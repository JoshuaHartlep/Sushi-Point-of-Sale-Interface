import { AlertCircle, Loader2 } from 'lucide-react';
import AppModal from './AppModal';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isPending?: boolean;
  error?: string;
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isPending = false,
  error,
}: ConfirmationModalProps) => {
  if (!isOpen) return null;

  return (
    <AppModal
      title={<span className="text-xl font-semibold text-on-surface">{title}</span>}
      onClose={onClose}
      footer={(
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 bg-error text-on-error rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              confirmText
            )}
          </button>
        </div>
      )}
    >
      <p className="text-on-surface-variant">{message}</p>

      {error && (
        <div className="p-3 bg-error/10 text-error rounded-md flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
    </AppModal>
  );
};

export default ConfirmationModal; 