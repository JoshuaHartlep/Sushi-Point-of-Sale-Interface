interface ProgressLoaderProps {
  progress: number;
  message?: string;
}

function getDefaultMessage(progress: number): string {
  if (progress < 25) return 'Initializing system…';
  if (progress < 50) return 'Connecting to backend…';
  if (progress < 80) return 'Fetching data…';
  return 'Finalizing…';
}

export default function ProgressLoader({ progress, message }: ProgressLoaderProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-sm font-medium text-on-surface">
        {message ?? getDefaultMessage(clamped)}
      </p>
      <div className="w-56 h-1 bg-surface-container-high rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full"
          style={{
            width: `${clamped}%`,
            transition: 'width 300ms ease-out',
          }}
        />
      </div>
      <p className="text-xs text-on-surface-variant/50 tabular-nums">
        {Math.round(clamped)}%
      </p>
    </div>
  );
}
