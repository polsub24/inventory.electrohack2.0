import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`relative bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl p-5 sm:p-7 overflow-hidden group ${className}`}>
      {/* Subtle ambient light effect */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-amber-500/10 transition-colors duration-700 ease-in-out"></div>
      
      {/* Content wrapper to stay above background effects */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default Card;