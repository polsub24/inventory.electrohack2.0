import React from 'react';

interface SparkAnimationProps {
  x: number;
  y: number;
  onComplete: () => void;
}

const generateSparkPaths = () => {
    const paths = [];
    const numLines = 7;
    for (let i = 0; i < numLines; i++) {
        const angle = (i / numLines) * 2 * Math.PI;
        const length1 = 15 + Math.random() * 15;
        const length2 = length1 * (0.4 + Math.random() * 0.4);
        const bendAngle = (Math.random() - 0.5) * (Math.PI / 2);

        const p1x = 0;
        const p1y = 0;
        const p2x = Math.cos(angle) * length2;
        const p2y = Math.sin(angle) * length2;
        const p3x = Math.cos(angle + bendAngle) * length1;
        const p3y = Math.sin(angle + bendAngle) * length1;
        
        paths.push(`${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
    }
    return paths;
};

const SparkAnimation: React.FC<SparkAnimationProps> = ({ x, y, onComplete }) => {
  const sparkPaths = React.useMemo(() => generateSparkPaths(), []);

  return (
    <div 
      className="fixed pointer-events-none z-[100]" 
      style={{ left: x, top: y }}
      onAnimationEnd={onComplete}
    >
      <svg 
        className="spark"
        width="80" 
        height="80" 
        viewBox="-40 -40 80 80"
      >
        <defs>
            <filter id="spark-glow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        <g filter="url(#spark-glow)">
          {sparkPaths.map((path, i) => (
             <polyline 
                key={i}
                points={path}
                fill="none"
                stroke={i % 2 === 0 ? "#FFFF00" : "#FFFFFF"}
                strokeWidth={1.5}
                strokeLinecap="round"
             />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default SparkAnimation;