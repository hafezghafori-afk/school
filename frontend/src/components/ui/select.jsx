import React, { useEffect, useMemo, useRef, useState } from 'react';
import './select.css';

const Select = React.forwardRef(({ 
  className = '', 
  children,
  value,
  onValueChange,
  disabled = false,
  size = 'md',
  ...props 
}, ref) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const childArray = React.Children.toArray(children);

  const triggerNode = childArray.find((child) => child?.type?.displayName === 'SelectTrigger');
  const contentNode = childArray.find((child) => child?.type?.displayName === 'SelectContent');

  const optionNodes = useMemo(() => {
    const contentChildren = React.Children.toArray(contentNode?.props?.children || []);
    return contentChildren.filter((child) => child?.type?.displayName === 'SelectItem');
  }, [contentNode]);

  const selectedOption = optionNodes.find((child) => child?.props?.value === value);
  const hasSelection = value !== undefined && value !== null && value !== '' && Boolean(selectedOption);

  const placeholder = useMemo(() => {
    const triggerChildren = React.Children.toArray(triggerNode?.props?.children || []);
    const valueNode = triggerChildren.find((child) => child?.type?.displayName === 'SelectValue');
    return valueNode?.props?.placeholder || 'انتخاب کنید';
  }, [triggerNode]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (newValue) => {
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="ui-select-root relative" dir="rtl">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        className={`ui-select-trigger ui-select-trigger--${size} flex h-9 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-right ring-offset-background placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${triggerNode?.props?.className || ''} ${className}`}
        onClick={() => setOpen(!open)}
        disabled={disabled}
        ref={ref}
        {...props}
      >
        <span className={`ui-select-value block truncate pl-2 ${hasSelection ? '' : 'is-placeholder'}`}>
          {hasSelection ? selectedOption?.props?.children : placeholder}
        </span>
        <svg
          className="ui-select-icon mr-2 h-3.5 w-3.5 shrink-0 opacity-60"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {open && (
        <div className="ui-select-menu absolute top-full z-50 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="max-h-40 overflow-auto p-1">
            {optionNodes.map((child) => (
              <button
                key={child.props.value}
                type="button"
                onClick={() => handleSelect(child.props.value)}
                className={`ui-select-option relative flex w-full cursor-pointer select-none items-center justify-start rounded-sm px-2 py-1.5 text-right text-sm outline-none hover:bg-gray-100 focus:bg-gray-100 ${child.props.value === value ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700'}`}
              >
                <span className="truncate">{child.props.children}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

Select.displayName = 'Select';

const SelectTrigger = React.forwardRef(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    {children}
  </div>
));

SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = React.forwardRef(({ placeholder, className = '', ...props }, ref) => (
  <span ref={ref} className={className} {...props}>
    {placeholder}
  </span>
));

SelectValue.displayName = 'SelectValue';

const SelectContent = React.forwardRef(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    {children}
  </div>
));

SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    {children}
  </div>
));

SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
