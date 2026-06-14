import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SiteMapPage from './pages/SiteMapPage';
import NetworkReportingPage from './pages/NetworkReportingPage';
import ActivityEnomPage from './pages/ActivityEnomPage';
import TransportQualityPage from './pages/TransportQualityPage';
import TicketingPage from './pages/TicketingPage';
import DataPotensiPage from './pages/DataPotensiPage';
import LoginPage from './pages/LoginPage';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { AppShell } from './components/DashboardSidebar';

const ImpactServicePage = React.lazy(() => import('./pages/ImpactServicePage'));

function ImpactServiceRoute() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
          Memuat Impact Service...
        </div>
      )}
    >
      <ImpactServicePage />
    </Suspense>
  );
}

// Simple PrivateRoute wrapper
function PrivateRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('nod_auth_token');
  return isAuthenticated ? <AppShell>{children}</AppShell> : <Navigate to="/login" />;
}

// Session guard — must be inside <Router> to use useNavigate()
function SessionGuard({ children }) {
  useSessionTimeout();
  return children;
}

export default function App() {
  return (
    <Router>
      <SessionGuard>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/home"
            element={
              <PrivateRoute>
                <HomePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/site-map"
            element={
              <PrivateRoute>
                <SiteMapPage />
              </PrivateRoute>
            }
          />
          <Route path="/dashboard" element={<Navigate to="/site-map" replace />} />
          <Route
            path="/reporting"
            element={
              <PrivateRoute>
                <NetworkReportingPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/impact-service"
            element={
              <PrivateRoute>
                <ImpactServiceRoute />
              </PrivateRoute>
            }
          />
          <Route
            path="/activity-enom"
            element={
              <PrivateRoute>
                <ActivityEnomPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/transport-quality"
            element={
              <PrivateRoute>
                <TransportQualityPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/ticketing"
            element={
              <PrivateRoute>
                <TicketingPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/data-potensi"
            element={
              <PrivateRoute>
                <DataPotensiPage />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/home" />} />
        </Routes>
      </SessionGuard>
    </Router>
  );
}
