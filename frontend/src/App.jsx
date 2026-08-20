import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import NetworkReportingPage from './pages/NetworkReportingPage';
import ActivityEnomPage from './pages/ActivityEnomPage';
import TransportQualityPage from './pages/TransportQualityPage';
import TicketingPage from './pages/TicketingPage';
import DataPotensiPage from './pages/DataPotensiPage';
import LoginPage from './pages/LoginPage';
import { AppShell } from './components/DashboardSidebar';
import MapRouteErrorBoundary from './components/MapRouteErrorBoundary';
import { AuthProvider, useAuth } from './auth/AuthContext';
import SiteDetailCapturePage from './pages/SiteDetailCapturePage';

const ImpactServicePage = React.lazy(() => import('./pages/ImpactServicePage'));
const SiteMapPage = React.lazy(() => import('./pages/SiteMapPage'));
const RfTiltAnalysisPage = React.lazy(() => import('./pages/RfTiltAnalysisPage'));
const TowerPlanGeneratorPage = React.lazy(() => import('./pages/TowerPlanGeneratorPage'));
const TicketTotiPage = React.lazy(() => import('./pages/TicketTotiPage'));

function MapRoute({ children }) {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
          Memuat peta...
        </div>
      )}
    >
      <MapRouteErrorBoundary>
        {children}
      </MapRouteErrorBoundary>
    </Suspense>
  );
}

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

function TowerPlanRoute() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
          Memuat Tower Visualizer...
        </div>
      )}
    >
      <TowerPlanGeneratorPage />
    </Suspense>
  );
}

function TicketTotiRoute() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
          Memuat Ticket TOTI...
        </div>
      )}
    >
      <TicketTotiPage />
    </Suspense>
  );
}

// Simple PrivateRoute wrapper
function PrivateRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking dashboard session...
      </div>
    );
  }

  return status === 'authenticated'
    ? <AppShell>{children}</AppShell>
    : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

// Session guard — must be inside <Router> to use useNavigate()
function LoginRoute() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking dashboard session...
      </div>
    );
  }
  return status === 'authenticated' ? <Navigate to="/home" replace /> : <LoginPage />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/capture/site-detail/:siteId" element={<SiteDetailCapturePage />} />
        <Route path="*" element={<DashboardRoutes />} />
      </Routes>
    </Router>
  );
}

function DashboardRoutes() {
  return (
    <AuthProvider>
      <Routes>
          <Route path="/login" element={<LoginRoute />} />
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
                <MapRoute><SiteMapPage /></MapRoute>
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
            path="/ticketing/toti"
            element={
              <PrivateRoute>
                <TicketTotiRoute />
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
          <Route
            path="/rf-tilt-analysis"
            element={
              <PrivateRoute>
                <MapRoute><RfTiltAnalysisPage /></MapRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/tower-plan-generator"
            element={
              <PrivateRoute>
                <TowerPlanRoute />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/home" />} />
      </Routes>
    </AuthProvider>
  );
}
