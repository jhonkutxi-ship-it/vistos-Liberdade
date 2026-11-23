/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CompanySettingsProvider } from './hooks/useCompanySettings';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { Dashboard } from './pages/Dashboard';
import { ClientPortal } from './pages/ClientPortal';
import { Processes } from './pages/Processes';
import { Bookings } from './pages/Bookings';
import { Messages } from './pages/Messages';
import { Login } from './pages/Login';
import { Services } from './pages/Services';
import { CRM } from './pages/CRM';
import { Finances } from './pages/Finances';
import { Employees } from './pages/Employees';
import { Reports } from './pages/Reports';
import { ManagerServices } from './pages/ManagerServices';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal"></div>
          <p className="text-sm font-medium text-gray-500">A carregar sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (profile?.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  const isClientRole = profile?.role === 'client';

  return (
    <Routes>
      <Route path="/" element={<Layout>{isClientRole ? <ClientPortal /> : <Dashboard />}</Layout>} />
      <Route path="/processes" element={<Layout><Processes /></Layout>} />
      <Route path="/admin/processes" element={<Layout><Processes /></Layout>} />
      <Route path="/bookings" element={<Layout><Bookings /></Layout>} />
      <Route path="/services" element={<Layout><ClientPortal /></Layout>} />
      <Route path="/messages" element={<Layout><Messages /></Layout>} />
      <Route path="/admin/clients" element={<Layout><CRM /></Layout>} />
      <Route path="/admin/finances" element={<Layout><Finances /></Layout>} />
      <Route path="/admin/employees" element={<Layout><Employees /></Layout>} />
      <Route path="/admin/tasks" element={<Layout><Tasks /></Layout>} />
      <Route path="/admin/services" element={<Layout><ManagerServices /></Layout>} />
      <Route path="/admin/analytics" element={<Layout><Reports /></Layout>} />
      <Route path="/settings" element={<Layout><Settings /></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CompanySettingsProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </CompanySettingsProvider>
    </ErrorBoundary>
  );
}
