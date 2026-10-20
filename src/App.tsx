import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, RequireAdmin, RequireAuth, RequireStaff } from './lib/auth';
import { AppShell } from './components/AppShell';
import { FaviconSync } from './components/Branding';
import { PublicLayout, ScrollToTop } from './components/PublicLayout';

// Public
import { HomePage } from './pages/public/HomePage';
import { KioskPage } from './pages/public/KioskPage';
import { BooksPage, BookReaderPage } from './pages/public/BooksPage';
import { LoginPage, NotFoundPage, RegisterPage, ResetPasswordPage } from './pages/public/AuthPages';

// Staff workspace
import { OverviewPage } from './pages/app/OverviewPage';
import { VisitsPage } from './pages/app/VisitsPage';
import { ManageBooksPage } from './pages/app/ManageBooksPage';
import { AnalyticsPage } from './pages/app/AnalyticsPage';
import { PeoplePage } from './pages/app/PeoplePage';
import { BroadcastPage } from './pages/app/BroadcastPage';
import { NotificationsPage } from './pages/app/NotificationsPage';
import { ActivityPage } from './pages/app/ActivityPage';
import { SettingsPage } from './pages/app/SettingsPage';

function AppHome() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'librarian' || user.role === 'admin') return <OverviewPage />;
  return <Navigate to="/books" replace />;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <FaviconSync />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="books" element={<BooksPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* The kiosk is a staff tool: full-screen, but only for librarian/admin. */}
        <Route element={<RequireStaff />}>
          <Route path="/kiosk" element={<KioskPage />} />
        </Route>

        {/* Reading a book needs a library ID; the reader takes over the screen. */}
        <Route element={<RequireAuth />}>
          <Route path="/books/:id" element={<BookReaderPage />} />
        </Route>

        {/* Staff workspace */}
        <Route path="/app" element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<AppHome />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="people" element={<PeoplePage />} />
              <Route path="broadcast" element={<BroadcastPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route element={<RequireStaff />}>
              <Route path="visits" element={<VisitsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="books" element={<ManageBooksPage />} />
              <Route path="books/new" element={<ManageBooksPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
