import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { usePresence } from '../context/PresenceContext.jsx';
import { toast } from 'react-hot-toast';
import { queryCache } from '../utils/queryCache.js';
import PrettyDatePicker from '../components/PrettyDatePicker.jsx';

const PRIMARY = '#6795BE';

/** User-facing message from Supabase/PostgREST write errors (RLS, constraints, missing columns). */
function formatSupabaseWriteError(err) {
  if (!err) return 'Failed to save onboarding record.';
  const msg = err.message || String(err);
  const msgLower = String(msg || '').toLowerCase();
  const parts = [msg];
  if (err.details && String(err.details).trim() && err.details !== msg) {
    parts.push(String(err.details).trim());
  }
  if (err.hint && String(err.hint).trim()) {
    parts.push(String(err.hint).trim());
  }
  const out = parts.join(' — ');
  if (err.code === '42501' || /row-level security/i.test(msg)) {
    return `${out} If this is unexpected, check Supabase RLS policies for onboarding_records.`;
  }
  if (err.code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
    return `${out} If this is an email conflict, use a different email or edit the existing onboarding row.`;
  }
  // Friendly backend guidance when older DB schema is missing onboarding fields.
  if (
    /could not find/.test(msgLower) &&
    /onboarding_records/.test(msgLower) &&
    /'hours'|'school'|'start_date'|'team'|'department'/.test(msgLower)
  ) {
    return `${out} Please run supabase/onboarding_records_ensure_columns.sql in Supabase SQL Editor, then retry.`;
  }
  if (
    /could not find/.test(msgLower) &&
    /offboarding_records/.test(msgLower) &&
    /'intern_name'|'handled_by'|'team'|'notes'|'tla_signature'|'it_manager_signature'|'coc_cll_creation'|'email_certificates'|'one_drive'|'status'/.test(
      msgLower
    )
  ) {
    return `${out} Please run supabase/offboarding_records_ensure_columns.sql in Supabase SQL Editor, then retry.`;
  }
  return out || 'Failed to save onboarding record.';
}

const OFFBOARDING_COC_ONEDRIVE_LINK =
  'https://ssgcgroup-my.sharepoint.com/personal/erick_umonics_sg/_layouts/15/onedrive.aspx?id=%2Fpersonal%2Ferick%5Fumonics%5Fsg%2FDocuments%2FKnowles%20Files%2FKnowles%20Intern%27s%20Files%2FICF%2C%20Letter%2C%20and%20List%20of%20Interns%20with%20COC%20%26%20Letter%2FCOC%20%26%20Letters&ga=1';
const OFFBOARDING_EMAIL_STRUCTURE_LINK =
  'https://docs.google.com/document/d/1qrZFo7rpt-m9WPRW2HWv3rlztOoBu8Z0Z7zvf1AHZkw/edit?tab=t.v4pduu1my6hn';

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
};

const offboardingStatusFromRow = (r) => {
  const done =
    toBool(r?.tla_signature) &&
    toBool(r?.it_manager_signature) &&
    toBool(r?.coc_cll_creation) &&
    toBool(r?.email_certificates) &&
    toBool(r?.one_drive);
  return done ? 'Completed' : 'In Progress';
};

const REQUIREMENTS_META = [
  {
    key: 'endorsement',
    label: 'Signed Endorsement Letter',
    description: '(for school-mandated internship)',
    flagField: 'req_endorsement_letter',
    pathField: 'endorsement_file_path',
  },
  {
    key: 'school_id',
    label: 'Photocopy of School ID',
    description: '(for school-mandated internship)',
    flagField: 'req_school_id_copy',
    pathField: 'school_id_file_path',
  },
  {
    key: 'photo_1x1',
    label: '1 pc 1x1 picture',
    description: '',
    flagField: 'req_photo_1x1',
    pathField: 'photo_1x1_file_path',
  },
  {
    key: 'checklist',
    label: 'Intern checklist',
    description: '(ongoing/continuous guide during internship)',
    flagField: 'req_intern_checklist',
    pathField: 'intern_checklist_file_path',
  },
  {
    key: 'contract',
    label: 'Signed Intern Contract',
    description: '',
    flagField: 'req_intern_contract',
    pathField: 'intern_contract_file_path',
  },
  {
    key: 'nda',
    label: 'Signed Intern NDA',
    description: '',
    flagField: 'req_intern_nda',
    pathField: 'intern_nda_file_path',
  },
  {
    key: 'policy',
    label: 'Signed Company Policy for Interns',
    description: '',
    flagField: 'req_company_policy',
    pathField: 'company_policy_file_path',
  },
];

const OFFBOARDING_REQUIREMENTS_META = [
  {
    key: 'tla_signature',
    label: 'TLA signature',
    description: '',
    flagField: 'req_tla_signature',
    pathField: 'tla_signature_file_path',
  },
  {
    key: 'it_manager_signature',
    label: 'IT Manager signature',
    description: '',
    flagField: 'req_it_manager_signature',
    pathField: 'it_manager_signature_file_path',
  },
  {
    key: 'coc_cll_creation',
    label: 'COC/CLL Creation',
    description: '',
    flagField: 'req_coc_cll_creation',
    pathField: 'coc_cll_creation_file_path',
  },
  {
    key: 'email_certificates',
    label: 'Email Certificates',
    description: '',
    flagField: 'req_email_certificates',
    pathField: 'email_certificates_file_path',
  },
  {
    key: 'one_drive',
    label: 'One drive',
    description: '',
    flagField: 'req_one_drive',
    pathField: 'one_drive_file_path',
  },
];

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="min-h-[100dvh] w-full p-4 flex items-center justify-center">
        {children}
      </div>
    </div>,
    document.body
  );
}

function getYear(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getFullYear();
}

