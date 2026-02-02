import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';

export default function CredentialVault() {
  const { supabase, user, userRole } = useSupabase();
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showManageModal, setShowManageModal] = useState(false);

  useEffect(() => {
    fetchCredentials();
  }, [supabase]);

  const fetchCredentials = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('credential_vault');
      if (cached != null) {
        setCredentials(cached);
        setLoading(false);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('credential_vault')
        .select('*')
        .order('tool_name', { ascending: true });

      if (error) {
        console.warn('Credential vault table may not exist:', error);
        setCredentials([]);
      } else {
        const creds = data || [];
        queryCache.set('credential_vault', creds);
        setCredentials(creds);
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredCredentials = () => {
    if (!searchQuery.trim()) return credentials;

    const query = searchQuery.toLowerCase();
    return credentials.filter(cred =>
      cred.tool_name?.toLowerCase().includes(query) ||
      cred.purpose?.toLowerCase().includes(query) ||
      cred.access_method?.toLowerCase().includes(query)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading credential vault...</div>
      </div>
    );
  }

  const filteredCredentials = getFilteredCredentials();

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Credential Vault</h1>
          <p className="mt-1 text-sm text-gray-600">View-only access to required tools and login instructions</p>
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> This is a view-only list. Passwords are not stored in the system. Contact your supervisor for access credentials.
            </p>
          </div>
        </div>
        {permissions.canManageCredentials(userRole) && (
          <button
            onClick={() => setShowManageModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Manage Credentials
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools by name, purpose, or access method..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Credentials List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCredentials.length > 0 ? (
          filteredCredentials.map((cred) => (
            <div
              key={cred.id}
              className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{cred.tool_name}</h3>
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                  View Only
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Purpose
                  </label>
                  <p className="text-sm text-gray-900">{cred.purpose || 'N/A'}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Access Method
                  </label>
                  <p className="text-sm text-gray-900">{cred.access_method || 'N/A'}</p>
                </div>

                {cred.login_instructions && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Login Instructions
                    </label>
                    <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      {cred.login_instructions}
                    </div>
                  </div>
                )}

                {cred.url && (
                  <div>
                    <a
                      href={cred.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Access Tool
                      <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500">
              {searchQuery
                ? 'No tools found matching your search'
                : 'No credentials available yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
