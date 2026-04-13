import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export default function Login() {
  const [mode, setMode] = useState('login'); // login | forgot | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmResetPassword, setShowConfirmResetPassword] = useState(false);
  const [singleDeviceModalOpen, setSingleDeviceModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { supabase } = useSupabase();
  const navigate = useNavigate();

  // Keep /login in light mode even if the app was previously in dark mode.
  // This avoids broken contrast when logging out while dark mode is enabled.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (hadDark) root.classList.add('dark');
    };
  }, []);

  useEffect(() => {
    const inRecoveryMode =
      window.location.hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).get('mode') === 'recovery';
    if (inRecoveryMode) setMode('reset');
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');
    if (!normalizedEmail || !normalizedPassword) {
      toast.error('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (error) {
        throw error;
      }

      const user = data?.user;
      if (user) {
        // Single-device restriction: if another active presence exists for this user,
        // deny this new login attempt and show a modal message.
        const hasOtherActiveSession = await new Promise((resolve) => {
          const channel = supabase.channel(`kti-single-device-check-${user.id}-${Date.now()}`, {
            config: { presence: { key: user.id } },
          });

          let settled = false;
          const settle = (value) => {
            if (settled) return;
            settled = true;
            channel.unsubscribe();
            resolve(value);
          };

          const timer = window.setTimeout(() => settle(false), 2000);

          channel
            .on('presence', { event: 'sync' }, () => {
              const state = channel.presenceState();
              const others = Array.isArray(state?.[user.id]) ? state[user.id].length : 0;
              clearTimeout(timer);
              settle(others > 0);
            })
            .subscribe((status) => {
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                clearTimeout(timer);
                settle(false);
              }
            });
        });

        if (hasOtherActiveSession) {
          await supabase.auth.signOut();
          setSingleDeviceModalOpen(true);
          return;
        }

        let role = 'intern';

        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

          if (!userError && userData) {
            role = userData.role || 'intern';
          } else {
            role = user.user_metadata?.role || 'intern';
          }
        } catch (err) {
          role = user.user_metadata?.role || 'intern';
        }

        if (role === 'admin' || role === 'tla') {
          navigate('/admin/dashboard');
        } else if (role === 'lead' || role === 'tl' || role === 'vtl' || role === 'monitoring_team' || role === 'pat1') {
          navigate('/lead/dashboard');
        } else if (role === 'intern' || !role) {
          navigate('/intern/dashboard');
        } else {
          navigate('/login');
        }
      } else {
        throw new Error('User not found');
      }

      toast.success('Logged in successfully!');
    } catch (error) {
      const rawMessage = String(error?.message || '').toLowerCase();
      const status = error?.status ?? error?.code;
      let userMessage = error?.message || 'Invalid email or password';

      // Supabase auth returns 400 for common credential issues.
      if (
        status === 400 ||
        rawMessage.includes('invalid login credentials') ||
        rawMessage.includes('invalid email or password') ||
        rawMessage.includes('email not confirmed')
      ) {
        userMessage = rawMessage.includes('email not confirmed')
          ? 'Your email is not confirmed yet. Please check your inbox.'
          : 'Invalid email or password. Please try again.';
      }

      toast.error(userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (loading) return;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/login?mode=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) throw error;
      toast.success('Password reset link sent. Please check your email.');
    } catch (error) {
      toast.error(error?.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const passwordRules = (value) => {
    const v = String(value || '');
    return {
      minLength: v.length >= 8,
      upper: /[A-Z]/.test(v),
      lower: /[a-z]/.test(v),
      number: /\d/.test(v),
      symbol: /[^A-Za-z0-9]/.test(v),
    };
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (loading) return;
    const nextPassword = String(resetPassword || '');
    const confirm = String(confirmResetPassword || '');
    const rulesPassed = Object.values(passwordRules(nextPassword)).every(Boolean);
    if (!nextPassword || !confirm) {
      toast.error('Please fill in both password fields.');
      return;
    }
    if (!rulesPassed) {
      toast.error('New password does not meet complexity requirements.');
      return;
    }
    if (nextPassword !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      toast.success('Password updated successfully. You can now sign in.');
      setResetPassword('');
      setConfirmResetPassword('');
      setMode('login');
      if (window.location.search.includes('mode=recovery')) {
        window.history.replaceState({}, '', '/login');
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to update password. Please request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: Login form - white background */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 py-12 bg-white">
        <div className="w-full max-w-md mx-auto">
          {/* KTI Logo at top */}
          <div className="flex justify-center mb-10 sm:mb-12">
            <img
              src="/KTI Logo.png"
              alt="Knowles Training Institute"
              className="h-auto w-full max-w-[220px] sm:max-w-[260px] object-contain"
            />
          </div>

          <form
            onSubmit={
              mode === 'login' ? handleLogin : mode === 'forgot' ? handleForgotPassword : handleResetPassword
            }
            className="space-y-6"
          >
            {/* Email */}
            {mode !== 'reset' && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#3b82b6] mb-2">
                Email Address*
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-0 py-3 bg-transparent border-0 border-b-2 border-[#93c5fd] rounded-none focus:outline-none focus:ring-0 focus:border-[#3b82b6] placeholder:text-gray-400 placeholder:italic transition-colors"
                placeholder="yourname@gmail.com"
              />
            </div>
            )}

            {/* Password */}
            {mode === 'login' && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#3b82b6] mb-2">
                Password*
              </label>
              <div className="flex items-center gap-1 border-b-2 border-[#93c5fd] transition-colors focus-within:border-[#3b82b6]">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="min-w-0 flex-1 px-0 py-3 bg-transparent border-0 rounded-none focus:outline-none focus:ring-0 placeholder:text-gray-400 placeholder:italic"
                  placeholder="********"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="shrink-0 rounded p-1 text-gray-500 outline-none focus:outline-none focus:ring-0 active:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.289m7.633 7.634l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-2 text-right">
                <a
                  href="#"
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode('forgot');
                  }}
                >
                  Forgot your password?
                </a>
              </div>
            </div>
            )}

            {mode === 'forgot' && (
              <div className="text-sm text-gray-600">
                Enter your account email and we will send a verification reset link.
              </div>
            )}

            {mode === 'reset' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#3b82b6] mb-2">New Password*</label>
                  <div className="flex items-center gap-1 border-b-2 border-[#93c5fd] transition-colors focus-within:border-[#3b82b6]">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="min-w-0 flex-1 px-0 py-3 bg-transparent border-0 rounded-none focus:outline-none focus:ring-0 placeholder:text-gray-400 placeholder:italic"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword((v) => !v)}
                      className="shrink-0 rounded p-1 text-gray-500"
                      aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                    >
                      {showResetPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#3b82b6] mb-2">Confirm New Password*</label>
                  <div className="flex items-center gap-1 border-b-2 border-[#93c5fd] transition-colors focus-within:border-[#3b82b6]">
                    <input
                      type={showConfirmResetPassword ? 'text' : 'password'}
                      required
                      value={confirmResetPassword}
                      onChange={(e) => setConfirmResetPassword(e.target.value)}
                      className="min-w-0 flex-1 px-0 py-3 bg-transparent border-0 rounded-none focus:outline-none focus:ring-0 placeholder:text-gray-400 placeholder:italic"
                      placeholder="Re-enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmResetPassword((v) => !v)}
                      className="shrink-0 rounded p-1 text-gray-500"
                      aria-label={showConfirmResetPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmResetPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <ul className="grid grid-cols-2 gap-1 text-[11px]">
                  {Object.entries({
                    'At least 8 chars': passwordRules(resetPassword).minLength,
                    'Uppercase': passwordRules(resetPassword).upper,
                    'Lowercase': passwordRules(resetPassword).lower,
                    Number: passwordRules(resetPassword).number,
                    Symbol: passwordRules(resetPassword).symbol,
                  }).map(([label, ok]) => (
                    <li key={label} className={ok ? 'text-green-600' : 'text-gray-500'}>
                      {ok ? '✓' : '•'} {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Login button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 bg-[#60a5fa] hover:bg-[#3b82b6] text-white font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  mode === 'login'
                    ? 'Login'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Update password'
                )}
              </button>
            </div>
            {mode !== 'login' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Back to login
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Right: Wallpaper image - hidden on small screens */}
      <div className="hidden lg:block lg:w-1/2 relative min-h-screen">
        <img
          src="/wallpaper 1.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {singleDeviceModalOpen && (
        <div
          className="fixed inset-0 z-[2147483647] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSingleDeviceModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="single-device-title"
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 id="single-device-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Account already active
              </h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700 dark:text-gray-200">
              This account is already logged in on another device. Only one active device is allowed per account.
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSingleDeviceModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: '#60a5fa' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