function formatMonthDayYear(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Cohort filter: user must have an onboarding record dated in `year`, and not be offboarded in that year tab. */
function userBelongsToOnboardingYear(user, year, onboardingByEmail, offboardedEmailSet) {
  const email = (user?.email || '').trim().toLowerCase();
  if (!email) return false;
  if (offboardedEmailSet?.has?.(email)) return false;
  const ob = onboardingByEmail.get(email);
  if (!ob?.onboarding_datetime) return false;
  return getYear(ob.onboarding_datetime) === year;
}

function formatTeamLabel(raw) {
  if (!raw) return '';
  const v = String(raw).trim().toLowerCase();
  if (v === 'tla' || v === 'team lead assistant' || v === 'team lead assistant (tla)') {
    return 'Team Lead Assistant';
  }
  if (v === 'monitoring' || v === 'monitoring team') {
    return 'Monitoring';
  }
  if (v === 'pat1' || v === 'pat 1') {
    return 'PAT1';
  }
  return raw;
}

function mapUserTeamToOnboardingTeam(raw) {
  if (!raw) return '';
  const v = String(raw).trim().toLowerCase();
  if (v === 'tla') return 'TLA';
  if (v === 'monitoring' || v === 'monitoring_team') return 'Monitoring';
  if (v === 'pat1' || v === 'pat 1') return 'PAT1';
  return '';
}

export default function OnboardingOffboarding() {
  const { supabase, user, userRole } = useSupabase();
  const { getStatus } = usePresence();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const onboardingInnerParam = searchParams.get('onboarding_tab'); // 'records' | 'requirements' | 'requirementsTracker' | 'internStatus'
  const offboardingInnerParam = searchParams.get('offboarding_tab'); // 'records' | 'requirements' | 'requirementsTracker'
  const hasOffboardingFlag = !!offboardingInnerParam;
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState([]);
  const [offboarding, setOffboarding] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [offboardingRequirements, setOffboardingRequirements] = useState([]);
  const [internUsers, setInternUsers] = useState([]);
  const [activeYear, setActiveYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState(hasOffboardingFlag ? 'offboarding' : 'onboarding'); // 'onboarding' | 'offboarding'
  const [onboardingInnerTab, setOnboardingInnerTab] = useState(
    onboardingInnerParam === 'requirements'
      ? 'requirements'
      : onboardingInnerParam === 'requirementsTracker'
      ? 'requirementsTracker'
      : onboardingInnerParam === 'internStatus'
      ? 'internStatus'
      : 'records'
  ); // 'records' | 'requirements' | 'requirementsTracker' | 'internStatus'
  const [offboardingInnerTab, setOffboardingInnerTab] = useState(
    offboardingInnerParam === 'requirementsTracker'
      ? 'requirementsTracker'
      : 'records'
  ); // 'records' | 'requirementsTracker'
  const [userTeam, setUserTeam] = useState(null);

  const [onboardingForm, setOnboardingForm] = useState({
    onboarding_date: '',
    onboarding_time: '',
    name: '',
    email: '',
    department: '',
    team: '',
    start_date: '',
    hours: '',
    school: '',
  });

  const [offboardingForm, setOffboardingForm] = useState({
    department: '',
    last_name: '',
    first_name: '',
    actual_end_date: '',
    hours: '',
    email: '',
  });
  const [editingOffboardingRow, setEditingOffboardingRow] = useState(null);
  const [offboardingEditDraft, setOffboardingEditDraft] = useState({
    tla_signature: false,
    it_manager_signature: false,
    coc_cll_creation: false,
    email_certificates: false,
    one_drive: false,
    notes: '',
  });

  const [requirementsForm, setRequirementsForm] = useState({
    name: '',
    email: '',
    department: '',
    team: '',
  });
  const [requirementsFiles, setRequirementsFiles] = useState({
    endorsement: null,
    school_id: null,
    photo_1x1: null,
    checklist: null,
    contract: null,
    nda: null,
    policy: null,
  });

  const [offboardingRequirementsFiles, setOffboardingRequirementsFiles] = useState({
    tla_signature: null,
    it_manager_signature: null,
    coc_cll_creation: null,
    email_certificates: null,
    one_drive: null,
  });

  // When a requirement is already submitted and pending verification, users can choose to replace the file.
  // This toggles the per-row file picker visibility and the correct action button label.
  const [requirementsReplaceMode, setRequirementsReplaceMode] = useState({}); // { [metaKey]: boolean }
  const [offboardingRequirementsReplaceMode, setOffboardingRequirementsReplaceMode] = useState({}); // { [metaKey]: boolean }

  const [requirementsSubmitting, setRequirementsSubmitting] = useState(false);
  const [offboardingRequirementsSubmitting, setOffboardingRequirementsSubmitting] = useState(false);

  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showOffboardingModal, setShowOffboardingModal] = useState(false);
  const [editingOnboardingId, setEditingOnboardingId] = useState(null);
  const [terminateTarget, setTerminateTarget] = useState(null); // { onboarding: r, user: u }
  const [terminatingIntern, setTerminatingIntern] = useState(false);
  const [viewOnboardingRequirementsRow, setViewOnboardingRequirementsRow] = useState(null); // { user, req }
  const [viewOffboardingRequirementsRow, setViewOffboardingRequirementsRow] = useState(null); // { user, req, off }
  const [onboardingVerifiedByName, setOnboardingVerifiedByName] = useState(null);
  const [offboardingVerifiedByName, setOffboardingVerifiedByName] = useState(null);
  const [, setStatusTick] = useState(0); // force re-render for Intern Status every minute

  // Records search/sort (admin + TL/VTL only)
  const [onboardingSearch, setOnboardingSearch] = useState('');
  const [offboardingSearch, setOffboardingSearch] = useState('');
  const [onboardingSort, setOnboardingSort] = useState('date_desc'); // date_desc | date_asc | name_asc | name_desc | email_asc | email_desc | team_asc
  const [offboardingSort, setOffboardingSort] = useState('date_desc'); // date_desc | date_asc | intern_asc | intern_desc | handled_by_asc | handled_by_desc | email_asc | email_desc | status_asc | status_desc

  const isTlaTeam = userTeam && String(userTeam).toLowerCase() === 'tla';

  const canManageRecords = userRole === 'admin' || userRole === 'tl' || userRole === 'vtl';
  const canManageRequirements =
    userRole === 'admin' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);

  const canSubmitRequirements =
    userRole === 'intern' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);

  const onboardingTabs = useMemo(() => {
    const tabs = [{ id: 'records', label: 'Records' }];
    if (canSubmitRequirements) tabs.push({ id: 'requirements', label: 'Requirements' });
    if (canManageRequirements) {
      tabs.push({ id: 'requirementsTracker', label: 'Requirements tracker' });
      tabs.push({ id: 'internStatus', label: 'Intern Status' });
    }
    return tabs;
  }, [canSubmitRequirements, canManageRequirements]);

  const offboardingTabs = useMemo(() => {
    const tabs = [{ id: 'records', label: 'Records' }];
    if (canManageRequirements) tabs.push({ id: 'requirementsTracker', label: 'Requirements tracker' });
    return tabs;
  }, [canManageRequirements]);

  useEffect(() => {
    fetchData();
  }, [supabase, user?.id, canManageRequirements]);

  const fetchData = async (bypassCache = false, options = {}) => {
    const { skipInternUsers = false } = options;
    setLoading(true);
    try {
      if (user?.id) {
        const { data: profile } = await supabase
          .from('users')
          .select('team')
          .eq('id', user.id)
          .single();
        setUserTeam(profile?.team ?? null);
      }

      // Load users list for requirements tracker (staff view) - interns + TL/VTL of any team
      // Skip after terminate so we don't overwrite local state with DB (user may still be in DB if RLS blocks delete)
      if (canManageRequirements && !skipInternUsers) {
        const { data: internsData, error: internsErr } = await supabase
          .from('users')
          .select('*')
          .in('role', ['intern', 'tl', 'vtl'])
          .order('full_name', { ascending: true });
        if (internsErr) {
          console.warn('Interns fetch error:', internsErr);
        }
        const raw = Array.isArray(internsData) ? internsData : [];
        const normalized = raw.map((row) => ({
          id: row.id,
          email: row.email ?? null,
          role: row.role ?? 'intern',
          team: row.team ?? null,
          full_name: (row.full_name ?? row.fullname ?? row.name ?? '').trim() || null,
        }));
        setInternUsers(normalized);
      }

      if (!bypassCache) {
        const cachedOn = queryCache.get('onboarding:records');
        const cachedOff = queryCache.get('offboarding:records');
        if (cachedOn && cachedOff) {
          setOnboarding(cachedOn);
          setOffboarding(cachedOff);
          setLoading(false);
          return;
        }
      }

      const { data: onData, error: onErr } = await supabase
        .from('onboarding_records')
        .select('*')
        .order('onboarding_datetime', { ascending: false });
      if (onErr) {
        console.warn('Onboarding fetch error:', onErr);
        toast.error('Could not load onboarding records. Run onboarding_offboarding_migration.sql in Supabase.');
      }

      const { data: offData, error: offErr } = await supabase
        .from('offboarding_records')
        .select('*')
        .order('actual_end_date', { ascending: false });
      if (offErr) {
        console.warn('Offboarding fetch error:', offErr);
        toast.error('Could not load offboarding records. Run onboarding_offboarding_migration.sql in Supabase.');
      }

      const { data: reqData, error: reqErr } = await supabase
        .from('onboarding_requirements')
        .select('*')
        .order('created_at', { ascending: false });
      if (reqErr) {
        console.warn('Onboarding requirements fetch error:', reqErr);
        toast.error('Could not load onboarding requirements. Run supabase_onboarding_requirements_migration.sql in Supabase.');
      }

      const { data: offReqData, error: offReqErr } = await supabase
        .from('offboarding_requirements')
        .select('*')
        .order('created_at', { ascending: false });
      if (offReqErr) {
        console.warn('Offboarding requirements fetch error:', offReqErr);
        toast.error('Could not load offboarding requirements. Run supabase_offboarding_requirements_migration.sql in Supabase.');
      }

      const onList = Array.isArray(onData) ? onData : [];
      const offList = (Array.isArray(offData) ? offData : []).map((r) => ({
        ...r,
        tla_signature: toBool(r?.tla_signature),
        it_manager_signature: toBool(r?.it_manager_signature),
        coc_cll_creation: toBool(r?.coc_cll_creation),
        email_certificates: toBool(r?.email_certificates),
        one_drive: toBool(r?.one_drive),
      }));
      const reqList = Array.isArray(reqData) ? reqData : [];
      const offReqList = Array.isArray(offReqData) ? offReqData : [];
      setOnboarding(onList);
      setOffboarding(offList);
      setRequirements(reqList);
      setOffboardingRequirements(offReqList);
      queryCache.set('onboarding:records', onList);
      queryCache.set('offboarding:records', offList);
    } catch (e) {
      console.error('Onboarding/Offboarding fetch error:', e);
      toast.error('Failed to load onboarding/offboarding data.');
    } finally {
      setLoading(false);
    }
  };

  const allYears = useMemo(() => {
    const years = new Set();
    const fixedYears = [new Date().getFullYear(), 2025, 2024, 2023];
    fixedYears.forEach((y) => {
      if (Number.isFinite(y) && y > 1900) years.add(y);
    });
    onboarding.forEach((r) => {
      const y = getYear(r.onboarding_datetime);
      if (y) years.add(y);
    });
    offboarding.forEach((r) => {
      const y = getYear(r.actual_end_date);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [onboarding, offboarding]);

  useEffect(() => {
    if (!allYears.includes(activeYear) && allYears.length > 0) {
      setActiveYear(allYears[0]);
    }
  }, [allYears, activeYear]);

  // Re-render every minute when on Intern Status so online/inactive/offline counts stay current
  useEffect(() => {
    if (onboardingInnerTab !== 'internStatus') return;
    const t = setInterval(() => setStatusTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, [onboardingInnerTab]);

  const offboardedEmailSetByYear = useMemo(() => {
    const byYear = new Map();
    offboarding.forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const y = getYear(r.actual_end_date);
      if (!email || !y) return;
      if (!byYear.has(y)) byYear.set(y, new Set());
      byYear.get(y).add(email);
    });
    return byYear;
  }, [offboarding]);

  const offboardedEmailSet = useMemo(() => {
    return offboardedEmailSetByYear.get(activeYear) || new Set();
  }, [offboardedEmailSetByYear, activeYear]);

  const onboardingByEmail = useMemo(() => {
    const map = new Map();
    onboarding.forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      if (email && !map.has(email)) {
        map.set(email, r);
      }
    });
    return map;
  }, [onboarding]);

  // Merge onboarding records with users (interns/TL/VTL) so table shows everyone
  const mergedOnboardingRows = useMemo(() => {
    const map = new Map();

    onboarding.forEach((r) => {
      const key = (r.email || '').trim().toLowerCase() || `onboarding-${r.id}`;
      map.set(key, { onboarding: r, user: null });
    });

    internUsers.forEach((u) => {
      const key = (u.email || '').trim().toLowerCase() || `user-${u.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.user = u;
      } else {
        map.set(key, { onboarding: null, user: u });
      }
    });

    return Array.from(map.values());
  }, [onboarding, internUsers]);

  const handleTerminateOnboarding = async () => {
    if (!editingOnboardingId) {
      setShowTerminateOnboardingModal(false);
      return;
    }
    setTerminatingOnboarding(true);
    try {
      const id = editingOnboardingId;

      // Find the onboarding row we are terminating to get its email
      const target = onboarding.find((r) => r.id === id) || null;
      const targetEmail = (target?.email || onboardingForm.email || '').trim().toLowerCase() || null;

      // Delete onboarding record (permanent)
      const { error } = await supabase.from('onboarding_records').delete().eq('id', id);
      if (error) throw error;

      // Permanently delete matching user so they do not reappear after refresh (table merges onboarding + users)
      if (targetEmail) {
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .ilike('email', targetEmail)
          .maybeSingle();
        if (userRow?.id) {
          const { error: userErr } = await supabase.from('users').delete().eq('id', userRow.id);
          if (userErr) {
            console.warn('Terminate onboarding: users delete error:', userErr);
            toast.error('Onboarding removed but user account could not be deleted. They may reappear after refresh.');
          }
        }
        setInternUsers((prev) =>
          prev.filter((u) => (u.email || '').trim().toLowerCase() !== targetEmail)
        );
      }

      setOnboarding((prev) => prev.filter((r) => r.id !== id));
      queryCache.invalidate('onboarding:records');
      queryCache.invalidate('offboarding:records');
      await fetchData(true, { skipInternUsers: true });
      setOnboarding((prev) => prev.filter((r) => r.id !== id));
      if (targetEmail) {
        setInternUsers((prev) =>
          prev.filter((u) => (u.email || '').trim().toLowerCase() !== targetEmail)
        );
      }
      toast.success('Intern has been terminated and permanently removed from the system.');
      setEditingOnboardingId(null);
      setShowOnboardingModal(false);
      setShowTerminateOnboardingModal(false);
      setOnboardingForm({
        onboarding_date: '',
        onboarding_time: '',
        name: '',
        email: '',
        department: '',
        team: '',
        start_date: '',
        hours: '',
        school: '',
      });
    } catch (err) {
      console.error('Terminate onboarding error:', err);
      toast.error(err?.message || 'Failed to terminate intern. Please try again.');
    } finally {
      setTerminatingOnboarding(false);
    }
  };

  const filteredOnboarding = mergedOnboardingRows.filter(({ onboarding: r, user: u }) => {
    const email = (r?.email || u?.email || '').trim().toLowerCase();
    const isOffboarded = email && offboardedEmailSet.has(email);
    if (isOffboarded) return false;

    if (r?.onboarding_datetime) {
      return getYear(r.onboarding_datetime) === activeYear;
    }
    // Account exists but no onboarding row yet: only show on the current calendar year tab (avoid listing under every historical year).
    const currentCalendarYear = new Date().getFullYear();
    return activeYear === currentCalendarYear;
  });

  const filteredOffboarding = offboarding.filter((r) => getYear(r.actual_end_date) === activeYear);

  const displayedOnboarding = useMemo(() => {
    const q = onboardingSearch.trim().toLowerCase();
    let list = filteredOnboarding;
    if (q) {
      list = list.filter(({ onboarding: r, user: u }) => {
        const name = String(r?.name || u?.full_name || '').toLowerCase();
        const email = String(r?.email || u?.email || '').toLowerCase();
        const dept = String(r?.department || '').toLowerCase();
        const team = String(formatTeamLabel(r?.team || u?.team) || '').toLowerCase();
        return [name, email, dept, team].some((v) => v.includes(q));
      });
    }
    const safeDate = (x) => {
      const dt = x?.onboarding_datetime ? new Date(x.onboarding_datetime) : null;
      return dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : 0;
    };
    const safeName = (x) => String(x?.name || '').toLowerCase();
    const safeEmail = (x) => String(x?.email || '').toLowerCase();
    list = [...list].sort((a, b) => {
      const ra = a.onboarding || {};
      const rb = b.onboarding || {};
      if (onboardingSort === 'date_asc') return safeDate(ra) - safeDate(rb);
      if (onboardingSort === 'date_desc') return safeDate(rb) - safeDate(ra);
      if (onboardingSort === 'name_asc') return safeName(ra).localeCompare(safeName(rb));
      if (onboardingSort === 'name_desc') return safeName(rb).localeCompare(safeName(ra));
      if (onboardingSort === 'email_asc') return safeEmail(ra).localeCompare(safeEmail(rb));
      if (onboardingSort === 'email_desc') return safeEmail(rb).localeCompare(safeEmail(ra));
      if (onboardingSort === 'team_asc') {
        const ta = String(formatTeamLabel(ra.team || a.user?.team) || '').toLowerCase();
        const tb = String(formatTeamLabel(rb.team || b.user?.team) || '').toLowerCase();
        return ta.localeCompare(tb);
      }
      return safeDate(rb) - safeDate(ra);
    });
    return list;
  }, [filteredOnboarding, onboardingSearch, onboardingSort]);

  const displayedOffboarding = useMemo(() => {
    const q = offboardingSearch.trim().toLowerCase();
    let list = filteredOffboarding;
    if (q) {
      list = list.filter((r) => {
        const dept = String(r?.department || '').toLowerCase();
        const intern = String(r?.intern_name || `${r?.first_name || ''} ${r?.last_name || ''}` || '').toLowerCase();
        const handledBy = String(r?.handled_by || '').toLowerCase();
        const team = String(r?.team || '').toLowerCase();
        const email = String(r?.email || '').toLowerCase();
        return [dept, intern, handledBy, team, email].some((v) => v.includes(q));
      });
    }
    const safeDate = (r) => {
      const dt = r?.actual_end_date ? new Date(r.actual_end_date) : null;
      return dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : 0;
    };
    const safeEmail = (r) => String(r?.email || '').toLowerCase();
    const safeIntern = (r) => String(r?.intern_name || `${r?.first_name || ''} ${r?.last_name || ''}` || '').toLowerCase();
    const safeHandledBy = (r) => String(r?.handled_by || '').toLowerCase();
    const safeStatus = (r) => offboardingStatusFromRow(r).toLowerCase();
    list = [...list].sort((a, b) => {
      if (offboardingSort === 'date_asc') return safeDate(a) - safeDate(b);
      if (offboardingSort === 'date_desc') return safeDate(b) - safeDate(a);
      if (offboardingSort === 'intern_asc') return safeIntern(a).localeCompare(safeIntern(b));
      if (offboardingSort === 'intern_desc') return safeIntern(b).localeCompare(safeIntern(a));
      if (offboardingSort === 'handled_by_asc') return safeHandledBy(a).localeCompare(safeHandledBy(b));
      if (offboardingSort === 'handled_by_desc') return safeHandledBy(b).localeCompare(safeHandledBy(a));
      if (offboardingSort === 'email_asc') return safeEmail(a).localeCompare(safeEmail(b));
      if (offboardingSort === 'email_desc') return safeEmail(b).localeCompare(safeEmail(a));
      if (offboardingSort === 'status_asc') return safeStatus(a).localeCompare(safeStatus(b));
      if (offboardingSort === 'status_desc') return safeStatus(b).localeCompare(safeStatus(a));
      return safeDate(b) - safeDate(a);
    });
    return list;
  }, [filteredOffboarding, offboardingSearch, offboardingSort]);

  const onboardingCandidates = useMemo(() => {
    return onboarding
      .filter((r) => {
        const email = (r.email || '').trim().toLowerCase();
        if (!email) return false;
        const onboardingYear = getYear(r.onboarding_datetime);
        if (onboardingYear !== activeYear) return false;
        return !offboardedEmailSet.has(email);
      })
      .sort((a, b) => {
        const ta = a?.onboarding_datetime ? new Date(a.onboarding_datetime).getTime() : 0;
        const tb = b?.onboarding_datetime ? new Date(b.onboarding_datetime).getTime() : 0;
        return tb - ta;
      });
  }, [onboarding, activeYear, offboardedEmailSet]);

  useEffect(() => {
    if (!showOffboardingModal) return;
    const currentEmail = (offboardingForm.email || '').trim().toLowerCase();
    if (!currentEmail) return;
    const existsInYear = onboardingCandidates.some(
      (r) => (r.email || '').trim().toLowerCase() === currentEmail
    );
    if (existsInYear) return;
    // Keep dropdown choices and selected value aligned with the active year tab.
    setOffboardingForm((f) => ({
      ...f,
      email: '',
      first_name: '',
      last_name: '',
      department: '',
    }));
  }, [showOffboardingModal, offboardingForm.email, onboardingCandidates]);

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    setOnboardingSubmitAttempted(true);
    const {
      onboarding_date,
      onboarding_time,
      name,
      email,
      department,
      team,
      start_date,
      hours,
      school,
    } = onboardingForm;
    if (!onboarding_date || !name.trim()) {
      toast.error('Onboarding date and name are required.');
      return;
    }
    const isCreating = !editingOnboardingId;
    const existingOnboardingRow =
      editingOnboardingId && Array.isArray(onboarding)
        ? onboarding.find((r) => r?.id === editingOnboardingId) || null
        : null;

    const parsedHours = hours === '' ? null : Number(hours);
    const schoolTrim = school?.trim() || '';

    const hoursForPayload = !isCreating && hours === '' ? (existingOnboardingRow?.hours ?? null) : parsedHours;
    const schoolForPayload = !isCreating && !schoolTrim ? (existingOnboardingRow?.school ?? null) : (schoolTrim || null);
    const startDateForPayload = !isCreating && !start_date
      ? (existingOnboardingRow?.start_date ?? null)
      : (start_date || null);
    if (isCreating) {
      if (!start_date) {
        toast.error('Start date is required.');
        return;
      }
      if (hoursForPayload == null || Number.isNaN(hoursForPayload) || hoursForPayload <= 0) {
        toast.error('Hours is required and must be a valid number greater than 0.');
        return;
      }
      if (!schoolTrim) {
        toast.error('School is required.');
        return;
      }
    } else {
      if (hours !== '' && (Number.isNaN(parsedHours) || parsedHours < 0)) {
        toast.error('Hours must be a valid number.');
        return;
      }
    }

    if (isCreating && !(department || '').trim()) {
      toast.error('Department is required.');
      return;
    }

    const deptTrim = (department || '').trim() || null;
    const teamTrim = (team || '').trim();
    if (deptTrim === 'IT' && !teamTrim) {
      toast.error('For IT department, select a team (TLA, PAT1, or Monitoring).');
      return;
    }

    try {
      const datetime = onboarding_time
        ? new Date(`${onboarding_date}T${onboarding_time}`)
        : new Date(`${onboarding_date}T00:00:00`);
      if (Number.isNaN(datetime.getTime())) {
        toast.error('Invalid onboarding date or time. Please pick the date again.');
        return;
      }

      const payload = {
        onboarding_datetime: datetime.toISOString(),
        name: name.trim(),
        email: email?.trim() || null,
        department: deptTrim,
        team: deptTrim === 'IT' ? teamTrim : null,
        start_date: startDateForPayload,
        hours: hoursForPayload,
        school: schoolForPayload,
      };

      let error;
      if (editingOnboardingId) {
        const res = await supabase.from('onboarding_records').update(payload).eq('id', editingOnboardingId);
        error = res.error;
        if (!error) toast.success('Onboarding record updated.');
      } else {
        const res = await supabase.from('onboarding_records').insert(payload);
        error = res.error;
        if (!error) toast.success('Onboarding record added.');
      }
      if (error) throw error;
      setOnboardingForm({
        onboarding_date: '',
        onboarding_time: '',
        name: '',
        email: '',
        department: '',
        team: '',
        start_date: '',
        hours: '',
        school: '',
      });
      setEditingOnboardingId(null);
      setShowOnboardingModal(false);
      setOnboardingSubmitAttempted(false);
      queryCache.invalidate('onboarding:records');
      await fetchData(true);
    } catch (err) {
      console.error('Onboarding save error:', err);
      toast.error(formatSupabaseWriteError(err));
    }
  };

  const handleTerminateIntern = async () => {
    if (!terminateTarget?.onboarding?.id) {
      setTerminateTarget(null);
      return;
    }
    setTerminatingIntern(true);
    const target = terminateTarget.onboarding;
    const targetEmail = (target?.email || '').trim().toLowerCase() || null;
    try {
      const { error } = await supabase
        .from('onboarding_records')
        .delete()
        .eq('id', target.id);
      if (error) throw error;

      // Permanently delete user so they do not reappear after refresh (delete by id when we have it)
      const userToRemove = terminateTarget.user;
      if (userToRemove?.id) {
        const { error: userErr } = await supabase.from('users').delete().eq('id', userToRemove.id);
        if (userErr) {
          console.warn('Terminate intern: users delete error:', userErr);
          toast.error('Onboarding removed but user account could not be deleted. They may reappear after refresh.');
        }
        setInternUsers((prev) => prev.filter((u) => u.id !== userToRemove.id));
      } else if (targetEmail) {
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .ilike('email', targetEmail)
          .maybeSingle();
        if (userRow?.id) {
          const { error: userErr } = await supabase.from('users').delete().eq('id', userRow.id);
          if (userErr) console.warn('Terminate intern: users delete error:', userErr);
        }
        setInternUsers((prev) =>
          prev.filter((u) => (u.email || '').trim().toLowerCase() !== targetEmail)
        );
      }

      setOnboarding((prev) => prev.filter((r) => r.id !== target.id));
      queryCache.invalidate('onboarding:records');
      queryCache.invalidate('offboarding:records');
      await fetchData(true, { skipInternUsers: true });
      setOnboarding((prev) => prev.filter((r) => r.id !== target.id));
      if (terminateTarget.user?.id) {
        setInternUsers((prev) => prev.filter((u) => u.id !== terminateTarget.user.id));
      } else if (targetEmail) {
        setInternUsers((prev) =>
          prev.filter((u) => (u.email || '').trim().toLowerCase() !== targetEmail)
        );
      }
      toast.success('Intern terminated and permanently removed from the system.');
    } catch (err) {
      console.error('Terminate intern error:', err);
      toast.error(err?.message || 'Failed to terminate intern.');
    } finally {
      setTerminatingIntern(false);
      setTerminateTarget(null);
    }
  };

  const handleOffboardingSubmit = async (e) => {
    e.preventDefault();
    setOffboardingSubmitAttempted(true);
    const { department, last_name, first_name, actual_end_date, hours, email } = offboardingForm;
    if (!department?.trim() || !last_name?.trim() || !first_name?.trim() || !actual_end_date || !email?.trim()) {
      toast.error('Please select an intern and complete Department and Actual end date.');
      return;
    }
    try {
      const payload = {
        department: department?.trim() || null,
        last_name: last_name.trim(),
        first_name: first_name.trim(),
        actual_end_date,
        hours: hours ? Number(hours) : null,
        email: email?.trim() || null,
        tla_signature: false,
        it_manager_signature: false,
        coc_cll_creation: false,
        email_certificates: false,
        one_drive: false,
        status: 'In Progress',
      };
      const { error } = await supabase.from('offboarding_records').insert(payload);
      if (error) throw error;
      toast.success('Offboarding record added.');
      setOffboardingForm({
        department: '',
        last_name: '',
        first_name: '',
        actual_end_date: '',
        hours: '',
        email: '',
      });
      setShowOffboardingModal(false);
      setOffboardingSubmitAttempted(false);
      queryCache.invalidate('offboarding:records');
      await fetchData(true);
    } catch (err) {
      console.error('Offboarding insert error:', err);
      toast.error(formatSupabaseWriteError(err));
    }
  };

  const startEditOffboardingRow = (row) => {
    setEditingOffboardingRow(row);
    setOffboardingEditDraft({
      tla_signature: toBool(row?.tla_signature),
      it_manager_signature: toBool(row?.it_manager_signature),
      coc_cll_creation: toBool(row?.coc_cll_creation),
      email_certificates: toBool(row?.email_certificates),
      one_drive: toBool(row?.one_drive),
      notes: row?.notes || '',
    });
  };

  const cancelEditOffboardingRow = () => {
    setEditingOffboardingRow(null);
    setOffboardingEditDraft({
      tla_signature: false,
      it_manager_signature: false,
      coc_cll_creation: false,
      email_certificates: false,
      one_drive: false,
      notes: '',
    });
  };

  const saveEditOffboardingRow = async (row) => {
    try {
      const nextStatus =
        offboardingEditDraft.tla_signature &&
        offboardingEditDraft.it_manager_signature &&
        offboardingEditDraft.coc_cll_creation &&
        offboardingEditDraft.email_certificates &&
        offboardingEditDraft.one_drive
          ? 'Completed'
          : 'In Progress';
      const payload = {
        tla_signature: !!offboardingEditDraft.tla_signature,
        it_manager_signature: !!offboardingEditDraft.it_manager_signature,
        coc_cll_creation: !!offboardingEditDraft.coc_cll_creation,
        email_certificates: !!offboardingEditDraft.email_certificates,
        one_drive: !!offboardingEditDraft.one_drive,
        notes: offboardingEditDraft.notes?.trim() || null,
        status: nextStatus,
      };
      const { error } = await supabase.from('offboarding_records').update(payload).eq('id', row.id);
      if (error) throw error;
      setOffboarding((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, ...payload } : item))
      );
      queryCache.invalidate('offboarding:records');
      cancelEditOffboardingRow();
      toast.success('Offboarding row updated.');
    } catch (err) {
      console.error('Offboarding update error:', err);
      toast.error(formatSupabaseWriteError(err));
    }
  };

  const deleteOffboardingRow = async (row) => {
    const ok = window.confirm('Delete this offboarding record?');
    if (!ok) return;
    try {
      const { error } = await supabase.from('offboarding_records').delete().eq('id', row.id);
      if (error) throw error;
      setOffboarding((prev) => prev.filter((item) => item.id !== row.id));
      queryCache.invalidate('offboarding:records');
      if (editingOffboardingRow?.id === row.id) cancelEditOffboardingRow();
      toast.success('Offboarding record deleted.');
    } catch (err) {
      console.error('Offboarding delete error:', err);
      toast.error(formatSupabaseWriteError(err));
    }
  };

  const currentUserRequirements = useMemo(() => {
    if (!user?.id) return null;
    return requirements.find((r) => r.intern_id === user.id) || null;
  }, [requirements, user]);

  const currentUserOffboardingRequirements = useMemo(() => {
    if (!user?.id) return null;
    return offboardingRequirements.find((r) => r.intern_id === user.id) || null;
  }, [offboardingRequirements, user]);

  const handleRequirementsSubmit = async () => {
    const derivedName =
      (currentUserRequirements?.name || '').trim() ||
      (user?.user_metadata?.full_name || '').trim() ||
      (user?.email || '').trim();
    const payloadBase = {
      name: derivedName,
      email: (currentUserRequirements?.email || user?.email || '').trim() || null,
      department: (currentUserRequirements?.department || '').trim() || null,
      team: (currentUserRequirements?.team || userTeam || '').trim() || null,
      intern_id: user?.id || null,
      status: 'pending',
    };
    if (!payloadBase.name) {
      toast.error('Could not determine your name from your account. Please contact admin.');
      return;
    }
    setRequirementsSubmitting(true);
    try {
      let rowId = currentUserRequirements?.id || null;
      if (currentUserRequirements) {
        const { error } = await supabase
          .from('onboarding_requirements')
          .update({ ...payloadBase, updated_at: new Date().toISOString() })
          .eq('id', currentUserRequirements.id);
        if (error) throw error;
        rowId = currentUserRequirements.id;
      } else {
        const { data, error } = await supabase
          .from('onboarding_requirements')
          .insert(payloadBase)
          .select('*')
          .single();
        if (error) throw error;
        rowId = data.id;
      }

      // Upload files for each requirement if chosen
      if (rowId) {
        for (const meta of REQUIREMENTS_META) {
          const file = requirementsFiles[meta.key];
          if (!file) continue;
          const path = `${rowId}/${meta.key}-${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from('onboarding-requirements')
            .upload(path, file, { upsert: true });
          if (uploadErr) {
            console.warn('Upload error', meta.key, uploadErr);
            toast.error(`Failed to upload ${meta.label}.`);
            continue;
          }
          const updatePayload = {
            [meta.pathField]: path,
            [meta.flagField]: true,
            updated_at: new Date().toISOString(),
            status: 'pending',
          };
          const { error: updErr } = await supabase
            .from('onboarding_requirements')
            .update(updatePayload)
            .eq('id', rowId);
          if (updErr) {
            console.warn('Update after upload error', meta.key, updErr);
          }
        }
      }
      toast.success('Requirements saved. Status is pending verification.');
      setRequirementsReplaceMode({});
      setRequirementsFiles({
        endorsement: null,
        school_id: null,
        photo_1x1: null,
        checklist: null,
        contract: null,
        nda: null,
        policy: null,
      });
      await fetchData(true);
    } catch (err) {
      console.error('Requirements submit error:', err);
      toast.error(err?.message || 'Failed to submit requirements.');
    } finally {
      setRequirementsSubmitting(false);
    }
  };

  const handleOffboardingRequirementsSubmit = async () => {
    const derivedName =
      (currentUserOffboardingRequirements?.name || '').trim() ||
      (user?.user_metadata?.full_name || '').trim() ||
      (user?.email || '').trim();
    const payloadBase = {
      name: derivedName,
      email: (currentUserOffboardingRequirements?.email || user?.email || '').trim() || null,
      department: (currentUserOffboardingRequirements?.department || '').trim() || null,
      team: (currentUserOffboardingRequirements?.team || userTeam || '').trim() || null,
      intern_id: user?.id || null,
      status: 'pending',
    };
    if (!payloadBase.name) {
      toast.error('Could not determine your name from your account. Please contact admin.');
      return;
    }
    setOffboardingRequirementsSubmitting(true);
    try {
      let rowId = currentUserOffboardingRequirements?.id || null;
      if (currentUserOffboardingRequirements) {
        const { error } = await supabase
          .from('offboarding_requirements')
          .update({ ...payloadBase, updated_at: new Date().toISOString() })
          .eq('id', currentUserOffboardingRequirements.id);
        if (error) throw error;
        rowId = currentUserOffboardingRequirements.id;
      } else {
        const { data, error } = await supabase
          .from('offboarding_requirements')
          .insert(payloadBase)
          .select('*')
          .single();
        if (error) throw error;
        rowId = data.id;
      }

      if (rowId) {
        for (const meta of OFFBOARDING_REQUIREMENTS_META) {
          const file = offboardingRequirementsFiles[meta.key];
          if (!file) continue;
          const path = `${rowId}/${meta.key}-${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from('offboarding-requirements')
            .upload(path, file, { upsert: true });
          if (uploadErr) {
            console.warn('Offboarding upload error', meta.key, uploadErr);
            toast.error(`Failed to upload ${meta.label}.`);
            continue;
          }
          const updatePayload = {
            [meta.pathField]: path,
            [meta.flagField]: true,
            updated_at: new Date().toISOString(),
            status: 'pending',
          };
          const { error: updErr } = await supabase
            .from('offboarding_requirements')
            .update(updatePayload)
            .eq('id', rowId);
          if (updErr) {
            console.warn('Offboarding update after upload error', meta.key, updErr);
          }
        }
      }
      toast.success('Offboarding requirements saved. Status is pending verification.');
      setOffboardingRequirementsReplaceMode({});
      setOffboardingRequirementsFiles({
        tla_signature: null,
        it_manager_signature: null,
        coc_cll_creation: null,
        email_certificates: null,
        one_drive: null,
      });
      await fetchData(true);
    } catch (err) {
      console.error('Offboarding requirements submit error:', err);
      toast.error(err?.message || 'Failed to submit offboarding requirements.');
    } finally {
      setOffboardingRequirementsSubmitting(false);
    }
  };

  const requirementsTrackerRows = useMemo(() => {
    if (!canManageRequirements) return [];
    if (!internUsers || internUsers.length === 0) return [];
    return internUsers
      .filter((u) => userBelongsToOnboardingYear(u, activeYear, onboardingByEmail, offboardedEmailSet))
      .map((u) => {
        const req = requirements.find((r) => r.intern_id === u.id) || null;
        const email = (u.email || '').trim().toLowerCase();
        const on = email ? onboardingByEmail.get(email) || null : null;
        return { user: u, req, on };
      });
  }, [
    internUsers,
    requirements,
    onboardingByEmail,
    canManageRequirements,
    activeYear,
    offboardedEmailSet,
  ]);

  const onboardingCohortUsersForYear = useMemo(() => {
    if (!internUsers?.length) return [];
    return internUsers.filter((u) =>
      userBelongsToOnboardingYear(u, activeYear, onboardingByEmail, offboardedEmailSet)
    );
  }, [internUsers, activeYear, onboardingByEmail, offboardedEmailSet]);

  const offboardingRequirementsTrackerRows = useMemo(() => {
    if (!canManageRequirements) return [];
    if (!offboarding || offboarding.length === 0) return [];
    return offboarding
      .filter((off) => getYear(off.actual_end_date) === activeYear)
      .map((off) => {
        const email = (off.email || '').trim().toLowerCase();
        const userMatch =
          (email &&
            internUsers.find((u) => (u.email || '').trim().toLowerCase() === email)) ||
          null;
        return { user: userMatch, off };
      });
  }, [offboarding, internUsers, canManageRequirements, activeYear]);

  const [showTerminateOnboardingModal, setShowTerminateOnboardingModal] = useState(false);
  const [terminatingOnboarding, setTerminatingOnboarding] = useState(false);
  const [onboardingSubmitAttempted, setOnboardingSubmitAttempted] = useState(false);
  const [offboardingSubmitAttempted, setOffboardingSubmitAttempted] = useState(false);

  // Load human-readable verifier name for onboarding/offboarding requirement modals
  useEffect(() => {
    const loadOnboardingVerifier = async () => {
      const v = viewOnboardingRequirementsRow?.req?.verified_by;
      if (!v) {
        setOnboardingVerifiedByName(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', v)
          .maybeSingle();
        if (error) {
          console.warn('Onboarding verifier fetch error', error);
          setOnboardingVerifiedByName(null);
          return;
        }
        setOnboardingVerifiedByName(data?.full_name || data?.email || null);
      } catch (err) {
        console.warn('Onboarding verifier fetch error', err);
        setOnboardingVerifiedByName(null);
      }
    };
    loadOnboardingVerifier();
  }, [viewOnboardingRequirementsRow, supabase]);

  useEffect(() => {
    const loadOffboardingVerifier = async () => {
      const v = viewOffboardingRequirementsRow?.req?.verified_by;
      if (!v) {
        setOffboardingVerifiedByName(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', v)
          .maybeSingle();
        if (error) {
          console.warn('Offboarding verifier fetch error', error);
          setOffboardingVerifiedByName(null);
          return;
        }
        setOffboardingVerifiedByName(data?.full_name || data?.email || null);
      } catch (err) {
        console.warn('Offboarding verifier fetch error', err);
        setOffboardingVerifiedByName(null);
      }
    };
    loadOffboardingVerifier();
  }, [viewOffboardingRequirementsRow, supabase]);

  if (loading && onboarding.length === 0 && offboarding.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Onboarding & Offboarding</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Track intern onboarding and offboarding records by year.
        </p>
      </div>

      {/* Year tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        {allYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setActiveYear(year)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              activeYear === year ? 'text-white' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            style={activeYear === year ? { backgroundColor: PRIMARY } : {}}
          >
            {year}
          </button>
        ))}
      </div>

      {/* Inner tabs: Onboarding / Offboarding */}
      <div className="flex flex-wrap gap-2 mt-3">
        {[
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'offboarding', label: 'Offboarding' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'onboarding') {
                const next = new URLSearchParams(searchParams);
                next.delete('offboarding_tab');
                next.set('onboarding_tab', onboardingInnerTab);
                const qs = next.toString();
                navigate(`/onboarding${qs ? `?${qs}` : ''}`);
              } else {
                const next = new URLSearchParams(searchParams);
                next.delete('onboarding_tab');
                next.set('offboarding_tab', offboardingInnerTab);
                const qs = next.toString();
                navigate(`/onboarding${qs ? `?${qs}` : ''}`);
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 shadow-sm'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Onboarding */}
      {activeTab === 'onboarding' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Onboarding ({activeYear})</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {/* Nested tabs: Records / Requirements */}
              <div className="flex flex-wrap gap-2">
                {onboardingTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setOnboardingInnerTab(tab.id);
                      const next = new URLSearchParams(searchParams);
                      next.set('onboarding_tab', tab.id);
                      setSearchParams(next);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      onboardingInnerTab === tab.id
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {canManageRecords && onboardingInnerTab === 'records' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOnboardingId(null);
                    setOnboardingForm({
                      onboarding_date: '',
                      onboarding_time: '',
                      name: '',
                      email: '',
                      department: '',
                      team: '',
                      start_date: '',
                      hours: '',
                      school: '',
                    });
                    setShowOnboardingModal(true);
                  }}
                  className="mt-1 sm:mt-0 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add onboarding
                </button>
              )}
            </div>
          </div>

          {onboardingInnerTab === 'records' && (
            <div className="space-y-2">
              {canManageRecords && (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    value={onboardingSearch}
                    onChange={(e) => setOnboardingSearch(e.target.value)}
                    placeholder="Search name, email, department, team…"
                    className="w-full sm:w-[320px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Sort:</span>
                  <select
                    value={onboardingSort}
                    onChange={(e) => setOnboardingSort(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                  >
                    <option value="date_desc">New</option>
                    <option value="date_asc">Old</option>
                    <option value="name_asc">Ascending Name</option>
                    <option value="name_desc">Descending Name</option>
                  </select>
                </div>
              )}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-950/40">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Onboarding date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Team</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Start date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Hours</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">School</th>
                      {canManageRecords && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {displayedOnboarding.map(({ onboarding: r, user: u }) => (
                      <tr key={r?.id || u?.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {r?.onboarding_datetime
                            ? new Date(r.onboarding_datetime).toLocaleString([], {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {r?.name || u?.full_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {r?.email || u?.email || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {r?.department || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {formatTeamLabel(r?.team || u?.team) || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r?.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {r?.hours != null && String(r.hours).trim() !== '' ? r.hours : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {r?.school && String(r.school).trim() !== '' ? r.school : '—'}
                        </td>
                        {canManageRecords && (
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 space-x-2">
                            {r && (
                              <button
                                type="button"
                                onClick={() => {
                                  const dt = r.onboarding_datetime ? new Date(r.onboarding_datetime) : null;
                                  const iso = dt ? dt.toISOString() : null;
                                  const date = iso ? iso.slice(0, 10) : '';
                                  const time = iso ? iso.slice(11, 16) : '';
                                  setEditingOnboardingId(r.id);
                                  setOnboardingForm({
                                    onboarding_date: date,
                                    onboarding_time: time,
                                    name: r.name || u?.full_name || '',
                                    email: r.email || u?.email || '',
                                    department: r.department || '',
                                    team: r.team || mapUserTeamToOnboardingTeam(u?.team),
                                    start_date: r.start_date || '',
                                    hours: r.hours != null ? String(r.hours) : '',
                                    school: r.school || '',
                                  });
                                  setShowOnboardingModal(true);
                                }}
                                className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                              >
                                Edit
                              </button>
                            )}
                            {!r && u && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingOnboardingId(null);
                                  setOnboardingForm({
                                    onboarding_date: '',
                                    onboarding_time: '',
                                    name: u.full_name || '',
                                    email: u.email || '',
                                    department: 'IT',
                                    team: mapUserTeamToOnboardingTeam(u.team),
                                    start_date: '',
                                    hours: '',
                                    school: '',
                                  });
                                  setShowOnboardingModal(true);
                                }}
                                className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50"
                              >
                                Add onboarding
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {displayedOnboarding.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center" colSpan={canManageRecords ? 9 : 8}>
                          No onboarding records for {activeYear}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {onboardingInnerTab === 'internStatus' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Presence for accounts whose <span className="font-medium">onboarding year</span> is {activeYear} (same cohort as Requirements tracker).
                <span className="block mt-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 mr-3">
                    <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
                    Online
                  </span>
                  <span className="inline-flex items-center gap-1 mr-3">
                    <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                    Inactive
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-500" aria-hidden />
                    Offline
                  </span>
                </span>
              </p>
              {(() => {
                const statusCounts = { online: 0, inactive: 0, offline: 0 };
                onboardingCohortUsersForYear.forEach((u) => {
                  const s = getStatus(u.id);
                  if (s === 'online') statusCounts.online += 1;
                  else if (s === 'inactive') statusCounts.inactive += 1;
                  else statusCounts.offline += 1;
                });
                return (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-green-600 dark:text-green-400">{statusCounts.online} online</span>
                    {' · '}
                    <span className="font-medium text-amber-600 dark:text-amber-400">{statusCounts.inactive} inactive</span>
                    {' · '}
                    <span className="font-medium text-red-600 dark:text-red-400">{statusCounts.offline} offline</span>
                  </p>
                );
              })()}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-950/40">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Team</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {onboardingCohortUsersForYear.map((u) => {
                      const status = getStatus(u.id);
                      const emailKey = (u.email || '').trim().toLowerCase();
                      const ob = onboardingByEmail.get(emailKey);
                      const displayName = (u.full_name || ob?.name || u.email || '—').trim() || '—';
                      const department = ob?.department || '—';
                      const team = formatTeamLabel(u.team || ob?.team) || '—';
                      const rowBorder =
                        status === 'online'
                          ? 'border-l-4 border-l-green-500'
                          : status === 'inactive'
                            ? 'border-l-4 border-l-amber-500'
                            : 'border-l-4 border-l-red-500';
                      const badgeClass =
                        status === 'online'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/45 dark:text-green-200'
                          : status === 'inactive'
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/45 dark:text-amber-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/45 dark:text-red-200';
                      const dotClass =
                        status === 'online'
                          ? 'bg-green-500'
                          : status === 'inactive'
                            ? 'bg-amber-500'
                            : 'bg-red-600 dark:bg-red-500';

                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${rowBorder}`}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{displayName}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{u.email || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{department}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{team}</td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full flex-shrink-0 ring-2 ring-white/50 dark:ring-black/20 ${dotClass}`}
                                aria-hidden
                              />
                              {status === 'online' && 'Online'}
                              {status === 'inactive' && 'Inactive'}
                              {status === 'offline' && 'Offline'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {onboardingCohortUsersForYear.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={5}>
                          No accounts with onboarding in {activeYear}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offboarding */}
      {activeTab === 'offboarding' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Offboarding ({activeYear})</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {/* Nested tabs: Records / Requirements / Requirements tracker */}
              <div className="flex flex-wrap gap-2">
                {offboardingTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setOffboardingInnerTab(tab.id);
                      const next = new URLSearchParams(searchParams);
                      next.set('offboarding', '');
                      next.set('offboarding_tab', tab.id);
                      setSearchParams(next);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      offboardingInnerTab === tab.id
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {canManageRecords && offboardingInnerTab === 'records' && (
                <button
                  type="button"
                  onClick={() => setShowOffboardingModal(true)}
                  className="mt-1 sm:mt-0 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add offboarding
                </button>
              )}
            </div>
          </div>

          {offboardingInnerTab === 'records' && (
            <div className="space-y-2">
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap mr-1">
                      Reference links
                    </p>
                    <a
                      href={OFFBOARDING_COC_ONEDRIVE_LINK}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-[#6795BE]/30 bg-[#6795BE]/10 dark:bg-[#6795BE]/20 px-3 py-1.5 text-xs font-semibold text-[#2e5f89] dark:text-[#b8d8f0] hover:bg-[#6795BE]/20 dark:hover:bg-[#6795BE]/30 transition-colors"
                    >
                      COC OneDrive
                    </a>
                    <a
                      href={OFFBOARDING_EMAIL_STRUCTURE_LINK}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-indigo-300/40 bg-indigo-50 dark:bg-indigo-900/25 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/35 transition-colors"
                    >
                      Email Structure
                    </a>
                  </div>
                  {canManageRecords && (
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <div className="relative w-full sm:w-[280px]">
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                        >
                          <circle cx="8.5" cy="8.5" r="4.75" stroke="currentColor" strokeWidth="1.8" fill="none" />
                          <path d="M12.2 12.2 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <input
                          value={offboardingSearch}
                          onChange={(e) => setOffboardingSearch(e.target.value)}
                          placeholder="Search department, name, email…"
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 pl-9 pr-3 py-1.5 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                        />
                      </div>
                      <div className="relative">
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                        >
                          <path
                            d="M6 4.5h8M7.5 8h5M9 11.5h2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            fill="none"
                          />
                          <path d="m12.8 13.8 1.7 1.7 1.7-1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                        <select
                          value={offboardingSort}
                          onChange={(e) => setOffboardingSort(e.target.value)}
                          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 pl-9 pr-3 py-1.5 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                        >
                          <option value="date_desc">Actual end date (newest)</option>
                          <option value="date_asc">Actual end date (oldest)</option>
                          <option value="intern_asc">Intern name (A–Z)</option>
                          <option value="intern_desc">Intern name (Z–A)</option>
                          <option value="email_asc">Email (A–Z)</option>
                          <option value="email_desc">Email (Z–A)</option>
                          <option value="status_asc">Status (A–Z)</option>
                          <option value="status_desc">Status (Z–A)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Last name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">First name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Actual end date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Hours</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {displayedOffboarding.map((r) => {
                      const statusLabel = offboardingStatusFromRow(r);
                      const statusClass =
                        statusLabel === 'Completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/45 dark:text-green-200'
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/45 dark:text-amber-200';
                      return (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.department || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.last_name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.first_name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                            {formatMonthDayYear(r.actual_end_date)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{r.hours ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{r.email || '—'}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditOffboardingRow(r)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                                style={{ backgroundColor: PRIMARY }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteOffboardingRow(r)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {displayedOffboarding.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center" colSpan={8}>
                          No offboarding records for {activeYear}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Requirements (nested under Onboarding) */}
      {activeTab === 'onboarding' && onboardingInnerTab === 'requirements' && canSubmitRequirements && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Onboarding Requirements</h2>
          </div>

          {/* Intern submission form (all interns) */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 space-y-3"
          >
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Submit your onboarding requirements files here. Your account details (name, email, team) are linked
              automatically; you don&apos;t need to type them.
            </p>

            <div className="mt-4">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Requirement
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File upload
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                  {REQUIREMENTS_META.map((meta) => {
                    const req = currentUserRequirements;
                    const hasFile = req && (req[meta.pathField] || req[meta.flagField]);
                    let statusLabel = 'Not submitted';
                    if (hasFile) {
                      statusLabel = req?.status === 'verified' ? 'Verified' : 'Pending verification';
                    }
                    const isVerified = !!(req && req.status === 'verified');
                    const isPendingVerification = !!(hasFile && !isVerified);
                    const inReplaceMode = !!requirementsReplaceMode?.[meta.key];
                    return (
                      <tr key={meta.key} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                          <div className="font-medium">{meta.label}</div>
                          {meta.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                          {statusLabel}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                          <div className="flex flex-col gap-2">
                            {/* First-time submit */}
                            {!hasFile && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="file"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setRequirementsFiles((prev) => ({
                                      ...prev,
                                      [meta.key]: file,
                                    }));
                                  }}
                                  className="block w-full text-xs text-gray-700 dark:text-gray-200 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 dark:file:bg-gray-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-gray-700"
                                />
                                <button
                                  type="button"
                                  disabled={requirementsSubmitting}
                                  className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{ backgroundColor: PRIMARY }}
                                  onClick={async () => {
                                    const file = requirementsFiles[meta.key];
                                    if (!file) {
                                      toast.error('Please choose a file before submitting.');
                                      return;
                                    }
                                    await handleRequirementsSubmit();
                                  }}
                                >
                                  {requirementsSubmitting ? 'Submitting…' : 'Submit'}
                                </button>
                              </div>
                            )}

                            {/* Pending verification: show “Resubmit” -> reveal file picker */}
                            {isPendingVerification && !inReplaceMode && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={requirementsSubmitting}
                                  className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{ backgroundColor: PRIMARY }}
                                  onClick={() => {
                                    setRequirementsReplaceMode((prev) => ({ ...prev, [meta.key]: true }));
                                  }}
                                >
                                  Resubmit / Replace file
                                </button>
                              </div>
                            )}

                            {isPendingVerification && inReplaceMode && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="file"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setRequirementsFiles((prev) => ({
                                      ...prev,
                                      [meta.key]: file,
                                    }));
                                  }}
                                  className="block w-full text-xs text-gray-700 dark:text-gray-200 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 dark:file:bg-gray-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-gray-700"
                                />
                                <button
                                  type="button"
                                  disabled={requirementsSubmitting}
                                  className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{ backgroundColor: PRIMARY }}
                                  onClick={async () => {
                                    const file = requirementsFiles[meta.key];
                                    if (!file) {
                                      toast.error('Please choose a replacement file.');
                                      return;
                                    }
                                    const ok = window.confirm(
                                      `Replace your pending ${meta.label} submission? This will mark it as pending verification again.`
                                    );
                                    if (!ok) return;
                                    await handleRequirementsSubmit();
                                  }}
                                >
                                  {requirementsSubmitting ? 'Replacing…' : 'Replace & Resubmit'}
                                </button>
                                <button
                                  type="button"
                                  disabled={requirementsSubmitting}
                                  className="px-2 py-1 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                  onClick={() => {
                                    setRequirementsReplaceMode((prev) => ({ ...prev, [meta.key]: false }));
                                    setRequirementsFiles((prev) => ({ ...prev, [meta.key]: null }));
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            {/* Verified: lock */}
                            {isVerified && <div className="text-xs text-gray-500 dark:text-gray-400">—</div>}
                          </div>
                          {req && req[meta.pathField] && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              File on record
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Upload files for each requirement. Once reviewed by Admin / TL/VTL, the status will change from
                &quot;Pending verification&quot; to &quot;Verified&quot;.
              </p>
            </div>

            {/* No explicit Save button; uploads are saved automatically when files are selected. */}
          </form>

        </div>
      )}

      {/* Requirements tracker (nested under Onboarding) - staff only */}
      {activeTab === 'onboarding' && onboardingInnerTab === 'requirementsTracker' && canManageRequirements && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Onboarding Requirements Tracker</h2>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Requirements tracker (staff view)</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Admin and TL/VTL of the TLA team can verify intern requirements here. Only people whose{' '}
                <span className="font-medium">onboarding record year</span> matches <span className="font-medium">{activeYear}</span>{' '}
                (selected year tab above) are listed.
              </p>
              <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">Status colors:</span>{' '}
                <span className="inline-flex items-center gap-1 mr-3">
                  <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden />
                  No submission
                </span>
                <span className="inline-flex items-center gap-1 mr-3">
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                  Incomplete
                </span>
                <span className="inline-flex items-center gap-1 mr-3">
                  <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                  Pending verification
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
                  Complete
                </span>
              </p>
            </div>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {requirementsTrackerRows.map(({ user: u, req, on }) => {
                  const hasRow = !!req;
                  const total = REQUIREMENTS_META.length;
                  const submittedCount = hasRow
                    ? REQUIREMENTS_META.filter(
                        (meta) => req[meta.pathField] || req[meta.flagField]
                      ).length
                    : 0;
                  const allSubmitted = hasRow && submittedCount === total;

                  let label = 'No submission';
                  /** @type {'none' | 'incomplete' | 'pending' | 'complete'} */
                  let statusKey = 'none';
                  if (!hasRow || submittedCount === 0) {
                    label = 'No submission';
                    statusKey = 'none';
                  } else if (!allSubmitted) {
                    label = 'Incomplete';
                    statusKey = 'incomplete';
                  } else if (req.status === 'verified') {
                    label = 'Complete';
                    statusKey = 'complete';
                  } else {
                    label = 'Submitted (Pending verification)';
                    statusKey = 'pending';
                  }

                  const reqStatusStyles = {
                    none: {
                      rowBorder: 'border-l-4 border-l-slate-400',
                      badge:
                        'bg-slate-100 text-slate-800 dark:bg-slate-800/55 dark:text-slate-200',
                      dot: 'bg-slate-500',
                    },
                    incomplete: {
                      rowBorder: 'border-l-4 border-l-amber-500',
                      badge:
                        'bg-amber-100 text-amber-900 dark:bg-amber-900/45 dark:text-amber-200',
                      dot: 'bg-amber-500',
                    },
                    pending: {
                      rowBorder: 'border-l-4 border-l-blue-500',
                      badge:
                        'bg-blue-100 text-blue-900 dark:bg-blue-900/45 dark:text-blue-200',
                      dot: 'bg-blue-500',
                    },
                    complete: {
                      rowBorder: 'border-l-4 border-l-green-500',
                      badge:
                        'bg-green-100 text-green-800 dark:bg-green-900/45 dark:text-green-200',
                      dot: 'bg-green-500',
                    },
                  };
                  const st = reqStatusStyles[statusKey];

                  return (
                  <tr key={u.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${st.rowBorder}`}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{(on?.name || u.full_name || req?.name || '').trim() || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{u.email || req?.email || on?.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {req?.department || on?.department || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {formatTeamLabel(req?.team || on?.team || u.team) || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.badge}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full flex-shrink-0 ring-2 ring-white/50 dark:ring-black/20 ${st.dot}`}
                          aria-hidden
                        />
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewOnboardingRequirementsRow({ user: u, req: req || null, on: on || null });
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {requirementsTrackerRows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center" colSpan={15}>
                      No onboarding cohort for {activeYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offboarding Requirements tracker (nested under Offboarding) - staff only */}
      {activeTab === 'offboarding' && offboardingInnerTab === 'requirementsTracker' && canManageRequirements && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Offboarding Requirements Tracker</h2>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Requirements tracker (staff view)</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Admin and TL/VTL of the TLA team can verify offboarding requirements here. Rows are limited to{' '}
                <span className="font-medium">offboarding records whose end date falls in {activeYear}</span>.
              </p>
            </div>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">TLA Signature</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IT Manager Signature</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">COC/LOC Creation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email Certificates</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">One Drive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {offboardingRequirementsTrackerRows.map(({ user: u, off }) => (
                  <tr key={off.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {u?.full_name || `${off.first_name || ''} ${off.last_name || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {u?.email || off.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {off.department || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {formatTeamLabel(off.team || u?.team) || off.team || u?.team || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">{toBool(off.tla_signature) ? 'Signed' : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">{toBool(off.it_manager_signature) ? 'Signed' : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">{toBool(off.coc_cll_creation) ? 'Created' : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">{toBool(off.email_certificates) ? 'Email sent' : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">{toBool(off.one_drive) ? 'Uploaded' : '—'}</td>
                  </tr>
                ))}
                {offboardingRequirementsTrackerRows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center" colSpan={10}>
                      No offboarding records ending in {activeYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onboarding requirements detail modal */}
      {viewOnboardingRequirementsRow && (
        <Modal open={!!viewOnboardingRequirementsRow} onClose={() => setViewOnboardingRequirementsRow(null)}>
          <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Onboarding requirements</h2>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                  Review submitted onboarding requirements for this intern/TL/VTL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewOnboardingRequirementsRow(null)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto dark:text-gray-100">
              {(() => {
                const { user: u, req, on } = viewOnboardingRequirementsRow;
                const displayName = (on?.name || u?.full_name || req?.name || '').trim() || '—';
                const overallStatus = req ? (req.status === 'verified' ? 'Verified' : 'Pending') : 'Pending';
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</div>
                        <div className="text-gray-900 dark:text-gray-100">{displayName}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</div>
                        <div className="text-gray-900 dark:text-gray-100">{u?.email || req?.email || on?.email || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Department</div>
                        <div className="text-gray-900 dark:text-gray-100">{req?.department || on?.department || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Team</div>
                        <div className="text-gray-900 dark:text-gray-100">{formatTeamLabel(req?.team || on?.team || u?.team) || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Overall status</div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              overallStatus === 'Verified'
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200'
                                : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200'
                            }`}
                          >
                            {overallStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <table className="min-w-full table-auto divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Requirement</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Verified by</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Verified at</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {REQUIREMENTS_META.map((meta) => {
                            const hasFile = req && (req[meta.pathField] || req[meta.flagField]);
                            let statusLabel = 'Not submitted';
                            if (hasFile) {
                              statusLabel = req?.status === 'verified' ? 'Verified' : 'Pending verification';
                            }
                            const bucket = 'onboarding-requirements';
                            const canViewFile = !!(req && req[meta.pathField]);
                            return (
                              <tr key={meta.key}>
                                <td className="px-4 py-2 align-top">
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{meta.label}</div>
                                  {meta.description && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</div>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                                  <div className="flex items-center gap-2">
                                    <span>{statusLabel}</span>
                                    {canViewFile && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const path = req[meta.pathField];
                                            const { data } = await supabase.storage
                                              .from(bucket)
                                              .getPublicUrl(path);
                                            const url = data?.publicUrl;
                                            if (url) {
                                              window.open(url, '_blank', 'noopener,noreferrer');
                                            } else {
                                              toast.error('Could not generate file URL.');
                                            }
                                          } catch (err) {
                                            console.error('Open requirement file error:', err);
                                            toast.error('Failed to open file.');
                                          }
                                        }}
                                        className="px-2 py-0.5 rounded text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                                      >
                                        View file
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                  {hasFile && req?.verified_by ? onboardingVerifiedByName || '—' : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                  {hasFile && req?.verified_at
                                    ? new Date(req.verified_at).toLocaleString()
                                    : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                  {req && req.status !== 'verified' && hasFile ? (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const { error } = await supabase
                                            .from('onboarding_requirements')
                                            .update({
                                              status: 'verified',
                                              verified_by: user?.id || null,
                                              verified_at: new Date().toISOString(),
                                            })
                                            .eq('id', req.id);
                                          if (error) throw error;
                                          toast.success('Marked as verified.');
                                          setViewOnboardingRequirementsRow((prev) =>
                                            prev ? { ...prev, req: { ...prev.req, status: 'verified', verified_by: user?.id || null, verified_at: new Date().toISOString() } } : prev
                                          );
                                          await fetchData(true);
                                        } catch (err) {
                                          console.error('Verify requirements error:', err);
                                          toast.error(err?.message || 'Failed to verify requirements.');
                                        }
                                      }}
                                      className="px-3 py-1 rounded-lg text-[11px] font-medium text-white"
                                      style={{ backgroundColor: PRIMARY }}
                                    >
                                      Verify
                                    </button>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewOnboardingRequirementsRow(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                Close
              </button>
              {viewOnboardingRequirementsRow?.req && viewOnboardingRequirementsRow.req.status !== 'verified' && (
                <button
                  type="button"
                  onClick={async () => {
                    const req = viewOnboardingRequirementsRow.req;
                    try {
                      const { error } = await supabase
                        .from('onboarding_requirements')
                        .update({
                          status: 'verified',
                          verified_by: user?.id || null,
                          verified_at: new Date().toISOString(),
                        })
                        .eq('id', req.id);
                      if (error) throw error;
                      toast.success('Marked as verified.');
                      setViewOnboardingRequirementsRow(null);
                      await fetchData(true);
                    } catch (err) {
                      console.error('Verify requirements error:', err);
                      toast.error(err?.message || 'Failed to verify requirements.');
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Mark all as verified
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Offboarding requirements detail modal */}
      {viewOffboardingRequirementsRow && (
        <Modal open={!!viewOffboardingRequirementsRow} onClose={() => setViewOffboardingRequirementsRow(null)}>
          <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Offboarding requirements</h2>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                  Review submitted offboarding requirements for this intern/TL/VTL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewOffboardingRequirementsRow(null)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto dark:text-gray-100">
              {(() => {
                const { user: u, req, off } = viewOffboardingRequirementsRow;
                const overallStatus = req ? (req.status === 'verified' ? 'Verified' : 'Pending') : 'Pending';
                const displayName =
                  u?.full_name ||
                  req?.name ||
                  `${off?.first_name || ''} ${off?.last_name || ''}`.trim() ||
                  '—';
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</div>
                        <div className="text-gray-900 dark:text-gray-100">{displayName}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</div>
                        <div className="text-gray-900 dark:text-gray-100">{u?.email || req?.email || off?.email || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Department</div>
                        <div className="text-gray-900 dark:text-gray-100">{req?.department || off?.department || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Team</div>
                        <div className="text-gray-900 dark:text-gray-100">{u?.team || req?.team || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Overall status</div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              overallStatus === 'Verified'
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200'
                                : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200'
                            }`}
                          >
                            {overallStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <table className="min-w-full table-auto divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Requirement</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Verified by</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Verified at</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {OFFBOARDING_REQUIREMENTS_META.map((meta) => {
                            const hasFile = req && (req[meta.pathField] || req[meta.flagField]);
                            let statusLabel = 'Not submitted';
                            if (hasFile) {
                              statusLabel = req?.status === 'verified' ? 'Verified' : 'Pending verification';
                            }
                            const bucket = 'offboarding-requirements';
                            const canViewFile = !!(req && req[meta.pathField]);
                            return (
                              <tr key={meta.key}>
                                <td className="px-4 py-2 align-top">
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{meta.label}</div>
                                  {meta.description && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</div>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                                  <div className="flex items-center gap-2">
                                    <span>{statusLabel}</span>
                                    {canViewFile && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const path = req[meta.pathField];
                                            const { data } = await supabase.storage
                                              .from(bucket)
                                              .getPublicUrl(path);
                                            const url = data?.publicUrl;
                                            if (url) {
                                              window.open(url, '_blank', 'noopener,noreferrer');
                                            } else {
                                              toast.error('Could not generate file URL.');
                                            }
                                          } catch (err) {
                                            console.error('Open offboarding requirement file error:', err);
                                            toast.error('Failed to open file.');
                                          }
                                        }}
                                        className="px-2 py-0.5 rounded text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/35 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                      >
                                        View file
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                  {hasFile && req?.verified_by ? offboardingVerifiedByName || '—' : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                  {hasFile && req?.verified_at
                                    ? new Date(req.verified_at).toLocaleString()
                                    : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                                  {req && req.status !== 'verified' && hasFile ? (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const { error } = await supabase
                                            .from('offboarding_requirements')
                                            .update({
                                              status: 'verified',
                                              verified_by: user?.id || null,
                                              verified_at: new Date().toISOString(),
                                            })
                                            .eq('id', req.id);
                                          if (error) throw error;
                                          toast.success('Marked as verified.');
                                          setViewOffboardingRequirementsRow((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  req: {
                                                    ...prev.req,
                                                    status: 'verified',
                                                    verified_by: user?.id || null,
                                                    verified_at: new Date().toISOString(),
                                                  },
                                                }
                                              : prev
                                          );
                                          await fetchData(true);
                                        } catch (err) {
                                          console.error('Verify offboarding requirements error:', err);
                                          toast.error(err?.message || 'Failed to verify offboarding requirements.');
                                        }
                                      }}
                                      className="px-3 py-1 rounded-lg text-[11px] font-medium text-white"
                                      style={{ backgroundColor: PRIMARY }}
                                    >
                                      Verify
                                    </button>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewOffboardingRequirementsRow(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Close
              </button>
              {viewOffboardingRequirementsRow?.req && viewOffboardingRequirementsRow.req.status !== 'verified' && (
                <button
                  type="button"
                  onClick={async () => {
                    const req = viewOffboardingRequirementsRow.req;
                    try {
                      const { error } = await supabase
                        .from('offboarding_requirements')
                        .update({
                          status: 'verified',
                          verified_by: user?.id || null,
                          verified_at: new Date().toISOString(),
                        })
                        .eq('id', req.id);
                      if (error) throw error;
                      toast.success('Marked as verified.');
                      setViewOffboardingRequirementsRow(null);
                      await fetchData(true);
                    } catch (err) {
                      console.error('Verify offboarding requirements error:', err);
                      toast.error(err?.message || 'Failed to verify offboarding requirements.');
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Mark all as verified
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {/* Onboarding modal form */}
      {canManageRecords && (
        <Modal
          open={showOnboardingModal}
          onClose={() => {
            if (!terminatingOnboarding) setShowOnboardingModal(false);
          }}
        >
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {editingOnboardingId ? 'Edit onboarding record' : 'Add onboarding record'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!terminatingOnboarding) setShowOnboardingModal(false);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleOnboardingSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Onboarding date</label>
                  <PrettyDatePicker
                    id="onboarding-date"
                    value={onboardingForm.onboarding_date}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, onboarding_date: e.target.value }))}
                    ariaLabel="Select onboarding date"
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">dd/mm/yyyy</p>
                  {onboardingSubmitAttempted && !onboardingForm.onboarding_date && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Onboarding time (optional)</label>
                  <input
                    type="time"
                    value={onboardingForm.onboarding_time}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, onboarding_time: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">--:-- --</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Start date</label>
                  <PrettyDatePicker
                    id="onboarding-start-date"
                    value={onboardingForm.start_date}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, start_date: e.target.value }))}
                    ariaLabel="Select start date"
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">dd/mm/yyyy</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Department</label>
                  <select
                    value={onboardingForm.department}
                    onChange={(e) => {
                      const nextDept = e.target.value;
                      setOnboardingForm((f) => ({
                        ...f,
                        department: nextDept,
                        team: nextDept === 'IT' ? f.team : '',
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                  >
                    <option value="">Select department</option>
                    <option value="IT">IT</option>
                    <option value="HR">HR</option>
                    <option value="Marketing">Marketing</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Hours</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.25"
                    value={onboardingForm.hours}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, hours: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="e.g. 120"
                  />
                  {onboardingSubmitAttempted &&
                    !editingOnboardingId &&
                    (!onboardingForm.hours ||
                      Number.isNaN(Number(onboardingForm.hours)) ||
                      Number(onboardingForm.hours) <= 0) && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">School</label>
                  <input
                    type="text"
                    value={onboardingForm.school}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, school: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="e.g. University of the Philippines"
                  />
                  {onboardingSubmitAttempted && !editingOnboardingId && !onboardingForm.school.trim() && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Name</label>
                  <input
                    type="text"
                    value={onboardingForm.name}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="e.g. Juan Dela Cruz"
                    required
                  />
                  {onboardingSubmitAttempted && !onboardingForm.name.trim() && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email</label>
                  <input
                    type="email"
                    value={onboardingForm.email}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="e.g. juan.delacruz@company.com"
                  />
                </div>
              </div>

              {onboardingForm.department === 'IT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Team</label>
                  <select
                    value={onboardingForm.team}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, team: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                  >
                    <option value="">Select team</option>
                    <option value="TLA">Team Lead Assistant</option>
                    <option value="PAT1">PAT1</option>
                    <option value="Monitoring">Monitoring Team</option>
                  </select>
                  {onboardingSubmitAttempted && !onboardingForm.team.trim() && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required for IT.</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Team is only needed for IT; HR and Marketing are treated as HR/Marketing Interns automatically.
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 mt-2 space-y-3">
                {editingOnboardingId && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-[11px] leading-snug text-red-600 sm:max-w-xs">
                      Terminating this intern will permanently remove their onboarding record from the database.
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTerminateOnboardingModal(true)}
                      disabled={terminatingOnboarding}
                      className="self-start sm:self-auto px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 shadow-sm"
                    >
                      {terminatingOnboarding ? 'Terminating…' : 'Terminate intern'}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOnboardingModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    disabled={terminatingOnboarding}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: PRIMARY }}
                    disabled={
                      terminatingOnboarding ||
                      !onboardingForm.onboarding_date ||
                      !onboardingForm.name.trim() ||
                      (onboardingForm.department === 'IT' && !onboardingForm.team.trim()) ||
                      (!editingOnboardingId &&
                        (!onboardingForm.department?.trim() ||
                          !onboardingForm.start_date ||
                          !onboardingForm.hours ||
                          Number.isNaN(Number(onboardingForm.hours)) ||
                          Number(onboardingForm.hours) <= 0 ||
                          !onboardingForm.school.trim()))
                    }
                  >
                    {editingOnboardingId ? 'Save changes' : 'Save onboarding'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Terminate onboarding confirmation modal */}
      {canManageRecords && (
        <Modal
          open={showTerminateOnboardingModal}
          onClose={() => {
            if (!terminatingOnboarding) setShowTerminateOnboardingModal(false);
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Terminate intern</h2>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-gray-700">
              <p>
                Are you sure you want to{' '}
                <span className="font-semibold text-red-600">terminate this intern</span>?
              </p>
              <p>
                This action will automatically remove the intern&apos;s onboarding record from the database. This
                cannot be undone.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!terminatingOnboarding) setShowTerminateOnboardingModal(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                disabled={terminatingOnboarding}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTerminateOnboarding}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
                disabled={terminatingOnboarding}
              >
                {terminatingOnboarding ? 'Terminating…' : 'Yes, terminate intern'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Offboarding modal form */}
      {canManageRecords && editingOffboardingRow && (
        <Modal open={!!editingOffboardingRow} onClose={cancelEditOffboardingRow}>
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit offboarding checklist</h2>
              <button
                type="button"
                onClick={cancelEditOffboardingRow}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {`${editingOffboardingRow.first_name || ''} ${editingOffboardingRow.last_name || ''}`.trim() || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{editingOffboardingRow.email || '—'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-950/40">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Checklist requirements</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    ['tla_signature', 'TLA Signature'],
                    ['it_manager_signature', 'IT Manager Signature'],
                    ['coc_cll_creation', 'COC/CLL Creation'],
                    ['email_certificates', 'Email Certificates'],
                    ['one_drive', 'One Drive'],
                  ].map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={!!offboardingEditDraft[key]}
                        onChange={(e) =>
                          setOffboardingEditDraft((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-700"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Notes (Optional)</label>
                <textarea
                  value={offboardingEditDraft.notes}
                  onChange={(e) => setOffboardingEditDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="Add notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelEditOffboardingRow}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveEditOffboardingRow(editingOffboardingRow)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Offboarding modal form */}
      {canManageRecords && (
        <Modal open={showOffboardingModal} onClose={() => setShowOffboardingModal(false)}>
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add offboarding record</h2>
              <button
                type="button"
                onClick={() => setShowOffboardingModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleOffboardingSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Intern</label>
                  <select
                    value={offboardingForm.email}
                    onChange={(e) => {
                      const email = e.target.value;
                      const match = onboardingCandidates.find(
                        (r) => (r.email || '').trim().toLowerCase() === email.trim().toLowerCase()
                      );
                      if (!match) {
                        setOffboardingForm((f) => ({
                          ...f,
                          email: '',
                          first_name: '',
                          last_name: '',
                        }));
                        return;
                      }
                      const parts = String(match.name || '').trim().split(/\s+/).filter(Boolean);
                      const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
                      const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '');
                      setOffboardingForm((f) => ({
                        ...f,
                        email: match.email || '',
                        department: match.department || f.department || '',
                        first_name: firstName || f.first_name,
                        last_name: lastName || f.last_name,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">
                      {`Select intern from ${activeYear} onboarding...`}
                    </option>
                    {onboardingCandidates.map((r) => (
                      <option key={r.id} value={r.email || ''}>
                        {r.name || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                  {offboardingSubmitAttempted && !offboardingForm.email?.trim() && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Department</label>
                  <input
                    type="text"
                    value={offboardingForm.department}
                    onChange={(e) => setOffboardingForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="e.g. IT"
                  />
                  {offboardingSubmitAttempted && !offboardingForm.department.trim() && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Actual end date</label>
                  <PrettyDatePicker
                    id="offboarding-actual-end-date"
                    value={offboardingForm.actual_end_date}
                    onChange={(e) => setOffboardingForm((f) => ({ ...f, actual_end_date: e.target.value }))}
                    ariaLabel="Select actual end date"
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">dd/mm/yyyy</p>
                  {offboardingSubmitAttempted && !offboardingForm.actual_end_date && (
                    <p className="mt-1 text-xs font-medium text-red-600">Required.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={offboardingForm.hours}
                    onChange={(e) => setOffboardingForm((f) => ({ ...f, hours: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="e.g. 160, 320"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email (Auto-filled)</label>
                  <input
                    type="text"
                    value={offboardingForm.email || ''}
                    readOnly
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    placeholder="Auto-filled from selected intern"
                  />
                </div>
              </div>

              <div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Select an intern from the onboarding list for {activeYear}. Email is populated automatically.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOffboardingModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                  disabled={
                    !offboardingForm.department.trim() ||
                    !offboardingForm.last_name.trim() ||
                    !offboardingForm.first_name.trim() ||
                    !offboardingForm.actual_end_date ||
                    !offboardingForm.email?.trim()
                  }
                >
                  Save offboarding
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}

