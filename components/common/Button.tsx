
import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}) => {
  const baseClasses = 'font-bold rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition ease-in-out duration-150 uppercase tracking-wider';

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2 px-4 text-sm',
    lg: 'py-3 px-6 text-base',
  };

  const variantClasses = {
    primary: 'bg-amber-500 text-black hover:bg-amber-400 focus:ring-amber-500',
    secondary: 'bg-gray-700 text-amber-400 border border-amber-900/50 hover:bg-gray-600 focus:ring-amber-500',
    danger: 'bg-red-900/80 text-white hover:bg-red-800 focus:ring-red-500 border border-red-500/20',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
