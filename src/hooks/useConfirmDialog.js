import { useCallback, useState } from 'react';
import Modal from '../components/Modal.jsx';

const ICON_BY_INTENT = {
  danger: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M3.98 20h16.04a1.5 1.5 0 0 0 1.3-2.25L13.3 4.25a1.5 1.5 0 0 0-2.6 0L2.68 17.75A1.5 1.5 0 0 0 3.98 20Z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0-8h.01" />
    </svg>
  ),
};

const BADGE_CLASS_BY_INTENT = {
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
};

export default function useConfirmDialog() {
  const [dialog, setDialog] = useState({
    open: false,
    title: '',
    message: '',
    intent: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    resolve: null,
  });

  const closeDialog = useCallback(
    (result) => {
      const resolver = dialog.resolve;
      setDialog((prev) => ({ ...prev, open: false, resolve: null }));
      if (typeof resolver === 'function') resolver(result);
    },
    [dialog.resolve]
  );

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({
        open: true,
        title: options?.title || 'Confirm action',
        message: options?.message || 'Are you sure?',
        intent: options?.intent || 'warning',
        confirmText: options?.confirmText || 'Confirm',
        cancelText: options?.cancelText || 'Cancel',
        resolve,
      });
    });
  }, []);

  const ConfirmDialog = (
    <Modal open={dialog.open} onClose={() => closeDialog(false)}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${BADGE_CLASS_BY_INTENT[dialog.intent] || BADGE_CLASS_BY_INTENT.warning}`}>
              {ICON_BY_INTENT[dialog.intent] || ICON_BY_INTENT.warning}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{dialog.title}</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{dialog.message}</p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => closeDialog(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {dialog.cancelText}
            </button>
            <button
              type="button"
              onClick={() => closeDialog(true)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium text-white ${
                dialog.intent === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : dialog.intent === 'info'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {dialog.confirmText}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );

  return { confirm, ConfirmDialog };
}
