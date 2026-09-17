import React from 'react';
import Galaxy from './Galaxy';

// Galaxy re-runs its WebGL setup whenever these props change identity, and array
// literals would be new on every render — so they live at module scope.
const FOCAL: [number, number] = [0.5, 0.5];
const ROTATION: [number, number] = [1.0, 0.0];

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-viewport Galaxy layer.
 *
 * Memoised with no props: InventoryContext re-renders the tree every 2s on its poll,
 * and without this the canvas would tear down and re-initialise on every one of them.
 */
const GalaxyBackground: React.FC = () => (
  <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
    <Galaxy
      focal={FOCAL}
      rotation={ROTATION}
      density={0.9}
      // Every star sits in a narrow band around 125° — yellow-green through
      // spring-green, no other hues — and cannot desaturate to white.
      hueShift={125}
      hueSpread={0.06}
      saturation={1.0}
      satFloor={0.55}
      glowIntensity={0.35}
      twinkleIntensity={0.25}
      rotationSpeed={0.04}
      starSpeed={0.3}
      speed={0.7}
      mouseInteraction={!prefersReducedMotion}
      mouseRepulsion={false}
      disableAnimation={prefersReducedMotion}
      transparent
    />
  </div>
);

export default React.memo(GalaxyBackground);
