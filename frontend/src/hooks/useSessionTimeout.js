/**
 * useSessionTimeout — Auto-logout after 24 hours of inactivity.
 *
 * Monitors user activity (mouse, keyboard, click, scroll, touch).
 * Activity detection is throttled to once per 60 seconds to minimize overhead.
 * If no activity is detected within 24 hours, clears the auth token and
 * redirects to the login page.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authLogout } from '../services/api';

const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const THROTTLE_MS = 60 * 1000; // 60 seconds
const AUTH_TOKEN_KEY = 'nod_auth_token';
const LAST_ACTIVITY_KEY = 'nod_last_activity';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

export function useSessionTimeout() {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const lastThrottleRef = useRef(0);

  const isAuthenticated = useCallback(() => {
    return !!localStorage.getItem(AUTH_TOKEN_KEY);
  }, []);

  const performLogout = useCallback(() => {
    authLogout();
    // Clear the stored last-activity timestamp
    try {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // localStorage unavailable; ignore
    }
    navigate('/login', { replace: true });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!isAuthenticated()) return;

    // Persist last-activity timestamp for cross-tab awareness
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable; ignore
    }

    timeoutRef.current = setTimeout(() => {
      if (isAuthenticated()) {
        performLogout();
      }
    }, SESSION_TIMEOUT_MS);
  }, [isAuthenticated, performLogout]);

  // Throttled activity handler
  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleRef.current < THROTTLE_MS) return;
    lastThrottleRef.current = now;
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // Only start monitoring if authenticated
    if (!isAuthenticated()) return undefined;

    // Check if session already expired (e.g. page was closed and reopened)
    try {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        const elapsed = Date.now() - Number(lastActivity);
        if (elapsed >= SESSION_TIMEOUT_MS) {
          performLogout();
          return undefined;
        }
      }
    } catch {
      // localStorage unavailable; ignore
    }

    // Start the timer
    resetTimer();

    // Attach activity listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Listen for storage changes (cross-tab logout)
    const handleStorage = (e) => {
      if (e.key === AUTH_TOKEN_KEY && !e.newValue) {
        // Token was removed in another tab
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('storage', handleStorage);
    };
  }, [isAuthenticated, performLogout, resetTimer, handleActivity, navigate]);
}
