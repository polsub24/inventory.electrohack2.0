import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { User, UserRole, Team } from '../types';
import api from '../server/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  registerParticipant: (teamData: { teamName: string; leaderName: string; registrationNumber: string; }) => Promise<Team>;
  loginParticipant: (teamName: string, password: string) => Promise<Team>;
  loginAdmin: () => void;
  logout: () => void;
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

  const registerParticipant = useCallback(async (teamData: { teamName: string; leaderName: string; registrationNumber: string; }) => {
    setIsLoading(true);
    try {
      const team = await api.registerTeam(teamData);
      const participantUser: User = {
        id: team.id,
        name: `${team.teamName} (${team.leaderName})`,
        role: UserRole.Participant,
      };
      setUser(participantUser);
      return team;
    } catch (error) {
      console.error("Participant registration failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, registerParticipant, loginParticipant, loginAdmin, logout }}>
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