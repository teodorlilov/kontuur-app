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
export function WizardFooter({ onBack, onNext, onSkip, onGenerate, nextDisabled, skipLabel }: WizardFooterProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '30px',
        paddingTop: '22px',
        borderTop: '0.5px solid rgba(44,62,80,0.07)',
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
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px',
        background: '#F0EDE8',
        border: '1px solid #D4CEC7',
        borderRadius: '9px',
        fontSize: '12px',
        fontWeight: 500,
        color: '#3A4A54',
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
      type="button"
      onClick={onClick}
      style={{
        fontSize: '12px',
        fontWeight: 500,
        color: '#8A8070',
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
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 24px',
        background: '#C07B55',
        color: '#fff',
        border: 'none',
        borderRadius: '9px',
        fontSize: '12px',
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 24px',
        background: disabled ? 'rgba(44,62,80,0.3)' : '#1A2630',
        color: '#ECE8E1',
        border: 'none',
        borderRadius: '9px',
        fontSize: '12px',
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
