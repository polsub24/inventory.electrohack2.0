import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}) => {
  const baseClasses = 'relative inline-flex items-center justify-center font-bold tracking-wider uppercase rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  const sizeClasses = {
    sm: 'py-2 px-3 text-[10px] leading-4',
    md: 'py-2.5 px-5 text-xs',
    lg: 'py-4 px-8 text-sm',
  };

  const variantClasses = {
    primary: 'bg-emerald-400 text-black hover:bg-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.3)] hover:shadow-[0_0_20px_rgba(52,211,153,0.5)] border border-emerald-300',
    secondary: 'bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white border border-white/10 backdrop-blur-sm',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40',
    ghost: 'bg-transparent text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/5',
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