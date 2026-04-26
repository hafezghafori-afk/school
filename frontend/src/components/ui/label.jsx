import React from 'react';

const Label = React.forwardRef(({ 
  className = '', 
  children,
  htmlFor,
  ...props 
}, ref) => {
  const baseClasses = 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';
  
  const classes = `${baseClasses} ${className}`;

  return (
    <label
      className={classes}
      ref={ref}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
    </label>
  );
});

Label.displayName = 'Label';

export { Label };
