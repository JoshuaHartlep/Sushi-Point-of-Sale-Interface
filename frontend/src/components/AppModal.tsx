import { ReactNode, useEffect } from 'react';

interface AppModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
  zIndexClassName?: string;
  contentClassName?: string;
  closeOnBackdrop?: boolean;
}

export default function AppModal({
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
  zIndexClassName = 'z-50',
  contentClassName = 'space-y-4',
  closeOnBackdrop = true,
}: AppModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 ${zIndexClassName}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`bg-surface-container-lowest dark:bg-sumi-800 rounded-xl w-full ${maxWidthClassName} max-h-[90vh] flex flex-col border border-outline-variant/20 dark:border-sumi-700 shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-6 py-4 bg-surface-container-lowest dark:bg-sumi-800 border-b border-outline-variant/10 dark:border-sumi-700 flex justify-between items-center">
          <h2 className="text-2xl font-headline text-on-surface">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto px-6 py-4 ${contentClassName}`}>
          {children}
        </div>

        {footer ? (
          <div className="sticky bottom-0 z-10 px-6 py-4 bg-surface-container-lowest dark:bg-sumi-800 border-t border-outline-variant/10 dark:border-sumi-700 shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
