import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import NetworkReportingPage from './pages/NetworkReportingPage';
import ImpactServicePage from './pages/ImpactServicePage';
import TransportQualityPage from './pages/TransportQualityPage';
import TicketingPage from './pages/TicketingPage';
import LoginPage from './pages/LoginPage';
import { useSessionTimeout } from './hooks/useSessionTimeout';

// Simple PrivateRoute wrapper
function PrivateRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('nod_auth_token');
  return isAuthenticated ? children : <Navigate to="/login" />;
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
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
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
                <ImpactServicePage />
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
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </SessionGuard>
    </Router>
  );
}
