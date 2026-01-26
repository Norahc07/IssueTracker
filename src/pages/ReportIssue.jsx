import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { compressImage } from '../utils/imageCompression.js';

const DEPARTMENTS = [
  'IT Team Lead Assistant',
  'IT Monitoring Team',
  'IT PAT1',
  'HR Intern',
  'HR Admin',
  'Marketing Admin',
  'Marketing Intern',
];

const URGENCY_LEVELS = [
  { value: 'critical', label: 'Critical - Immediate attention needed' },
  { value: 'high', label: 'High - Urgent' },
  { value: 'normal', label: 'Normal - Standard priority' },
  { value: 'low', label: 'Low - Can wait' },
];

export default function ReportIssue() {
  const { supabase } = useSupabase();
  const [formData, setFormData] = useState({
    reportedBy: '',
    department: '',
    affectedSystem: '',
    title: '',
    description: '',
    urgency: 'normal',
    screenshot: null,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);

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

      toast.success('Issue reported successfully! We will review it soon.');
      setSubmitted(true);
      setFormData({
        reportedBy: '',
        department: '',
        affectedSystem: '',
        title: '',
        description: '',
        urgency: 'normal',
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
            <p className="text-gray-600 mb-6">
              Your issue has been reported successfully. Our team will review it and get back to you soon.
            </p>
            <button
              onClick={() => setSubmitted(false)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Report Another Issue
            </button>
            <Link
              to="/login"
              className="block mt-3 text-sm text-blue-600 hover:text-blue-700"
            >
              Admin Login →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <Link to="/" className="inline-block mb-3 sm:mb-4">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Issue Tracker</h1>
          </Link>
          <p className="text-base sm:text-lg text-gray-600">
            Report an issue or request assistance
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-8 py-4 sm:py-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Report an Issue</h2>
            <p className="text-blue-100 mt-1 text-sm sm:text-base">Fill out the form below to submit your issue</p>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
            {/* Reported By */}
            <div>
              <label htmlFor="reportedBy" className="block text-sm font-semibold text-gray-700 mb-2">
                Reported By (Your Name) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="reportedBy"
                required
                value={formData.reportedBy}
                onChange={(e) => setFormData({ ...formData, reportedBy: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your full name"
              />
            </div>

            {/* Department */}
            <div>
              <label htmlFor="department" className="block text-sm font-semibold text-gray-700 mb-2">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="department"
                required
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">Select your department</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Affected System/Process */}
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="e.g., Email System, Payroll System, Website, etc."
              />
            </div>

            {/* Issue Title */}
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Brief description of the issue"
              />
            </div>

            {/* Detailed Description */}
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Provide detailed information about the issue, including steps to reproduce if applicable..."
              />
            </div>

            {/* Urgency Level */}
            <div>
              <label htmlFor="urgency" className="block text-sm font-semibold text-gray-700 mb-2">
                How Urgent Is This Issue? <span className="text-red-500">*</span>
              </label>
              <select
                id="urgency"
                required
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                {URGENCY_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Upload Screenshot */}
            <div>
              <label htmlFor="screenshot" className="block text-sm font-semibold text-gray-700 mb-2">
                Upload Screenshot or Evidence <span className="text-gray-500 text-xs">(Optional)</span>
              </label>
              <div className="mt-1 flex items-center">
                <label
                  htmlFor="screenshot"
                  className="cursor-pointer flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all w-full"
                >
                  <div className="text-center">
                    <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="mt-2 block text-sm font-medium text-gray-700">
                      {formData.screenshot ? formData.screenshot.name : 'Click to upload or drag and drop'}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500">
                      PNG, JPG, GIF up to 5MB
                    </span>
                  </div>
                  <input
                    id="screenshot"
                    name="screenshot"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
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

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 pt-4">
              <Link
                to="/login"
                className="text-center sm:text-left text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Admin Login →
              </Link>
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {loading || uploading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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

        {/* Info Box */}
        <div className="mt-4 sm:mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> All submitted issues will be reviewed by our team. You will be contacted via email if we need additional information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
