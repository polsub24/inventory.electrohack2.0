import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, useAnimate, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { UserRole } from '../../types';
import { spring } from './motion';

const CAS_LOGO = '/CAS-Logo-White.png';
const EMBED_LOGO = '/embed%20control%207.0%20logo.png';

/**
 * Pulses once per completed poll. Driven by InventoryContext's `lastSync` rather
 * than an interval of its own, so the light reports real sync, not a guess at its rhythm.
 */
const SyncIndicator: React.FC = () => {
  const { lastSync } = useInventory();
  const reduceMotion = useReducedMotion();
  const [scope, animate] = useAnimate();

  useEffect(() => {
    if (reduceMotion || !scope.current) return;
    animate([
      [scope.current, { opacity: 1, scale: 1.3 }, spring.press],
      [scope.current, { opacity: 0.4, scale: 1 }, spring.standard],
    ]);
  }, [lastSync, animate, scope, reduceMotion]);

  return (
    <span className="flex items-center gap-2" title="Live sync">
      <motion.span ref={scope} className="h-1.5 w-1.5 rounded-full bg-white" style={{ opacity: 0.4 }} />
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600 sm:inline">
        Live
      </span>
    </span>
  );
};

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    const isParticipant = user?.role === UserRole.Participant;
    logout();
    navigate(isParticipant ? '/participant-login' : '/admin-login');
  };

  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#050806]/70 backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between sm:h-20">
          <Link
            to="/"
            aria-label="ELECTROHACK 2.0 home"
            className="flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
          >
            <img src={CAS_LOGO} alt="IEEE Circuits and Systems Society" className="h-5 opacity-90" />
            <span aria-hidden="true" className="mx-4 h-6 w-px bg-white/15" />
            <img src={EMBED_LOGO} alt="Embed Control 7.0" className="h-8" />
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            {user ? (
              <>
                <SyncIndicator />
                <div className="hidden flex-col items-end text-right sm:flex">
                  <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">Signed in</span>
                  <span className="max-w-[180px] truncate text-xs font-medium text-zinc-200">{user.name}</span>
                </div>
                <motion.button
                  type="button"
                  onClick={handleLogout}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.press}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
                >
                  Logout
                </motion.button>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <Link
                  to="/participant-login"
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    location.pathname.startsWith('/participant-') ? 'text-white' : 'text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  Participant Access
                </Link>
                <Link
                  to="/admin-login"
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    location.pathname === '/admin-login' ? 'text-white' : 'text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  Admin Console
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
