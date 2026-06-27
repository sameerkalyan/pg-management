import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import OAuthCallback from './pages/OAuthCallback';
import AdminDashboard from './pages/AdminDashboard';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Rooms from './pages/Rooms';
import Tenants from './pages/Tenants';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Complaints from './pages/Complaints';
import TenantPortal from './pages/TenantPortal';
import Users from './pages/Users';
import OrganisationSettings from './pages/OrganisationSettings';
import Profile from './pages/Profile';
import SubscriptionPayment from './pages/SubscriptionPayment';
import SubscriptionDashboard from './pages/SubscriptionDashboard';
import SubscriptionPlans from './pages/SubscriptionPlans';
import SubscriptionRenewal from './pages/SubscriptionRenewal';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import PendingApproval from './pages/PendingApproval';
import MfaSetup from './pages/MfaSetup';
import MfaVerify from './pages/MfaVerify';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/mfa-verify" element={<MfaVerify />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route
            path="/subscription-payment"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <SubscriptionPayment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription-dashboard"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <Layout>
                  <SubscriptionDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription-plans"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <SubscriptionPlans />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription-renewal"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <SubscriptionRenewal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription-success"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <SubscriptionSuccess />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pending-approval"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <PendingApproval />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mfa-setup"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <MfaSetup />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <Layout variant="admin">
                  <AdminDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager', 'accountant']}>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/properties"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <Layout>
                  <Properties />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <Layout>
                  <Rooms />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenants"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <Layout>
                  <Tenants />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager', 'accountant']}>
                <Layout>
                  <Invoices />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager', 'accountant']}>
                <Layout>
                  <Payments />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <Layout>
                  <Complaints />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <Layout>
                  <Users />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/organisation/settings"
            element={
              <ProtectedRoute allowedRoles={['owner']}>
                <Layout>
                  <OrganisationSettings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager', 'accountant']}>
                <Layout>
                  <Profile />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal"
            element={
              <ProtectedRoute allowedRoles={['tenant']}>
                <TenantPortal />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
