import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authLogin } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { Lock, User, Sun, Moon, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Vanta.js refs
  const vantaRef = useRef(null);
  const vantaEffect = useRef(null);

  // Initialize Vanta.js NET effect — dynamic import to handle UMD module
  useEffect(() => {
    if (!vantaRef.current) return;
    let cancelled = false;

    async function initVanta() {
      try {
        const THREE = await import('three');
        // Vanta UMD registers on window.VANTA as a side-effect
        await import('vanta/dist/vanta.net.min');
        const NET = window.VANTA?.NET;

        if (!NET || cancelled || !vantaRef.current) return;

        vantaEffect.current = NET({
          el: vantaRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          color: 0xfc0b0b,
          backgroundColor: 0x050110,
          points: 7.0,
          maxDistance: 20.0,
          spacing: 15.0,
          showDots: true,
        });
      } catch (err) {
        console.warn('Vanta.js NET effect failed to initialize:', err);
      }
    }

    initVanta();

    return () => {
      cancelled = true;
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
        vantaEffect.current = null;
      }
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await authLogin(username, password);
      navigate('/home');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Vanta.js NET animated background */}
      <div
        ref={vantaRef}
        className="absolute inset-0 z-0"
        style={{ minHeight: '100vh', minWidth: '100vw' }}
      />

      {/* Theme toggle — top right */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all duration-200 backdrop-blur-sm"
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* Login Card */}
      <div className="relative z-10 max-w-md w-full animate-fade-in">
        <div
          className="rounded-2xl p-8 border border-white/10 shadow-2xl"
          style={{
            background: 'rgba(10, 10, 30, 0.75)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            boxShadow: '0 0 60px rgba(252, 11, 11, 0.08), 0 24px 48px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Branding */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/15 overflow-hidden"
              style={{
                background: 'rgba(255, 255, 255, 0.92)',
                boxShadow: '0 0 32px rgba(252, 11, 11, 0.2), 0 4px 16px rgba(0, 0, 0, 0.3)',
              }}
            >
              <img
                src="/brand/telkomsel-seeklogo.png"
                alt="Telkomsel"
                className="w-11 h-11 object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              NOD Dashboard
            </h1>
            <p className="text-sm text-white/50 mt-1">
              Network Operation Dashboard — Jawa Timur
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/15 text-red-400 text-sm p-3 rounded-xl mb-4 border border-red-500/20 flex items-center gap-2 animate-fade-in">
              <Lock className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white placeholder-white/30 focus:ring-2 focus:ring-red-500/40 focus:border-red-500/30 outline-none transition-all duration-200"
                  placeholder="Enter username"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white placeholder-white/30 focus:ring-2 focus:ring-red-500/40 focus:border-red-500/30 outline-none transition-all duration-200"
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full font-medium py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                boxShadow: '0 4px 24px rgba(220, 38, 38, 0.35)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 32px rgba(220, 38, 38, 0.55)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(220, 38, 38, 0.35)'; }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-[10px] text-white/30 mt-6 tracking-wide">
            Monitoring Availability Site — Jawa Timur
          </p>
        </div>
      </div>
    </div>
  );
}
