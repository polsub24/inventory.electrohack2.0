import React, { useId } from 'react';

const TRACE = '#1b6b53';

interface PcbTracesProps {
  className?: string;
}

/**
 * Tiling 1px PCB trace pattern, rendered inline rather than loaded as a bitmap so it
 * stays crisp at any density and can be masked by the cursor spotlight.
 */
const PcbTraces: React.FC<PcbTracesProps> = ({ className = '' }) => {
  const patternId = `pcb-${useId()}`;

  return (
    <svg aria-hidden="true" className={className} width="100%" height="100%">
      <defs>
        <pattern id={patternId} width="120" height="120" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={TRACE} strokeWidth="1" strokeLinecap="square">
            <path d="M0 30 H44 l12 -12 H120" />
            <path d="M0 90 H28 l14 14 H76 l12 -12 H120" />
            <path d="M20 0 V26 l10 10 V64 l-10 10 V120" />
            <path d="M92 0 V40 l-12 12 V104 l10 10 V120" />
            <path d="M56 18 V0" />
            <path d="M68 52 H80" />
            <path d="M42 104 V120" />
          </g>
          <g fill={TRACE}>
            <circle cx="20" cy="30" r="3" />
            <circle cx="56" cy="18" r="3" />
            <circle cx="80" cy="52" r="3" />
            <circle cx="42" cy="104" r="3" />
            <rect x="100" y="26" width="8" height="8" />
            <rect x="8" y="86" width="8" height="8" />
          </g>
          <g fill="#000000">
            <circle cx="20" cy="30" r="1.1" />
            <circle cx="56" cy="18" r="1.1" />
            <circle cx="80" cy="52" r="1.1" />
            <circle cx="42" cy="104" r="1.1" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};

export default PcbTraces;
