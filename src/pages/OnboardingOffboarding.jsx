import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';

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

function splitName(fullName) {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const onboardingInnerParam = searchParams.get('onboarding_tab'); // 'records' | 'requirements' | 'requirementsTracker'
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
      : 'records'
  ); // 'records' | 'requirements' | 'requirementsTracker'
  const [offboardingInnerTab, setOffboardingInnerTab] = useState(
    offboardingInnerParam === 'requirements'
      ? 'requirements'
      : offboardingInnerParam === 'requirementsTracker'
      ? 'requirementsTracker'
      : 'records'
  ); // 'records' | 'requirements' | 'requirementsTracker'
  const [userTeam, setUserTeam] = useState(null);

  const [onboardingForm, setOnboardingForm] = useState({
    onboarding_date: '',
    onboarding_time: '',
    name: '',
    email: '',
    department: '',
    team: '',
    start_date: '',
  });

  const [offboardingForm, setOffboardingForm] = useState({
    department: '',
    last_name: '',
    first_name: '',
    actual_end_date: '',
    hours: '',
    email: '',
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

  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showOffboardingModal, setShowOffboardingModal] = useState(false);
  const [editingOnboardingId, setEditingOnboardingId] = useState(null);
  const [viewOnboardingRequirementsRow, setViewOnboardingRequirementsRow] = useState(null); // { user, req }
  const [viewOffboardingRequirementsRow, setViewOffboardingRequirementsRow] = useState(null); // { user, req, off }
  const [onboardingVerifiedByName, setOnboardingVerifiedByName] = useState(null);
  const [offboardingVerifiedByName, setOffboardingVerifiedByName] = useState(null);

  const isTlaTeam = userTeam && String(userTeam).toLowerCase() === 'tla';

  const canManage =
    userRole === 'admin' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);

  const canManageRequirements = canManage;

  const canSubmitRequirements =
    userRole === 'intern' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);

  const onboardingTabs = useMemo(() => {
    const tabs = [{ id: 'records', label: 'Records' }];
    if (canSubmitRequirements) tabs.push({ id: 'requirements', label: 'Requirements' });
    if (canManageRequirements) tabs.push({ id: 'requirementsTracker', label: 'Requirements tracker' });
    return tabs;
  }, [canSubmitRequirements, canManageRequirements]);

  const offboardingTabs = useMemo(() => {
    const tabs = [{ id: 'records', label: 'Records' }];
    if (canSubmitRequirements) tabs.push({ id: 'requirements', label: 'Requirements' });
    if (canManageRequirements) tabs.push({ id: 'requirementsTracker', label: 'Requirements tracker' });
    return tabs;
  }, [canSubmitRequirements, canManageRequirements]);

  useEffect(() => {
    fetchData();
  }, [supabase, user?.id, canManageRequirements]);

  const fetchData = async (bypassCache = false) => {
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
      if (canManageRequirements) {
        const { data: internsData, error: internsErr } = await supabase
          .from('users')
          .select('id, full_name, email, role, team')
          .in('role', ['intern', 'tl', 'vtl'])
          .order('full_name', { ascending: true });
        if (internsErr) {
          console.warn('Interns fetch error:', internsErr);
        }
        setInternUsers(Array.isArray(internsData) ? internsData : []);
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
      const offList = Array.isArray(offData) ? offData : [];
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
    onboarding.forEach((r) => {
      const y = getYear(r.onboarding_datetime);
      if (y) years.add(y);
    });
    offboarding.forEach((r) => {
      const y = getYear(r.actual_end_date);
      if (y) years.add(y);
    });
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [onboarding, offboarding]);

  useEffect(() => {
    if (!allYears.includes(activeYear) && allYears.length > 0) {
      setActiveYear(allYears[0]);
    }
  }, [allYears, activeYear]);

  const offboardedEmailSet = useMemo(() => {
    const set = new Set();
    offboarding.forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      if (email) set.add(email);
    });
    return set;
  }, [offboarding]);

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

  const filteredOnboarding = mergedOnboardingRows.filter(({ onboarding: r, user: u }) => {
    const email = (r?.email || u?.email || '').trim().toLowerCase();
    const isOffboarded = email && offboardedEmailSet.has(email);
    if (isOffboarded) return false;

    const year = r?.onboarding_datetime ? getYear(r.onboarding_datetime) : activeYear;
    return year === activeYear;
  });

  const filteredOffboarding = offboarding.filter((r) => getYear(r.actual_end_date) === activeYear);

  const onboardingCandidates = useMemo(() => {
    return onboarding.filter((r) => {
      const email = (r.email || '').trim().toLowerCase();
      if (!email) return false;
      return !offboardedEmailSet.has(email);
    });
  }, [onboarding, offboardedEmailSet]);

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    const { onboarding_date, onboarding_time, name, email, department, team, start_date } = onboardingForm;
    if (!onboarding_date || !name.trim()) {
      toast.error('Onboarding date and name are required.');
      return;
    }
    try {
      const datetime = onboarding_time
        ? new Date(`${onboarding_date}T${onboarding_time}`)
        : new Date(`${onboarding_date}T00:00:00`);

      const payload = {
        onboarding_datetime: datetime.toISOString(),
        name: name.trim(),
        email: email?.trim() || null,
        department: department?.trim() || null,
        team: team?.trim() || null,
        start_date: start_date || null,
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
      });
      setEditingOnboardingId(null);
      setShowOnboardingModal(false);
      queryCache.invalidate('onboarding:records');
      await fetchData(true);
    } catch (err) {
      console.error('Onboarding insert error:', err);
      toast.error(err?.message || 'Failed to add onboarding record.');
    }
  };

  const handleOffboardingSubmit = async (e) => {
    e.preventDefault();
    const { department, last_name, first_name, actual_end_date, hours, email } = offboardingForm;
    if (!actual_end_date || !email?.trim()) {
      toast.error('Actual end date and email (from onboarding) are required.');
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
      queryCache.invalidate('offboarding:records');
      await fetchData(true);
    } catch (err) {
      console.error('Offboarding insert error:', err);
      toast.error(err?.message || 'Failed to add offboarding record.');
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
    }
  };

  const requirementsTrackerRows = useMemo(() => {
    if (!canManageRequirements) return [];
    if (!internUsers || internUsers.length === 0) return [];
    return internUsers.map((u) => {
      const req = requirements.find((r) => r.intern_id === u.id) || null;
      const email = (u.email || '').trim().toLowerCase();
      const on = email ? onboardingByEmail.get(email) || null : null;
      return { user: u, req, on };
    });
  }, [internUsers, requirements, onboardingByEmail, canManageRequirements]);

  const offboardingRequirementsTrackerRows = useMemo(() => {
    if (!canManageRequirements) return [];
    if (!offboarding || offboarding.length === 0) return [];
    return offboarding.map((off) => {
      const email = (off.email || '').trim().toLowerCase();
      const userMatch =
        (email &&
          internUsers.find((u) => (u.email || '').trim().toLowerCase() === email)) ||
        null;
      const req =
        (userMatch &&
          offboardingRequirements.find((r) => r.intern_id === userMatch.id)) ||
        (email &&
          offboardingRequirements.find(
            (r) => (r.email || '').trim().toLowerCase() === email
          )) ||
        null;
      return { user: userMatch, req, off };
    });
  }, [offboarding, internUsers, offboardingRequirements, canManageRequirements]);

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
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Onboarding & Offboarding</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track intern onboarding and offboarding records by year.
        </p>
      </div>

      {/* Year tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {allYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setActiveYear(year)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              activeYear === year ? 'text-white' : 'text-gray-700 hover:bg-gray-100'
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
                ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                : 'bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Onboarding */}
      {activeTab === 'onboarding' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Onboarding ({activeYear})</h2>
          </div>

          {/* Nested tabs: Records / Requirements */}
          <div className="flex flex-wrap gap-2 mt-1">
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
                    ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                    : 'bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {onboardingInnerTab === 'records' && (
            <div className="space-y-3">
              {canManage && (
                <div className="flex justify-end">
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
                      });
                      setShowOnboardingModal(true);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Add onboarding
                  </button>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Onboarding date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Team</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Start date</th>
                      {canManage && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredOnboarding.map(({ onboarding: r, user: u }) => (
                      <tr key={r?.id || u?.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
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
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {r?.name || u?.full_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r?.email || u?.email || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r?.department || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatTeamLabel(r?.team || u?.team) || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r?.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-sm text-gray-600 space-x-2">
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
                                  });
                                  setShowOnboardingModal(true);
                                }}
                                className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
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
                                  });
                                  setShowOnboardingModal(true);
                                }}
                                className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100"
                              >
                                Add onboarding
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {filteredOnboarding.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={6}>
                          No onboarding records for {activeYear}.
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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Offboarding ({activeYear})</h2>
          </div>

          {/* Nested tabs: Records / Requirements / Requirements tracker */}
          <div className="flex flex-wrap gap-2 mt-1">
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
                    ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                    : 'bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {offboardingInnerTab === 'records' && (
            <div className="space-y-3">
              {canManage && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowOffboardingModal(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Add offboarding
                  </button>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Last name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">First name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actual end date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Hours</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredOffboarding.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{r.department || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.last_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.first_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r.actual_end_date ? new Date(r.actual_end_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.hours ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.email || '—'}</td>
                      </tr>
                    ))}
                    {filteredOffboarding.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={6}>
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
            <h2 className="text-base font-semibold text-gray-900">Onboarding Requirements</h2>
          </div>

          {/* Intern submission form (all interns) */}
          <form onSubmit={(e) => e.preventDefault()} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-sm text-gray-600">
              Submit your onboarding requirements files here. Your account details (name, email, team) are linked
              automatically; you don&apos;t need to type them.
            </p>

            <div className="mt-4">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
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
                <tbody className="bg-white divide-y divide-gray-100">
                  {REQUIREMENTS_META.map((meta) => {
                    const req = currentUserRequirements;
                    const hasFile = req && (req[meta.pathField] || req[meta.flagField]);
                    let statusLabel = 'Not submitted';
                    if (hasFile) {
                      statusLabel = req?.status === 'verified' ? 'Verified' : 'Pending verification';
                    }
                    return (
                      <tr key={meta.key}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          <div className="font-medium">{meta.label}</div>
                          {meta.description && (
                            <div className="text-xs text-gray-500">{meta.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {statusLabel}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
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
                              className="block w-full text-xs text-gray-700"
                            />
                            <button
                              type="button"
                              className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-60"
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
                              Submit
                            </button>
                          </div>
                          {req && req[meta.pathField] && (
                            <div className="mt-1 text-xs text-gray-500">
                              File on record
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-gray-500">
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
            <h2 className="text-base font-semibold text-gray-900">Onboarding Requirements Tracker</h2>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Requirements tracker (staff view)</h3>
              <p className="mt-1 text-xs text-gray-600">
                Admin and TL/VTL of the TLA team can verify intern requirements here.
              </p>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requirementsTrackerRows.map(({ user: u, req, on }) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{u.full_name || req?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.email || req?.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {req?.department || on?.department || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatTeamLabel(req?.team || on?.team || u.team) || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {(() => {
                        const hasRow = !!req;
                        const total = REQUIREMENTS_META.length;
                        const submittedCount = hasRow
                          ? REQUIREMENTS_META.filter(
                              (meta) => req[meta.pathField] || req[meta.flagField]
                            ).length
                          : 0;
                        const allSubmitted = hasRow && submittedCount === total;

                        let label = 'No submission';
                        let cls = 'bg-yellow-50 text-yellow-700';

                        if (!hasRow || submittedCount === 0) {
                          label = 'No submission';
                        } else if (!allSubmitted) {
                          label = 'Incomplete';
                        } else if (req.status === 'verified') {
                          label = 'Complete';
                          cls = 'bg-green-50 text-green-700';
                        } else {
                          label = 'Submitted (Pending verification)';
                        }

                        return (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewOnboardingRequirementsRow({ user: u, req: req || null, on: on || null });
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {requirementsTrackerRows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={15}>
                      No intern records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offboarding Requirements (nested under Offboarding) */}
      {activeTab === 'offboarding' && offboardingInnerTab === 'requirements' && canSubmitRequirements && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Offboarding Requirements</h2>
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-sm text-gray-600">
              Submit your offboarding requirements files here. Your account details (name, email, team) are linked
              automatically; you don&apos;t need to type them.
            </p>

            <div className="mt-4">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
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
                <tbody className="bg-white divide-y divide-gray-100">
                  {OFFBOARDING_REQUIREMENTS_META.map((meta) => {
                    const req = currentUserOffboardingRequirements;
                    const hasFile = req && (req[meta.pathField] || req[meta.flagField]);
                    let statusLabel = 'Not submitted';
                    if (hasFile) {
                      statusLabel = req?.status === 'verified' ? 'Verified' : 'Pending verification';
                    }
                    return (
                      <tr key={meta.key}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          <div className="font-medium">{meta.label}</div>
                          {meta.description && (
                            <div className="text-xs text-gray-500">{meta.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {statusLabel}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setOffboardingRequirementsFiles((prev) => ({
                                  ...prev,
                                  [meta.key]: file,
                                }));
                              }}
                              className="block w-full text-xs text-gray-700"
                            />
                            <button
                              type="button"
                              className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                              style={{ backgroundColor: PRIMARY }}
                              onClick={async () => {
                                const file = offboardingRequirementsFiles[meta.key];
                                if (!file) {
                                  toast.error('Please choose a file before submitting.');
                                  return;
                                }
                                await handleOffboardingRequirementsSubmit();
                              }}
                            >
                              Submit
                            </button>
                          </div>
                          {req && req[meta.pathField] && (
                            <div className="mt-1 text-xs text-gray-500">
                              File on record
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-gray-500">
                Upload files for each offboarding requirement. Once reviewed by Admin / TL/VTL, the status will change
                from &quot;Pending verification&quot; to &quot;Verified&quot;.
              </p>
            </div>
          </form>
        </div>
      )}

      {/* Offboarding Requirements tracker (nested under Offboarding) - staff only */}
      {activeTab === 'offboarding' && offboardingInnerTab === 'requirementsTracker' && canManageRequirements && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Offboarding Requirements Tracker</h2>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Requirements tracker (staff view)</h3>
              <p className="mt-1 text-xs text-gray-600">
                Admin and TL/VTL of the TLA team can verify offboarding requirements here.
              </p>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {offboardingRequirementsTrackerRows.map(({ user: u, req, off }) => (
                  <tr key={off.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {u?.full_name || req?.name || `${off.first_name || ''} ${off.last_name || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {u?.email || req?.email || off.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {req?.department || off.department || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {u?.team || req?.team || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {(() => {
                        const hasRow = !!req;
                        const total = OFFBOARDING_REQUIREMENTS_META.length;
                        const submittedCount = hasRow
                          ? OFFBOARDING_REQUIREMENTS_META.filter(
                              (meta) => req[meta.pathField] || req[meta.flagField]
                            ).length
                          : 0;
                        const allSubmitted = hasRow && submittedCount === total;

                        let label = 'No submission';
                        let cls = 'bg-yellow-50 text-yellow-700';

                        if (!hasRow || submittedCount === 0) {
                          label = 'No submission';
                        } else if (!allSubmitted) {
                          label = 'Incomplete';
                        } else if (req.status === 'verified') {
                          label = 'Complete';
                          cls = 'bg-green-50 text-green-700';
                        } else {
                          label = 'Submitted (Pending verification)';
                        }

                        return (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewOffboardingRequirementsRow({ user: u, req: req || null, off });
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {offboardingRequirementsTrackerRows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={15}>
                      No intern records found.
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
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Onboarding requirements</h2>
                <p className="mt-1 text-xs text-gray-600">
                  Review submitted onboarding requirements for this intern/TL/VTL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewOnboardingRequirementsRow(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              {(() => {
                const { user: u, req } = viewOnboardingRequirementsRow;
                const overallStatus = req ? (req.status === 'verified' ? 'Verified' : 'Pending') : 'Pending';
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs font-medium text-gray-500">Name</div>
                        <div className="text-gray-900">{u?.full_name || req?.name || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Email</div>
                        <div className="text-gray-900">{u?.email || req?.email || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Department</div>
                        <div className="text-gray-900">{req?.department || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Team</div>
                        <div className="text-gray-900">{req?.team || u?.team || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Overall status</div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              overallStatus === 'Verified' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                            }`}
                          >
                            {overallStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <table className="min-w-full table-auto divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requirement</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verified by</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verified at</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
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
                                  <div className="font-medium text-gray-900">{meta.label}</div>
                                  {meta.description && (
                                    <div className="text-xs text-gray-500">{meta.description}</div>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-gray-700">
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
                                <td className="px-4 py-2 text-xs text-gray-600">
                                  {hasFile && req?.verified_by ? onboardingVerifiedByName || '—' : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600">
                                  {hasFile && req?.verified_at
                                    ? new Date(req.verified_at).toLocaleString()
                                    : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600">
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
                                    <span className="text-gray-400">—</span>
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
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewOnboardingRequirementsRow(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
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
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Offboarding requirements</h2>
                <p className="mt-1 text-xs text-gray-600">
                  Review submitted offboarding requirements for this intern/TL/VTL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewOffboardingRequirementsRow(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto">
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
                        <div className="text-xs font-medium text-gray-500">Name</div>
                        <div className="text-gray-900">{displayName}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Email</div>
                        <div className="text-gray-900">{u?.email || req?.email || off?.email || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Department</div>
                        <div className="text-gray-900">{req?.department || off?.department || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Team</div>
                        <div className="text-gray-900">{u?.team || req?.team || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Overall status</div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              overallStatus === 'Verified' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                            }`}
                          >
                            {overallStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <table className="min-w-full table-auto divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requirement</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verified by</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verified at</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
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
                                  <div className="font-medium text-gray-900">{meta.label}</div>
                                  {meta.description && (
                                    <div className="text-xs text-gray-500">{meta.description}</div>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-gray-700">
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
                                        className="px-2 py-0.5 rounded text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                                      >
                                        View file
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600">
                                  {hasFile && req?.verified_by ? offboardingVerifiedByName || '—' : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600">
                                  {hasFile && req?.verified_at
                                    ? new Date(req.verified_at).toLocaleString()
                                    : '—'}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600">
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
                                    <span className="text-gray-400">—</span>
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
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewOffboardingRequirementsRow(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
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
      {canManage && (
        <Modal open={showOnboardingModal} onClose={() => setShowOnboardingModal(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Add onboarding record</h2>
              <button
                type="button"
                onClick={() => setShowOnboardingModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleOnboardingSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding date</label>
                  <input
                    type="date"
                    value={onboardingForm.onboarding_date}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, onboarding_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">dd/mm/yyyy</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding time (optional)</label>
                  <input
                    type="time"
                    value={onboardingForm.onboarding_time}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, onboarding_time: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">--:-- --</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                  <input
                    type="date"
                    value={onboardingForm.start_date}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">dd/mm/yyyy</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={onboardingForm.department}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={onboardingForm.name}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. Juan Dela Cruz"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={onboardingForm.email}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. juan.delacruz@company.com"
                  />
                </div>
              </div>

              {onboardingForm.department === 'IT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                  <select
                    value={onboardingForm.team}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, team: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select team</option>
                    <option value="TLA">Team Lead Assistant</option>
                    <option value="PAT1">PAT1</option>
                    <option value="Monitoring">Monitoring Team</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Team is only needed for IT; HR and Marketing are treated as HR/Marketing Interns automatically.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOnboardingModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Save onboarding
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Offboarding modal form */}
      {canManage && (
        <Modal open={showOffboardingModal} onClose={() => setShowOffboardingModal(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Add offboarding record</h2>
              <button
                type="button"
                onClick={() => setShowOffboardingModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleOffboardingSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual end date</label>
                  <input
                    type="date"
                    value={offboardingForm.actual_end_date}
                    onChange={(e) => setOffboardingForm((f) => ({ ...f, actual_end_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">dd/mm/yyyy</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={offboardingForm.hours}
                    onChange={(e) => setOffboardingForm((f) => ({ ...f, hours: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. 160, 320"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (from onboarding)</label>
                <select
                  value={offboardingForm.email}
                  onChange={(e) => {
                    const email = e.target.value;
                    setOffboardingForm((f) => ({ ...f, email }));
                    const match = onboardingCandidates.find(
                      (r) => (r.email || '').trim().toLowerCase() === email.trim().toLowerCase()
                    );
                    if (match) {
                      const { firstName, lastName } = splitName(match.name || '');
                      setOffboardingForm((f) => ({
                        ...f,
                        email: match.email || '',
                        department: match.department || f.department || '',
                        first_name: firstName || f.first_name,
                        last_name: lastName || f.last_name,
                      }));
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select from onboarding...</option>
                  {onboardingCandidates.map((r) => (
                    <option key={r.id} value={r.email || ''}>
                      {r.name || 'Unnamed'}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Choose an email from onboarding; department and name will fill automatically.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOffboardingModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
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

