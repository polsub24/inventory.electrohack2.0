import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CartItem } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { spring, STAGGER_SECONDS } from '../common/motion';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  updateCartItemQuantity: (componentId: string, newQuantity: number) => void;
  onSubmitted: () => void;
}

const EmptyCartArt: React.FC = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 96"
    className="h-24 w-32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 26h14l10 38h44l10-28H38" />
    <circle cx="50" cy="76" r="5" />
    <circle cx="80" cy="76" r="5" />
    <path d="M66 26v14M59 33h14" strokeDasharray="3 4" />
  </svg>
);

const Cart: React.FC<CartProps> = ({ isOpen, onClose, cart, updateCartItemQuantity, onSubmitted }) => {
  const { getComponentById, submitRequest } = useInventory();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const totalUnits = cart.reduce((total, item) => total + item.quantity, 0);

  // Stock can drop under an open cart from another client's poll — checked at
  // render time, live, rather than only at add-to-cart, so the submit button
  // reflects the same numbers the "Only N left" warning below is showing.
  const hasOverAllocation = cart.some((item) => {
    const component = getComponentById(item.componentId);
    if (!component || component.hasQuantityLimit === false) return false;
    return item.quantity > component.totalQuantity - component.reservedQuantity;
  });

  const handleSubmit = async () => {
    if (!user || cart.length === 0 || hasOverAllocation || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitRequest(user.id, cart);
      onSubmitted();
    } catch (error) {
      console.error('Failed to submit request', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const panelHidden = reduceMotion
    ? { opacity: 0, transform: 'translateX(0%)' }
    : { opacity: 1, transform: 'translateX(100%)' };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Request cart">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.drawerOut}
            onClick={onClose}
          />

          <motion.aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#07100c]/80 backdrop-blur-2xl"
            initial={panelHidden}
            animate={{ opacity: 1, transform: 'translateX(0%)' }}
            exit={panelHidden}
            transition={spring.drawerIn}
          >
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">Request Cart</h2>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Close cart"
                whileTap={{ scale: 0.97 }}
                transition={spring.press}
                className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </header>

            <div className="flex-grow overflow-y-auto px-6 py-5">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-zinc-700">
                  <EmptyCartArt />
                  <p className="mt-5 text-xs uppercase tracking-[0.2em] text-zinc-600">Your cart is empty</p>
                </div>
              ) : (
                <motion.ul
                  className="space-y-3"
                  initial="hidden"
                  animate="visible"
                  variants={{ hidden: {}, visible: { transition: { staggerChildren: STAGGER_SECONDS } } }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {cart.map((item) => {
                      // Read through to context on every render: stock moves under
                      // the drawer while it is open, and the cart must show that.
                      const component = getComponentById(item.componentId);
                      const isUnlimited = component?.hasQuantityLimit === false;
                      const available = component ? component.totalQuantity - component.reservedQuantity : 0;
                      const overAllocated = !!component && !isUnlimited && item.quantity > available;

                      return (
                        <motion.li
                          key={item.componentId}
                          layout
                          variants={{ hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 } }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={spring.standard}
                          className="rounded-lg border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-100">
                                {component ? component.name : 'Component no longer available'}
                              </p>
                              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                                {component
                                  ? `${component.category} · ${isUnlimited ? '∞' : available} available`
                                  : 'Removed from inventory'}
                              </p>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1">
                              <motion.button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.componentId, item.quantity - 1)}
                                aria-label={`Remove one ${component?.name ?? 'item'}`}
                                whileTap={{ scale: 0.97 }}
                                transition={spring.press}
                                className="h-8 w-8 rounded-md text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
                              >
                                –
                              </motion.button>
                              <span className="w-8 text-center font-mono text-sm tabular-nums text-white">
                                {item.quantity}
                              </span>
                              <motion.button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.componentId, item.quantity + 1)}
                                disabled={!component || (!isUnlimited && item.quantity >= available)}
                                aria-label={`Add one ${component?.name ?? 'item'}`}
                                whileTap={{ scale: 0.97 }}
                                transition={spring.press}
                                className="h-8 w-8 rounded-md text-zinc-400 disabled:text-zinc-700 enabled:hover:bg-white/5 enabled:hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
                              >
                                +
                              </motion.button>
                            </div>
                          </div>
                          {overAllocated && (
                            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-500">
                              Only {available} left — reduce to submit
                            </p>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </motion.ul>
              )}
            </div>

            <footer className="border-t border-white/10 px-6 py-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Allocation Total
                </span>
                <span className="font-mono text-2xl font-medium tabular-nums text-white">{totalUnits}</span>
              </div>
              <motion.button
                type="button"
                onClick={handleSubmit}
                disabled={cart.length === 0 || hasOverAllocation || isSubmitting}
                whileTap={cart.length === 0 || hasOverAllocation || isSubmitting ? undefined : { scale: 0.97 }}
                transition={spring.press}
                className={`w-full rounded-lg py-3.5 text-xs font-semibold uppercase tracking-[0.2em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${
                  cart.length === 0 || hasOverAllocation || isSubmitting
                    ? 'bg-white/5 text-zinc-500'
                    : 'bg-emerald-500 text-black hover:bg-emerald-400'
                }`}
              >
                {isSubmitting ? 'Transmitting…' : hasOverAllocation ? 'Reduce Over-Allocated Items' : 'Transmit Request'}
              </motion.button>
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Cart;
