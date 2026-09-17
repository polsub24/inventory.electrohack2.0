import { useEffect, useState } from 'react';
import type { Transition } from 'framer-motion';

// Critically damped springs: damping ≈ 2√stiffness at mass 1, so nothing overshoots.
// An inventory console should read as precise instrumentation, not as playful UI.
export const spring = {
  press: { type: 'spring', stiffness: 700, damping: 53 },
  standard: { type: 'spring', stiffness: 400, damping: 40 },
  drawerIn: { type: 'spring', stiffness: 300, damping: 35 },
  // Exit outruns entry: the system should respond faster than it invites.
  drawerOut: { type: 'spring', stiffness: 520, damping: 46 },
  tracking: { type: 'spring', stiffness: 150, damping: 26 },
} satisfies Record<string, Transition>;

export const STAGGER_SECONDS = 0.04;

// Touch devices fire hover on tap, which would strand a cursor-tracked highlight
// wherever the finger last landed. Gate those effects on a real pointer.
export const useFinePointer = () => {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFine(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return fine;
};
