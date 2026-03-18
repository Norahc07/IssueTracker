import { createPortal } from 'react-dom';

// Render to document.body to avoid being clipped/stacked under parent containers.
// Use a very high z-index so modals appear above drawers/sidebars/popovers.
export default function Modal({ open, onClose, children, zIndexClassName = 'z-[2147483647]' }) {
  if (!open) return null;
  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} bg-black/60 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 2147483647 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="min-h-[100dvh] w-full p-4 flex items-center justify-center">
        {children}
      </div>
    </div>,
    document.body
  );
}
