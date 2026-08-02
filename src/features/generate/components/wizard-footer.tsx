'use client'

interface WizardFooterProps {
  onBack?: () => void
  onNext?: () => void
  onSkip?: () => void
  onGenerate?: () => void
  nextDisabled?: boolean
  skipLabel?: string
}

/** Shared footer for wizard steps with Back / Skip / Generate / Next buttons. */
export function WizardFooter({
  onBack,
  onNext,
  onSkip,
  onGenerate,
  nextDisabled,
  skipLabel,
}: WizardFooterProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '30px',
        paddingTop: '22px',
        borderTop: '1px solid rgba(15,21,18,0.07)',
      }}
    >
      <div>{onBack && <BackButton onClick={onBack} />}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onSkip && <SkipButton onClick={onSkip} label={skipLabel ?? 'Skip for now'} />}
        {onGenerate && <GenerateButton onClick={onGenerate} />}
        {onNext && <NextButton onClick={onNext} disabled={nextDisabled} />}
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="text-caption"
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px',
        background: 'var(--sunken)',
        border: '1px solid var(--line2)',
        borderRadius: '9px',
        fontWeight: 500,
        color: 'var(--text2)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      ← Back
    </button>
  )
}

function SkipButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      className="text-caption"
      type="button"
      onClick={onClick}
      style={{
        fontWeight: 500,
        color: 'var(--text2)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

function GenerateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="text-caption"
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 24px',
        background: 'var(--spring-text)',
        color: '#fff',
        border: 'none',
        borderRadius: '9px',
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.15s',
      }}
    >
      ⚡ Generate posts
    </button>
  )
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="text-caption"
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 24px',
        background: disabled ? 'rgba(15,21,18,0.3)' : 'var(--forest-deep)',
        color: '#f2f5f1',
        border: 'none',
        borderRadius: '9px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      Next →
    </button>
  )
}
