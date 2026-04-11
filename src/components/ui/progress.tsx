type ProgressVariant = 'default' | 'success' | 'warning' | 'error'

interface ProgressProps {
  value: number // 0–100
  variant?: ProgressVariant
  className?: string
}

const fillColors: Record<ProgressVariant, string> = {
  default: 'var(--color-brand-accent)',
  success: '#1D9E75',
  warning: '#BA7517',
  error: '#E24B4A',
}

export function Progress({ value, variant = 'default', className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: 5,
        background: 'var(--color-sunken)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          borderRadius: 'var(--radius-full)',
          background: fillColors[variant],
          transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </div>
  )
}
