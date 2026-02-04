import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import Button from './Button';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    const isParticipant = user?.role === UserRole.Participant;
    logout();
    navigate(isParticipant ? '/participant-login' : '/admin-login');
  };

  const Logo = () => (
    <div className="flex items-center gap-3 sm:gap-4 group">
      {/* 
        TO USE AN IMAGE LOGO INSTEAD OF THE SVG:
        1. Add your logo file to the 'public' folder (e.g., public/logo.png).
        2. Uncomment the line below and remove the <div className="relative...">...</div> block.
      */}
      {/* <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" /> */}

      <div className="relative h-8 w-8 sm:h-10 sm:w-10 transition-transform duration-300 group-hover:scale-110">
        <svg viewBox="0 0 24 24" className="h-full w-full drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]" fill="none" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Microchip Icon */}
            <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
            <rect x="9" y="9" width="6" height="6" />
            <line x1="9" y1="1" x2="9" y2="4" />
            <line x1="15" y1="1" x2="15" y2="4" />
            <line x1="9" y1="20" x2="9" y2="23" />
            <line x1="15" y1="20" x2="15" y2="23" />
            <line x1="20" y1="9" x2="23" y2="9" />
            <line x1="20" y1="14" x2="23" y2="14" />
            <line x1="1" y1="9" x2="4" y2="9" />
            <line x1="1" y1="14" x2="4" y2="14" />
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
                    <Link 
                        to="/participant-login" 
                        className={`text-xs font-bold transition-colors uppercase tracking-wider hidden sm:block ${
                            location.pathname.startsWith('/participant-') 
                            ? 'text-amber-500' 
                            : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        Participant Access
                    </Link>
                    <Link 
                        to="/admin-login" 
                        className={`text-xs font-bold transition-colors uppercase tracking-wider hidden sm:block ${
                            location.pathname === '/admin-login'
                            ? 'text-amber-500' 
                            : 'text-gray-400 hover:text-amber-400'
                        }`}
                    >
                        Admin Console
                    </Link>
                    
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