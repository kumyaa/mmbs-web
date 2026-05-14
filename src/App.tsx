import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AuthCallback } from './pages/AuthCallback';
import { SignIn } from './pages/SignIn';
import { Setup } from './pages/Setup';
import { SyncProgressPage } from './pages/SyncProgress';
import { Home } from './pages/Home';
import { MemberList } from './pages/MemberList';
import { MemberDetail } from './pages/MemberDetail';
import { MemberEdit } from './pages/MemberEdit';
import { RecordPayment } from './pages/RecordPayment';
import { TxnList } from './pages/TxnList';
import { TxnEdit } from './pages/TxnEdit';
import { ReconUpload } from './pages/ReconUpload';
import { ReconMatch } from './pages/ReconMatch';
import { ReconSummary } from './pages/ReconSummary';
import { Settings } from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { email, loading, spreadsheetId } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!email) return <Navigate to="/signin" replace />;
  if (!spreadsheetId) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/signin" element={<SignIn />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/sync" element={<SyncProgressPage />} />

      {/* Protected */}
      <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/members" element={<RequireAuth><MemberList /></RequireAuth>} />
      <Route path="/members/new" element={<RequireAuth><MemberEdit /></RequireAuth>} />
      <Route path="/members/:id" element={<RequireAuth><MemberDetail /></RequireAuth>} />
      <Route path="/members/:id/edit" element={<RequireAuth><MemberEdit /></RequireAuth>} />
      <Route path="/members/:id/payment" element={<RequireAuth><RecordPayment /></RequireAuth>} />
      <Route path="/txns" element={<RequireAuth><TxnList /></RequireAuth>} />
      <Route path="/txns/new" element={<RequireAuth><TxnEdit /></RequireAuth>} />
      <Route path="/txns/:id" element={<RequireAuth><TxnEdit /></RequireAuth>} />
      <Route path="/recon" element={<RequireAuth><ReconUpload /></RequireAuth>} />
      <Route path="/recon/match" element={<RequireAuth><ReconMatch /></RequireAuth>} />
      <Route path="/recon/summary" element={<RequireAuth><ReconSummary /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
