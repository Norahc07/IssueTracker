import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { logAction } from '../utils/auditTrail.js';
import { permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';
import { createNotifications, getUserIdsByScope, notifyUser, scopeFromUserProfile } from '../utils/notifications.js';
import UdemyCourseTab from '../components/UdemyCourseTab.jsx';
import PrettyDatePicker from '../components/PrettyDatePicker.jsx';
import DomainUpdates from './DomainUpdates.jsx';

/** Shared copy for Domains tab — weekly WordPress plugin update expectations */
const WEEKLY_PLUGIN_SCHEDULE_BULLETS = [
  'WordPress plugin updates run on a weekly schedule.',
  'All plugins for all domains should be completed by Friday each week.',
  'On Monday, the team begins the next weekly update cycle across all domains.',
];

function WeeklyPluginScheduleNote({ open, onToggle, className = '' }) {
  return (
    <div
      className={`rounded-md border border-slate-200/90 bg-slate-50/90 dark:border-slate-600/50 dark:bg-slate-900/40 ${className}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/50"
      >
        <span className="pt-0.5 text-base leading-none shrink-0" aria-hidden>
          📌
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Weekly plugin update schedule</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-600 dark:text-slate-400">
            Finish all domains by Friday; a new cycle starts each Monday.
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{open ? 'Hide' : 'Details'}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="space-y-2 border-t border-slate-200/80 px-3 pt-2 pb-3 pl-9 text-sm text-slate-700 dark:border-slate-600/50 dark:text-slate-300">
          {WEEKLY_PLUGIN_SCHEDULE_BULLETS.map((text) => (
            <li key={text} className="flex gap-2">
              <span className="shrink-0 select-none" aria-hidden>
                📌
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PRIMARY = '#6795BE';
const TASK_STATUSES = {
  'to-do': 'Not Started',
  'in-progress': 'In Progress',
  'cancelled': 'Cancelled',
  'done': 'Complete',
  'review': 'Review',
};

const TASK_PRIORITIES = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const TASK_OPTIONS = [
  { name: 'Daily Report', description: 'Make and submit daily report to Sir Erick.' },
  { name: 'WordPress Updates (Old Domains)', description: 'Old Migrated Domains. (Notes: Update only on Mondays and Fridays. knowlesti.com must be updated everyday.)' },
  { name: 'WordPress Updates (New Domains)', description: 'New Migrated Domains. (Notes: Update only on Mondays and Fridays. knowlesti.com must be updated everyday.)' },
  { name: 'Google Search Console Crawling', description: 'Ensure all domains are indexed and note all issues.' },
  { name: 'Course Price Edit', description: 'Update course prices for selected domain.' },
  { name: 'Assisting Other Team', description: 'Assist other team with their task.' },
  { name: 'Intern Onboarding', description: 'Handle onboarding Intern.' },
  { name: 'Intern Offboarding', description: 'Handle offboarding Intern.' },
  { name: 'Internal Documentation Update', description: 'Review and update all standard operating procedures (SOPs).' },
  { name: 'Oversee Udemy Review', description: 'Assign and Manage Interns to do Udemy Course Review' },
];

const TASK_NAMES = TASK_OPTIONS.map((t) => t.name);

const SCANNING_OPTIONS = ['ok', 'move on', 'ongoing'];
const SCANNING_LABELS = { ok: 'Ok', 'move on': 'Move on', ongoing: 'On-going' };
const DOMAIN_ROW_STATUS_OPTIONS = ['done', 'need verification', 'blocked access'];
const UPDATE_STATUS_OPTIONS = ['Updated', 'Skipped', 'Failed'];
const POST_UPDATE_CHECK_OPTIONS = ['Ok', 'Issue Found'];

function Modal({ open, onClose, children, zIndexClassName = 'z-[2147483647]' }) {
  if (!open) return null;
  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} bg-black/60 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 2147483647 }}
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

const canAccessCourseListTab = (userRole, userTeam) => {
  const team = String(userTeam || '').toLowerCase();
  if (userRole === 'admin' || userRole === 'tla') return true;
  if ((userRole === 'tl' || userRole === 'vtl') && team === 'tla') return true;
  if (userRole === 'intern') return true; // all interns can access (view-only unless TLA; edit via canEditCourseList)
  return false;
};

const canEditCourseList = (userRole, userTeam) => {
  const team = String(userTeam || '').toLowerCase();
  if (userRole === 'admin' || userRole === 'tla') return true;
  if ((userRole === 'tl' || userRole === 'vtl') && team === 'tla') return true;
  if (userRole === 'intern') return true;
  return false;
};

const canDeleteCourseList = (userRole, userTeam) => {
  const team = String(userTeam || '').toLowerCase();
  if (userRole === 'admin') return true;
  if ((userRole === 'tl' || userRole === 'vtl') && team === 'tla') return true;
  if (userRole === 'intern') return true;
  return false;
};

const canManageDomainsForTla = (userRole, userTeam) => {
  const team = String(userTeam || '').toLowerCase();
  if (userRole === 'admin' || userRole === 'tla') return true;
  if ((userRole === 'tl' || userRole === 'vtl') && team === 'tla') return true;
  return false;
};

// Some domain fields can come back as strings (e.g., "false") depending on storage / migration.
// Normalize to a real boolean so checkboxes don't render as checked by accident.
const coerceBoolean = (raw) => {
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  if (raw === 1) return true;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === 't' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === 'f' || s === 'no' || s === 'n' || s === '0' || s === '') return false;
  return Boolean(raw);
};

// Supabase values may come as boolean or as strings (legacy); normalize to real boolean.
const toBool = (v) => {
  if (v === true) return true;
  if (v === false) return false;
  if (v === 1) return true;
  if (v === 0) return false;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  // Only treat common boolean-ish values as truthy.
  // (Legacy "done" values should not affect reCAPTCHA / Backup checkboxes.)
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
};

const scanningLabel = (raw) => {
  if (!raw) return '';
  const key = String(raw).trim().toLowerCase();
  return SCANNING_LABELS[key] || raw;
};

const COURSE_LIST_DOMAIN_COUNTRIES = [
  'Belize',
  'China',
  'Denmark',
  'Germany',
  'Hongkong',
  'India',
  'Indonesia',
  'Israel',
  'Japan',
  'Kenya',
  'Laos',
  'Luxembourg',
  'Mexico',
  'Netherlands',
  'New Zealand',
  'Nigeria',
  'Norway',
  'Pakistan',
  'Philippines',
  'Poland',
  'Qatar',
  'Singapore',
  'South Africa',
  'Spain',
  'Sweden',
  'Taiwan',
  'Timor-Leste',
  'UAE',
  'UK',
];

const VALID_COURSE_TYPES = ['G', 'S', 'G/S'];
const VALID_COURSE_STATUSES = ['done', 'has_issue', 'in_progress', 'different_title'];

// DB check constraint allows only 'G', 'S', or 'G/S'. Returns one of these exactly.
const courseTypeToDb = (value) => {
  if (value == null || value === '') return 'G';
  const v = String(value).trim().replace(/\s+/g, '');
  if (!v) return 'G';
  if (v === 'GS' || v === 'G/S' || v.toLowerCase() === 'g/s') return 'G/S';
  if (v === 'G') return 'G';
  if (v === 'S') return 'S';
  return 'G';
};

// Strict whitelist: only send values that pass DB check constraint. Prevents any edge-case violations.
// Uses strict equality against known literals to avoid unicode/encoding issues.
const sanitizeCourseType = (value) => {
  const normalized = courseTypeToDb(value);
  if (normalized === 'S') return 'S';
  if (normalized === 'G/S') return 'G/S';
  return 'G';
};

// Guarantee payload values match DB check constraints (avoids constraint violation)
const buildCorporateCoursePayload = (draft, row, userId) => {
  const raw = draft?.course_type ?? courseTypeToUi(row?.course_type);
  const courseType = sanitizeCourseType(raw);
  const status = statusToDb(draft?.status ?? row?.status);
  return {
    // Do not auto-fill a default title here. UI + handlers already require a title for creation.
    // This prevents accidental "New course" rows when an empty draft is inserted.
    course_title: ((draft?.course_title ?? row?.course_title ?? '').trim() || ''),
    course_type: courseType,
    status,
    updated_by: userId ?? null,
    updated_at: new Date().toISOString(),
  };
};

// Same validation for course_list_domain_items (same course_type/status constraints)
const buildDomainCoursePayload = (draft, row, userId) => {
  const raw = draft?.course_type ?? courseTypeToUi(row?.course_type);
  const courseType = sanitizeCourseType(raw);
  const status = statusToDb(draft?.status ?? row?.status);
  return {
    // Do not auto-fill a default title here. UI + handlers already require a title for creation.
    // This prevents accidental "New course" rows when an empty draft is inserted.
    course_title: ((draft?.course_title ?? row?.course_title ?? '').trim() || ''),
    course_type: courseType,
    status,
    updated_by: userId ?? null,
    updated_at: new Date().toISOString(),
  };
};

const courseTypeToUi = (value) => {
  if (!value) return '';
  const v = String(value).trim();
  if (!v) return '';
  // Normalize any legacy 'GS' values back to 'G/S' for display.
  if (v === 'GS') return 'G/S';
  return v;
};

const statusToDb = (value) => {
  if (!value) return 'in_progress';
  const v = String(value).trim().toLowerCase();
  if (!v) return 'in_progress';
  if (VALID_COURSE_STATUSES.includes(v)) return v;
  return 'in_progress';
};

const CORPORATE_COURSE_CATEGORIES = [
  'Career Skills Course',
  'Communication Skills Courses',
  'Conflict Resolution & Mediation Skills Courses',
  'Customer Service Skills Courses',
  'Facilitation, Teaching, Training & Learning Skills Courses',
  'Leadership & Management Skills Courses',
  'Mentoring and Coaching Skills Courses',
  'Marketing Skills Courses',
  'Organisation Level Training Courses',
  'Personal Development Skills Courses',
  'Problem Solving and Decision Making Courses',
  'Sales Skills Course',
  'Strategy Tools Course',
  'Teamwork and Collaboration Skill Courses',
];

const SINGAPORE_COURSE_CATEGORIES = [
  'Lunch Talk Course',
  'Other Course',
  'Determined Price Category',
  '2025',
];

// Some legacy rows exist with empty `course_title` for these domains.
// We fix them on fetch to prevent the course lists from showing blank rows again.
const COURSE_TITLE_BLANK_FIX_COUNTRIES = ['Belize', 'Qatar', 'Indonesia', 'Kenya'];
const DEFAULT_COURSE_TITLE_FALLBACK = 'New course';

export default function TaskAssignmentLog() {
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab'); // 'domains' opens Domains tab
  if (tabParam === 'tl-vtl-tracker') return <Navigate to="/tracker" replace />;
  if (tabParam === 'schedule-form') return <Navigate to="/tracker?tab=schedule" replace />;
  const [tasks, setTasks] = useState([]);
  const [domains, setDomains] = useState([]);
  const [users, setUsers] = useState([]);
  const [onboardingRecords, setOnboardingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingTaskId, setClaimingTaskId] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState(
    tabParam === 'domains'
      ? 'domains'
      : tabParam === 'domain-claims'
      ? 'domain-claims'
      : tabParam === 'udemy-course'
      ? 'udemy-course'
      : tabParam === 'course-list'
      ? 'course-list'
      : tabParam === 'domain-updates'
      ? 'domain-updates'
      : 'tasks'
  ); // 'tasks' | 'udemy-course' | 'course-list' | 'domains' | 'domain-claims' | 'domain-updates'
  const [taskFilter, setTaskFilter] = useState('all'); // 'all' | 'my-tasks'
  const [domainTypeFilter, setDomainTypeFilter] = useState('old'); // 'old' | 'new'
  /** Domains tab: search + filters */
  const [domainSearchQuery, setDomainSearchQuery] = useState('');
  const [domainClaimFilter, setDomainClaimFilter] = useState('all'); // 'all' | 'claimed' | 'unclaimed' | 'mine'
  const [domainStatusFilter, setDomainStatusFilter] = useState('all'); // 'all' | 'updated' | 'not_updated' | 'in_progress'
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateDomainModal, setShowCreateDomainModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isEditingAllTasks, setIsEditingAllTasks] = useState(false);
  const [taskEditDrafts, setTaskEditDrafts] = useState({}); // { [taskId]: { assigned_to, priority, status } }
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);
  const [wpPluginRows, setWpPluginRows] = useState([]);
  const [domainPasswordHistory, setDomainPasswordHistory] = useState({});
  const [passwordHistoryModalDomain, setPasswordHistoryModalDomain] = useState(null);
  const [passwordHistoryModalLabel, setPasswordHistoryModalLabel] = useState('');
  const [passwordHistoryAddForm, setPasswordHistoryAddForm] = useState({ month: '', password: '' });
  const [addingPasswordHistory, setAddingPasswordHistory] = useState(false);
  const [editingPasswordHistoryRow, setEditingPasswordHistoryRow] = useState(null); // { id, domain_id, recorded_at, password }
  const [passwordHistoryEditForm, setPasswordHistoryEditForm] = useState({ month: '', password: '' });
  const [savingPasswordHistoryEdit, setSavingPasswordHistoryEdit] = useState(false);
  const [selectedDomainForAccounts, setSelectedDomainForAccounts] = useState(null);
  const [selectedNewDomainDetails, setSelectedNewDomainDetails] = useState(null);
  const [newDomainDrawerDomain, setNewDomainDrawerDomain] = useState(null);
  /** 'old' | 'new' — which tab opened the slide-over */
  const [domainDrawerKind, setDomainDrawerKind] = useState('new');
  const [isEditingNewDomainDrawer, setIsEditingNewDomainDrawer] = useState(false);
  const [savingNewDomainDrawer, setSavingNewDomainDrawer] = useState(false);
  const [newDomainDrawerDraft, setNewDomainDrawerDraft] = useState(null);
  const [defaultAccounts, setDefaultAccounts] = useState({ intern: { username: '', password: '' }, sg: { username: '', password: '' } });
  const [showNewDomainDrawerPassword, setShowNewDomainDrawerPassword] = useState(false); // Mask new_password by default

  // Reset table edit when modal opens
  useEffect(() => {
    if (selectedTask) setIsEditingAllTasks(false);
  }, [selectedTask]);

  // Open Domains, Domain Claims, Domain Updates when URL has ?tab=...
  useEffect(() => {
    if (tabParam === 'domains') setActiveMainTab('domains');
    if (tabParam === 'domain-claims') setActiveMainTab('domain-claims');
    if (tabParam === 'domain-updates') setActiveMainTab('domain-updates');
    if (tabParam === 'udemy-course') setActiveMainTab('udemy-course');
    if (tabParam === 'course-list') setActiveMainTab('course-list');
  }, [tabParam]);

  const [showDefaultPassword, setShowDefaultPassword] = useState({ intern: false, sg: false });
  const [editDefaultAccount, setEditDefaultAccount] = useState(null); // 'intern' | 'sg' | null
  const [defaultAccountEditForm, setDefaultAccountEditForm] = useState({ username: '', password: '' });
  const [savingDefaultAccount, setSavingDefaultAccount] = useState(false);
  const [showEditModalPassword, setShowEditModalPassword] = useState(false);
  const [domainUpdates, setDomainUpdates] = useState([]);
  const [domainClaims, setDomainClaims] = useState([]);
  const [domainClaimsTab, setDomainClaimsTab] = useState('old'); // 'old' | 'new'
  const [claimingDomainId, setClaimingDomainId] = useState(null);
  const [weeklyPluginScheduleNoteOpen, setWeeklyPluginScheduleNoteOpen] = useState(false);
  const [isEditingDomainsTable, setIsEditingDomainsTable] = useState(false);
  const [savingDomains, setSavingDomains] = useState(false);
  const [courseListDomainId, setCourseListDomainId] = useState('');
  const [courseListItems, setCourseListItems] = useState([]);
  const [courseListLoading, setCourseListLoading] = useState(false);
  const [courseListSaving, setCourseListSaving] = useState(false);
  const [corporateCourseItems, setCorporateCourseItems] = useState([]);
  const [corporateCourseLoading, setCorporateCourseLoading] = useState(false);
  const [hasLoadedSavedCourseDomain, setHasLoadedSavedCourseDomain] = useState(false);
  const [courseListPage, setCourseListPage] = useState(1);
  const [courseListSearchQuery, setCourseListSearchQuery] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('courseListSearchQuery') || '';
      }
    } catch {
      // ignore storage errors
    }
    return '';
  });

  const [corporateCoursePages, setCorporateCoursePages] = useState({});

  // Per-domain course list: client-side filter by title (helps with locating letters like "T").
  const courseListFilteredItems = useMemo(() => {
    const q = String(courseListSearchQuery || '').trim().toLowerCase();
    if (!q) return courseListItems;
    return (Array.isArray(courseListItems) ? courseListItems : []).filter((r) =>
      String(r?.course_title || '').toLowerCase().includes(q)
    );
  }, [courseListItems, courseListSearchQuery]);

  const courseListTotalPages = Math.max(1, Math.ceil(courseListFilteredItems.length / 10));

  // Corporate course list uses the same search query as the per-domain course list.
  const courseListFilteredCorporateItems = useMemo(() => {
    const q = String(courseListSearchQuery || '').trim().toLowerCase();
    if (!q) return corporateCourseItems;
    return (Array.isArray(corporateCourseItems) ? corporateCourseItems : []).filter((r) =>
      String(r?.course_title || '').toLowerCase().includes(q)
    );
  }, [corporateCourseItems, courseListSearchQuery]);

  const [editingDomainCourseId, setEditingDomainCourseId] = useState(null);
  const [editingDomainCourseDraft, setEditingDomainCourseDraft] = useState({
    course_title: '',
    course_type: '',
    status: '',
  });
  const [isCreatingDomainCourse, setIsCreatingDomainCourse] = useState(false);
  const [creatingDomainCourseDraft, setCreatingDomainCourseDraft] = useState({
    course_title: '',
    course_type: 'G',
    status: 'in_progress',
  });
  const [editingCorporateCourseId, setEditingCorporateCourseId] = useState(null);
  const [editingCorporateCourseDraft, setEditingCorporateCourseDraft] = useState({
    course_title: '',
    course_type: '',
    status: '',
  });
  const [isCreatingCorporateCourse, setIsCreatingCorporateCourse] = useState(false);
  const [creatingCorporateCourseCategory, setCreatingCorporateCourseCategory] = useState(null);
  const [creatingCorporateCourseDraft, setCreatingCorporateCourseDraft] = useState({
    course_title: '',
    course_type: 'G',
    status: 'in_progress',
  });
  const [createTaskForm, setCreateTaskForm] = useState({
    name: '',
    domain_migration: '',
    assigned_to: '',
    priority: 'medium',
    status: 'to-do',
    description: '',
    notes: '',
  });
  const [createDomainForm, setCreateDomainForm] = useState({
    type: 'old',
    country: '',
    url: '',
    status: '',
    scanning_done_date: '',
    scanning_date: '',
    scanning_plugin: '',
    scanning_2fa: '',
    wp_username: '',
    new_password: '',
    sg_username: '',
    sg_password: '',
    recaptcha: false,
    backup: false,
  });

  // TL/VTL Tracker (admin, TL/VTL of TLA only)
  useEffect(() => {
    fetchTasks();
    fetchDomains();
    if (permissions.canCreateTasks(userRole)) fetchUsers();
  }, [supabase, userRole]);

  // Onboarding records: source of truth for intern names/team (for Assigned To dropdown)
  useEffect(() => {
    if (!supabase) return;
    const cached = queryCache.get('onboarding:records');
    if (cached && Array.isArray(cached)) {
      setOnboardingRecords(cached);
      return;
    }
    supabase
      .from('onboarding_records')
      .select('name, email, team')
      .order('onboarding_datetime', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('TaskAssignmentLog: onboarding_records fetch error', error);
          return;
        }
        setOnboardingRecords(Array.isArray(data) ? data : []);
      });
  }, [supabase]);

  useEffect(() => {
    if (activeMainTab === 'domains' && domainTypeFilter === 'old') fetchDefaultAccounts();
  }, [activeMainTab, domainTypeFilter, supabase]);

  useEffect(() => {
    if (activeMainTab === 'domains' || activeMainTab === 'domain-claims') {
      fetchDomainUpdates();
      fetchDomainClaims();
    }
  }, [activeMainTab, supabase]);

  // Load previously selected course-list domain from localStorage (once)
  useEffect(() => {
    if (hasLoadedSavedCourseDomain) return;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('courseListDomainId');
        if (saved && !courseListDomainId) {
          setCourseListDomainId(saved);
        }
      }
    } catch {
      // ignore storage errors
    }
    setHasLoadedSavedCourseDomain(true);
  }, [courseListDomainId, hasLoadedSavedCourseDomain]);

  // Persist course list search query (helps with refresh).
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const q = String(courseListSearchQuery || '');
        if (q) window.localStorage.setItem('courseListSearchQuery', q);
        else window.localStorage.removeItem('courseListSearchQuery');
      }
    } catch {
      // ignore storage errors
    }
  }, [courseListSearchQuery]);

  // When search changes, restart pagination at first page.
  useEffect(() => {
    setCourseListPage(1);
  }, [courseListSearchQuery]);

  // Also reset pagination for corporate categories when search changes.
  useEffect(() => {
    setCorporateCoursePages({});
  }, [courseListSearchQuery]);

  // Keep pagination valid when filtered result size changes.
  useEffect(() => {
    setCourseListPage((p) => Math.min(Math.max(1, p), courseListTotalPages));
  }, [courseListTotalPages]);

  // Fetch course list data when Course List tab is active
  useEffect(() => {
    if (activeMainTab !== 'course-list') return;
    if (courseListDomainId) {
      setCourseListPage(1);
      setIsCreatingDomainCourse(false);
      setCreatingDomainCourseDraft({
        course_title: '',
        course_type: 'G',
        status: 'in_progress',
      });
      setEditingDomainCourseId(null);
      setEditingDomainCourseDraft({
        course_title: '',
        course_type: '',
        status: '',
      });
      fetchCourseListItems(courseListDomainId);
      fetchCorporateCourseItems(courseListDomainId);
    } else {
      setCourseListItems([]);
      setCorporateCourseItems([]);
      setIsCreatingDomainCourse(false);
      setCreatingDomainCourseDraft({
        course_title: '',
        course_type: 'G',
        status: 'in_progress',
      });
      setEditingDomainCourseId(null);
      setEditingDomainCourseDraft({
        course_title: '',
        course_type: '',
        status: '',
      });
    }
  }, [activeMainTab, courseListDomainId]);

  const isTaskFormValid = () => {
    const name = (createTaskForm.name || '').trim();
    const status = (createTaskForm.status || '').trim();
    const assigned = (createTaskForm.assigned_to || '').trim();
    if (!name || !status || !assigned) return false;
    if ((name === 'WordPress Updates (Old Domains)' || name === 'WordPress Updates (New Domains)') && !createTaskForm.domain_migration) return false;
    return true;
  };

  const isDomainFormValid = () => {
    const f = createDomainForm;
    return Boolean(
      (f.type || '').trim() &&
      (f.country || '').trim() &&
      (f.url || '').trim() &&
      (f.status || '').trim() &&
      (f.scanning_done_date || '').trim() &&
      (f.scanning_date || '').trim() &&
      (f.scanning_plugin || '').trim() &&
      (f.scanning_2fa || '').trim()
    );
  };

  const fetchTasks = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('tasks');
      if (cached != null) {
        setTasks(cached);
        setLoading(false);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = data || [];
      queryCache.set('tasks', list);
      setTasks(list);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
      const code = error?.code || error?.status;
      if (code === 403 || code === 'PGRST301') {
        toast.error('Permission denied. Try logging out and back in, or ask an admin to run task_domains_migration.sql.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDomains = async (bypassCache = false) => {
    const key = 'domains';
    if (!bypassCache) {
      const cached = queryCache.get(key);
      if (cached != null) {
        setDomains(cached);
        return;
      }
    }
    try {
      const { data, error } = await supabase.from('domains').select('*').order('country', { ascending: true });
      if (error) {
        console.warn('Domains table may not exist:', error);
        setDomains([]);
        return;
      }
      const list = data || [];
      queryCache.set(key, list);
      setDomains(list);
    } catch (error) {
      console.error('Error fetching domains:', error);
      setDomains([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('id, email, full_name, role').order('email');
      if (error) {
        console.warn('Could not fetch users:', error);
        setUsers([]);
        const code = error?.code || error?.status;
        if (code === 403 || code === 'PGRST301') {
          toast.error('Permission denied for users table. Run users_table_rls.sql and fix_users_grants.sql in Supabase.');
        }
        return;
      }
      setUsers(data || []);
    } catch (error) {
      setUsers([]);
    }
  };

  const fetchWpPluginRows = async (taskId) => {
    try {
      const { data, error } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at');
      if (error) throw error;
      setWpPluginRows(data || []);
    } catch (error) {
      console.warn('task_plugin_update_rows may not exist:', error);
      setWpPluginRows([]);
    }
  };

  const fetchDomainPasswordHistory = async (domainId) => {
    try {
      const { data, error } = await supabase
        .from('domain_password_history')
        .select('id, domain_id, password, recorded_at')
        .eq('domain_id', domainId)
        .order('recorded_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setDomainPasswordHistory((prev) => ({ ...prev, [domainId]: data || [] }));
    } catch (error) {
      console.warn('fetchDomainPasswordHistory error:', error);
      setDomainPasswordHistory((prev) => ({ ...prev, [domainId]: [] }));
    }
  };

  const openDefaultOldDomainPasswordHistory = async (accountKind) => {
    const oldDomains = (Array.isArray(domains) ? domains : []).filter((d) => d?.type === 'old');
    const targetDomain =
      accountKind === 'sg'
        ? oldDomains.find((d) => String(d?.country || '').trim().toLowerCase().includes('singapore'))
        : oldDomains.find((d) => !String(d?.country || '').trim().toLowerCase().includes('singapore'));

    if (!targetDomain?.id) {
      toast.error(accountKind === 'sg' ? 'No SG old domain found.' : 'No non-SG old domain found.');
      return;
    }

    await fetchDomainPasswordHistory(targetDomain.id);
    setPasswordHistoryAddForm({ month: new Date().toISOString().slice(0, 7), password: '' });
    setPasswordHistoryModalLabel(accountKind === 'sg' ? 'SG Domain WordPress' : 'Intern Account WordPress');
    setPasswordHistoryModalDomain(targetDomain);
  };

  const addDomainPasswordHistory = async ({ domainId, month, password }) => {
    if (!supabase || !domainId) return;
    const pwd = String(password || '').trim();
    const m = String(month || '').trim(); // YYYY-MM
    if (!m) throw new Error('Please select a month.');
    if (!pwd) throw new Error('Please enter a previous password.');
    // Store as first day of month (UTC-ish) so we can render Month/Year consistently.
    const recorded_at = `${m}-01T00:00:00.000Z`;
    const { error } = await supabase.from('domain_password_history').insert({
      domain_id: domainId,
      password: pwd,
      recorded_at,
    });
    if (error) throw error;
  };

  const updateDomainPasswordHistory = async ({ id, domainId, month, password }) => {
    if (!supabase || !id || !domainId) return;
    const pwd = String(password || '').trim();
    const m = String(month || '').trim(); // YYYY-MM
    if (!m) throw new Error('Please select a month.');
    if (!pwd) throw new Error('Please enter a previous password.');
    const recorded_at = `${m}-01T00:00:00.000Z`;
    const { error } = await supabase
      .from('domain_password_history')
      .update({ password: pwd, recorded_at })
      .eq('id', id)
      .eq('domain_id', domainId);
    if (error) throw error;
  };

  const deleteDomainPasswordHistory = async ({ id, domainId }) => {
    if (!supabase || !id || !domainId) return;
    const { error } = await supabase
      .from('domain_password_history')
      .delete()
      .eq('id', id)
      .eq('domain_id', domainId);
    if (error) throw error;
  };

  const openDomainDrawer = (domain, kind = 'new') => {
    if (!domain) return;
    setDomainDrawerKind(kind === 'old' ? 'old' : 'new');
    setNewDomainDrawerDomain(domain);
    setIsEditingNewDomainDrawer(false);
    setSavingNewDomainDrawer(false);
    setShowNewDomainDrawerPassword(false);
    setNewDomainDrawerDraft({
      wp_username: domain.wp_username || '',
      new_password: domain.new_password || '',
      status: domain.status || '',
      scanning_done_date: domain.scanning_done_date ? String(domain.scanning_done_date).slice(0, 10) : '',
      scanning_date: domain.scanning_date || '',
      scanning_plugin: domain.scanning_plugin || '',
      scanning_2fa: domain.scanning_2fa || '',
      recaptcha: toBool(domain.recaptcha),
      backup: toBool(domain.backup),
      url: domain.url || '',
      country: domain.country || '',
    });
  };

  const closeNewDomainDrawer = () => {
    setNewDomainDrawerDomain(null);
    setDomainDrawerKind('new');
    setIsEditingNewDomainDrawer(false);
    setSavingNewDomainDrawer(false);
    setNewDomainDrawerDraft(null);
    setShowNewDomainDrawerPassword(false);
  };

  const saveNewDomainDrawer = async () => {
    if (!supabase || !newDomainDrawerDomain?.id || !newDomainDrawerDraft) return;
    setSavingNewDomainDrawer(true);
    try {
      const payload = {
        wp_username: String(newDomainDrawerDraft.wp_username || '').trim() || null,
        new_password: String(newDomainDrawerDraft.new_password || '').trim() || null,
        scanning_done_date: newDomainDrawerDraft.scanning_done_date ? newDomainDrawerDraft.scanning_done_date : null,
        scanning_date: String(newDomainDrawerDraft.scanning_date || '').trim() || null,
        scanning_plugin: String(newDomainDrawerDraft.scanning_plugin || '').trim() || null,
        scanning_2fa: String(newDomainDrawerDraft.scanning_2fa || '').trim() || null,
        recaptcha: !!newDomainDrawerDraft.recaptcha,
        backup: !!newDomainDrawerDraft.backup,
        url: String(newDomainDrawerDraft.url || '').trim() || null,
        country: String(newDomainDrawerDraft.country || '').trim() || null,
      };
      if (domainDrawerKind === 'new') {
        payload.status = String(newDomainDrawerDraft.status || '').trim() || null;
      }

      const { error } = await supabase.from('domains').update(payload).eq('id', newDomainDrawerDomain.id);
      if (error) throw error;

      // Update local state
      setDomains((prev) =>
        (Array.isArray(prev) ? prev : []).map((d) =>
          d.id === newDomainDrawerDomain.id
            ? { ...d, ...payload, scanning_done_date: payload.scanning_done_date }
            : d
        )
      );
      setNewDomainDrawerDomain((prev) => (prev ? { ...prev, ...payload, scanning_done_date: payload.scanning_done_date } : prev));
      queryCache.invalidate('domains');
      toast.success('Domain updated');
      setIsEditingNewDomainDrawer(false);
    } catch (e) {
      toast.error(e?.message || 'Failed to update domain');
    } finally {
      setSavingNewDomainDrawer(false);
    }
  };

  const fetchCourseListItems = async (domainId) => {
    if (!domainId) {
      setCourseListItems([]);
      return [];
    }
    setCourseListLoading(true);
    try {
      const { data, error } = await supabase
        .from('course_list_domain_items')
        .select('*')
        .eq('domain_id', domainId)
        .order('course_title', { ascending: true });
      if (error) {
        console.warn('course_list_domain_items fetch error:', error);
        setCourseListItems([]);
        return [];
      }
      let list = Array.isArray(data) ? data : [];

      // Fix legacy empty titles for the affected domains.
      const hasBlankTitles = list.some((r) => !String(r?.course_title || '').trim());
      if (hasBlankTitles) {
        // If any blank rows were recently inserted as accidental drafts, delete them instead of converting.
        const CLEANUP_RECENT_BLANK_MS = 15 * 60 * 1000; // 15 minutes
        const nowMs = Date.now();

        const { data: domainRow, error: domainErr } = await supabase
          .from('domains')
          .select('country')
          .eq('id', domainId)
          .maybeSingle();

        const country = String(domainRow?.country || '').trim();
        if (!domainErr && COURSE_TITLE_BLANK_FIX_COUNTRIES.includes(country)) {
          const blankRows = list.filter((r) => !String(r?.course_title || '').trim());
          const idsToDelete = blankRows
            .filter((r) => {
              const updatedAtMs = new Date(r?.updated_at || '').getTime();
              const updatedByMatches = user?.id ? String(r?.updated_by || '') === String(user.id) : false;
              const isRecent = Number.isFinite(updatedAtMs) && nowMs - updatedAtMs <= CLEANUP_RECENT_BLANK_MS;
              return isRecent && updatedByMatches;
            })
            .map((r) => r.id);

          const idsToFix = blankRows
            .filter((r) => !(idsToDelete || []).includes(r.id))
            .map((r) => r.id);

          if (idsToDelete.length > 0) {
            try {
              const { error: delErr } = await supabase
                .from('course_list_domain_items')
                .delete()
                .in('id', idsToDelete);
              if (delErr) throw delErr;
            } catch (e) {
              console.warn('course_list_domain_items recent blank title cleanup error:', e);
            }
          }

          const updatedAtIso = new Date().toISOString();
          const payload = { course_title: DEFAULT_COURSE_TITLE_FALLBACK, updated_at: updatedAtIso };

          try {
            if (idsToFix.length > 0) {
              await Promise.all(
                idsToFix.map(async (id) => {
                  const { error: updErr } = await supabase
                    .from('course_list_domain_items')
                    .update(payload)
                    .eq('id', id);
                  if (updErr) throw updErr;
                })
              );
            }
            const { data: refetched, error: refetchErr } = await supabase
              .from('course_list_domain_items')
              .select('*')
              .eq('domain_id', domainId)
              .order('course_title', { ascending: true });
            if (!refetchErr && Array.isArray(refetched)) list = refetched;
          } catch (e) {
            console.warn('course_list_domain_items blank title sanitize error:', e);
          }
        }
      }

      setCourseListItems(list);
      return list;
    } catch (error) {
      console.warn('course_list_domain_items fetch error:', error);
      setCourseListItems([]);
      return [];
    } finally {
      setCourseListLoading(false);
    }
  };

  const fetchCorporateCourseItems = async (domainId) => {
    if (!domainId) {
      setCorporateCourseItems([]);
      return [];
    }
    setCorporateCourseLoading(true);
    try {
      const { data, error } = await supabase
        .from('corporate_course_items')
        .select('*')
        .eq('domain_id', domainId)
        .order('category', { ascending: true })
        .order('course_title', { ascending: true });
      if (error) {
        console.warn('corporate_course_items fetch error:', error);
        setCorporateCourseItems([]);
        return [];
      }
      let list = Array.isArray(data) ? data : [];

      // Fix legacy empty titles for the affected domains.
      const hasBlankTitles = list.some((r) => !String(r?.course_title || '').trim());
      if (hasBlankTitles) {
        // If any blank rows were recently inserted as accidental drafts, delete them instead of converting.
        const CLEANUP_RECENT_BLANK_MS = 15 * 60 * 1000; // 15 minutes
        const nowMs = Date.now();

        const { data: domainRow, error: domainErr } = await supabase
          .from('domains')
          .select('country')
          .eq('id', domainId)
          .maybeSingle();

        const country = String(domainRow?.country || '').trim();
        if (!domainErr && COURSE_TITLE_BLANK_FIX_COUNTRIES.includes(country)) {
          const blankRows = list.filter((r) => !String(r?.course_title || '').trim());
          const idsToDelete = blankRows
            .filter((r) => {
              const updatedAtMs = new Date(r?.updated_at || '').getTime();
              const updatedByMatches = user?.id ? String(r?.updated_by || '') === String(user.id) : false;
              const isRecent = Number.isFinite(updatedAtMs) && nowMs - updatedAtMs <= CLEANUP_RECENT_BLANK_MS;
              return isRecent && updatedByMatches;
            })
            .map((r) => r.id);

          const idsToFix = blankRows
            .filter((r) => !(idsToDelete || []).includes(r.id))
            .map((r) => r.id);

          if (idsToDelete.length > 0) {
            try {
              const { error: delErr } = await supabase
                .from('corporate_course_items')
                .delete()
                .in('id', idsToDelete);
              if (delErr) throw delErr;
            } catch (e) {
              console.warn('corporate_course_items recent blank title cleanup error:', e);
            }
          }

          const updatedAtIso = new Date().toISOString();
          const payload = { course_title: DEFAULT_COURSE_TITLE_FALLBACK, updated_at: updatedAtIso };

          try {
            if (idsToFix.length > 0) {
              await Promise.all(
                idsToFix.map(async (id) => {
                  const { error: updErr } = await supabase
                    .from('corporate_course_items')
                    .update(payload)
                    .eq('id', id);
                  if (updErr) throw updErr;
                })
              );
            }
            const { data: refetched, error: refetchErr } = await supabase
              .from('corporate_course_items')
              .select('*')
              .eq('domain_id', domainId)
              .order('category', { ascending: true })
              .order('course_title', { ascending: true });
            if (!refetchErr && Array.isArray(refetched)) list = refetched;
          } catch (e) {
            console.warn('corporate_course_items blank title sanitize error:', e);
          }
        }
      }

      setCorporateCourseItems(list);
      return list;
    } catch (error) {
      console.warn('corporate_course_items fetch error:', error);
      setCorporateCourseItems([]);
      return [];
    } finally {
      setCorporateCourseLoading(false);
    }
  };

  const fetchDomainUpdates = async () => {
    try {
      const { data, error } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDomainUpdates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('task_plugin_update_rows fetch error:', err);
      setDomainUpdates([]);
    }
  };

  const fetchDomainClaims = async () => {
    try {
      const { data, error } = await supabase
        .from('domain_claims')
        .select('*')
        .order('claimed_at', { ascending: false });
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      // Support "soft unclaim" rows where claim fields are cleared via UPDATE.
      setDomainClaims(list.filter((r) => r?.domain_id && r?.claimed_by));
    } catch (err) {
      console.warn('domain_claims fetch error:', err);
      setDomainClaims([]);
    }
  };

  const fetchDefaultAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('old_domain_default_accounts')
        .select('account_type, username, password');
      if (error) throw error;
      const list = data || [];
      const next = { intern: { username: '', password: '' }, sg: { username: '', password: '' } };
      list.forEach((row) => {
        if (row.account_type === 'intern' || row.account_type === 'sg') {
          next[row.account_type] = { username: row.username || '', password: row.password || '' };
        }
      });
      setDefaultAccounts(next);
    } catch (err) {
      console.warn('fetchDefaultAccounts:', err);
      setDefaultAccounts({ intern: { username: '', password: '' }, sg: { username: '', password: '' } });
    }
  };

  const copyToClipboard = (value, label) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copied to clipboard`),
      () => toast.error('Failed to copy')
    );
  };

  const copyPasswordToClipboard = (password, label) => copyToClipboard(password, label);
  const copyUsernameToClipboard = (username, label) => copyToClipboard(username, label);

  const handleSaveDefaultAccount = async (e) => {
    e.preventDefault();
    if (!editDefaultAccount) return;
    setSavingDefaultAccount(true);
    try {
      const { data: existing } = await supabase
        .from('old_domain_default_accounts')
        .select('id')
        .eq('account_type', editDefaultAccount)
        .maybeSingle();
      const payload = {
        account_type: editDefaultAccount,
        username: (defaultAccountEditForm.username || '').trim() || null,
        password: (defaultAccountEditForm.password || '').trim() || null,
      };
      if (existing?.id) {
        const { error } = await supabase.from('old_domain_default_accounts').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('old_domain_default_accounts').insert(payload);
        if (error) throw error;
      }
      setDefaultAccounts((prev) => ({
        ...prev,
        [editDefaultAccount]: { username: payload.username || '', password: payload.password || '' },
      }));
      setEditDefaultAccount(null);
      setDefaultAccountEditForm({ username: '', password: '' });
      toast.success('Default account updated');
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSavingDefaultAccount(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const { name, domain_migration, assigned_to, priority, status, description, notes } = createTaskForm;
    if (!name) {
      toast.error('Select a task name');
      return;
    }
    const isWpPlugin = name === 'WordPress Updates (Old Domains)' || name === 'WordPress Updates (New Domains)';
    const domainMigration = isWpPlugin ? (name === 'WordPress Updates (Old Domains)' ? 'old' : 'new') : domain_migration;
    setClaimingTaskId('create');
    try {
      const payload = {
        name,
        type: 'task',
        status: status || 'to-do',
        priority: priority || 'medium',
        description: description?.trim() || null,
        notes: notes?.trim() || null,
        assigned_to: assigned_to || null,
        assigned_to_name: getUserDisplayNameOrNull(users.find((u) => String(u.id) === String(assigned_to))) ?? null,
      };
      if (isWpPlugin) payload.domain_migration = domainMigration;
      const { data, error } = await supabase.from('tasks').insert(payload).select('id').single();
      if (error) throw error;
      await logAction(supabase, 'task_created', { task_id: data?.id, task_name: name }, user?.id);

      // Notify assignee (if any)
      if (payload.assigned_to) {
        try {
          await notifyUser(supabase, {
            recipient_user_id: payload.assigned_to,
            sender_user_id: user?.id || null,
            type: 'task_assigned',
            title: 'New task assigned',
            body: `${name}${payload.priority ? ` • Priority: ${payload.priority}` : ''}`,
            context_date: new Date().toISOString().slice(0, 10),
            metadata: { task_name: name, task_id: data?.id || null },
          });
        } catch (notifyErr) {
          console.warn('Task assignment notification error:', notifyErr);
        }
      }

      // Team-scoped notification: notify the assignee's team scope (TLA vs Monitoring vs PAT1) + Admin
      if (payload.assigned_to) {
        try {
          const assignee = users.find((u) => String(u.id) === String(payload.assigned_to));
          const scope = scopeFromUserProfile(assignee) || '';
          if (scope) {
            const recipientIds = await getUserIdsByScope(supabase, scope);
            await createNotifications(
              supabase,
              recipientIds.map((id) => ({
                recipient_user_id: id,
                sender_user_id: user?.id || null,
                type: 'task_team_update',
                title: 'Task update',
                body: `Task assigned: ${name} → ${assignee?.full_name || assignee?.email || 'assignee'}`,
                context_date: new Date().toISOString().slice(0, 10),
                metadata: { task_name: name, task_id: data?.id || null, assigned_to: payload.assigned_to },
              }))
            );
          }
        } catch (notifyErr) {
          console.warn('Task team notification error:', notifyErr);
        }
      }

      queryCache.invalidate('tasks');
      fetchTasks(true);
      setShowCreateTaskModal(false);
      setCreateTaskForm({ name: '', domain_migration: '', assigned_to: '', priority: 'medium', status: 'to-do', description: '', notes: '' });
      toast.success('Task created');
    } catch (error) {
      console.error('Error creating task:', error);
      const code = error?.code || error?.status;
      const msg = code === 403 || code === 'PGRST301'
        ? 'Permission denied. Run task_domains_migration.sql and ensure your role (admin/tl/vtl) can insert tasks.'
        : (error?.message || 'Failed to create task');
      toast.error(msg);
    } finally {
      setClaimingTaskId(null);
    }
  };

  const handleCreateDomain = async (e) => {
    e.preventDefault();
    const { type, country, url, status, scanning_done_date, scanning_date, scanning_plugin, scanning_2fa, recaptcha, backup } = createDomainForm;
    if (!country?.trim() || !url?.trim()) {
      toast.error('Country and URL are required');
      return;
    }
    console.log('[Domain Create] User role:', userRole, 'User ID:', user?.id);
    try {
      const payload = {
        type: type || 'old',
        country: country.trim(),
        url: url.trim(),
        status: status || null,
        scanning_date: scanning_date || null,
        scanning_plugin: scanning_plugin || null,
        scanning_2fa: scanning_2fa || null,
        recaptcha: !!recaptcha,
        backup: !!backup,
      };
      if (scanning_done_date) payload.scanning_done_date = scanning_done_date;
      const { error } = await supabase.from('domains').insert(payload);
      if (error) throw error;
      queryCache.invalidate('domains');
      fetchDomains(true);
      setShowCreateDomainModal(false);
      setCreateDomainForm({
        type: 'old',
        country: '',
        url: '',
        status: '',
        scanning_done_date: '',
        scanning_date: '',
        scanning_plugin: '',
        scanning_2fa: '',
        wp_username: '',
        new_password: '',
        sg_username: '',
        sg_password: '',
        recaptcha: false,
        backup: false,
      });
      toast.success('Domain added');
    } catch (error) {
      console.error('Error creating domain:', error);
      const code = error?.code || error?.status;
      if (code === 403 || code === 'PGRST301') {
        const roleMsg = userRole ? `Your current role: ${userRole}` : 'No role detected';
        toast.error(
          `Permission denied (403). ${roleMsg}. Please: 1) Run reset_policies_grants.sql in Supabase SQL Editor, 2) Ensure your user has a row in public.users with id matching auth.uid() and role in (admin, tla, tl, vtl), 3) Log out and log back in.`,
          { duration: 6000 }
        );
      } else {
        toast.error(error?.message || 'Failed to add domain');
      }
    }
  };

  const handleUpdateDomainPassword = async (domainId, newPassword) => {
    try {
      const domain = domains.find((d) => d.id === domainId);
      if (domain?.new_password) {
        const now = new Date();
        const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        await supabase.from('domain_password_history').insert({
          domain_id: domainId,
          password: domain.new_password,
          recorded_at: `${currentMonth}-01T00:00:00.000Z`,
        });
      }
      const { error } = await supabase.from('domains').update({ new_password: newPassword }).eq('id', domainId);
      if (error) throw error;
      queryCache.invalidate('domains');
      fetchDomains(true);
      setDomainPasswordHistory((prev) => ({ ...prev, [domainId]: undefined }));
      toast.success('Password updated; old password saved to history');
    } catch (error) {
      toast.error(error.message || 'Failed to update password');
    }
  };

  const updateDomainInState = (id, updates) => {
    setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  };

  const handleSaveDomains = async () => {
    const list = domains.filter((d) => d.type === domainTypeFilter);
    if (list.length === 0) {
      setIsEditingDomainsTable(false);
      return;
    }
    setSavingDomains(true);
    try {
      for (const d of list) {
        const payload = {
          country: d.country ?? '',
          url: d.url ?? '',
          status: d.status || null,
          scanning_date: d.scanning_date || null,
          scanning_plugin: d.scanning_plugin || null,
          scanning_2fa: d.scanning_2fa || null,
          scanning_done_date: d.scanning_done_date || null,
          recaptcha: !!d.recaptcha,
          backup: !!d.backup,
        };
        if (d.type === 'new') {
          payload.wp_username = d.wp_username ?? '';
          if (d.new_password !== undefined) payload.new_password = d.new_password;
        }
        const { error } = await supabase.from('domains').update(payload).eq('id', d.id);
        if (error) throw error;
      }
      queryCache.invalidate('domains');
      await fetchDomains(true);
      setIsEditingDomainsTable(false);
      toast.success('Domains saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to save domains');
    } finally {
      setSavingDomains(false);
    }
  };

  const handleCancelDomainsEdit = () => {
    setIsEditingDomainsTable(false);
    fetchDomains(true);
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          updated_by: user?.id,
          updated_by_name: user?.email,
        })
        .eq('id', task.id);
      if (error) throw error;
      await logAction(supabase, 'task_status_changed', { task_id: task.id, new_status: newStatus }, user?.id);
      queryCache.invalidate('tasks');
      fetchTasks(true);
      if (selectedTask?.id === task.id) setSelectedTask((t) => (t ? { ...t, status: newStatus } : null));
      toast.success('Status updated');
    } catch (error) {
      const code = error?.code || error?.status;
      const msg = code === 403 || code === 'PGRST301'
        ? 'Permission denied. Run task_domains_migration.sql so your role can update tasks.'
        : (error?.message || 'Failed to update status');
      toast.error(msg);
    }
  };

  const startEditAllTasks = () => {
    fetchUsers();
    const drafts = {};
    filteredTasks.forEach((t) => {
      drafts[t.id] = {
        assigned_to: t.assigned_to || '',
        priority: t.priority || 'medium',
        status: t.status || 'to-do',
      };
    });
    setTaskEditDrafts(drafts);
    setIsEditingAllTasks(true);
  };

  const cancelTaskEdit = () => {
    setIsEditingAllTasks(false);
    setTaskEditDrafts({});
  };

  const updateTaskDraft = (taskId, field, value) => {
    setTaskEditDrafts((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), [field]: value },
    }));
  };

  const handleSaveTaskEdit = async () => {
    const taskIds = Object.keys(taskEditDrafts);
    if (taskIds.length === 0) return;
    setSavingTaskEdit(true);
    try {
      for (const id of taskIds) {
        const task = tasks.find((t) => t.id === id);
        if (!task || !canUpdateStatus(task)) continue;
        const d = taskEditDrafts[id] || {};
        const assigned_to = d.assigned_to || null;
        const assigned_to_name = assigned_to
          ? (getUserDisplayNameOrNull(users.find((u) => String(u.id) === String(assigned_to))) ?? null)
          : null;
      const { error } = await supabase
        .from('tasks')
        .update({
          assigned_to,
          assigned_to_name,
          priority: d.priority || 'medium',
            status: d.status || 'to-do',
            updated_by: user?.id,
            updated_by_name: user?.email,
          })
          .eq('id', id);
        if (error) throw error;
        await logAction(supabase, 'task_updated', { task_id: id, fields: ['assigned_to', 'priority', 'status'] }, user?.id);
      }
      queryCache.invalidate('tasks');
      fetchTasks(true);
      if (selectedTask && taskEditDrafts[selectedTask.id]) {
        const d = taskEditDrafts[selectedTask.id];
        const assigned_to = d.assigned_to || null;
        const assigned_to_name = assigned_to
          ? (getUserDisplayNameOrNull(users.find((u) => String(u.id) === String(assigned_to))) ?? null)
          : null;
        setSelectedTask((t) =>
          t ? { ...t, assigned_to, assigned_to_name, priority: d.priority, status: d.status } : null
        );
      }
      setIsEditingAllTasks(false);
      setTaskEditDrafts({});
      toast.success('Tasks saved');
    } catch (error) {
      const msg = error?.message || 'Failed to save tasks';
      toast.error(msg);
    } finally {
      setSavingTaskEdit(false);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm(`Delete task "${task.name}"?`)) return;
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
      queryCache.invalidate('tasks');
      fetchTasks(true);
      setTaskEditDrafts((prev) => {
        const next = { ...(prev || {}) };
        delete next[task.id];
        return next;
      });
      setSelectedTask(null);
      toast.success('Task deleted');
    } catch (error) {
      toast.error(error.message || 'Failed to delete task');
    }
  };

  const handleSaveWpPluginRow = async (row) => {
    try {
      const payload = {
        country: row.country,
        admin_url: row.admin_url,
        admin_username: row.admin_username,
        admin_password: row.admin_password,
        status: row.status,
        plugin_names: row.plugin_names,
        version_before: row.version_before,
        version_after: row.version_after,
        update_status: row.update_status,
        post_update_check: row.post_update_check,
        notes: row.notes,
      };
      if (row.id) {
        const { error } = await supabase.from('task_plugin_update_rows').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('task_plugin_update_rows').insert({
          task_id: selectedTask.id,
          domain_id: row.domain_id || null,
          ...payload,
        });
        if (error) throw error;
      }
      fetchWpPluginRows(selectedTask.id);
      toast.success('Row saved');
    } catch (error) {
      toast.error(error.message || 'Failed to save row');
    }
  };

  const handleAddDomainToWpTask = (domain) => {
    const newRow = {
      id: null,
      domain_id: domain.id,
      country: domain.country,
      admin_url: domain.url,
      admin_username: domain.wp_username,
      admin_password: domain.new_password,
      status: '',
      plugin_names: '',
      version_before: '',
      version_after: '',
      update_status: '',
      post_update_check: '',
      notes: '',
    };
    setWpPluginRows((prev) => [...prev, newRow]);
  };

  const getFilteredTasks = () => {
    const list = taskFilter === 'my-tasks' ? tasks.filter((t) => t.assigned_to === user?.id) : tasks;
    return list;
  };

  const canUpdateStatus = (task) =>
    permissions.canUpdateTaskStatus(userRole, task.assigned_to, user?.id);

  const isTlaTeam = (teamValue) => {
    const raw = String(teamValue || '').trim().toLowerCase();
    if (!raw) return true; // tolerate missing team for intern accounts; default to TLA behavior
    const compact = raw.replace(/[^a-z0-9]+/g, '');
    if (compact === 'tla' || compact === 'teamleadassistant') return true;
    return raw.includes('team lead assistant') || raw.includes('tla');
  };

  const canClaimTask = (userRole, userTeam) =>
    (userRole === 'intern' || userRole === 'tl' || userRole === 'vtl') && isTlaTeam(userTeam);

  const handleClaimTask = async (task) => {
    if (!user?.id) return;
    const claimedByMe = String(task?.assigned_to || '') === String(user?.id || '');
    if (task?.assigned_to && !claimedByMe) return;
    setClaimingTaskId(task.id);
    try {
      if (claimedByMe) {
        const { error } = await supabase
          .from('tasks')
          .update({
            assigned_to: null,
            assigned_to_name: null,
            updated_by: user?.id,
            updated_by_name: user?.email,
          })
          .eq('id', task.id);
        if (error) throw error;
        await logAction(supabase, 'task_unclaimed', { task_id: task.id, task_name: task.name }, user?.id);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, assigned_to: null, assigned_to_name: null } : t
          )
        );
        queryCache.invalidate('tasks');
        await fetchTasks(true);
        if (selectedTask?.id === task.id) {
          setSelectedTask((t) => (t ? { ...t, assigned_to: null, assigned_to_name: null } : null));
        }
        toast.success('Task unclaimed');
        return;
      }

      let assigned_to_name = (users.find((u) => u.id === user.id)?.full_name || '').trim();
      if (!assigned_to_name) {
        const { data: me } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle();
        assigned_to_name = (me?.full_name || '').trim() || user?.user_metadata?.full_name || user?.email || null;
      }
      const displayNameForDb = assigned_to_name || user?.user_metadata?.full_name || user?.email || null;
      const { error } = await supabase
        .from('tasks')
        .update({
          assigned_to: user.id,
          assigned_to_name: displayNameForDb,
          updated_by: user?.id,
          updated_by_name: user?.email,
        })
        .eq('id', task.id);
      if (error) throw error;
      await logAction(supabase, 'task_claimed', { task_id: task.id, task_name: task.name }, user?.id);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, assigned_to: user.id, assigned_to_name: displayNameForDb } : t
        )
      );
      queryCache.invalidate('tasks');
      await fetchTasks(true);
      if (selectedTask?.id === task.id) setSelectedTask((t) => (t ? { ...t, assigned_to: user.id, assigned_to_name: displayNameForDb } : null));
      toast.success('Task claimed');
    } catch (error) {
      const msg = error?.message || 'Failed to claim task';
      toast.error(msg);
    } finally {
      setClaimingTaskId(null);
    }
  };

  const canClaimDomain = (userRole, userTeam) => {
    if (userRole === 'admin' || userRole === 'tla') return true;
    if (userRole === 'intern' && isTlaTeam(userTeam)) return true;
    if ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam(userTeam)) return true;
    return false;
  };

  const handleClaimDomain = async (domain) => {
    if (!user?.id) return;
    const existing = domainClaims.find((c) => c.domain_id === domain.id);
    if (existing) return;
    setClaimingDomainId(domain.id);
    try {
      let claimed_by_name = (users.find((u) => u.id === user.id)?.full_name || '').trim();
      if (!claimed_by_name) {
        const { data: me } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle();
        claimed_by_name = (me?.full_name || '').trim() || user?.user_metadata?.full_name || user?.email || null;
      }
      const nameForDb = claimed_by_name || user?.user_metadata?.full_name || user?.email || null;
      const claimPayload = {
        domain_id: domain.id,
        claimed_by: user.id,
        claimed_by_name: nameForDb,
        claimed_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('domain_claims')
        .upsert(claimPayload, { onConflict: 'domain_id' });
      if (error) throw error;
      const newClaim = {
        id: crypto.randomUUID(),
        domain_id: domain.id,
        claimed_by: user.id,
        claimed_by_name: nameForDb,
        claimed_at: claimPayload.claimed_at,
        update_status: null,
        post_update_check: null,
      };
      setDomainClaims((prev) => [newClaim, ...prev]);
      await fetchDomainClaims();
      toast.success('Domain claimed');
    } catch (error) {
      const msg = error?.message || 'Failed to claim domain';
      toast.error(msg);
    } finally {
      setClaimingDomainId(null);
    }
  };

  const handleUnclaimDomain = async (domain, claimRow) => {
    if (!user?.id || !domain?.id || !claimRow?.domain_id) return;
    if (!canClaimDomain(userRole, userTeam) && userRole !== 'admin') return;
    setClaimingDomainId(domain.id);
    try {
      const { data: deleted, error } = await supabase
        .from('domain_claims')
        .delete()
        .eq('domain_id', claimRow.domain_id)
        .select('id, domain_id');
      if (error) {
        // Some environments allow UPDATE but not DELETE on domain_claims.
        const { error: updateErr } = await supabase
          .from('domain_claims')
          .update({
            claimed_by: null,
            claimed_by_name: null,
            claimed_at: null,
            update_status: null,
            post_update_check: null,
          })
          .eq('domain_id', claimRow.domain_id);
        if (updateErr) throw updateErr;
      } else if (!deleted || deleted.length === 0) {
        // Delete succeeded but no rows returned (policy/select behavior). Try soft-unclaim fallback.
        const { error: updateErr } = await supabase
          .from('domain_claims')
          .update({
            claimed_by: null,
            claimed_by_name: null,
            claimed_at: null,
            update_status: null,
            post_update_check: null,
          })
          .eq('domain_id', claimRow.domain_id);
        if (updateErr) throw updateErr;
      }
      setDomainClaims((prev) => prev.filter((c) => c.domain_id !== claimRow.domain_id));
      await fetchDomainClaims();
      toast.success('Domain unclaimed');
    } catch (error) {
      const msg = error?.message || 'Failed to unclaim domain';
      toast.error(msg);
    } finally {
      setClaimingDomainId(null);
    }
  };

  const handleRemoveDomainClaim = async (claimRow) => {
    if (userRole !== 'admin') return;
    if (!claimRow?.domain_id) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Remove this domain claim and return it to claimable state?');
    if (!ok) return;
    try {
      // Delete by domain_id to avoid any mismatch between UI keys and DB PK.
      // Return deleted rows so we can verify something was actually removed.
      const { data: deleted, error } = await supabase
        .from('domain_claims')
        .delete()
        .eq('domain_id', claimRow.domain_id)
        .select('id, domain_id');

      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error('No claim was removed. Check RLS/policies for domain_claims delete.');
      }

      const removedDomainIds = new Set(deleted.map((d) => d.domain_id));
      setDomainClaims((prev) => prev.filter((c) => !removedDomainIds.has(c.domain_id)));
      await fetchDomainClaims();
      toast.success('Domain claim removed');
    } catch (error) {
      const msg = error?.message || 'Failed to remove domain claim';
      toast.error(msg);
    }
  };

  // Onboarding name by email (source of truth for names when users.full_name is empty)
  const onboardingByNameByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const name = (r.name || '').trim();
      if (email && name && !map.has(email)) map.set(email, name);
    });
    return map;
  }, [onboardingRecords]);

  // Onboarding TLA team records keyed by email.
  const tlaOnboardingByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const name = (r.name || '').trim();
      const team = String(r.team || '').trim().toLowerCase();
      const compact = team.replace(/[^a-z0-9]+/g, '');
      const isTla = compact === 'tla' || compact === 'teamleadassistant' || team.includes('team lead assistant');
      if (!email || !isTla || map.has(email)) return;
      map.set(email, name || null);
    });
    return map;
  }, [onboardingRecords]);

  const getUserDisplayNameOrNull = (u) => {
    const fromUser = (u?.full_name || '').trim();
    if (fromUser) return fromUser;
    const email = (u?.email || '').trim().toLowerCase();
    const fromOnboarding = email ? onboardingByNameByEmail.get(email) : null;
    const normalized = (fromOnboarding || '').trim();
    return normalized || null;
  };

  // Assigned To: prefer users.full_name, then onboarding name by email, then 'Unnamed'
  const getUserDisplayName = (u) => {
    return getUserDisplayNameOrNull(u) || 'Unnamed';
  };

  // Only Team Lead Assistant members from onboarding records are assignable in admin dropdowns.
  const tlaAssignableUsers = useMemo(
    () =>
      (users || [])
        .filter((u) => {
          const email = (u?.email || '').trim().toLowerCase();
          return !!email && tlaOnboardingByEmail.has(email);
        })
        .map((u) => ({ ...u, display_name: getUserDisplayNameOrNull(u) }))
        .filter((u) => !!u.display_name),
    [users, tlaOnboardingByEmail, onboardingByNameByEmail]
  );

  const getAssignedToDisplay = (task) => {
    if (!task) return 'Unassigned';
    const stored = (task.assigned_to_name || '').trim();
    if (stored && !stored.includes('@')) return stored;
    const u = task.assigned_to ? users.find((us) => String(us.id) === String(task.assigned_to)) : null;
    const nameOnly = (u?.full_name || '').trim()
      || (u?.email ? onboardingByNameByEmail.get((u.email || '').trim().toLowerCase()) : null)
      || null;
    return nameOnly || (stored && !stored.includes('@') ? stored : null) || 'Unassigned';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'to-do':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
      case 'review':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
      case 'done':
        return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
      case 'low':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const isWpPluginTask = (task) =>
    task?.name === 'WordPress Updates (Old Domains)' || task?.name === 'WordPress Updates (New Domains)';

  const latestUpdateByDomainId = useMemo(() => {
    const map = {};
    domainUpdates.forEach((row) => {
      if (!row?.domain_id) return;
      const existing = map[row.domain_id];
      if (!existing) {
        map[row.domain_id] = row;
        return;
      }
      const existingDate = existing.created_at ? new Date(existing.created_at) : null;
      const rowDate = row.created_at ? new Date(row.created_at) : null;
      if (!existingDate || (rowDate && rowDate > existingDate)) {
        map[row.domain_id] = row;
      }
    });
    return map;
  }, [domainUpdates]);

  const getDomainPluginSummary = (domain) => {
    const u = latestUpdateByDomainId[domain.id];
    if (!u) return 'Not updated';

    // New domains can have row-level status (done / need verification / blocked access)
    if (u.status === 'blocked access') return 'Blocked access';
    if (u.status === 'need verification') return 'Needs verification';
    if (u.status === 'done' && u.update_status === 'Updated' && u.post_update_check === 'Ok') {
      return 'OK / Updated';
    }

    if (u.update_status === 'Failed') return 'Failed';
    if (u.post_update_check === 'Issue Found') return 'Issue found';
    if (u.update_status === 'Updated' && u.post_update_check === 'Ok') return 'OK / Updated';

    if (u.update_status === 'Skipped') return 'Skipped';

    return u.update_status || 'Pending';
  };

  /**
   * Domains table status column — shared 3-tier color system for scanability:
   * - not_started: gray (not updated / no meaningful progress)
   * - in_progress: orange (active work, blocked, failed, pending, etc.)
   * - done: green (updated / complete)
   */
  const domainTableStatusBadgeClassByTier = (tier) => {
    switch (tier) {
      case 'done':
        return 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/90 dark:bg-emerald-900/45 dark:text-emerald-100 dark:ring-emerald-800/60';
      case 'in_progress':
        return 'bg-orange-100 text-orange-950 ring-1 ring-orange-200/90 dark:bg-orange-950/50 dark:text-orange-100 dark:ring-orange-800/55';
      case 'not_started':
      default:
        return 'bg-gray-100 text-gray-800 ring-1 ring-gray-200/90 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600';
    }
  };

  /** Old domains: map plugin summary → display label + tier (not all rows are binary Updated/Not updated) */
  const getOldDomainPluginTierAndLabel = (summary) => {
    if (summary === 'OK / Updated' || summary === 'OK') {
      return { tier: 'done', label: 'Updated' };
    }
    if (summary === 'Not updated') {
      return { tier: 'not_started', label: 'Not updated' };
    }
    const labelBySummary = {
      Failed: 'Failed',
      'Issue found': 'Issue found',
      'Needs verification': 'Needs verification',
      'Blocked access': 'Blocked access',
      Skipped: 'Skipped',
      Pending: 'Pending',
    };
    return {
      tier: 'in_progress',
      label: labelBySummary[summary] || summary,
    };
  };

  /** Shown when new domain row has no status yet — matches old-domains “Not updated” label */
  const NEW_DOMAIN_DEFAULT_STATUS_LABEL = 'Not updated';

  /** New domains: free-text row status → tier */
  const getNewDomainStatusTier = (status) => {
    const raw = String(status || '').trim();
    if (!raw || raw === '—') return 'not_started';
    const s = raw.toLowerCase();
    if (s === 'not updated' || s === 'n/a' || s === 'na' || s === 'none') return 'not_started';
    if (
      s.includes('done') ||
      s.includes('complete') ||
      s === 'ok' ||
      (s.includes('updated') && !s.includes('not'))
    ) {
      return 'done';
    }
    if (
      s.includes('progress') ||
      s.includes('pending') ||
      s.includes('verify') ||
      s.includes('block') ||
      s.includes('issue') ||
      s.includes('fail') ||
      s.includes('wait') ||
      s.includes('hold')
    ) {
      return 'in_progress';
    }
    return 'in_progress';
  };

  /** Badge class for new-domain status cell from free text */
  const newDomainRowStatusBadgeClass = (status) =>
    domainTableStatusBadgeClassByTier(getNewDomainStatusTier(status));

  /** View mode: empty / placeholder hyphen → same default label as old domains tab */
  const getNewDomainStatusDisplayLabel = (status) => {
    const raw = String(status || '').trim();
    if (!raw || raw === '—') return NEW_DOMAIN_DEFAULT_STATUS_LABEL;
    return raw;
  };

  const filteredDomains = useMemo(() => {
    let list = domains.filter((d) => d.type === domainTypeFilter);

    const q = String(domainSearchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter((d) => {
        const country = String(d.country || '').toLowerCase();
        const url = String(d.url || '').toLowerCase();
        return country.includes(q) || url.includes(q);
      });
    }

    if (domainClaimFilter !== 'all') {
      list = list.filter((d) => {
        const claim = domainClaims.find((c) => c.domain_id === d.id);
        const isClaimed = !!claim;
        const mine = claim && String(claim.claimed_by) === String(user?.id);
        if (domainClaimFilter === 'claimed') return isClaimed;
        if (domainClaimFilter === 'unclaimed') return !isClaimed;
        if (domainClaimFilter === 'mine') return mine;
        return true;
      });
    }

    if (domainStatusFilter !== 'all') {
      list = list.filter((d) => {
        if (domainTypeFilter === 'old') {
          const summary = getDomainPluginSummary(d);
          const { tier } = getOldDomainPluginTierAndLabel(summary);
          if (domainStatusFilter === 'updated') return tier === 'done';
          if (domainStatusFilter === 'not_updated') return tier === 'not_started';
          if (domainStatusFilter === 'in_progress') return tier === 'in_progress';
        } else {
          const tier = getNewDomainStatusTier(d.status);
          if (domainStatusFilter === 'updated') return tier === 'done';
          if (domainStatusFilter === 'not_updated') return tier === 'not_started';
          if (domainStatusFilter === 'in_progress') return tier === 'in_progress';
        }
        return true;
      });
    }

    return list;
  }, [
    domains,
    domainTypeFilter,
    domainSearchQuery,
    domainClaimFilter,
    domainStatusFilter,
    domainClaims,
    user?.id,
    domainUpdates,
  ]);

  const domainsTabBaseCount = useMemo(
    () => domains.filter((d) => d.type === domainTypeFilter).length,
    [domains, domainTypeFilter]
  );

  const clearDomainFilters = () => {
    setDomainSearchQuery('');
    setDomainClaimFilter('all');
    setDomainStatusFilter('all');
  };

  const domainFiltersActive =
    Boolean(String(domainSearchQuery || '').trim()) ||
    domainClaimFilter !== 'all' ||
    domainStatusFilter !== 'all';

  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 dark:text-gray-400">Loading tasks...</div>
      </div>
    );
  }

  const filteredTasks = getFilteredTasks();
  const selectedCourseListDomain =
    domains.find((d) => d.id === courseListDomainId) || null;
  const isSingaporeCourseDomain =
    selectedCourseListDomain &&
    String(selectedCourseListDomain.country || '')
      .trim()
      .toLowerCase() === 'singapore';

  const canBulkEditDomains = domainTypeFilter === 'old';
  const isEditingDomains = isEditingDomainsTable && canBulkEditDomains;

  const domainSearchToolbarEl = (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/40 p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-row flex-wrap md:flex-nowrap items-end gap-3">
          <div className="relative min-w-0 w-full flex-1 md:w-auto md:min-w-[12rem] max-w-xl">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base opacity-70 pointer-events-none select-none" aria-hidden>
              🔍
            </span>
            <label htmlFor="domain-search-input" className="sr-only">
              Search by country or URL
            </label>
            <input
              id="domain-search-input"
              type="search"
              value={domainSearchQuery}
              onChange={(e) => setDomainSearchQuery(e.target.value)}
              placeholder="Search by country or URL…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 pl-10 pr-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
              aria-label="Search domains by country or URL"
            />
          </div>
          <div className="w-40 shrink-0">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Claim</label>
            <select
              value={domainClaimFilter}
              onChange={(e) => setDomainClaimFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="claimed">Claimed</option>
              <option value="unclaimed">Unclaimed</option>
              <option value="mine">Claimed by me</option>
            </select>
          </div>
          <div className="w-44 shrink-0">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              {domainTypeFilter === 'old' ? 'Status (plugin update)' : 'Status (row)'}
            </label>
            <select
              value={domainStatusFilter}
              onChange={(e) => setDomainStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="updated">{domainTypeFilter === 'old' ? 'Updated' : 'Done / Updated'}</option>
              <option value="not_updated">Not updated</option>
              <option value="in_progress">In progress</option>
            </select>
          </div>
          {domainFiltersActive && (
            <button
              type="button"
              onClick={clearDomainFilters}
              className="text-sm font-medium text-[#6795BE] dark:text-sky-300 hover:underline shrink-0 pb-2"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {domainFiltersActive ? (
            <>
              Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{filteredDomains.length}</span> of{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">{domainsTabBaseCount}</span> domain
              {domainsTabBaseCount !== 1 ? 's' : ''} in this tab
            </>
          ) : (
            <>
              {domainsTabBaseCount} domain{domainsTabBaseCount !== 1 ? 's' : ''} in this tab — use search or filters to narrow the list
            </>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            Task Assignment Log
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage tasks and domains</p>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => { setActiveMainTab('tasks'); setSearchParams({}); }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeMainTab === 'tasks'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          style={activeMainTab === 'tasks' ? { borderTopColor: PRIMARY } : {}}
        >
          Tasks
        </button>
        <button
          type="button"
          onClick={() => { setActiveMainTab('udemy-course'); setSearchParams({ tab: 'udemy-course' }); }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeMainTab === 'udemy-course'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          style={activeMainTab === 'udemy-course' ? { borderTopColor: PRIMARY } : {}}
        >
          Udemy Course
        </button>
        {canAccessCourseListTab(userRole, userTeam) && (
          <button
            type="button"
            onClick={() => { setActiveMainTab('course-list'); setSearchParams({ tab: 'course-list' }); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeMainTab === 'course-list'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={activeMainTab === 'course-list' ? { borderTopColor: PRIMARY } : {}}
          >
            Course List
          </button>
        )}
        <button
          type="button"
          onClick={() => { setActiveMainTab('domains'); setSearchParams({ tab: 'domains' }); }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeMainTab === 'domains'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
        >
          Domains
        </button>
        {(userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl') && (
          <button
            type="button"
            onClick={() => { setActiveMainTab('domain-claims'); setSearchParams({ tab: 'domain-claims' }); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeMainTab === 'domain-claims'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            Domain Claims
          </button>
        )}
        {(userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl' || (userRole === 'intern' && String(userTeam || '').toLowerCase() === 'tla')) && (
          <button
            type="button"
            onClick={() => { setActiveMainTab('domain-updates'); setSearchParams({ tab: 'domain-updates' }); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeMainTab === 'domain-updates'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={activeMainTab === 'domain-updates' ? { borderTopColor: PRIMARY } : {}}
          >
            Domain Updates
          </button>
        )}
      </div>

      {activeMainTab === 'tasks' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTaskFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  taskFilter === 'all'
                    ? 'text-white'
                    : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                style={taskFilter === 'all' ? { backgroundColor: PRIMARY } : {}}
              >
                All Tasks
              </button>
              <button
                type="button"
                onClick={() => setTaskFilter('my-tasks')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  taskFilter === 'my-tasks'
                    ? 'text-white'
                    : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                style={taskFilter === 'my-tasks' ? { backgroundColor: PRIMARY } : {}}
              >
                My Tasks
              </button>
            </div>
            <div className="flex items-center gap-2">
              {isEditingAllTasks ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveTaskEdit}
                    disabled={savingTaskEdit}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {savingTaskEdit ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelTaskEdit}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                filteredTasks.some((t) => canUpdateStatus(t)) && (
                  <button
                    type="button"
                    onClick={startEditAllTasks}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Edit
                  </button>
                )
              )}
              {!isEditingAllTasks && permissions.canCreateTasks(userRole) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTaskModal(true);
                    fetchUsers();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Task
                </button>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task Name
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredTasks.length > 0 ? (
                    filteredTasks.map((task) => {
                      const draft = taskEditDrafts[task.id] || {
                        assigned_to: task.assigned_to || '',
                        priority: task.priority || 'medium',
                        status: task.status || 'to-do',
                      };
                      const rowEditable = isEditingAllTasks && canUpdateStatus(task);
                      return (
                        <tr key={task.id} className={isEditingAllTasks ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.name}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm">
                            {rowEditable ? (
                              <select
                                value={draft.assigned_to}
                                onChange={(e) => updateTaskDraft(task.id, 'assigned_to', e.target.value)}
                                className="min-w-[8rem] rounded border border-gray-300 px-2 py-1.5 text-sm"
                              >
                                <option value="">Unassigned</option>
                                {tlaAssignableUsers.map((u) => (
                                  <option key={u.id} value={u.id}>{u.display_name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-500">{getAssignedToDisplay(task)}</span>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            {rowEditable ? (
                              <select
                                value={draft.priority}
                                onChange={(e) => updateTaskDraft(task.id, 'priority', e.target.value)}
                                className="min-w-[6rem] rounded border border-gray-300 px-2 py-1.5 text-sm"
                              >
                                {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getPriorityColor(
                                  task.priority || 'medium'
                                )}`}
                              >
                                {TASK_PRIORITIES[task.priority] || 'Medium'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            {rowEditable ? (
                              <select
                                value={draft.status}
                                onChange={(e) => updateTaskDraft(task.id, 'status', e.target.value)}
                                className={`min-w-[7rem] rounded border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-sm ${getStatusColor(
                                  draft.status
                                )}`}
                              >
                                {Object.entries(TASK_STATUSES).map(([key, label]) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </select>
                            ) : canUpdateStatus(task) ? (
                              <select
                                value={task.status || 'to-do'}
                                onChange={(e) => handleStatusChange(task, e.target.value)}
                                className={`min-w-[7rem] px-2.5 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 ${getStatusColor(
                                  task.status || 'to-do'
                                )} cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6795BE] focus:ring-offset-0`}
                              >
                                {Object.entries(TASK_STATUSES).map(([key, label]) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(
                                  task.status || 'to-do'
                                )}`}
                              >
                                {TASK_STATUSES[task.status] || 'Not Started'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTask(task);
                                  if (isWpPluginTask(task)) fetchWpPluginRows(task.id);
                                }}
                                className="text-xs font-medium min-w-[4rem] px-2.5 py-1.5 rounded-lg text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                View
                              </button>
                              {isEditingAllTasks && permissions.canDeleteTasks(userRole) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task)}
                                  className="text-xs font-medium min-w-[4rem] px-2.5 py-1.5 rounded-lg text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                              {canClaimTask(userRole, userTeam) && (
                                task.assigned_to ? (
                                  String(task.assigned_to) === String(user?.id) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleClaimTask(task)}
                                      disabled={claimingTaskId === task.id}
                                      className="text-xs font-medium min-w-[4rem] px-2.5 py-1.5 rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-opacity"
                                    >
                                      {claimingTaskId === task.id ? '...' : 'Unclaim'}
                                    </button>
                                  ) : null
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleClaimTask(task)}
                                    disabled={claimingTaskId === task.id}
                                    className="text-xs font-medium min-w-[4rem] px-2.5 py-1.5 rounded-full bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-60 transition-opacity"
                                  >
                                    {claimingTaskId === task.id ? '...' : 'Claim'}
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 sm:px-6 py-12 text-center text-sm text-gray-500">
                        {taskFilter === 'my-tasks' ? 'You have no assigned tasks' : 'No tasks found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeMainTab === 'udemy-course' && (
        <UdemyCourseTab />
      )}

          {activeMainTab === 'course-list' && canAccessCourseListTab(userRole, userTeam) && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                Course List
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Track course titles per domain and across corporate course categories.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Domain</label>
                <select
                  value={courseListDomainId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCourseListDomainId(id);
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        if (id) {
                          window.localStorage.setItem('courseListDomainId', id);
                        } else {
                          window.localStorage.removeItem('courseListDomainId');
                        }
                      }
                    } catch {
                      // ignore storage errors
                    }
                    // Data fetch is handled by useEffect that watches courseListDomainId
                  }}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                >
                  <option value="">Select domain…</option>
                  {COURSE_LIST_DOMAIN_COUNTRIES.map((name) => {
                    const match = domains.find(
                      (d) => (d.country || '').trim().toLowerCase() === name.toLowerCase()
                    );
                    if (!match) return null;
                    return (
                      <option key={match.id} value={match.id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="min-w-[240px]">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Search</label>
                <input
                  type="text"
                  value={courseListSearchQuery}
                  onChange={(e) => setCourseListSearchQuery(e.target.value)}
                  placeholder="Type to filter course title…"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>
          {courseListDomainId ? (
            <>
              {/* Per-domain: Add course button (separate from table) */}
              {canEditCourseList(userRole, userTeam) && (
                <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={async () => {
                        if (editingDomainCourseId || isCreatingDomainCourse) {
                          toast.error('Finish editing the current course row first.');
                          return;
                        }
                        setIsCreatingDomainCourse(true);
                        setCreatingDomainCourseDraft({
                          course_title: '',
                          course_type: 'G',
                          status: 'in_progress',
                        });
                    }}
                      disabled={courseListSaving || isCreatingDomainCourse}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                      {courseListSaving ? 'Working…' : isCreatingDomainCourse ? 'Adding…' : 'Add course'}
                  </button>
                </div>
              )}

              {/* Per-domain: Add course form (separate from table to keep sorting consistent) */}
              {canEditCourseList(userRole, userTeam) && isCreatingDomainCourse && (
                <div className="mx-4 mb-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Course title</label>
                      <input
                        type="text"
                        value={creatingDomainCourseDraft.course_title}
                        onChange={(e) =>
                          setCreatingDomainCourseDraft((prev) => ({
                            ...prev,
                            course_title: e.target.value,
                          }))
                        }
                        placeholder="Enter course title (required)"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="w-full md:w-40">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">G / S</label>
                      <select
                        value={creatingDomainCourseDraft.course_type}
                        onChange={(e) =>
                          setCreatingDomainCourseDraft((prev) => ({
                            ...prev,
                            course_type: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">—</option>
                        <option value="G">G</option>
                        <option value="S">S</option>
                        <option value="G/S">G/S</option>
                      </select>
                    </div>
                    <div className="w-full md:w-56">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
                      <select
                        value={creatingDomainCourseDraft.status}
                        onChange={(e) =>
                          setCreatingDomainCourseDraft((prev) => ({
                            ...prev,
                            status: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">—</option>
                        <option value="done">Done</option>
                        <option value="has_issue">Has issue</option>
                        <option value="in_progress">In-Progress</option>
                        <option value="different_title">Different title / Not in domain</option>
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={async () => {
                          const title = String(creatingDomainCourseDraft.course_title || '').trim();
                          if (!title) {
                            toast.error('Course title is required.');
                            return;
                          }
                          if (!window.confirm('Create this new course?')) return;
                          setCourseListSaving(true);
                          try {
                            const payload = buildDomainCoursePayload(creatingDomainCourseDraft, {}, user?.id);
                            const { data, error } = await supabase
                              .from('course_list_domain_items')
                              .insert({
                                domain_id: courseListDomainId,
                                ...payload,
                              })
                              .select('*')
                              .single();
                            if (error) throw error;

                            const nextList = await fetchCourseListItems(courseListDomainId);
                            const q = String(courseListSearchQuery || '').trim().toLowerCase();
                            const filteredNextList = q
                              ? (nextList || []).filter((r) => String(r?.course_title || '').toLowerCase().includes(q))
                              : nextList || [];
                            const idx = filteredNextList.findIndex((r) => r.id === data.id);
                            if (idx >= 0) setCourseListPage(Math.floor(idx / 10) + 1);

                            setIsCreatingDomainCourse(false);
                            setCreatingDomainCourseDraft({
                              course_title: '',
                              course_type: 'G',
                              status: 'in_progress',
                            });
                          } catch (err) {
                            console.warn('Add course_list_domain_items error:', err);
                            toast.error(err?.message || 'Failed to create course');
                          } finally {
                            setCourseListSaving(false);
                          }
                        }}
                        disabled={courseListSaving || !String(creatingDomainCourseDraft.course_title || '').trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {courseListSaving ? 'Working…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingDomainCourse(false);
                          setCreatingDomainCourseDraft({
                            course_title: '',
                            course_type: 'G',
                            status: 'in_progress',
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-domain course list table */}
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  {courseListLoading ? (
                    <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading courses…</div>
                  ) : courseListItems.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      No courses yet for this domain.{' '}
                      {canEditCourseList(userRole, userTeam) ? 'Use “Add course” to create the first row.' : ''}
                    </div>
                  ) : courseListFilteredItems.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      No matching courses found.
                    </div>
                  ) : (
                    <>
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-950/40">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Course title
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">
                            G / S
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-40">
                            Status
                          </th>
                          {canEditCourseList(userRole, userTeam) && (
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                        {courseListFilteredItems
                          .slice((courseListPage - 1) * 10, courseListPage * 10)
                          .map((row) => {
                          const canEdit = canEditCourseList(userRole, userTeam);
                          const isEditingRow = canEdit && editingDomainCourseId === row.id;
                          const draft = isEditingRow ? editingDomainCourseDraft : null;
                          return (
                            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                              <td className="px-4 py-2">
                                {isEditingRow ? (
                                  <input
                                    type="text"
                                    value={draft?.course_title ?? ''}
                                    onChange={(e) =>
                                      setEditingDomainCourseDraft((prev) => ({
                                        ...prev,
                                        course_title: e.target.value,
                                      }))
                                    }
                                    placeholder="Enter course title"
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                                  />
                                ) : (
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {(row.course_title || '').trim() || DEFAULT_COURSE_TITLE_FALLBACK}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                {isEditingRow ? (
                                  <select
                                    value={draft?.course_type ?? ''}
                                    onChange={(e) =>
                                      setEditingDomainCourseDraft((prev) => ({
                                        ...prev,
                                        course_type: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                  >
                                <option value="">—</option>
                                <option value="G">G</option>
                                <option value="S">S</option>
                                <option value="G/S">G/S</option>
                                  </select>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                    {courseTypeToUi(row.course_type) || '—'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                {isEditingRow ? (
                                  <select
                                    value={draft?.status ?? ''}
                                    onChange={(e) =>
                                      setEditingDomainCourseDraft((prev) => ({
                                        ...prev,
                                        status: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                  >
                                    <option value="">—</option>
                                    <option value="done">Done</option>
                                    <option value="has_issue">Has issue</option>
                                    <option value="in_progress">In-Progress</option>
                                    <option value="different_title">Different title / Not in domain</option>
                                  </select>
                                ) : (
                                  <span
                                    className={`
                                      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                      ${
                                        !row.status
                                          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'
                                          : row.status === 'done'
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                          : row.status === 'has_issue'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                          : row.status === 'different_title'
                                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                                      }
                                    `}
                                  >
                                    {!row.status
                                      ? '—'
                                      : row.status === 'done'
                                      ? 'Done'
                                      : row.status === 'has_issue'
                                      ? 'Has issue'
                                      : row.status === 'different_title'
                                      ? 'Different title / Not in domain'
                                      : 'In-Progress'}
                                  </span>
                                )}
                              </td>
                              {canEdit && (
                                <td className="px-4 py-2 text-right">
                                  {isEditingRow ? (
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const title = String(draft?.course_title ?? '').trim();
                                            if (!title) {
                                              toast.error('Course title is required.');
                                              return;
                                            }
                                            const payload = buildDomainCoursePayload(
                                              editingDomainCourseDraft,
                                              row,
                                              user?.id
                                            );
                                            setCourseListSaving(true);
                                            try {
                                              const { error } = await supabase
                                                .from('course_list_domain_items')
                                                .update(payload)
                                              .eq('id', row.id);
                                            if (error) throw error;
                                            const nextList = await fetchCourseListItems(courseListDomainId);
                                            const q = String(courseListSearchQuery || '').trim().toLowerCase();
                                            const filteredNextList = q
                                              ? (nextList || []).filter((r) => String(r?.course_title || '').toLowerCase().includes(q))
                                              : nextList || [];
                                            const idx = filteredNextList.findIndex((r) => r.id === row.id);
                                            if (idx >= 0) setCourseListPage(Math.floor(idx / 10) + 1);
                                            setEditingDomainCourseId(null);
                                          } catch (err) {
                                            console.warn('Save course_list_domain_items error:', err);
                                            toast.error(err?.message || 'Failed to save course');
                                            fetchCourseListItems(courseListDomainId);
                                          } finally {
                                            setCourseListSaving(false);
                                          }
                                        }}
                                        disabled={courseListSaving || !String(draft?.course_title ?? '').trim()}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                                        style={{ backgroundColor: PRIMARY }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingDomainCourseId(null);
                                          setEditingDomainCourseDraft({
                                            course_title: '',
                                            course_type: '',
                                            status: '',
                                          });
                                          fetchCourseListItems(courseListDomainId);
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (editingDomainCourseId && editingDomainCourseId !== row.id) {
                                            toast.error('You can only edit one course row at a time.');
                                            return;
                                          }
                                          setEditingDomainCourseId(row.id);
                                          setEditingDomainCourseDraft({
                                            course_title: row.course_title || '',
                                            course_type: courseTypeToUi(row.course_type) || '',
                                            status: row.status || '',
                                          });
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                      >
                                        Edit
                                      </button>
                                      {canDeleteCourseList(userRole, userTeam) && (
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!window.confirm('Delete this course from this domain?')) return;
                                            try {
                                              await supabase
                                                .from('course_list_domain_items')
                                                .delete()
                                                .eq('id', row.id);
                                              setCourseListItems((prev) => prev.filter((r) => r.id !== row.id));
                                              if (editingDomainCourseId === row.id) {
                                                setEditingDomainCourseId(null);
                                              }
                                            } catch (err) {
                                              console.warn('Delete course_list_domain_items error:', err);
                                              toast.error(err?.message || 'Failed to delete course');
                                            }
                                          }}
                                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {courseListFilteredItems.length > 10 && (
                      <div className="px-4 py-2 flex items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800">
                        <span>
                          Page {courseListPage} of {courseListTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCourseListPage((p) => Math.max(1, p - 1))}
                          disabled={courseListPage === 1}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCourseListPage((p) =>
                              Math.min(courseListTotalPages, p + 1)
                            )
                          }
                          disabled={courseListPage >= courseListTotalPages}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    )}
                    </>
                  )}
                </div>
              </div>

              {/* Corporate courses */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Corporate Courses</h3>
                {CORPORATE_COURSE_CATEGORIES.map((category) => {
                  const rows = courseListFilteredCorporateItems.filter((r) => r.category === category);
                  const page = corporateCoursePages[category] || 1;
                  const totalPages = Math.max(1, Math.ceil(rows.length / 10));
                  const clampedPage = Math.min(Math.max(1, page), totalPages);
                  return (
                    <div key={category} className="space-y-0">
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{category}</h4>
                        {canEditCourseList(userRole, userTeam) && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (editingCorporateCourseId || isCreatingCorporateCourse) {
                                toast.error('Finish editing the current course row first.');
                                return;
                              }
                              setIsCreatingCorporateCourse(true);
                              setCreatingCorporateCourseCategory(category);
                              setCreatingCorporateCourseDraft({
                                course_title: '',
                                course_type: 'G',
                                status: 'in_progress',
                              });
                            }}
                            disabled={corporateCourseLoading || isCreatingCorporateCourse}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            Add course
                          </button>
                        )}
                      </div>

                      {canEditCourseList(userRole, userTeam) &&
                        isCreatingCorporateCourse &&
                        creatingCorporateCourseCategory === category && (
                          <div className="mx-4 mb-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-end gap-3">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Course title</label>
                                <input
                                  type="text"
                                  value={creatingCorporateCourseDraft.course_title}
                                  onChange={(e) =>
                                    setCreatingCorporateCourseDraft((prev) => ({
                                      ...prev,
                                      course_title: e.target.value,
                                    }))
                                  }
                                  placeholder="Enter course title (required)"
                                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                                />
                              </div>
                              <div className="w-full md:w-40">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">G / S</label>
                                <select
                                  value={creatingCorporateCourseDraft.course_type}
                                  onChange={(e) =>
                                    setCreatingCorporateCourseDraft((prev) => ({
                                      ...prev,
                                      course_type: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                >
                                  <option value="G">G</option>
                                  <option value="S">S</option>
                                  <option value="G/S">G/S</option>
                                </select>
                              </div>
                              <div className="w-full md:w-56">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
                                <select
                                  value={creatingCorporateCourseDraft.status}
                                  onChange={(e) =>
                                    setCreatingCorporateCourseDraft((prev) => ({
                                      ...prev,
                                      status: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                >
                                  <option value="done">Done</option>
                                  <option value="has_issue">Has issue</option>
                                  <option value="in_progress">In-Progress</option>
                                  <option value="different_title">Different title / Not in domain</option>
                                </select>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const title = String(creatingCorporateCourseDraft.course_title || '').trim();
                                    if (!title) {
                                      toast.error('Course title is required.');
                                      return;
                                    }
                                    if (!window.confirm('Create this new course?')) return;

                                    setCorporateCourseLoading(true);
                                    try {
                                      const payload = buildCorporateCoursePayload(
                                        creatingCorporateCourseDraft,
                                        {},
                                        user?.id
                                      );
                                      const { data, error } = await supabase
                                        .from('corporate_course_items')
                                        .insert({
                                          category,
                                          domain_id: courseListDomainId,
                                          ...payload,
                                        })
                                        .select('*')
                                        .single();
                                      if (error) throw error;

                                      const next = await fetchCorporateCourseItems(courseListDomainId);
                                      const categoryRows = (next || []).filter((r) => r.category === category);
                                      const idx = categoryRows.findIndex((r) => r.id === data.id);
                                      if (idx >= 0) {
                                        setCorporateCoursePages((p) => ({
                                          ...p,
                                          [category]: Math.floor(idx / 10) + 1,
                                        }));
                                      }

                                      setIsCreatingCorporateCourse(false);
                                      setCreatingCorporateCourseCategory(null);
                                      setCreatingCorporateCourseDraft({
                                        course_title: '',
                                        course_type: 'G',
                                        status: 'in_progress',
                                      });
                                    } catch (err) {
                                      console.warn('Add corporate_course_items error:', err);
                                      toast.error(err?.message || 'Failed to create course');
                                    } finally {
                                      setCorporateCourseLoading(false);
                                    }
                                  }}
                                  disabled={corporateCourseLoading || !String(creatingCorporateCourseDraft.course_title || '').trim()}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                                  style={{ backgroundColor: PRIMARY }}
                                >
                                  {corporateCourseLoading ? 'Working…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsCreatingCorporateCourse(false);
                                    setCreatingCorporateCourseCategory(null);
                                    setCreatingCorporateCourseDraft({
                                      course_title: '',
                                      course_type: 'G',
                                      status: 'in_progress',
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                        {rows.length === 0 ? (
                          <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                            No courses yet for this category.
                          </div>
                        ) : (
                          <>
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-950/40">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                  Course title
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">
                                  G / S
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-40">
                                  Status
                                </th>
                                {canEditCourseList(userRole, userTeam) && (
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">
                                    Actions
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                              {rows
                                .slice((clampedPage - 1) * 10, clampedPage * 10)
                                .map((row) => {
                                const canEdit = canEditCourseList(userRole, userTeam);
                                const isEditingRow = canEdit && editingCorporateCourseId === row.id;
                                const draft = isEditingRow ? editingCorporateCourseDraft : null;
                                return (
                                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                    <td className="px-4 py-2">
                                      {isEditingRow ? (
                                        <input
                                          type="text"
                                          value={draft?.course_title ?? ''}
                                          onChange={(e) =>
                                            setEditingCorporateCourseDraft((prev) => ({
                                              ...prev,
                                              course_title: e.target.value,
                                            }))
                                          }
                                          placeholder="Enter course title"
                                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                                        />
                                      ) : (
                                        <span className="text-gray-900 dark:text-gray-100">
                                          {(row.course_title || '').trim() || DEFAULT_COURSE_TITLE_FALLBACK}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      {isEditingRow ? (
                                        <select
                                          value={draft?.course_type ?? ''}
                                          onChange={(e) =>
                                            setEditingCorporateCourseDraft((prev) => ({
                                              ...prev,
                                              course_type: e.target.value,
                                            }))
                                          }
                                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                        >
                                          <option value="">—</option>
                                          <option value="G">G</option>
                                          <option value="S">S</option>
                                          <option value="G/S">G/S</option>
                                        </select>
                                      ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                          {courseTypeToUi(row.course_type) || '—'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      {isEditingRow ? (
                                        <select
                                          value={draft?.status ?? ''}
                                          onChange={(e) =>
                                            setEditingCorporateCourseDraft((prev) => ({
                                              ...prev,
                                              status: e.target.value,
                                            }))
                                          }
                                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                        >
                                          <option value="">—</option>
                                          <option value="done">Done</option>
                                          <option value="has_issue">Has issue</option>
                                          <option value="in_progress">In-Progress</option>
                                          <option value="different_title">Different title / Not in domain</option>
                                        </select>
                                      ) : (
                                        <span
                                          className={`
                                            inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                            ${
                                              !row.status
                                                ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'
                                                : row.status === 'done'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                : row.status === 'has_issue'
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                : row.status === 'different_title'
                                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                                            }
                                          `}
                                        >
                                          {!row.status
                                            ? '—'
                                            : row.status === 'done'
                                            ? 'Done'
                                            : row.status === 'has_issue'
                                            ? 'Has issue'
                                            : row.status === 'different_title'
                                            ? 'Different title / Not in domain'
                                            : 'In-Progress'}
                                        </span>
                                      )}
                                    </td>
                                    {canEdit && (
                                      <td className="px-4 py-2 text-right">
                                        {isEditingRow ? (
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                const payload = buildCorporateCoursePayload(
                                                  editingCorporateCourseDraft,
                                                  row,
                                                  user?.id
                                                );
                                                setCorporateCourseLoading(true);
                                                try {
                                                  const { error } = await supabase
                                                    .from('corporate_course_items')
                                                    .update(payload)
                                                    .eq('id', row.id);
                                                  if (error) throw error;
                                                  setCorporateCourseItems((prev) =>
                                                    prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r))
                                                  );
                                                  setEditingCorporateCourseId(null);
                                                } catch (err) {
                                                  console.warn('Save corporate_course_items error:', err);
                                                  toast.error(err?.message || 'Failed to save course');
                                                  fetchCorporateCourseItems(courseListDomainId);
                                                } finally {
                                                  setCorporateCourseLoading(false);
                                                }
                                              }}
                                              disabled={corporateCourseLoading || !String(draft?.course_title ?? '').trim()}
                                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                                              style={{ backgroundColor: PRIMARY }}
                                            >
                                              Save
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingCorporateCourseId(null);
                                                setEditingCorporateCourseDraft({
                                                  course_title: '',
                                                  course_type: '',
                                                  status: '',
                                                });
                                                fetchCorporateCourseItems(courseListDomainId);
                                              }}
                                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (editingCorporateCourseId && editingCorporateCourseId !== row.id) {
                                                  toast.error('You can only edit one course row at a time.');
                                                  return;
                                                }
                                                setEditingCorporateCourseId(row.id);
                                                setEditingCorporateCourseDraft({
                                                  course_title: row.course_title || '',
                                                  course_type: courseTypeToUi(row.course_type) || '',
                                                  status: row.status || '',
                                                });
                                                }}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                            >
                                              Edit
                                            </button>
                                            {canDeleteCourseList(userRole, userTeam) && (
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  if (
                                                    !window.confirm(
                                                      'Delete this corporate course for this domain?'
                                                    )
                                                  ) {
                                                    return;
                                                  }
                                                  try {
                                                    await supabase
                                                      .from('corporate_course_items')
                                                      .delete()
                                                      .eq('id', row.id);
                                                    setCorporateCourseItems((prev) =>
                                                      prev.filter((r) => r.id !== row.id)
                                                    );
                                                    if (editingCorporateCourseId === row.id) {
                                                      setEditingCorporateCourseId(null);
                                                    }
                                                  } catch (err) {
                                                    console.warn('Delete corporate_course_items error:', err);
                                                    toast.error(err?.message || 'Failed to delete course');
                                                  }
                                                }}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40"
                                              >
                                                Delete
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {rows.length > 10 && (
                            <div className="px-4 py-2 flex items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800">
                              <span>
                                Page {clampedPage} of {totalPages}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setCorporateCoursePages((prev) => ({
                                    ...prev,
                                    [category]: Math.max(1, clampedPage - 1),
                                  }))
                                }
                                disabled={clampedPage === 1}
                                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                              >
                                Prev
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCorporateCoursePages((prev) => ({
                                    ...prev,
                                    [category]: Math.min(totalPages, clampedPage + 1),
                                  }))
                                }
                                disabled={clampedPage >= totalPages}
                                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                              >
                                Next
                              </button>
                            </div>
                          )}
                          </>
                        )}
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>

              {/* Singapore-specific course categories */}
              {isSingaporeCourseDomain && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Singapore Course Categories</h3>
                  {SINGAPORE_COURSE_CATEGORIES.map((category) => {
                    const rows = courseListFilteredCorporateItems.filter((r) => r.category === category);
                    const page = corporateCoursePages[category] || 1;
                    const totalPages = Math.max(1, Math.ceil(rows.length / 10));
                    const clampedPage = Math.min(Math.max(1, page), totalPages);
                    return (
                      <div
                        key={category}
                        className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"
                      >
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{category}</h4>
                          {canEditCourseList(userRole, userTeam) && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (editingCorporateCourseId) {
                                  toast.error('Finish editing the current course row first.');
                                  return;
                                }
                                setCorporateCourseLoading(true);
                                try {
                                  const { data, error } = await supabase
                                    .from('corporate_course_items')
                                    .insert({
                                      category,
                                      domain_id: courseListDomainId,
                                      course_title: '',
                                      course_type: 'G',
                                      status: 'in_progress',
                                      updated_by: user?.id || null,
                                    })
                                    .select('*')
                                    .single();
                                  if (error) throw error;
                                  setCorporateCourseItems((prev) => {
                                    const next = [...prev, data];
                                    const categoryRows = next.filter((r) => r.category === category);
                                    setCorporateCoursePages((p) => ({
                                      ...p,
                                      [category]: Math.ceil(categoryRows.length / 10),
                                    }));
                                    return next;
                                  });
                                  setEditingCorporateCourseId(data.id);
                                  setEditingCorporateCourseDraft({
                                    course_title: data.course_title || '',
                                    course_type: courseTypeToUi(data.course_type) || '',
                                    status: data.status || '',
                                  });
                                } catch (err) {
                                  console.warn('Add corporate_course_items error (Singapore):', err);
                                  toast.error(err?.message || 'Failed to add course');
                                } finally {
                                  setCorporateCourseLoading(false);
                                }
                              }}
                              disabled={corporateCourseLoading}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                              style={{ backgroundColor: PRIMARY }}
                            >
                              Add course
                            </button>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          {rows.length === 0 ? (
                            <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                              No courses yet for this category.
                            </div>
                          ) : (
                            <>
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-950/40">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                      Course title
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">
                                      G / S
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-40">
                                      Status
                                    </th>
                                    {canEditCourseList(userRole, userTeam) && (
                                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">
                                        Actions
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                                  {rows
                                    .slice((clampedPage - 1) * 10, clampedPage * 10)
                                    .map((row) => {
                                      const canEdit = canEditCourseList(userRole, userTeam);
                                      const isEditingRow = canEdit && editingCorporateCourseId === row.id;
                                      const draft = isEditingRow ? editingCorporateCourseDraft : null;
                                      return (
                                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                          <td className="px-4 py-2">
                                            {isEditingRow ? (
                                              <input
                                                type="text"
                                                value={draft?.course_title ?? ''}
                                                onChange={(e) =>
                                                  setEditingCorporateCourseDraft((prev) => ({
                                                    ...prev,
                                                    course_title: e.target.value,
                                                  }))
                                                }
                                                placeholder="Enter course title"
                                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                                              />
                                            ) : (
                                              <span className="text-gray-900 dark:text-gray-100">
                                                  {(row.course_title || '').trim() || DEFAULT_COURSE_TITLE_FALLBACK}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2">
                                            {isEditingRow ? (
                                              <select
                                                value={draft?.course_type ?? ''}
                                                onChange={(e) =>
                                                  setEditingCorporateCourseDraft((prev) => ({
                                                    ...prev,
                                                    course_type: e.target.value,
                                                  }))
                                                }
                                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                              >
                                                <option value="">—</option>
                                                <option value="G">G</option>
                                                <option value="S">S</option>
                                                <option value="G/S">G/S</option>
                                              </select>
                                            ) : (
                                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                                  {courseTypeToUi(row.course_type) || '—'}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2">
                                            {isEditingRow ? (
                                              <select
                                                value={draft?.status ?? ''}
                                                onChange={(e) =>
                                                  setEditingCorporateCourseDraft((prev) => ({
                                                    ...prev,
                                                    status: e.target.value,
                                                  }))
                                                }
                                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                              >
                                                <option value="">—</option>
                                                <option value="done">Done</option>
                                                <option value="has_issue">Has issue</option>
                                                <option value="in_progress">In-Progress</option>
                                                <option value="different_title">Different title / Not in domain</option>
                                              </select>
                                            ) : (
                                              <span
                                                className={`
                                                  inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                                  ${
                                                    !row.status
                                                      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'
                                                      : row.status === 'done'
                                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                      : row.status === 'has_issue'
                                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                      : row.status === 'different_title'
                                                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                                                  }
                                                `}
                                              >
                                                {!row.status
                                                  ? '—'
                                                  : row.status === 'done'
                                                  ? 'Done'
                                                  : row.status === 'has_issue'
                                                  ? 'Has issue'
                                                  : row.status === 'different_title'
                                                  ? 'Different title / Not in domain'
                                                  : 'In-Progress'}
                                              </span>
                                            )}
                                          </td>
                                          {canEdit && (
                                            <td className="px-4 py-2 text-right">
                                              {isEditingRow ? (
                                                <div className="flex items-center justify-end gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      const payload = buildCorporateCoursePayload(
                                                        editingCorporateCourseDraft,
                                                        row,
                                                        user?.id
                                                      );
                                                      setCorporateCourseLoading(true);
                                                      try {
                                                        const { error } = await supabase
                                                          .from('corporate_course_items')
                                                          .update(payload)
                                                          .eq('id', row.id);
                                                        if (error) throw error;
                                                        setCorporateCourseItems((prev) =>
                                                          prev.map((r) =>
                                                            r.id === row.id ? { ...r, ...payload } : r
                                                          )
                                                        );
                                                        setEditingCorporateCourseId(null);
                                                      } catch (err) {
                                                        console.warn('Save corporate_course_items error:', err);
                                                        toast.error(err?.message || 'Failed to save course');
                                                        fetchCorporateCourseItems(courseListDomainId);
                                                      } finally {
                                                        setCorporateCourseLoading(false);
                                                      }
                                                    }}
                                                    disabled={corporateCourseLoading || !String(draft?.course_title ?? '').trim()}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                                                    style={{ backgroundColor: PRIMARY }}
                                                  >
                                                    Save
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setEditingCorporateCourseId(null);
                                                      setEditingCorporateCourseDraft({
                                                        course_title: '',
                                                        course_type: '',
                                                        status: '',
                                                      });
                                                      fetchCorporateCourseItems(courseListDomainId);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      if (
                                                        editingCorporateCourseId &&
                                                        editingCorporateCourseId !== row.id
                                                      ) {
                                                        toast.error(
                                                          'You can only edit one course row at a time.'
                                                        );
                                                        return;
                                                      }
                                                      setEditingCorporateCourseId(row.id);
                                                      setEditingCorporateCourseDraft({
                                                        course_title: row.course_title || '',
                                                        course_type: courseTypeToUi(row.course_type) || '',
                                                        status: row.status || '',
                                                      });
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                                                  >
                                                    Edit
                                                  </button>
                                                  {canDeleteCourseList(userRole, userTeam) && (
                                                    <button
                                                      type="button"
                                                      onClick={async () => {
                                                        if (
                                                          !window.confirm(
                                                            'Delete this corporate course for this domain?'
                                                          )
                                                        ) {
                                                          return;
                                                        }
                                                        try {
                                                          await supabase
                                                            .from('corporate_course_items')
                                                            .delete()
                                                            .eq('id', row.id);
                                                          setCorporateCourseItems((prev) =>
                                                            prev.filter((r) => r.id !== row.id)
                                                          );
                                                          if (editingCorporateCourseId === row.id) {
                                                            setEditingCorporateCourseId(null);
                                                          }
                                                        } catch (err) {
                                                          console.warn('Delete corporate_course_items error:', err);
                                                          toast.error(err?.message || 'Failed to delete course');
                                                        }
                                                      }}
                                                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40"
                                                    >
                                                      Delete
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                              {rows.length > 10 && (
                                <div className="px-4 py-2 flex items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800">
                                  <span>
                                    Page {clampedPage} of {totalPages}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCorporateCoursePages((prev) => ({
                                        ...prev,
                                        [category]: Math.max(1, clampedPage - 1),
                                      }))
                                    }
                                    disabled={clampedPage === 1}
                                    className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                  >
                                    Prev
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCorporateCoursePages((prev) => ({
                                        ...prev,
                                        [category]: Math.min(totalPages, clampedPage + 1),
                                      }))
                                    }
                                    disabled={clampedPage >= totalPages}
                                    className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <div className="mb-4 rounded-full bg-gray-100 dark:bg-gray-800 p-4">
                <svg
                  className="w-10 h-10 text-gray-400 dark:text-gray-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7h4l2-3h6l2 3h4v12H3V7z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Select a domain first.</p>
            </div>
          )}
        </div>
      )}

      {activeMainTab === 'domains' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDomainTypeFilter('old')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  domainTypeFilter === 'old' ? 'text-white' : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
                style={domainTypeFilter === 'old' ? { backgroundColor: PRIMARY } : {}}
              >
                Old Domains
              </button>
              <button
                type="button"
                onClick={() => setDomainTypeFilter('new')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  domainTypeFilter === 'new' ? 'text-white' : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
                style={domainTypeFilter === 'new' ? { backgroundColor: PRIMARY } : {}}
              >
                New Domains
              </button>
            </div>
            {canManageDomainsForTla(userRole, userTeam) && (
              <div className="flex items-center gap-2">
                {canBulkEditDomains && !isEditingDomains ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingDomainsTable(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                ) : canBulkEditDomains && isEditingDomains ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDomains}
                      disabled={savingDomains}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {savingDomains ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDomainsEdit}
                      disabled={savingDomains}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Click a domain to view/edit details.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreateDomainModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Domain
                </button>
              </div>
            )}
          </div>

          {domainTypeFilter === 'new' && domainSearchToolbarEl}

          {/* Note for Old Domains only: default accounts (editable) used for WordPress plugin updates */}
          {domainTypeFilter === 'old' && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/30 p-4 text-sm text-gray-800 dark:text-gray-200">
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">Default accounts for old domains (Intern Account WordPress &amp; SG Domain WordPress)</p>
              <p className="mb-3 text-gray-700 dark:text-gray-300 leading-relaxed">These two accounts are the default credentials used for WordPress plugin updates on old domains. You can view and update the values below.</p>
              <WeeklyPluginScheduleNote
                open={weeklyPluginScheduleNoteOpen}
                onToggle={() => setWeeklyPluginScheduleNoteOpen((v) => !v)}
                className="mb-3"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div className="bg-white/70 dark:bg-gray-900/50 rounded-lg p-3 border border-blue-100 dark:border-blue-900/40 relative">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Intern Account WordPress</p>
                    <button
                      type="button"
                      onClick={() => openDefaultOldDomainPasswordHistory('intern')}
                      className="text-xs font-medium text-[#6795BE] hover:underline"
                    >
                      View old password history
                    </button>
                  </div>
                  <p className="text-gray-800 dark:text-gray-200 flex items-center gap-1 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">Admin Username:</span>
                    {defaultAccounts.intern?.username ? (
                      <>
                        <span className="font-mono text-xs break-all">{defaultAccounts.intern.username}</span>
                        <button
                          type="button"
                          onClick={() => copyUsernameToClipboard(defaultAccounts.intern?.username, 'Username')}
                          className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
                          title="Copy username"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </>
                    ) : '—'}
                  </p>
                  <p className="text-gray-800 dark:text-gray-200 flex items-center gap-1 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">Admin Password:</span>
                    {defaultAccounts.intern?.password ? (
                      <>
                        <span className="font-mono text-xs break-all">
                          {showDefaultPassword.intern ? defaultAccounts.intern.password : '••••••••••••'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setShowDefaultPassword((s) => ({ ...s, intern: !s.intern }))}
                            className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title={showDefaultPassword.intern ? 'Hide password' : 'Show password'}
                          >
                            {showDefaultPassword.intern ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                          {showDefaultPassword.intern && (
                            <button
                              type="button"
                              onClick={() => copyPasswordToClipboard(defaultAccounts.intern?.password, 'Password')}
                              className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                              title="Copy password"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </>
                    ) : '—'}
                  </p>
                  {permissions.canManageDomains(userRole) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDefaultAccount('intern');
                        setDefaultAccountEditForm({
                          username: defaultAccounts.intern?.username || '',
                          password: defaultAccounts.intern?.password || '',
                        });
                      }}
                      className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-white hover:opacity-90"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
                <div className="bg-white/70 dark:bg-gray-900/50 rounded-lg p-3 border border-amber-100 dark:border-amber-900/40 relative">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">SG Domain WordPress</p>
                    <button
                      type="button"
                      onClick={() => openDefaultOldDomainPasswordHistory('sg')}
                      className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
                    >
                      View old password history
                    </button>
                  </div>
                  <p className="text-gray-800 dark:text-gray-200 flex items-center gap-1 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">Admin username:</span>
                    {defaultAccounts.sg?.username ? (
                      <>
                        <span className="font-mono text-xs break-all">{defaultAccounts.sg.username}</span>
                        <button
                          type="button"
                          onClick={() => copyUsernameToClipboard(defaultAccounts.sg?.username, 'Username')}
                          className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
                          title="Copy username"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </>
                    ) : '—'}
                  </p>
                  <p className="text-gray-800 dark:text-gray-200 flex items-center gap-1 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">Admin Password:</span>
                    {defaultAccounts.sg?.password ? (
                      <>
                        <span className="font-mono text-xs break-all">
                          {showDefaultPassword.sg ? defaultAccounts.sg.password : '••••••••••••'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setShowDefaultPassword((s) => ({ ...s, sg: !s.sg }))}
                            className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title={showDefaultPassword.sg ? 'Hide password' : 'Show password'}
                          >
                            {showDefaultPassword.sg ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                          {showDefaultPassword.sg && (
                            <button
                              type="button"
                              onClick={() => copyPasswordToClipboard(defaultAccounts.sg?.password, 'Password')}
                              className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                              title="Copy password"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </>
                    ) : '—'}
                  </p>
                  {permissions.canManageDomains(userRole) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDefaultAccount('sg');
                        setDefaultAccountEditForm({
                          username: defaultAccounts.sg?.username || '',
                          password: defaultAccounts.sg?.password || '',
                        });
                      }}
                      className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-white hover:opacity-90 bg-amber-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  )}
                  <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">For SG Domain DO NOT CHANGE the password unless required.</p>
                </div>
              </div>
            </div>
          )}

          {domainTypeFilter === 'old' && domainSearchToolbarEl}

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm overflow-x-auto">
            {domainTypeFilter === 'new' && (
              <WeeklyPluginScheduleNote
                open={weeklyPluginScheduleNoteOpen}
                onToggle={() => setWeeklyPluginScheduleNoteOpen((v) => !v)}
                className="mx-4 mt-4 mb-1"
              />
            )}
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-[11px] text-gray-600 dark:border-gray-800 dark:bg-gray-950/35 dark:text-gray-400"
              role="note"
              aria-label="Status column uses gray for not updated, orange for in progress, green for updated or done"
            >
              <span className="font-semibold text-gray-700 dark:text-gray-300">Status colors</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden />
                Not updated
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400 dark:bg-orange-500" aria-hidden />
                In progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden />
                Updated / Done
              </span>
            </div>
            {domainTypeFilter === 'old' ? (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">URL</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Claim</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredDomains.length > 0 ? (
                    filteredDomains.map((domain) => {
                      const claim = domainClaims.find((c) => c.domain_id === domain.id);
                      const isClaimed = !!claim;
                      const isClaimedByMe = claim && String(claim.claimed_by) === String(user?.id);
                      return (
                      <tr
                        key={domain.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${isClaimed ? 'bg-green-50/70 dark:bg-green-900/30' : ''} ${!isEditingDomains ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (!isEditingDomains) openDomainDrawer(domain, 'old');
                        }}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" onClick={(e) => isEditingDomains && e.stopPropagation()}>
                          {isEditingDomains ? (
                            <input
                              type="text"
                              value={domain.country || ''}
                              onChange={(e) => updateDomainInState(domain.id, { country: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Country"
                            />
                          ) : (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{domain.country || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300" onClick={(e) => isEditingDomains && e.stopPropagation()}>
                          {!isEditingDomains && (() => {
                            const summary = getDomainPluginSummary(domain);
                            const { tier, label } = getOldDomainPluginTierAndLabel(summary);
                            return (
                              <span
                                title={summary}
                                className={`inline-flex max-w-full items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${domainTableStatusBadgeClassByTier(tier)}`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                          {isEditingDomains && <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 break-all" onClick={(e) => isEditingDomains && e.stopPropagation()}>
                          {isEditingDomains ? (
                            <input
                              type="url"
                              value={domain.url || ''}
                              onChange={(e) => updateDomainInState(domain.id, { url: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm break-all"
                              placeholder="https://..."
                            />
                          ) : domain.url ? (
                            <a href={domain.url} target="_blank" rel="noopener noreferrer" className="text-[#6795BE] hover:underline break-all" onClick={(e) => e.stopPropagation()}>
                              {domain.url}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          {!isEditingDomainsTable && (
                            isClaimed ? (
                              canClaimDomain(userRole, userTeam) || userRole === 'admin' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnclaimDomain(domain, claim)}
                                  disabled={claimingDomainId === domain.id}
                                  className="inline-block text-xs font-medium min-w-[4rem] px-2 py-1 rounded bg-green-600 text-white text-center hover:bg-green-700 disabled:opacity-60 transition-opacity"
                                >
                                  {claimingDomainId === domain.id ? '...' : 'Unclaim'}
                                </button>
                              ) : (
                                <span className="inline-block text-xs font-medium min-w-[4rem] px-2 py-1 rounded bg-green-600 text-white text-center">
                                  Claimed
                                </span>
                              )
                            ) : canClaimDomain(userRole, userTeam) ? (
                              <button
                                type="button"
                                onClick={() => handleClaimDomain(domain)}
                                disabled={claimingDomainId === domain.id}
                                className="text-xs font-medium min-w-[4rem] px-2 py-1 rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-60 transition-opacity"
                              >
                                {claimingDomainId === domain.id ? '...' : 'Claim'}
                              </button>
                            ) : (
                              <span className="inline-block text-xs text-gray-400 dark:text-gray-500 min-w-[4rem] text-center">—</span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        {domainsTabBaseCount === 0 ? (
                          <>No old domains. Add one with &quot;Add Domain&quot;.</>
                        ) : (
                          <span>
                            No domains match your search or filters.{' '}
                            <button
                              type="button"
                              onClick={clearDomainFilters}
                              className="font-medium text-[#6795BE] dark:text-sky-300 hover:underline"
                            >
                              Clear filters
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">URL</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">WP Username</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">New Password</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Claim</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredDomains.length > 0 ? (
                    filteredDomains.map((domain) => {
                      const claim = domainClaims.find((c) => c.domain_id === domain.id);
                      const isClaimed = !!claim;
                      const isClaimedByMe = claim && String(claim.claimed_by) === String(user?.id);
                      return (
                      <tr
                        key={domain.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer ${isClaimed ? 'bg-green-50/70 dark:bg-green-900/30' : ''}`}
                        onClick={() => openDomainDrawer(domain, 'new')}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.country || ''}
                              onChange={(e) => updateDomainInState(domain.id, { country: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Country"
                            />
                          ) : (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{domain.country || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 break-all" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="url"
                              value={domain.url || ''}
                              onChange={(e) => updateDomainInState(domain.id, { url: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm break-all"
                              placeholder="https://..."
                            />
                          ) : domain.url ? (
                            <a href={domain.url} target="_blank" rel="noopener noreferrer" className="text-[#6795BE] hover:underline break-all">
                              {domain.url}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.status || ''}
                              onChange={(e) => updateDomainInState(domain.id, { status: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder={NEW_DOMAIN_DEFAULT_STATUS_LABEL}
                            />
                          ) : (
                            <span
                              title={
                                String(domain.status || '').trim()
                                  ? String(domain.status).trim()
                                  : NEW_DOMAIN_DEFAULT_STATUS_LABEL
                              }
                              className={`inline-flex max-w-full min-w-0 items-center truncate px-2.5 py-0.5 rounded-full text-xs font-semibold ${newDomainRowStatusBadgeClass(domain.status)}`}
                            >
                              {getNewDomainStatusDisplayLabel(domain.status)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.wp_username || ''}
                              onChange={(e) => updateDomainInState(domain.id, { wp_username: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="WP Username"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span>{domain.wp_username || '—'}</span>
                              {domain.wp_username && !isEditingDomainsTable && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); copyUsernameToClipboard(domain.wp_username, 'WP Username'); }}
                                  className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                  title="Copy WP username"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="password"
                              value={domain.new_password || ''}
                              onChange={(e) => updateDomainInState(domain.id, { new_password: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Password"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span>{domain.new_password ? '••••••' : '—'}</span>
                              {domain.new_password && !isEditingDomainsTable && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); copyPasswordToClipboard(domain.new_password, 'WP Password'); }}
                                  className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                  title="Copy password"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              )}
                              {canManageDomainsForTla(userRole, userTeam) && !isEditingDomainsTable && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newPass = window.prompt('Enter new password (current will be saved to history):');
                                    if (newPass != null && newPass !== '') handleUpdateDomainPassword(domain.id, newPass);
                                  }}
                                  className="ml-1 text-xs font-medium"
                                  style={{ color: PRIMARY }}
                                >
                                  Update
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {!isEditingDomainsTable && (
                            isClaimed ? (
                              canClaimDomain(userRole, userTeam) || userRole === 'admin' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnclaimDomain(domain, claim)}
                                  disabled={claimingDomainId === domain.id}
                                  className="inline-block text-xs font-medium min-w-[4rem] px-2 py-1 rounded bg-green-600 text-white text-center hover:bg-green-700 disabled:opacity-60 transition-opacity"
                                >
                                  {claimingDomainId === domain.id ? '...' : 'Unclaim'}
                                </button>
                              ) : (
                                <span className="inline-block text-xs font-medium min-w-[4rem] px-2 py-1 rounded bg-green-600 text-white text-center">
                                  Claimed
                                </span>
                              )
                            ) : canClaimDomain(userRole, userTeam) ? (
                              <button
                                type="button"
                                onClick={() => handleClaimDomain(domain)}
                                disabled={claimingDomainId === domain.id}
                                className="text-xs font-medium min-w-[4rem] px-2 py-1 rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-60 transition-opacity"
                              >
                                {claimingDomainId === domain.id ? '...' : 'Claim'}
                              </button>
                            ) : (
                              <span className="inline-block text-xs text-gray-400 min-w-[4rem] text-center">—</span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        {domainsTabBaseCount === 0 ? (
                          <>No new domains. Add one with &quot;Add Domain&quot;.</>
                        ) : (
                          <span>
                            No domains match your search or filters.{' '}
                            <button
                              type="button"
                              onClick={clearDomainFilters}
                              className="font-medium text-[#6795BE] dark:text-sky-300 hover:underline"
                            >
                              Clear filters
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* View Old Domain Accounts modal (Intern + SG; update Intern only) */}
          {selectedDomainForAccounts && (
            <Modal open={!!selectedDomainForAccounts} onClose={() => setSelectedDomainForAccounts(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
                <div className="p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900" style={{ color: PRIMARY }}>
                      Accounts — {selectedDomainForAccounts.country || selectedDomainForAccounts.url || 'Domain'}
                    </h3>
                    <button type="button" onClick={() => setSelectedDomainForAccounts(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Intern Account WordPress</p>
                      <p className="text-sm">Admin Username: {selectedDomainForAccounts.wp_username || '—'}</p>
                      <p className="text-sm">Admin Password: {selectedDomainForAccounts.new_password ? '••••••••' : '—'}</p>
                      {permissions.canManageDomains(userRole) && (
                        <button
                          type="button"
                          onClick={() => {
                            const newPass = window.prompt('Enter new password (current will be saved to history):');
                            if (newPass != null && newPass !== '') {
                              handleUpdateDomainPassword(selectedDomainForAccounts.id, newPass);
                              setSelectedDomainForAccounts((d) => (d ? { ...d, new_password: newPass } : null));
                            }
                          }}
                          className="mt-2 text-xs font-medium"
                          style={{ color: PRIMARY }}
                        >
                          Update Intern password
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await fetchDomainPasswordHistory(selectedDomainForAccounts.id);
                          setPasswordHistoryAddForm({ month: new Date().toISOString().slice(0, 7), password: '' });
                          setPasswordHistoryModalLabel('');
                          setPasswordHistoryModalDomain(selectedDomainForAccounts);
                        }}
                        className="block mt-1 text-xs text-gray-500 hover:underline"
                      >
                        View password history
                      </button>
                    </div>
                    <div className="rounded-lg border border-amber-200 p-3 bg-amber-50/50">
                      <p className="text-xs font-semibold text-amber-800 uppercase mb-2">SG Domain WordPress</p>
                      <p className="text-sm">Admin username: {selectedDomainForAccounts.sg_username || '—'}</p>
                      <p className="text-sm">Admin Password: {selectedDomainForAccounts.sg_password ? '••••••••' : '—'}</p>
                      <p className="text-xs font-medium text-amber-800 mt-1">DO NOT CHANGE the password.</p>
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* Domains – right-side slide-over (old & new); scanning fields + plugin status */}
          {newDomainDrawerDomain && (
            <Modal open={!!newDomainDrawerDomain} onClose={closeNewDomainDrawer} zIndexClassName="z-[10000]">
              <div className="fixed inset-0" />
              <div className="fixed inset-0 flex items-stretch justify-end">
                <div
                  className="absolute inset-0"
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) closeNewDomainDrawer();
                  }}
                />
                <div className="relative w-full max-w-md sm:max-w-lg h-[100dvh] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl">
                  <div className="h-full flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {domainDrawerKind === 'old' ? 'Old domain' : 'New domain'}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate" style={{ color: PRIMARY }}>
                          {newDomainDrawerDomain.country || 'Domain'}
                        </h3>
                        {newDomainDrawerDomain.url && (
                          <a
                            href={newDomainDrawerDomain.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-xs text-[#6795BE] hover:underline break-all"
                          >
                            {newDomainDrawerDomain.url}
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={closeNewDomainDrawer}
                        className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        Close
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                      <div className="flex items-center justify-between gap-2">
                        {domainDrawerKind !== 'old' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await fetchDomainPasswordHistory(newDomainDrawerDomain.id);
                              setPasswordHistoryAddForm({ month: new Date().toISOString().slice(0, 7), password: '' });
                              setPasswordHistoryModalLabel('');
                              setPasswordHistoryModalDomain(newDomainDrawerDomain);
                            }}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            View old password history
                          </button>
                        ) : (
                          <span />
                        )}

                        {canManageDomainsForTla(userRole, userTeam) && (
                          <div className="flex items-center gap-2">
                            {!isEditingNewDomainDrawer ? (
                              <button
                                type="button"
                                onClick={() => setIsEditingNewDomainDrawer(true)}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={saveNewDomainDrawer}
                                  disabled={savingNewDomainDrawer}
                                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                                  style={{ backgroundColor: PRIMARY }}
                                >
                                  {savingNewDomainDrawer ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsEditingNewDomainDrawer(false);
                                    openDomainDrawer(newDomainDrawerDomain, domainDrawerKind);
                                  }}
                                  disabled={savingNewDomainDrawer}
                                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950/40 border-b border-gray-200 dark:border-gray-800">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Domain details</h4>
                        </div>
                        <div className="p-4 space-y-3">
                          {[
                            { key: 'country', label: 'Country', type: 'text', placeholder: 'Country' },
                            { key: 'url', label: 'URL', type: 'url', placeholder: 'https://...' },
                            ...(domainDrawerKind === 'old'
                              ? []
                              : [
                                  { key: 'wp_username', label: 'WP Username', type: 'text', placeholder: 'WP Username' },
                                  { key: 'new_password', label: 'New Password', type: 'text', placeholder: 'Password' },
                                ]),
                          ].map((f) => (
                            <div key={f.key} className="space-y-1">
                              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">{f.label}</label>
                              {isEditingNewDomainDrawer && canManageDomainsForTla(userRole, userTeam) ? (
                                f.key === 'new_password' ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type={showNewDomainDrawerPassword ? 'text' : 'password'}
                                      value={newDomainDrawerDraft?.[f.key] ?? ''}
                                      onChange={(e) =>
                                        setNewDomainDrawerDraft((p) => ({ ...(p || {}), [f.key]: e.target.value }))
                                      }
                                      placeholder={f.placeholder}
                                      className="flex-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowNewDomainDrawerPassword((v) => !v)}
                                      className="shrink-0 px-2 py-1 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      {showNewDomainDrawerPassword ? 'Hide' : 'Show'}
                                    </button>
                                  </div>
                                ) : (
                                  <input
                                    type={f.type}
                                    value={newDomainDrawerDraft?.[f.key] ?? ''}
                                    onChange={(e) =>
                                      setNewDomainDrawerDraft((p) => ({ ...(p || {}), [f.key]: e.target.value }))
                                    }
                                    placeholder={f.placeholder}
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                                  />
                                )
                              ) : (
                                f.key === 'new_password' ? (
                                  (() => {
                                    const raw = newDomainDrawerDomain?.[f.key];
                                    const str = String(raw || '');
                                    const masked = str ? '•'.repeat(Math.min(12, Math.max(6, str.length))) : '—';
                                    const display = showNewDomainDrawerPassword ? str : masked;
                                    return (
                                      <div className="flex items-center gap-2">
                                        <div className="text-sm text-gray-900 dark:text-gray-100 break-all flex-1">
                                          {display}
                                        </div>
                                        {str && (
                                          <button
                                            type="button"
                                            onClick={() => setShowNewDomainDrawerPassword((v) => !v)}
                                            className="shrink-0 px-2 py-1 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                                          >
                                            {showNewDomainDrawerPassword ? 'Hide' : 'Show'}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="text-sm text-gray-900 dark:text-gray-100 break-all">
                                    {newDomainDrawerDomain?.[f.key] || '—'}
                                  </div>
                                )
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {domainDrawerKind === 'old' && newDomainDrawerDomain && (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950/40 border-b border-gray-200 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plugin update status</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Same summary as the Status column (from latest plugin update log).
                            </p>
                          </div>
                          <div className="p-4 space-y-2">
                            {(() => {
                              const summary = getDomainPluginSummary(newDomainDrawerDomain);
                              const { tier, label } = getOldDomainPluginTierAndLabel(summary);
                              return (
                                <>
                                  <span
                                    className={`inline-flex max-w-full items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${domainTableStatusBadgeClassByTier(tier)}`}
                                  >
                                    {label}
                                  </span>
                                  <p className="text-xs text-gray-600 dark:text-gray-300">
                                    <span className="font-semibold">Details: </span>
                                    {summary}
                                  </p>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950/40 border-b border-gray-200 dark:border-gray-800">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Scanning &amp; site checks</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Date (done), Scanning, Plugin, 2FA, reCAPTCHA, Backup
                          </p>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Date</label>
                            {isEditingNewDomainDrawer && canManageDomainsForTla(userRole, userTeam) ? (
                              <PrettyDatePicker
                                value={newDomainDrawerDraft?.scanning_done_date || ''}
                                onChange={(e) =>
                                  setNewDomainDrawerDraft((p) => ({ ...(p || {}), scanning_done_date: e.target.value }))
                                }
                                ariaLabel="Select scanning done date"
                                className="w-full"
                              />
                            ) : (
                              <div className="text-sm text-gray-900 dark:text-gray-100">
                                {newDomainDrawerDomain?.scanning_done_date
                                  ? new Date(newDomainDrawerDomain.scanning_done_date).toLocaleDateString()
                                  : '—'}
                              </div>
                            )}
                          </div>
                          {(
                            domainDrawerKind === 'old'
                              ? [
                                  { key: 'scanning_date', label: 'Scanning' },
                                  { key: 'scanning_plugin', label: 'Plugin' },
                                  { key: 'scanning_2fa', label: '2FA' },
                                ]
                              : [
                                  { key: 'scanning_date', label: 'Date status' },
                                  { key: 'scanning_plugin', label: 'Plugin' },
                                  { key: 'scanning_2fa', label: '2FA' },
                                  { key: 'status', label: 'Row status' },
                                ]
                          ).map((f) => (
                            <div key={f.key} className="space-y-1">
                              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">{f.label}</label>
                              {isEditingNewDomainDrawer && canManageDomainsForTla(userRole, userTeam) ? (
                                <select
                                  value={newDomainDrawerDraft?.[f.key] ?? ''}
                                  onChange={(e) =>
                                    setNewDomainDrawerDraft((p) => ({ ...(p || {}), [f.key]: e.target.value }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                                >
                                  <option value="">{f.key === 'status' ? NEW_DOMAIN_DEFAULT_STATUS_LABEL : '—'}</option>
                                  {(f.key === 'status' ? DOMAIN_ROW_STATUS_OPTIONS : SCANNING_OPTIONS).map((o) => (
                                    <option key={o} value={o}>
                                      {f.key === 'status' ? o : (SCANNING_LABELS[o] || o)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="text-sm text-gray-900 dark:text-gray-100">
                                  {f.key === 'status'
                                    ? getNewDomainStatusDisplayLabel(newDomainDrawerDomain?.status)
                                    : (scanningLabel(newDomainDrawerDomain?.[f.key]) || '—')}
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center gap-4 sm:col-span-2 pt-1">
                            {[
                              { key: 'recaptcha', label: 'reCAPTCHA' },
                              { key: 'backup', label: 'Backup' },
                            ].map((c) => (
                              <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <input
                                  type="checkbox"
                                  checked={toBool(
                                    isEditingNewDomainDrawer ? newDomainDrawerDraft?.[c.key] : newDomainDrawerDomain?.[c.key]
                                  )}
                                  disabled={!isEditingNewDomainDrawer || !canManageDomainsForTla(userRole, userTeam)}
                                  onChange={(e) =>
                                    setNewDomainDrawerDraft((p) => ({ ...(p || {}), [c.key]: e.target.checked }))
                                  }
                                  className="rounded border-gray-300 dark:border-gray-700"
                                />
                                {c.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* Password history modal for a specific domain */}
          {passwordHistoryModalDomain && (
            <Modal
              open={!!passwordHistoryModalDomain}
              onClose={() => {
                setPasswordHistoryModalDomain(null);
                setPasswordHistoryModalLabel('');
              }}
              zIndexClassName="z-[2147483647]"
            >
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="p-5">
                  <div className="mb-4">
                    <div className="flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordHistoryModalDomain(null);
                          setPasswordHistoryModalLabel('');
                          setPasswordHistoryAddForm({ month: '', password: '' });
                          setAddingPasswordHistory(false);
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                    <h3 className="mt-1 text-center font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                      {passwordHistoryModalLabel || passwordHistoryModalDomain.country || passwordHistoryModalDomain.url || 'Domain'}
                    </h3>
                    <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
                      Password history by month and year
                    </p>
                  </div>
                  {canManageDomainsForTla(userRole, userTeam) && (
                    <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Month / Year
                          </label>
                          <input
                            type="month"
                            value={passwordHistoryAddForm.month}
                            onChange={(e) => setPasswordHistoryAddForm((p) => ({ ...p, month: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                          />
                        </div>
                        <div className="flex-[2] min-w-[220px]">
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Previous password
                          </label>
                          <input
                            type="password"
                            value={passwordHistoryAddForm.password}
                            onChange={(e) => setPasswordHistoryAddForm((p) => ({ ...p, password: e.target.value }))}
                            placeholder="Enter previous password"
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={addingPasswordHistory}
                          onClick={async () => {
                            try {
                              setAddingPasswordHistory(true);
                              await addDomainPasswordHistory({
                                domainId: passwordHistoryModalDomain.id,
                                month: passwordHistoryAddForm.month,
                                password: passwordHistoryAddForm.password,
                              });
                              toast.success('Password history added');
                              setPasswordHistoryAddForm({ month: '', password: '' });
                              await fetchDomainPasswordHistory(passwordHistoryModalDomain.id);
                            } catch (e) {
                              console.warn('Add password history error:', e);
                              const msg =
                                e?.message ||
                                e?.details ||
                                e?.hint ||
                                (typeof e === 'object' ? JSON.stringify(e) : '') ||
                                'Failed to add password history';
                              toast.error(msg);
                            } finally {
                              setAddingPasswordHistory(false);
                            }
                          }}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          {addingPasswordHistory ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        This adds a manual history row (Month/Year + previous password) for this domain.
                      </p>
                    </div>
                  )}

                  {/* Edit row */}
                  {editingPasswordHistoryRow && canManageDomainsForTla(userRole, userTeam) && (
                    <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Editing history row</div>
                          <div className="text-xs text-amber-700 dark:text-amber-300">
                            Update the month/year and password, then save.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPasswordHistoryRow(null);
                            setPasswordHistoryEditForm({ month: '', password: '' });
                          }}
                          className="text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Month / Year</label>
                          <input
                            type="month"
                            value={passwordHistoryEditForm.month}
                            onChange={(e) => setPasswordHistoryEditForm((p) => ({ ...p, month: e.target.value }))}
                            className="w-full rounded-lg border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                          />
                        </div>
                        <div className="flex-[2] min-w-[220px]">
                          <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Previous password</label>
                          <input
                            type="password"
                            value={passwordHistoryEditForm.password}
                            onChange={(e) => setPasswordHistoryEditForm((p) => ({ ...p, password: e.target.value }))}
                            className="w-full rounded-lg border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={savingPasswordHistoryEdit}
                          onClick={async () => {
                            try {
                              setSavingPasswordHistoryEdit(true);
                              await updateDomainPasswordHistory({
                                id: editingPasswordHistoryRow.id,
                                domainId: passwordHistoryModalDomain.id,
                                month: passwordHistoryEditForm.month,
                                password: passwordHistoryEditForm.password,
                              });
                              toast.success('Password history updated');
                              setEditingPasswordHistoryRow(null);
                              setPasswordHistoryEditForm({ month: '', password: '' });
                              await fetchDomainPasswordHistory(passwordHistoryModalDomain.id);
                            } catch (e) {
                              const msg =
                                e?.message ||
                                e?.details ||
                                e?.hint ||
                                (typeof e === 'object' ? JSON.stringify(e) : '') ||
                                'Failed to update password history';
                              toast.error(msg);
                            } finally {
                              setSavingPasswordHistoryEdit(false);
                            }
                          }}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          {savingPasswordHistoryEdit ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                      <thead className="bg-gray-50 dark:bg-gray-950/40">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                            Month Year
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                            Previous Password
                          </th>
                          {canManageDomainsForTla(userRole, userTeam) && (
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                        {(() => {
                          const history = domainPasswordHistory[passwordHistoryModalDomain.id] || [];
                          if (!history.length) {
                            return (
                              <tr>
                                <td colSpan={2} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                  No password history recorded yet for this domain.
                                </td>
                              </tr>
                            );
                          }
                          return history.map((h, idx) => {
                            const date = new Date(h.recorded_at);
                            const month = date.toLocaleString('default', { month: 'long' });
                            const year = date.getFullYear();
                            const label = `${month} ${year}`;
                            return (
                              <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                  {label}
                                </td>
                                <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                  {h.password || '—'}
                                </td>
                                {canManageDomainsForTla(userRole, userTeam) && (
                                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPasswordHistoryRow(h);
                                        const d = new Date(h.recorded_at);
                                        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                                        const yyyy = String(d.getUTCFullYear());
                                        setPasswordHistoryEditForm({
                                          month: `${yyyy}-${mm}`,
                                          password: h.password || '',
                                        });
                                      }}
                                      className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const ok = window.confirm('Delete this password history row? This cannot be undone.');
                                        if (!ok) return;
                                        try {
                                          await deleteDomainPasswordHistory({ id: h.id, domainId: passwordHistoryModalDomain.id });
                                          toast.success('Password history deleted');
                                          if (editingPasswordHistoryRow?.id === h.id) {
                                            setEditingPasswordHistoryRow(null);
                                            setPasswordHistoryEditForm({ month: '', password: '' });
                                          }
                                          await fetchDomainPasswordHistory(passwordHistoryModalDomain.id);
                                        } catch (e) {
                                          const msg =
                                            e?.message ||
                                            e?.details ||
                                            e?.hint ||
                                            (typeof e === 'object' ? JSON.stringify(e) : '') ||
                                            'Failed to delete password history';
                                          toast.error(msg);
                                        }
                                      }}
                                      className="ml-2 px-2 py-1 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-200 hover:bg-red-50/60 dark:hover:bg-red-950/30"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* Edit Default Account modal (Intern or SG) */}
          {editDefaultAccount && (
            <Modal
              open={!!editDefaultAccount}
              onClose={() => {
                setEditDefaultAccount(null);
                setDefaultAccountEditForm({ username: '', password: '' });
                setShowEditModalPassword(false);
              }}
            >
              <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
                <div className="p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                      Edit {editDefaultAccount === 'intern' ? 'Intern Account WordPress' : 'SG Domain WordPress'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setEditDefaultAccount(null);
                        setDefaultAccountEditForm({ username: '', password: '' });
                        setShowEditModalPassword(false);
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleSaveDefaultAccount} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                        Admin Username
                      </label>
                      <input
                        type="text"
                        value={defaultAccountEditForm.username}
                        onChange={(e) =>
                          setDefaultAccountEditForm((f) => ({ ...f, username: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#6795BE]"
                        placeholder="Username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                        Admin Password
                      </label>
                      <div className="flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus-within:ring-2 focus-within:ring-[#6795BE] focus-within:border-transparent">
                        <input
                          type={showEditModalPassword ? 'text' : 'password'}
                          value={defaultAccountEditForm.password}
                          onChange={(e) =>
                            setDefaultAccountEditForm((f) => ({ ...f, password: e.target.value }))
                          }
                          className="flex-1 min-w-0 rounded-lg border-0 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-transparent focus:ring-0 focus:outline-none"
                          placeholder="Password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditModalPassword((v) => !v)}
                          className="p-2 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
                          title={showEditModalPassword ? 'Hide password' : 'Show password'}
                        >
                          {showEditModalPassword ? (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                      {editDefaultAccount === 'sg' && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          For SG Domain DO NOT CHANGE the password unless required.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={savingDefaultAccount}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {savingDefaultAccount ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditDefaultAccount(null);
                          setDefaultAccountEditForm({ username: '', password: '' });
                          setShowEditModalPassword(false);
                        }}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}

      {activeMainTab === 'domain-updates' &&
        (userRole === 'admin' ||
          userRole === 'tla' ||
          userRole === 'tl' ||
          userRole === 'vtl' ||
          (userRole === 'intern' && String(userTeam || '').toLowerCase() === 'tla')) && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                Domain Updates
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                View plugin update history for all old and new domains.
              </p>
            </div>

            <DomainUpdates />
          </div>
        )}

      {activeMainTab === 'domain-claims' && (userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl' || (userRole === 'intern' && String(userTeam || '').toLowerCase() === 'tla')) && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
              Domain Claims
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Domains claimed by TLA interns from the Domains tab — country, intern name, date, and update status.
            </p>
          </div>

          <div className="px-4 pt-3 border-b border-gray-100 dark:border-gray-800 flex gap-2">
            <button
              type="button"
              onClick={() => setDomainClaimsTab('old')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                domainClaimsTab === 'old' ? 'text-white' : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              style={domainClaimsTab === 'old' ? { backgroundColor: PRIMARY } : {}}
            >
              Old Domains
            </button>
            <button
              type="button"
              onClick={() => setDomainClaimsTab('new')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                domainClaimsTab === 'new' ? 'text-white' : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              style={domainClaimsTab === 'new' ? { backgroundColor: PRIMARY } : {}}
            >
              New Domains
            </button>
          </div>

          <div className="overflow-x-auto">
            {domainClaims.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">No domain claims yet. Claim domains from the Domains tab.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Intern Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Update Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Post Update Check</th>
                    {userRole === 'admin' && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {[...domainClaims]
                    .filter((row) => {
                      const domain = domains.find((d) => d.id === row.domain_id);
                      const type = (domain?.type || 'old').toLowerCase();
                      return domainClaimsTab === 'old' ? type === 'old' : type === 'new';
                    })
                    .sort((a, b) => {
                      const da = a.claimed_at ? new Date(a.claimed_at).getTime() : 0;
                      const db = b.claimed_at ? new Date(b.claimed_at).getTime() : 0;
                      return db - da;
                    })
                    .map((row) => {
                      const domain = domains.find((d) => d.id === row.domain_id);
                      const country = domain?.country || '—';
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{country}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.claimed_by_name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {row.claimed_at ? new Date(row.claimed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.update_status || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.post_update_check || '—'}</td>
                          {userRole === 'admin' && (
                            <td className="px-4 py-3 text-sm">
                              <button
                                type="button"
                                onClick={() => handleRemoveDomainClaim(row)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/30"
                              >
                                Remove claim
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTaskModal && (
        <Modal open={showCreateTaskModal} onClose={() => setShowCreateTaskModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto border border-gray-100">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ color: PRIMARY }}>
                Add Task
              </h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                  <select
                    value={createTaskForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const option = TASK_OPTIONS.find((t) => t.name === name);
                      const domainMigration =
                        name === 'WordPress Updates (Old Domains)' ? 'old' : name === 'WordPress Updates (New Domains)' ? 'new' : '';
                      setCreateTaskForm((f) => ({
                        ...f,
                        name,
                        description: option?.description ?? f.description,
                        domain_migration: domainMigration,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                    required
                  >
                    <option value="">Select task</option>
                    {TASK_OPTIONS.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={createTaskForm.priority}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  >
                    {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={createTaskForm.status}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  >
                    {Object.entries(TASK_STATUSES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={createTaskForm.description}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Task description"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={createTaskForm.notes}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Optional notes"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                  <select
                    value={createTaskForm.assigned_to}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  >
                    <option value="">Unassigned</option>
                    {tlaAssignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={claimingTaskId === 'create' || !isTaskFormValid()}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                    style={isTaskFormValid() ? { backgroundColor: PRIMARY } : {}}
                  >
                    {claimingTaskId === 'create' ? 'Creating...' : 'Create Task'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-transparent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Domain Modal */}
      {showCreateDomainModal && (
        <Modal open={showCreateDomainModal} onClose={() => setShowCreateDomainModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4" style={{ color: PRIMARY }}>
                Add Domain
              </h2>
              <form onSubmit={handleCreateDomain} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Type</label>
                  <select
                    value={createDomainForm.type}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                  >
                    <option value="old">Old</option>
                    <option value="new">New</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Country</label>
                  <input
                    type="text"
                    value={createDomainForm.country}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    placeholder="Country"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">URL</label>
                  <input
                    type="url"
                    value={createDomainForm.url}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
                  <select
                    value={createDomainForm.status}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                  >
                    <option value="">—</option>
                    {SCANNING_OPTIONS.map((o) => (
                      <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Scanning</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date (date of scanning)</label>
                      <PrettyDatePicker
                        id="create-domain-scanning-date"
                        value={createDomainForm.scanning_done_date}
                        onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_done_date: e.target.value }))}
                        ariaLabel="Select scanning date"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Scanning status (ok / move on / on-going)</label>
                      <select
                        value={createDomainForm.scanning_date}
                        onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_date: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                      >
                        <option value="">—</option>
                        {SCANNING_OPTIONS.map((o) => (
                          <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Plugin</label>
                    <select
                      value={createDomainForm.scanning_plugin}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_plugin: e.target.value }))}
                      className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    >
                      <option value="">—</option>
                      {SCANNING_OPTIONS.map((o) => (
                        <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">2FA</label>
                    <select
                      value={createDomainForm.scanning_2fa}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_2fa: e.target.value }))}
                      className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    >
                      <option value="">—</option>
                      {SCANNING_OPTIONS.map((o) => (
                        <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={createDomainForm.recaptcha}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, recaptcha: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-700"
                    />
                    reCAPTCHA
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={createDomainForm.backup}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, backup: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-700"
                    />
                    Backup
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={!isDomainFormValid()}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 shadow-sm"
                    style={isDomainFormValid() ? { backgroundColor: PRIMARY } : {}}
                  >
                    Add Domain
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateDomainModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}

      {/* Task Detail Modal (generic or WordPress Updates task) */}
      {selectedTask && (
        <Modal open={!!selectedTask} onClose={() => setSelectedTask(null)} zIndexClassName="z-[10000]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800 flex flex-col">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  {selectedTask.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {isWpPluginTask(selectedTask) ? (
                <>
                  {/* Top section: Date, Assigned To, Updated By, Status, Priority, Domain Type */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-950/40 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</span>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {selectedTask.created_at
                          ? new Date(selectedTask.created_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Assigned To</span>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{getAssignedToDisplay(selectedTask)}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</span>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{selectedTask.updated_by_name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</span>
                      <p className="text-sm">
                        <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedTask.status || 'to-do')}`}>
                          {TASK_STATUSES[selectedTask.status] || 'Not Started'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Priority</span>
                      <p className="text-sm">
                        <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getPriorityColor(selectedTask.priority || 'medium')}`}>
                          {TASK_PRIORITIES[selectedTask.priority] || 'Medium'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Domain Type</span>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {selectedTask.domain_migration === 'new'
                          ? 'New Domain'
                          : selectedTask.domain_migration === 'old'
                          ? 'Old Domain'
                          : '—'}
                      </p>
                    </div>
                  </div>
                  {(selectedTask.description != null && selectedTask.description !== '') && (
                    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-950/40 rounded-lg">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Description</span>
                      <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 whitespace-pre-wrap">
                        {selectedTask.description}
                      </p>
                    </div>
                  )}
                  {(selectedTask.notes != null && selectedTask.notes !== '') && (
                    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-950/40 rounded-lg">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Notes</span>
                      <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 whitespace-pre-wrap">
                        {selectedTask.notes}
                      </p>
                    </div>
                  )}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {permissions.canManageDomains(userRole) && (
                      <>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Add domain from list:</span>
                        <select
                          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                          onChange={(e) => {
                            const id = e.target.value;
                            e.target.value = '';
                            if (!id) return;
                            const domain = domains.find((d) => d.id === id);
                            if (domain) handleAddDomainToWpTask(domain);
                          }}
                        >
                          <option value="">Select domain to add...</option>
                          {domains
                            .filter((d) => d.type === selectedTask.domain_migration)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.country} - {d.url}
                              </option>
                            ))}
                        </select>
                      </>
                    )}
                    {permissions.canCreateTasks(userRole) && (
                      <button
                        type="button"
                        onClick={() =>
                          setWpPluginRows((prev) => [
                            ...prev,
                            {
                              id: null,
                              domain_id: null,
                              country: '',
                              admin_url: '',
                              admin_username: '',
                              admin_password: '',
                              status: '',
                              plugin_names: '',
                              version_before: '',
                              version_after: '',
                              update_status: '',
                              post_update_check: '',
                              notes: '',
                            },
                          ])
                        }
                        className="px-3 py-1.5 text-sm font-medium text-white rounded-lg"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        Add row
                      </button>
                    )}
                  </div>
                  {/* Table: Domain (Country), Admin URL, Admin Username and Password, Status, Plugin Names, Version Before/After, Update Status, Post-Update Check, Notes, Save */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                      <thead className="bg-gray-50 dark:bg-gray-950/40">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Domain (Country)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Admin URL</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Admin Username</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Password</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Plugin Names</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Version Before</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Version After</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Update Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Post-Update Check</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Notes</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                        {wpPluginRows.map((row, idx) => (
                          <tr key={row.id || `new-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.country || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, country: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                                placeholder="Country"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.admin_url || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, admin_url: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-32 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                                placeholder="URL"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.admin_username || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, admin_username: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="password"
                                value={row.admin_password || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, admin_password: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.status || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, status: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                              >
                                <option value="">—</option>
                                {DOMAIN_ROW_STATUS_OPTIONS.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.plugin_names || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, plugin_names: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-32 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                                placeholder="Plugin names"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.version_before || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, version_before: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-20 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.version_after || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, version_after: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-20 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.update_status || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, update_status: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                              >
                                <option value="">—</option>
                                {UPDATE_STATUS_OPTIONS.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.post_update_check || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, post_update_check: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                              >
                                <option value="">—</option>
                                {POST_UPDATE_CHECK_OPTIONS.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.notes || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, notes: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 px-2 py-1"
                                placeholder="Notes"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleSaveWpPluginRow(row)}
                                className="text-xs font-medium text-white px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                                style={{ backgroundColor: PRIMARY }}
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {wpPluginRows.length === 0 && (
                    <p className="text-sm text-gray-500 py-4">
                      No domain rows yet. Add a domain from the dropdown above or add rows manually in the table (add first row by selecting a domain).
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Priority:</span>{' '}
                    <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getPriorityColor(selectedTask.priority || 'medium')}`}>
                      {TASK_PRIORITIES[selectedTask.priority] || 'Medium'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Status:</span>{' '}
                    <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedTask.status || 'to-do')}`}>
                      {TASK_STATUSES[selectedTask.status] || 'Not Started'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Assigned To:</span>{' '}
                    {getAssignedToDisplay(selectedTask)}
                  </p>
                  {(selectedTask.description != null && selectedTask.description !== '') && (
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-medium">Description:</span>
                      <p className="mt-1 text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                        {selectedTask.description}
                      </p>
                    </div>
                  )}
                  {(selectedTask.notes != null && selectedTask.notes !== '') && (
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-medium">Notes:</span>
                      <p className="mt-1 text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                        {selectedTask.notes}
                      </p>
                    </div>
                  )}
                  {permissions.canDeleteTasks(userRole) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(selectedTask)}
                      className="mt-2 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40"
                    >
                      Delete Task
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
