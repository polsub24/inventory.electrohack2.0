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
    <div className="flex items-center gap-3 sm:gap-4 group">
      <div className="relative h-8 w-8 sm:h-10 sm:w-10 transition-transform duration-300 group-hover:rotate-90">
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]">
            <path 
                d="M50 10 L58 10 L60 20 A30 30 0 0 1 70 24 L80 16 L86 22 L78 32 A30 30 0 0 1 82 42 L92 44 L92 52 L82 54 A30 30 0 0 1 78 64 L86 74 L80 80 L70 72 A30 30 0 0 1 60 76 L58 86 L50 86 L48 76 A30 30 0 0 1 38 72 L28 80 L22 74 L30 64 A30 30 0 0 1 26 54 L16 52 L16 44 L26 42 A30 30 0 0 1 30 32 L22 22 L28 16 L38 24 A30 30 0 0 1 48 20 Z" 
                fill="none" 
                stroke="#d4af37" 
                strokeWidth="6"
            />
            <circle cx="50" cy="50" r="18" fill="#d4af37" fillOpacity="0.1" stroke="#d4af37" strokeWidth="2" />
        </svg>
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-base sm:text-xl font-black text-white tracking-tight leading-none group-hover:text-amber-500 transition-colors uppercase italic">
          Electrohack <span className="text-amber-500">2.0</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-bold leading-none mt-1">Inventory System</span>
      </div>
    </div>
  );

  return (
    <header className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 transition-all duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link to="/" className="flex items-center focus:outline-none rounded-lg focus:ring-2 focus:ring-amber-500/50">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <>
                <div className="hidden sm:flex flex-col items-end mr-2 text-right">
                  <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Logged in as</span>
                  <span className="text-xs text-white font-bold max-w-[150px] truncate">{user.name}</span>
                </div>
                <Button onClick={handleLogout} variant="danger" size="sm" className="hidden sm:inline-flex">
                  Logout
                </Button>
                <Button onClick={handleLogout} variant="danger" size="sm" className="sm:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </Button>
              </>
            ) : (
                <div className="flex items-center gap-3">
                    <Link to="/participant-login" className="text-xs font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-wider hidden sm:block">Participant Access</Link>
                    <Link to="/admin-login" className="text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors uppercase tracking-wider hidden sm:block">Admin Console</Link>
                    
                    {/* Mobile Only simplified nav */}
                    <Button onClick={() => navigate('/participant-login')} size="sm" className="sm:hidden">Login</Button>
                </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;