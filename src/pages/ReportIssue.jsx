import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import { useSupabase } from '../context/supabase.jsx';
import { compressImage } from '../utils/imageCompression.js';
import { createNotifications, getUserIdsByScope, scopeFromDepartment } from '../utils/notifications.js';

const URGENCY_LEVELS = [
  { value: 'critical', label: 'Critical - Immediate attention needed' },
  { value: 'high', label: 'High - Urgent' },
  { value: 'normal', label: 'Normal - Standard priority' },
  { value: 'low', label: 'Low - Can wait' },
];

export default function ReportIssue() {
  const { supabase, user } = useSupabase();
  const [formData, setFormData] = useState({
    reportedBy: '',
    department: '',
    affectedSystem: '',
    title: '',
    description: '',
    urgency: '',
    screenshot: null,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const departmentFromProfile = (profile) => {
    const role = String(profile?.role || '').toLowerCase();
    const teamRaw = String(profile?.team || '').toLowerCase();
    const team = teamRaw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const dept = String(profile?.department || '').trim();
    if (dept) return dept;
    if (team === 'tla' || team.includes('tla') || team.includes('team lead assistant') || role === 'tla') {
      return 'IT Team Lead Assistant';
    }
    if (team === 'monitoring' || team.includes('monitoring') || role === 'monitoring_team') {
      return 'IT Monitoring Team';
    }
    if (team === 'pat1' || team.includes('pat1') || team.includes('pat 1') || role === 'pat1') {
      return 'IT PAT1';
    }
    return '';
  };

  const departmentFromOnboarding = (onboardingRow, userProfile) => {
    const deptRaw = String(onboardingRow?.department || '').toLowerCase().trim();
    const teamRaw = String(onboardingRow?.team || '').toLowerCase();
    const team = teamRaw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const role = String(userProfile?.role || '').toLowerCase();

    if (deptRaw.includes('it')) {
      if (team.includes('monitoring')) return 'IT Monitoring Team';
      if (team.includes('pat1') || team.includes('pat 1')) return 'IT PAT1';
      if (team.includes('tla') || team.includes('team lead assistant') || team.includes('onboarding')) return 'IT Team Lead Assistant';
      return 'IT Team Lead Assistant';
    }
    if (deptRaw.includes('hr')) return role === 'admin' ? 'HR Admin' : 'HR Intern';
    if (deptRaw.includes('marketing')) return role === 'admin' ? 'Marketing Admin' : 'Marketing Intern';
    return '';
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const userEmail = (user?.email || '').trim();
        const [userRes, onboardingRes] = await Promise.all([
          supabase
            .from('users')
            .select('full_name, email, role, team, department')
            .eq('id', user.id)
            .maybeSingle(),
          userEmail
            ? supabase
                .from('onboarding_records')
                .select('name, email, department, team')
                .ilike('email', userEmail)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (cancelled) return;
        const profile = userRes?.data || null;
        const ob = onboardingRes?.data || null;

        const displayName =
          (ob?.name || '').trim()
          || (profile?.full_name || '').trim()
          || (user?.user_metadata?.full_name || '').trim()
          || (profile?.email || '').trim()
          || (user?.email || '').trim()
          || '';

        const department =
          departmentFromOnboarding(ob, profile)
          || departmentFromProfile(profile)
          || '';

        setFormData((prev) => ({
          ...prev,
          reportedBy: displayName,
          department,
        }));
      } catch (e) {
        const fallbackName =
          (user?.user_metadata?.full_name || '').trim() || (user?.email || '').trim() || '';
        setFormData((prev) => ({ ...prev, reportedBy: prev.reportedBy || fallbackName }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, user?.id]);

  const validate = (v) => {
    const e = {};
    // These are auto-filled from the logged-in account
    if (!String(v.reportedBy || '').trim()) e.reportedBy = 'Missing account name.';
    if (!String(v.department || '').trim()) e.department = 'Missing account department.';
    if (!String(v.affectedSystem || '').trim()) e.affectedSystem = 'Required.';
    if (!String(v.title || '').trim()) e.title = 'Required.';
    if (!String(v.description || '').trim()) e.description = 'Required.';
    if (!String(v.urgency || '').trim()) e.urgency = 'Required.';
    return e;
  };

  const errors = validate(formData);
  const isValid = Object.keys(errors).length === 0;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      setFormData({ ...formData, screenshot: file });
    }
  };

  const uploadScreenshot = async (file) => {
    if (!file) return null;

    try {
      // Check if storage bucket exists, if not, convert to base64 and store in database
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `screenshots/${fileName}`;

      try {
        const { data, error } = await supabase.storage
          .from('ticket-screenshots')
          .upload(filePath, file);

        if (error) {
          // If storage bucket doesn't exist, convert to base64
          console.warn('Storage upload failed, converting to base64:', error);
          return await convertToBase64(file);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('ticket-screenshots')
          .getPublicUrl(filePath);

        return publicUrl;
      } catch (storageError) {
        // Fallback to base64 if storage is not available
        console.warn('Storage not available, using base64:', storageError);
        return await convertToBase64(file);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload screenshot. You can still submit without it.');
      return null;
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!isValid) return;
    setLoading(true);
    setUploading(true);

    try {
      let screenshotUrl = null;
      
      // Upload screenshot if provided
      if (formData.screenshot) {
        // Compress image before uploading
        const compressedFile = await compressImage(formData.screenshot);
        screenshotUrl = await uploadScreenshot(compressedFile);
      }

      const { data, error } = await supabase
        .from('tickets')
        .insert({
          title: formData.title,
          description: formData.description,
          status: 'open',
          reporter_name: formData.reportedBy,
          department: formData.department,
          affected_system: formData.affectedSystem,
          priority: formData.urgency,
          screenshot_url: screenshotUrl,
        });

      if (error) throw error;

      // System notification: notify the relevant team scope (TLA vs Monitoring vs PAT1) + Admin
      try {
        const scope = scopeFromDepartment(formData.department);
        const recipientIds = scope ? await getUserIdsByScope(supabase, scope) : await getUserIdsByScope(supabase, 'tla');
        const title = `New ticket: ${(formData.title || '').trim() || 'Untitled'}`;
        const body = `Department: ${formData.department || '—'}\nReported by: ${formData.reportedBy || '—'}\nPriority: ${formData.urgency || 'normal'}`;
        await createNotifications(
          supabase,
          recipientIds.map((id) => ({
            recipient_user_id: id,
            sender_user_id: null,
            type: 'ticket_created',
            title,
            body,
            context_date: new Date().toISOString().slice(0, 10),
            metadata: { ticket_title: formData.title || null, department: formData.department || null },
          }))
        );
      } catch (notifyErr) {
        console.warn('Ticket created notification error:', notifyErr);
      }

      toast.success('Issue reported successfully! We will review it soon.');
      setSubmitted(true);
      setTouched({});
      setSubmitAttempted(false);
      setFormData({
        reportedBy: formData.reportedBy,
        department: formData.department,
        affectedSystem: '',
        title: '',
        description: '',
        urgency: '',
        screenshot: null,
      });
    } catch (error) {
      toast.error(error.message || 'Failed to submit issue. Please try again.');
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const PRIMARY = '#6795BE';

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Report an Issue</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Submit an issue or request assistance
        </p>
      </div>

      <div className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-8 py-4 border-b border-gray-100" style={{ backgroundColor: `${PRIMARY}08` }}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Submit your issue</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">Fill out the form below</p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-5 sm:space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">Fill out the form below to submit your issue.</p>

          {/* Row 1: Reported By | Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 pointer-events-none select-none">
                Reported By
              </label>
              <input
                type="text"
                id="reportedBy"
                value={formData.reportedBy}
                readOnly
                tabIndex={-1}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-200 pointer-events-none select-none"
              />
              {submitAttempted && errors.reportedBy && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.reportedBy}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 pointer-events-none select-none">
                Department
              </label>
              <input
                id="department"
                type="text"
                value={formData.department}
                readOnly
                tabIndex={-1}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-200 pointer-events-none select-none"
              />
              {submitAttempted && errors.department && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.department}</p>
              )}
            </div>
          </div>

          {/* Row 2: Affected System/Process | Issue Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label htmlFor="affectedSystem" className="block text-sm font-semibold text-gray-700 mb-2">
                Affected System/Process <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="affectedSystem"
                required
                value={formData.affectedSystem}
                onChange={(e) => setFormData({ ...formData, affectedSystem: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, affectedSystem: true }))}
                className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6795BE] focus:border-transparent transition-all placeholder:text-gray-400"
                placeholder="e.g. WordPress System, Website, Payroll, etc."
              />
              {(submitAttempted || touched.affectedSystem) && errors.affectedSystem && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.affectedSystem}</p>
              )}
            </div>
            <div>
              <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                Issue Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6795BE] focus:border-transparent transition-all placeholder:text-gray-400"
                placeholder="Brief description of the issue"
              />
              {(submitAttempted || touched.title) && errors.title && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.title}</p>
              )}
            </div>
          </div>

          {/* Row 3: Detailed Description (full width) */}
          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
              Detailed Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              required
              rows={6}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6795BE] focus:border-transparent transition-all resize-none placeholder:text-gray-400"
              placeholder="Provide detailed information about the issue, including steps to reproduce if applicable..."
            />
            {(submitAttempted || touched.description) && errors.description && (
              <p className="mt-1 text-xs font-medium text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Row 4: How Urgent (full width) */}
          <div>
            <label htmlFor="urgency" className="block text-sm font-semibold text-gray-700 mb-2">
              How Urgent Is This Issue? <span className="text-red-500">*</span>
            </label>
            <select
              id="urgency"
              required
              value={formData.urgency}
              onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, urgency: true }))}
              className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6795BE] focus:border-transparent transition-all bg-white"
            >
              <option value="">Select Issue Priority</option>
              {URGENCY_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
            {(submitAttempted || touched.urgency) && errors.urgency && (
              <p className="mt-1 text-xs font-medium text-red-600">{errors.urgency}</p>
            )}
          </div>

          {/* Upload Screenshot (optional) */}
          <div>
            <label htmlFor="screenshot" className="block text-sm font-semibold text-gray-700 mb-2">
              Upload Screenshot or Evidence <span className="text-gray-500 text-xs font-normal">(Optional)</span>
            </label>
            <div className="mt-1">
              <label
                htmlFor="screenshot"
                className="cursor-pointer flex flex-col items-center justify-center px-4 py-8 border-2 border-dashed border-blue-200 rounded-lg hover:border-[#6795BE] hover:bg-blue-50/50 transition-all w-full"
              >
                <svg className="h-10 w-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="mt-2 block text-sm font-medium text-gray-700">
                  {formData.screenshot ? formData.screenshot.name : 'Click to Upload or drag and drop'}
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  PNG, JPG, GIF up to 5MB
                </span>
                <input
                  id="screenshot"
                  name="screenshot"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              {formData.screenshot && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-sm text-gray-600">{formData.screenshot.name}</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, screenshot: null })}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={loading || uploading || !isValid}
                className="px-5 py-2.5 rounded-lg font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ backgroundColor: PRIMARY }}
              >
                {loading || uploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {uploading ? 'Uploading...' : 'Submitting...'}
                  </span>
                ) : (
                  'Submit Issue'
                )}
              </button>
          </div>
        </form>
        </div>

        <div className="w-full rounded-xl border border-blue-200 bg-blue-50/80 p-4 sm:p-5">
          <div className="flex gap-3">
            <div className="flex-shrink-0 text-blue-500">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-gray-700">
              <strong>Note:</strong> All submitted issues will be reviewed by our team. You will be contacted via email if we need additional information.
            </p>
          </div>
        </div>

        {submitted &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              className="fixed inset-0 z-[2147483000] bg-black/60 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Issue submitted"
              onClick={() => setSubmitted(false)}
            >
              <div className="min-h-screen w-full p-4 flex items-center justify-center">
                <div
                  className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-gray-900">Thank You!</h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Your issue has been submitted successfully.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubmitted(false)}
                      className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                      aria-label="Close"
                    >
                      Close
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-14 w-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-600">
                        You can submit another issue immediately.
                      </p>
                      <div className="mt-5 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSubmitted(false)}
                          className="px-5 py-2.5 rounded-lg font-medium text-white transition-colors hover:opacity-90"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          Submit Another Issue
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
    </div>
  );
}
