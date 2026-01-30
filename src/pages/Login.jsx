import { useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { supabase } = useSupabase();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      const user = data?.user;
      if (user) {
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
      toast.error(error.message || 'Invalid email or password');
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

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email */}
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

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#3b82b6] mb-2">
                Password*
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-0 py-3 bg-transparent border-0 border-b-2 border-[#93c5fd] rounded-none focus:outline-none focus:ring-0 focus:border-[#3b82b6] placeholder:text-gray-400 placeholder:italic transition-colors"
                placeholder="********"
              />
              <div className="mt-2 text-right">
                <a
                  href="#"
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot your password?
                </a>
              </div>
            </div>

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
                  'Login'
                )}
              </button>
            </div>
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
    </div>
  );
}
