import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { User, UserRole, Team } from '../types';
import api from '../server/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  // Set when the server rejects an admin-authenticated request (expired/revoked
  // token) and the user is force-logged-out as a result. AdminLoginPage reads
  // and clears this to explain why the screen bounced back to the login form.
  adminAuthMessage: string | null;
  loginParticipant: (teamName: string, password: string) => Promise<Team>;
  loginAdmin: () => void;
  logout: () => void;
  clearAdminAuthMessage: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = import.meta.env.VITE_SESSION_STORAGE_KEY || 'electrohack_user_session';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const storedUser = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (error) {
      console.error("Error reading user from session storage", error);
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [adminAuthMessage, setAdminAuthMessage] = useState<string | null>(null);

  // If any admin-authenticated request comes back 401 (token expired, revoked,
  // or never made it into sessionStorage after login), force the session back
  // to logged-out with an explanation instead of leaving admin actions
  // silently doing nothing forever.
  useEffect(() => {
    api.setAdminUnauthorizedHandler(() => {
      setAdminAuthMessage('Your admin session has expired. Please log in again.');
      setUser((current) => (current?.role === UserRole.Admin ? null : current));
    });
    return () => api.setAdminUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    try {
      if (user) {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } else {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Error writing user to session storage", error);
    }
  }, [user]);

  const loginParticipant = useCallback(async (teamName: string, password: string) => {
    setIsLoading(true);
    try {
      const team = await api.loginTeam(teamName, password);
      const participantUser: User = {
        id: team.id,
        name: `${team.teamName} (${team.leaderName})`,
        role: UserRole.Participant,
      };
      setUser(participantUser);
      return team;
    } catch (error) {
      console.error("Participant login failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);


  const loginAdmin = () => {
    const adminUser: User = {
      id: 'admin_user',
      name: 'Admin',
      role: UserRole.Admin,
    };
    setUser(adminUser);
  };

  const logout = () => {
    if (user?.role === UserRole.Admin) {
      void api.logoutAdmin();
    }
    setUser(null);
  };

  const clearAdminAuthMessage = () => setAdminAuthMessage(null);

  return (
    <AuthContext.Provider value={{ user, isLoading, adminAuthMessage, loginParticipant, loginAdmin, logout, clearAdminAuthMessage }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};