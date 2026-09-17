import React from 'react';
import { motion } from 'framer-motion';
import { useInventory } from '../../context/InventoryContext';
import { Component, CartItem } from '../../types';
import { spring, STAGGER_SECONDS } from '../common/motion';
import ComponentCard from './ComponentCard';

interface ComponentListProps {
  cart: CartItem[];
  updateCartItemQuantity: (componentId: string, newQuantity: number) => void;
}

const GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

// Mirrors ComponentCard's exact spacing scaffold so the real cards drop into the
// same box the skeleton held — the grid never reflows when data lands.
const CardSkeleton: React.FC = () => (
  <div className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-h-[2.75rem] w-full space-y-2">
          <div className="h-4 w-3/4 rounded bg-white/5" />
          <div className="h-4 w-1/2 rounded bg-white/5" />
        </div>
        <div className="mt-1 h-2 w-16 flex-shrink-0 rounded bg-white/5" />
      </div>
      <div className="flex items-end justify-between border-t border-white/10 pt-4">
        <div>
          <div className="mb-1 h-2 w-14 rounded bg-white/5" />
          <div className="h-[30px] w-12 rounded bg-white/5" />
        </div>
        <div className="h-3 w-14 rounded bg-white/5" />
      </div>
    </div>
    <div className="mt-5 h-[42px] rounded-lg border border-white/10 bg-white/5" />
  </div>
);

const ComponentList: React.FC<ComponentListProps> = ({ cart, updateCartItemQuantity }) => {
  const { components, isLoading } = useInventory();

  if (isLoading) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading resources">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!components.length) {
    return (
      <p className="py-20 text-center text-xs uppercase tracking-[0.2em] text-zinc-600">
        No resources in inventory
      </p>
    );
  }

  return (
    <motion.div
      className={GRID}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: STAGGER_SECONDS } },
      }}
    >
      {components.map((component: Component) => (
        <motion.div
          key={component.id}
          variants={{
            hidden: { opacity: 0, scale: 0.98 },
            visible: { opacity: 1, scale: 1 },
          }}
          transition={spring.standard}
        >
          <ComponentCard
            component={component}
            cart={cart}
            updateCartItemQuantity={updateCartItemQuantity}
          />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default ComponentList;
