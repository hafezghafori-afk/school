import React from 'react';

function createIcon(displayName) {
  const Icon = React.forwardRef(({ className = '', ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  ));

  Icon.displayName = displayName;
  return Icon;
}

export const AlertCircle = createIcon('AlertCircle');
export const AlertTriangle = createIcon('AlertTriangle');
export const ArrowRight = createIcon('ArrowRight');
export const Beaker = createIcon('Beaker');
export const BookOpen = createIcon('BookOpen');
export const Calendar = createIcon('Calendar');
export const CalendarDays = createIcon('CalendarDays');
export const CheckCircle = createIcon('CheckCircle');
export const Clock = createIcon('Clock');
export const Clock3 = createIcon('Clock3');
export const Download = createIcon('Download');
export const Dumbbell = createIcon('Dumbbell');
export const Edit = createIcon('Edit');
export const Edit3 = createIcon('Edit3');
export const Eye = createIcon('Eye');
export const EyeOff = createIcon('EyeOff');
export const FileText = createIcon('FileText');
export const Filter = createIcon('Filter');
export const GraduationCap = createIcon('GraduationCap');
export const Grid3X3 = createIcon('Grid3X3');
export const History = createIcon('History');
export const List = createIcon('List');
export const Monitor = createIcon('Monitor');
export const PencilLine = createIcon('PencilLine');
export const Plus = createIcon('Plus');
export const Printer = createIcon('Printer');
export const RefreshCw = createIcon('RefreshCw');
export const Save = createIcon('Save');
export const Search = createIcon('Search');
export const Settings = createIcon('Settings');
export const Swap = createIcon('Swap');
export const Trash2 = createIcon('Trash2');
export const Undo = createIcon('Undo');
export const UserCheck = createIcon('UserCheck');
export const UserX = createIcon('UserX');
export const Users = createIcon('Users');
export const Wand2 = createIcon('Wand2');
export const X = createIcon('X');
export const XCircle = createIcon('XCircle');
