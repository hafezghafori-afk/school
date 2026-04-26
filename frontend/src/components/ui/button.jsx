import React from 'react';

const Button = React.forwardRef(({ 
  className = '', 
  variant = 'default',
  size = 'default',
  children,
  disabled = false,
  type = 'button',
  ...props 
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    ghost: 'hover:bg-gray-100',
    link: 'text-blue-600 underline-offset-4 hover:underline'
  };
  
  const sizes = {
    default: 'h-8 px-3 py-1 text-sm',
    sm: 'h-7 rounded-md px-2 text-xs',
    lg: 'h-10 rounded-md px-6 text-base',
    icon: 'h-8 w-8'
  };

  const classes = `${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`;

  return (
    <button
      className={classes}
      ref={ref}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export { Button };
