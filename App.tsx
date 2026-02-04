import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InventoryProvider } from './context/InventoryContext';
import { AnimationProvider } from './context/AnimationContext';
import ParticipantLoginPage from './pages/ParticipantLoginPage';
import ParticipantRegisterPage from './pages/ParticipantRegisterPage';
import ParticipantDashboardPage from './pages/ParticipantDashboardPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminRequestDetailPage from './pages/AdminRequestDetailPage';
import Header from './components/common/Header';
import BackgroundLines from './components/common/BackgroundLines';
import { UserRole } from './types';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <InventoryProvider>
        <AnimationProvider>
          <HashRouter>
            <div className="min-h-screen flex flex-col relative overflow-hidden">
              <BackgroundLines />
              <Header />
              <main className="flex-grow container mx-auto p-4 md:p-6 lg:p-8 z-10">
                <AppRoutes />
              </main>
            </div>
          </HashRouter>
        </AnimationProvider>
      </InventoryProvider>
    </AuthProvider>
  );
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/participant-login" element={!user ? <ParticipantLoginPage /> : <Navigate to="/dashboard" />} />
      <Route path="/participant-register" element={!user ? <ParticipantRegisterPage /> : <Navigate to="/dashboard" />} />
      <Route path="/admin-login" element={!user ? <AdminLoginPage /> : <Navigate to="/admin" />} />

      {/* Participant Routes */}
      <Route path="/dashboard" element={user && user.role === UserRole.Participant ? <ParticipantDashboardPage /> : <Navigate to="/participant-login" />} />

      {/* Admin Routes */}
      <Route path="/admin" element={user && user.role === UserRole.Admin ? <AdminDashboardPage /> : <Navigate to="/admin-login" />} />
      <Route path="/admin/request/:id" element={user && user.role === UserRole.Admin ? <AdminRequestDetailPage /> : <Navigate to="/admin-login" />} />
      
      <Route path="*" element={<Navigate to={user ? (user.role === UserRole.Admin ? "/admin" : "/dashboard") : "/participant-login"} />} />
    </Routes>
  );
};

export default App;