import React, { useState, useEffect, useMemo } from 'react';

const generatePcbPath = (width: number, height: number): string => {
  const segments = 10 + Math.floor(Math.random() * 10);
  let x = Math.random() * width;
  let y = Math.random() * height;
  let path = `M ${x} ${y}`;
  let lastMove: 'h' | 'v' = Math.random() > 0.5 ? 'h' : 'v';

  for (let i = 0; i < segments; i++) {
    const length = 50 + Math.random() * 150;
    
    if (lastMove === 'h') { // Move vertically
      y += (Math.random() > 0.5 ? 1 : -1) * length;
      y = Math.max(0, Math.min(height, y)); // Clamp to screen bounds
      path += ` V ${y}`;
      lastMove = 'v';
    } else { // Move horizontally
      x += (Math.random() > 0.5 ? 1 : -1) * length;
      x = Math.max(0, Math.min(width, x)); // Clamp to screen bounds
      path += ` H ${x}`;
      lastMove = 'h';
    }
  }
  return path;
};

const BackgroundLines: React.FC = () => {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const paths = useMemo(() => {
    if (windowSize.width === 0) return [];
    return Array.from({ length: 15 }, () => ({
      d: generatePcbPath(windowSize.width, windowSize.height),
      duration: 8 + Math.random() * 12, // 8s to 20s duration
      delay: -(Math.random() * 15),   // Random start point in animation
      reverse: Math.random() > 0.5
    }));
  }, [windowSize.width, windowSize.height]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-950/80 to-black opacity-95"></div>
      
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#8B4513', stopOpacity: 0 }} />
            <stop offset="20%" style={{ stopColor: '#D2691E', stopOpacity: 0.8 }} />
            <stop offset="50%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
            <stop offset="80%" style={{ stopColor: '#D2691E', stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: '#8B4513', stopOpacity: 0 }} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <g stroke="url(#lineGrad)" strokeWidth="2" fill="none" filter="url(#glow)" opacity="0.7">
          {paths.map((path, index) => (
             <path 
                key={index}
                d={path.d}
                className="circuit-line" 
                style={{ 
                    animationDuration: `${path.duration}s`, 
                    animationDelay: `${path.delay}s`,
                    animationDirection: path.reverse ? 'reverse' : 'normal'
                }} 
             />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default BackgroundLines;