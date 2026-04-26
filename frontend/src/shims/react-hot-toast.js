const emitToast = (level, message) => {
  if (typeof window !== 'undefined') {
    const detail = { level, message: String(message || '') };
    window.dispatchEvent(new CustomEvent('codex:toast', { detail }));
  }
  return String(message || '');
};

export const toast = Object.assign(
  (message) => emitToast('default', message),
  {
    success: (message) => emitToast('success', message),
    error: (message) => emitToast('error', message),
    info: (message) => emitToast('info', message),
    warning: (message) => emitToast('warning', message),
    dismiss: () => undefined
  }
);

export default toast;
