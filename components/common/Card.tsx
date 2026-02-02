
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-gray-800/60 backdrop-blur-md shadow-lg rounded-xl p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
};

export default Card;
