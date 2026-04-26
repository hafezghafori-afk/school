import React from 'react';

const Badge = React.forwardRef(({ 
  className = '', 
  variant = 'default',
  children,
  ...props 
}, ref) => {
  const baseClasses = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
  
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    secondary: 'bg-gray-200 text-gray-900',
    destructive: 'bg-red-100 text-red-800',
    outline: 'text-gray-800 border border-gray-300',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800'
  };
  
  const classes = `${baseClasses} ${variants[variant] || variants.default} ${className}`;

  return (
    <div
      className={classes}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  );
});

Badge.displayName = 'Badge';

export { Badge };
