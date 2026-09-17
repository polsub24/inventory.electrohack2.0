import React, { useEffect, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Component, CartItem } from '../../types';
import { spring, useFinePointer } from '../common/motion';
import PcbTraces from './PcbTraces';

interface ComponentCardProps {
  component: Component;
  cart: CartItem[];
  updateCartItemQuantity: (componentId: string, newQuantity: number) => void;
}

const TickingNumber: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const reduceMotion = useReducedMotion();
  const target = useMotionValue(value);
  const settled = useSpring(target, spring.standard);
  const rounded = useTransform(settled, (v) => Math.round(v).toString());

  useEffect(() => {
    target.set(value);
  }, [value, target]);

  if (reduceMotion) return <span className={className}>{value}</span>;
  return <motion.span className={className}>{rounded}</motion.span>;
};

const StepperButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, label, children }) => (
  <motion.button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    whileTap={disabled ? undefined : { scale: 0.97 }}
    transition={spring.press}
    className="h-9 w-10 flex items-center justify-center rounded-md text-zinc-300 disabled:text-zinc-700 enabled:hover:bg-white/5 enabled:hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
  >
    {children}
  </motion.button>
);

const ComponentCard: React.FC<ComponentCardProps> = ({ component, cart, updateCartItemQuantity }) => {
  const finePointer = useFinePointer();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spotlightX = useSpring(pointerX, spring.tracking);
  const spotlightY = useSpring(pointerY, spring.tracking);
  const spotlightMask = useMotionTemplate`radial-gradient(160px circle at ${spotlightX}px ${spotlightY}px, #000 0%, rgba(0,0,0,0.55) 45%, transparent 72%)`;

  const isUnlimited = component.hasQuantityLimit === false;
  const available = component.totalQuantity - component.reservedQuantity;
  const maxAllowed = isUnlimited ? Infinity : available;

  const quantityInCart = cart.find((item) => item.componentId === component.id)?.quantity ?? 0;
  const canIncrement = isUnlimited || quantityInCart < maxAllowed;
  const canDecrement = quantityInCart > 0;

  const status = isUnlimited
    ? { label: 'Available', dot: 'bg-emerald-500' }
    : available <= 0
      ? { label: 'Depleted', dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' }
      : available < 5
        ? { label: 'Low Stock', dot: 'bg-amber-500' }
        : { label: 'In Stock', dot: 'bg-emerald-500' };

  const trackPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(event.clientX - bounds.left);
    pointerY.set(event.clientY - bounds.top);
  };

  const handleEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!finePointer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    // Jump rather than spring on entry, so the light appears under the cursor
    // instead of sweeping in from wherever it was left last time.
    spotlightX.jump(event.clientX - bounds.left);
    spotlightY.jump(event.clientY - bounds.top);
    setHovered(true);
  };

  const showSpotlight = hovered && finePointer && !reduceMotion;

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseMove={finePointer ? trackPointer : undefined}
      onMouseLeave={() => setHovered(false)}
      className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ maskImage: spotlightMask, WebkitMaskImage: spotlightMask }}
        animate={{ opacity: showSpotlight ? 1 : 0 }}
        transition={spring.standard}
      >
        <PcbTraces className="absolute inset-0" />
      </motion.div>

      <div className="relative">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h3 className="min-h-[2.75rem] text-base font-semibold leading-snug text-zinc-100 line-clamp-2">
            {component.name}
          </h3>
          <span className="flex flex-shrink-0 items-center gap-2 pt-1">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{status.label}</span>
          </span>
        </div>

        <div className="flex items-end justify-between border-t border-white/10 pt-4">
          <div>
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-600">Available</p>
            {isUnlimited ? (
              <p className="font-mono text-3xl font-medium leading-none text-white">∞</p>
            ) : (
              <TickingNumber
                value={available}
                className="font-mono text-3xl font-medium leading-none text-white"
              />
            )}
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600">
            {component.category}
          </p>
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-1">
        <StepperButton
          onClick={() => updateCartItemQuantity(component.id, quantityInCart - 1)}
          disabled={!canDecrement}
          label={`Remove one ${component.name}`}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </StepperButton>

        <span className="font-mono text-sm font-medium tabular-nums text-white" aria-live="polite">
          {quantityInCart}
        </span>

        <StepperButton
          onClick={() => updateCartItemQuantity(component.id, quantityInCart + 1)}
          disabled={!canIncrement}
          label={`Add one ${component.name}`}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </StepperButton>
      </div>
    </div>
  );
};

export default ComponentCard;
