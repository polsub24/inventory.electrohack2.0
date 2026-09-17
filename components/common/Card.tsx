import React, { useState } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { spring, useFinePointer } from './motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  const finePointer = useFinePointer();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, spring.tracking);
  const y = useSpring(pointerY, spring.tracking);

  // Light catching the face of the glass, and the same light picking out its edge.
  const sheen = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 40%, transparent 70%)`;
  const edge = useMotionTemplate`radial-gradient(200px circle at ${x}px ${y}px, rgba(255,255,255,0.55), transparent 72%)`;

  const track = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(event.clientX - bounds.left);
    pointerY.set(event.clientY - bounds.top);
  };

  const handleEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!finePointer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    // Jump on entry so the highlight appears under the cursor rather than
    // sliding in from wherever it was left last time.
    x.jump(event.clientX - bounds.left);
    y.jump(event.clientY - bounds.top);
    setHovered(true);
  };

  const lit = hovered && finePointer && !reduceMotion;

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseMove={finePointer ? track : undefined}
      onMouseLeave={() => setHovered(false)}
      className={`relative bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-5 sm:p-7 overflow-hidden group ${className}`}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: sheen }}
        animate={{ opacity: lit ? 1 : 0 }}
        transition={spring.standard}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl border border-white/60"
        style={{ maskImage: edge, WebkitMaskImage: edge }}
        animate={{ opacity: lit ? 1 : 0 }}
        transition={spring.standard}
      />

      {/* Content wrapper to stay above background effects */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default Card;
