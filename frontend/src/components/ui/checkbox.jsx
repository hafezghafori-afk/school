import React from 'react';

const Checkbox = React.forwardRef(({ 
  className = '', 
  checked = false,
  onCheckedChange,
  disabled = false,
  id,
  ...props 
}, ref) => {
  const handleChange = (e) => {
    onCheckedChange?.(e.target.checked);
  };

  const baseClasses = 'peer h-3 w-3 shrink-0 rounded-sm border border-gray-300 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white';
  
  const classes = `${baseClasses} ${className}`;

  return (
    <input
      type="checkbox"
      className={classes}
      ref={ref}
      checked={checked}
      onChange={handleChange}
      disabled={disabled}
      id={id}
      {...props}
    />
  );
});

Checkbox.displayName = 'Checkbox';

export { Checkbox };
