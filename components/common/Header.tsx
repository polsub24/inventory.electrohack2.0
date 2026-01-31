
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import Button from './Button';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    const isParticipant = user?.role === UserRole.Participant;
    logout();
    navigate(isParticipant ? '/participant-login' : '/admin-login');
  };

  const Logo = () => (
    <div className="flex items-center space-x-3 group">
      <div className="relative h-10 w-10">
        <svg viewBox="0 0 100 100" className="h-full w-full animate-pulse-slow">
            {/* Outer Gear */}
            <path 
                d="M50 10 L58 10 L60 20 A30 30 0 0 1 70 24 L80 16 L86 22 L78 32 A30 30 0 0 1 82 42 L92 44 L92 52 L82 54 A30 30 0 0 1 78 64 L86 74 L80 80 L70 72 A30 30 0 0 1 60 76 L58 86 L50 86 L48 76 A30 30 0 0 1 38 72 L28 80 L22 74 L30 64 A30 30 0 0 1 26 54 L16 52 L16 44 L26 42 A30 30 0 0 1 30 32 L22 22 L28 16 L38 24 A30 30 0 0 1 48 20 Z" 
                fill="none" 
                stroke="#d4af37" 
                strokeWidth="4"
            />
            {/* Inner Circuit Core */}
            <circle cx="50" cy="50" r="18" fill="#d4af37" fillOpacity="0.2" stroke="#d4af37" strokeWidth="2" />
            <text x="50" y="56" textAnchor="middle" fill="#d4af37" fontSize="16" fontWeight="900" style={{fontFamily: 'sans-serif'}}>2.0</text>
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-black text-white tracking-tighter leading-none group-hover:text-amber-500 transition-colors">ELECTROHACK <span className="text-amber-500">2.0</span></span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-gray-400 font-bold leading-none mt-1">Plug into Innovation</span>
      </div>
    </div>
  );

  return (
    <header className="bg-black border-b border-amber-900/40 backdrop-blur-md shadow-2xl shadow-amber-900/10 sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center">
            <Logo />
          </Link>
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-gray-400 hidden sm:block text-xs uppercase tracking-widest font-bold">
                   TEAM: <span className="text-amber-400">{user.name}</span>
                </span>
                <Button onClick={handleLogout} variant="danger" size="sm" className="!bg-transparent border border-red-900 text-red-500 hover:bg-red-950">
                  Logout
                </Button>
              </>
            ) : (
                <div className="flex items-center space-x-2">
                    <Button onClick={() => navigate('/participant-login')} size="sm" className="bg-amber-600 hover:bg-amber-500 text-black font-black border-b-2 border-amber-800">TEAM LOGIN</Button>
                    <Button onClick={() => navigate('/admin-login')} size="sm" variant="secondary" className="hidden sm:block">STAFF</Button>
                </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
