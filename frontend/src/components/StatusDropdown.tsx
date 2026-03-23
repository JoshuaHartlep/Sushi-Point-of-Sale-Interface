import { useState, useRef, useEffect } from 'react';

interface StatusDropdownProps {
  currentStatus: string;
  orderId: number;
  onStatusChange: (orderId: number, newStatus: string) => void;
  isUpdating: boolean;
}

const statusOptions = [
  { value: 'pending',   label: 'Pending'   },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready',     label: 'Ready'     },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusStyles: Record<string, { pill: string; dot: string }> = {
  pending:   { pill: 'bg-secondary/10 text-secondary',           dot: 'bg-secondary'   },
  preparing: { pill: 'bg-primary/10 text-primary',               dot: 'bg-primary animate-pulse' },
  ready:     { pill: 'bg-tertiary/10 text-tertiary',             dot: 'bg-tertiary'    },
  completed: { pill: 'bg-surface-container-high text-on-surface-variant', dot: 'bg-on-surface-variant' },
  cancelled: { pill: 'bg-error/10 text-error',                   dot: 'bg-error'       },
};

const StatusDropdown = ({ currentStatus, orderId, onStatusChange, isUpdating }: StatusDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const style = statusStyles[currentStatus] ?? { pill: 'bg-surface-container text-on-surface-variant', dot: 'bg-on-surface-variant' };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !isUpdating && setIsOpen(!isOpen)}
        disabled={isUpdating}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${style.pill}`}
      >
        {isUpdating ? (
          <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        )}
        {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
        {!isUpdating && <span className="material-symbols-outlined text-[12px]">expand_more</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-44 rounded bg-surface-container-lowest dark:bg-sumi-800 border border-outline-variant/20 dark:border-sumi-700 shadow-lg z-20">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onStatusChange(orderId, opt.value); setIsOpen(false); }}
              className={`flex items-center gap-2 w-full text-left px-4 py-2.5 text-xs font-medium text-on-surface hover:bg-surface-container-low dark:hover:bg-sumi-700 transition-colors ${opt.value === currentStatus ? 'bg-surface-container-low dark:bg-sumi-700' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${(statusStyles[opt.value] ?? { dot: 'bg-on-surface-variant' }).dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StatusDropdown;
