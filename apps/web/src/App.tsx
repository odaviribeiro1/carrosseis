import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { InvitePage } from '@/pages/InvitePage';
import { SetupPage } from '@/pages/setup/SetupPage';
import { isSupabaseConfigured } from '@/lib/supabase';

const DashboardPage = React.lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CreateCarouselPage = React.lazy(() =>
  import('@/pages/CreateCarouselPage').then((m) => ({ default: m.CreateCarouselPage }))
);
const EditorPage = React.lazy(() =>
  import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage }))
);
const TemplatesPage = React.lazy(() =>
  import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage }))
);
const BrandKitsPage = React.lazy(() =>
  import('@/pages/BrandKitsPage').then((m) => ({ default: m.BrandKitsPage }))
);
const MembersPage = React.lazy(() =>
  import('@/pages/MembersPage').then((m) => ({ default: m.MembersPage }))
);
const CredentialsSettingsPage = React.lazy(() =>
  import('@/pages/settings/credentials').then((m) => ({ default: m.CredentialsSettingsPage }))
);

const SuspenseFallback = (
  <div className="flex items-center justify-center h-screen">Carregando...</div>
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={SuspenseFallback}>
        <SetupGate>
          <Routes>
            {/* Public routes */}
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/invite" element={<InvitePage />} />

          {/* Authenticated routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Routes>
                  <Route path="/editor/:id" element={<EditorPage />} />
                  <Route
                    path="/*"
                    element={
                      <AppShell>
                        <Routes>
                          <Route path="/" element={<DashboardPage />} />
                          <Route path="/create" element={<CreateCarouselPage />} />
                          <Route path="/templates" element={<TemplatesPage />} />
                          <Route path="/settings/brand-kits" element={<BrandKitsPage />} />
                          <Route path="/settings/members" element={<MembersPage />} />
                          <Route path="/settings/credentials" element={<CredentialsSettingsPage />} />
                          <Route path="/settings" element={<Navigate to="/settings/credentials" replace />} />
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      </AppShell>
                    }
                  />
                </Routes>
              </ProtectedRoute>
            }
          />
          </Routes>
        </SetupGate>
      </Suspense>
    </BrowserRouter>
  );
}

function SetupGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!isSupabaseConfigured && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }
  if (isSupabaseConfigured && location.pathname === '/setup' && !location.search.includes('step=4')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
