import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Moon, Sun, User } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { login } = useAuth();

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(username, password);
      navigate('/home');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-canvas relative flex min-h-screen items-center justify-center p-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="dashboard-control absolute right-4 top-4 z-20 flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <section className="relative z-10 w-full max-w-md animate-fade-in rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-glass)] p-6 shadow-[var(--shadow-lg)] sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]">
            <img
              src="/brand/telkomsel-seeklogo.png"
              alt="Telkomsel"
              className="size-10 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            NOD Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Network Operation Dashboard · Jawa Timur
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--badge-critical-bg)] p-3 text-sm text-[var(--danger)] animate-fade-in">
            <Lock className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="dashboard-control w-full rounded-lg py-2.5 pl-10 pr-4 outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/20"
                placeholder="Enter username"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="dashboard-control w-full rounded-lg py-2.5 pl-10 pr-4 outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/20"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-4 py-2.5 font-medium text-[var(--primary-foreground)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--brand-red-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-[var(--primary-foreground)]/30 border-t-[var(--primary-foreground)]" />
                Signing in...
              </>
            ) : (
              <>
                Sign In
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] tracking-wide text-[var(--text-muted)]">
          Monitoring Availability Site · Jawa Timur
        </p>
      </section>
    </div>
  );
}
