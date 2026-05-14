import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  clearTokens,
  ensureToken,
  getUserEmail,
  hasSavedSession,
  isTokenValid,
} from './oauth';
import { db } from '../db/db';

export type Role = 'Treasurer' | 'Committee Member' | 'Auditor' | null;

interface AuthState {
  /** null = not signed in; string = email address */
  email: string | null;
  role: Role;
  /** Spreadsheet ID as stored in configKv; null = not set up yet */
  spreadsheetId: string | null;
  /** True while we're doing the initial token-restore check */
  loading: boolean;
  /** Ensures we have a fresh token before every API call */
  getToken: () => Promise<string>;
  setRole: (r: Role) => void;
  setSpreadsheetId: (id: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: try to restore session from existing refresh_token
  useEffect(() => {
    (async () => {
      try {
        if (hasSavedSession()) {
          const token = isTokenValid()
            ? (getUserEmail(), true) // already valid
            : await ensureToken().then(() => true).catch(() => false);

          if (token) {
            const e = getUserEmail();
            if (e) setEmail(e);

            // Restore spreadsheetId + role from IndexedDB
            const idRow = await db.configKv.get('spreadsheetId');
            const roleRow = await db.configKv.get('userRole');
            if (idRow?.value) setSpreadsheetId(idRow.value);
            if (roleRow?.value) setRole(roleRow.value as Role);
          }
        }
      } catch {
        // Ignore — user will re-authenticate
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getToken = useCallback(() => ensureToken(), []);

  const handleSignOut = useCallback(() => {
    clearTokens();
    setEmail(null);
    setRole(null);
    setSpreadsheetId(null);
  }, []);

  const handleSetSpreadsheetId = useCallback((id: string) => {
    setSpreadsheetId(id);
    db.configKv.put({ key: 'spreadsheetId', value: id });
  }, []);

  const handleSetRole = useCallback((r: Role) => {
    setRole(r);
    if (r) db.configKv.put({ key: 'userRole', value: r });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        email,
        role,
        spreadsheetId,
        loading,
        getToken,
        setRole: handleSetRole,
        setSpreadsheetId: handleSetSpreadsheetId,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
