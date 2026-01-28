import { useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { ROLES, getRoleDisplayName } from '../utils/rolePermissions.js';

export default function CreateAccountModal({ isOpen, onClose, onSuccess }) {
  const { supabase } = useSupabase();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'intern',
    fullName: '',
    team: '', // For TL/VTL
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create auth user with role in metadata
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: formData.password,
        email_confirm: true,
        user_metadata: {
          full_name: formData.fullName,
          role: formData.role,
          team: formData.team || null,
        },
      });

      if (authError) {
        // Fallback: use regular signUp if admin API not available
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              role: formData.role,
              team: formData.team || null,
            },
          },
        });

        if (signUpError) throw signUpError;

        // Create user record in users table (if it exists)
        const userId = signUpData.user?.id;
        if (userId) {
          try {
            const { error: userError } = await supabase
              .from('users')
              .insert({
                id: userId,
                email: formData.email,
                role: formData.role,
                full_name: formData.fullName,
                team: formData.team || null,
              });

            if (userError) {
              console.warn('Could not create user record (table may not exist):', userError);
              // Continue anyway - user is created in auth with metadata
            }
          } catch (err) {
            console.warn('Users table may not exist, using metadata only:', err);
          }
        }
      } else {
        // Admin API worked, create user record in users table (if it exists)
        const userId = authData.user?.id;
        if (userId) {
          try {
            const { error: userError } = await supabase
              .from('users')
              .insert({
                id: userId,
                email: formData.email,
                role: formData.role,
                full_name: formData.fullName,
                team: formData.team || null,
              });

            if (userError) {
              console.warn('Could not create user record (table may not exist):', userError);
              // Continue anyway - user is created in auth with metadata
            }
          } catch (err) {
            console.warn('Users table may not exist, using metadata only:', err);
          }
        }
      }

      toast.success('Account created successfully!');
      setFormData({ email: '', password: '', role: 'intern', fullName: '', team: '' });
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to create account');
      console.error('Error creating account:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="w-full">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Account</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        id="fullName"
                        required
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter full name"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter email address"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        required
                        minLength={6}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter password (min 6 characters)"
                      />
                    </div>

                    <div>
                      <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                        Role
                      </label>
                      <select
                        id="role"
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value, team: '' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="intern">Intern</option>
                        <option value="admin">Admin</option>
                        <option value="tla">Team Lead Assistant (TLA)</option>
                        <option value="monitoring_team">Monitoring Team</option>
                        <option value="pat1">PAT1</option>
                        <option value="tl">Team Lead (TL)</option>
                        <option value="vtl">Vice Team Lead (VTL)</option>
                      </select>
                    </div>

                    {(formData.role === 'tl' || formData.role === 'vtl') && (
                      <div>
                        <label htmlFor="team" className="block text-sm font-medium text-gray-700 mb-1">
                          Team
                        </label>
                        <select
                          id="team"
                          value={formData.team}
                          onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select team...</option>
                          <option value="tla">TLA</option>
                          <option value="monitoring">Monitoring</option>
                          <option value="pat1">PAT1</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
