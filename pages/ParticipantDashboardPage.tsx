import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ComponentList from '../components/participant/ComponentList';
import Cart from '../components/participant/Cart';
import RequestHistory from '../components/participant/RequestHistory';
import CollectedComponents from '../components/participant/CollectedComponents';
import TeamRoster from '../components/participant/TeamRoster';
import { spring } from '../components/common/motion';
import { CartItem } from '../types';

type Tab = 'store' | 'requests' | 'inventory' | 'team';

const TABS: { id: Tab; label: string }[] = [
  { id: 'store', label: 'Resources' },
  { id: 'requests', label: 'My Requests' },
  { id: 'inventory', label: 'My Inventory' },
  { id: 'team', label: 'My Team' },
];

const ParticipantDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('store');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const updateCartItemQuantity = useCallback((componentId: string, newQuantity: number) => {
    setCart((previous) => {
      if (newQuantity <= 0) return previous.filter((item) => item.componentId !== componentId);
      if (!previous.some((item) => item.componentId === componentId)) {
        return [...previous, { componentId, quantity: newQuantity }];
      }
      return previous.map((item) =>
        item.componentId === componentId ? { ...item, quantity: newQuantity } : item
      );
    });
  }, []);

  const handleSubmitted = useCallback(() => {
    setCart([]);
    setIsCartOpen(false);
    setShowToast(true);
  }, []);

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(false), 2600);
    return () => clearTimeout(timer);
  }, [showToast]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="relative pb-24 sm:pb-12">
      <nav className="mb-8 flex border-b border-white/10" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`relative px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 ${
              activeTab === tab.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.span
                layoutId="dashboard-tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-500"
                transition={spring.standard}
              />
            )}
          </button>
        ))}
      </nav>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring.standard}
      >
        {activeTab === 'store' && (
          <ComponentList cart={cart} updateCartItemQuantity={updateCartItemQuantity} />
        )}
        {activeTab === 'requests' && (
          <div className="mx-auto max-w-4xl">
            <RequestHistory />
          </div>
        )}
        {activeTab === 'inventory' && (
          <div className="mx-auto max-w-6xl">
            <CollectedComponents />
          </div>
        )}
        {activeTab === 'team' && (
          <div className="mx-auto max-w-3xl">
            <TeamRoster />
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {activeTab === 'store' && (
          <motion.button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label={`Open cart, ${cartItemCount} units`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileTap={{ scale: 0.97 }}
            transition={spring.standard}
            className="fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-2xl backdrop-blur-xl hover:bg-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <AnimatePresence>
              {cartItemCount > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={spring.press}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white font-mono text-[11px] font-medium tabular-nums text-black"
                >
                  {cartItemCount}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>

      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        updateCartItemQuantity={updateCartItemQuantity}
        onSubmitted={handleSubmitted}
      />

      <AnimatePresence>
        {showToast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, transform: 'translateY(100%)' }}
            animate={{ opacity: 1, transform: 'translateY(0%)' }}
            exit={{ opacity: 0, transform: 'translateY(100%)' }}
            transition={spring.drawerIn}
            className="fixed inset-x-0 bottom-8 z-50 mx-auto w-fit rounded-lg border border-white/15 bg-[#07100c]/80 backdrop-blur-xl px-5 py-3 text-xs font-medium tracking-wide text-zinc-100 shadow-2xl"
          >
            ✓ Request Transmitted
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ParticipantDashboardPage;
