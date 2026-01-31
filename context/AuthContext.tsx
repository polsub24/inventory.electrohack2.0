
import React, { createContext, useState, useContext, ReactNode, useMemo } from 'react';
import { User, UserRole, Team } from '../types';

interface AuthContextType {
  user: User | null;
  loginParticipant: (team: Team) => void;
  loginAdmin: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const loginParticipant = (team: Team) => {
    const participantUser: User = {
      id: team.id,
      name: `${team.teamName} (${team.leaderName})`,
      role: UserRole.Participant,
    };
    setUser(participantUser);
  };

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

  const value = useMemo(() => ({ user, loginParticipant, loginAdmin, logout }), [user]);

  return (
    <AuthContext.Provider value={value}>
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
