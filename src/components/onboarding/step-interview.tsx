'use client'

import { useRef, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { QUESTIONS } from '@/lib/onboarding/questions'
import type { Message } from '@/types/onboarding'

interface StepInterviewProps {
  messages: Message[]
  currentQ: number
  input: string
  onInputChange: (v: string) => void
  onSubmitAnswer: (text: string) => void
  isMultiSelect: boolean
  multiSelectAnswers: string[]
  onToggleMultiSelect: (chip: string) => void
  onSubmitMultiSelect: () => void
  detectedAnswer: string | null
  hasAnalysisData: boolean
  isGenerating: boolean
}

/** Step 3: sidebar with progress + chat-style Q&A. */
export function StepInterview({
  messages,
  currentQ,
  input,
  onInputChange,
  onSubmitAnswer,
  isMultiSelect,
  multiSelectAnswers,
  onToggleMultiSelect,
  onSubmitMultiSelect,
  detectedAnswer,
  hasAnalysisData,
  isGenerating,
}: StepInterviewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const currentQuestion = !isGenerating ? QUESTIONS[currentQ] : null
  const chips = resolveChips(isGenerating, currentQuestion?.chips ?? [], detectedAnswer)

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <InterviewSidebar currentQ={currentQ} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', overflow: 'hidden' }}>
        <ChatMessages messages={messages} isGenerating={isGenerating} messagesEndRef={messagesEndRef} />

        {!isGenerating && (
          <InputBar
            chips={chips}
            input={input}
            onInputChange={onInputChange}
            onSubmitAnswer={onSubmitAnswer}
            isMultiSelect={isMultiSelect}
            multiSelectAnswers={multiSelectAnswers}
            onToggleMultiSelect={onToggleMultiSelect}
            onSubmitMultiSelect={onSubmitMultiSelect}
            detectedAnswer={detectedAnswer}
            hasAnalysisData={hasAnalysisData}
          />
        )}
      </div>
    </div>
  )
}

function resolveChips(
  isGenerating: boolean,
  questionChips: string[],
  detectedAnswer: string | null
): string[] {
  if (isGenerating) return []
  if (detectedAnswer) return [detectedAnswer]
  return questionChips
}

// --- Sidebar ---

function InterviewSidebar({ currentQ }: { currentQ: number }) {
  return (
    <div
      className="hidden md:flex"
      style={{
        width: '260px',
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        padding: '28px 24px',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <DecorativeRings />
      <SidebarHeader />

      <div style={{ position: 'relative', zIndex: 2, flex: 1 }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 500,
            color: 'rgba(236,232,225,0.4)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          Interview progress
        </div>

        {QUESTIONS.map((q, i) => (
          <SidebarQuestion key={q.id} label={q.text} index={i} currentQ={currentQ} />
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          fontSize: '11px',
          color: 'rgba(236,232,225,0.28)',
          lineHeight: 1.6,
          paddingTop: '20px',
        }}
      >
        Auto-detected answers are pre-filled. Edit anything that doesn&apos;t fit.
      </div>
    </div>
  )
}

function SidebarHeader() {
  return (
    <div style={{ position: 'relative', zIndex: 2, marginBottom: '28px' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '16px',
          color: '#ECE8E1',
          letterSpacing: '3px',
          marginBottom: '3px',
        }}
      >
        KONTUUR
      </div>
      <div style={{ fontSize: '7px', color: 'var(--color-terracotta)', letterSpacing: '5px' }}>
        SOCIAL INTELLIGENCE
      </div>
    </div>
  )
}

function SidebarQuestion({ label, index, currentQ }: { label: string; index: number; currentQ: number }) {
  const isDone = index < currentQ
  const isActive = index === currentQ

  const dotColor = isDone
    ? 'var(--status-ok)'
    : isActive
      ? 'var(--color-terracotta)'
      : 'rgba(236,232,225,0.18)'

  const textColor = isDone
    ? 'rgba(236,232,225,0.75)'
    : isActive
      ? '#ECE8E1'
      : 'rgba(236,232,225,0.35)'

  // Truncate long question labels for the sidebar
  const shortLabel = label.length > 40 ? `${label.slice(0, 40)}…` : label

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '7px 0',
        borderBottom: '0.5px solid rgba(236,232,225,0.07)',
      }}
    >
      <div
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          flexShrink: 0,
          background: dotColor,
        }}
      />
      <span
        style={{
          fontSize: '12px',
          color: textColor,
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {shortLabel}
      </span>
    </div>
  )
}

function DecorativeRings() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
      viewBox="0 0 260 620"
      fill="none"
    >
      <ellipse cx="240" cy="310" rx="200" ry="200" stroke="rgba(236,232,225,0.025)" strokeWidth="60" />
      <ellipse cx="240" cy="310" rx="130" ry="130" stroke="rgba(192,123,85,0.04)" strokeWidth="35" />
    </svg>
  )
}

// --- Chat ---

function ChatMessages({
  messages,
  isGenerating,
  messagesEndRef,
}: {
  messages: Message[]
  isGenerating: boolean
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {messages.map((msg, i) =>
        msg.role === 'ai' ? <AiMessage key={i} text={msg.text} /> : <UserMessage key={i} text={msg.text} />
      )}
      {isGenerating && <TypingIndicator />}
      <div ref={messagesEndRef} />
    </div>
  )
}

function AiMessage({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '7px',
          background: 'var(--sidebar-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <Pencil size={11} color="var(--color-terracotta)" strokeWidth={1.5} />
      </div>
      <div
        style={{
          background: '#F9F6F2',
          border: '0.5px solid var(--color-border-1)',
          borderRadius: '0 10px 10px 10px',
          padding: '12px 14px',
          maxWidth: '480px',
        }}
      >
        <p style={{ fontSize: '13px', color: 'var(--color-text-1)', lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0 }}>
          {text}
        </p>
      </div>
    </div>
  )
}

function UserMessage({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          background: 'var(--sidebar-bg)',
          color: '#ECE8E1',
          borderRadius: '10px 0 10px 10px',
          padding: '11px 14px',
          maxWidth: '440px',
          fontSize: '13px',
          lineHeight: 1.55,
        }}
      >
        {text}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '7px',
          background: 'var(--sidebar-bg)',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          background: '#F9F6F2',
          border: '0.5px solid var(--color-border-1)',
          borderRadius: '0 10px 10px 10px',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'var(--color-muted)',
                animation: `bounce-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Input Bar ---

function InputBar({
  chips,
  input,
  onInputChange,
  onSubmitAnswer,
  isMultiSelect,
  multiSelectAnswers,
  onToggleMultiSelect,
  onSubmitMultiSelect,
  detectedAnswer,
  hasAnalysisData,
}: {
  chips: string[]
  input: string
  onInputChange: (v: string) => void
  onSubmitAnswer: (text: string) => void
  isMultiSelect: boolean
  multiSelectAnswers: string[]
  onToggleMultiSelect: (chip: string) => void
  onSubmitMultiSelect: () => void
  detectedAnswer: string | null
  hasAnalysisData: boolean
}) {
  return (
    <div
      style={{
        borderTop: '0.5px solid var(--color-border-1)',
        padding: '14px 20px',
        background: 'var(--color-surface)',
        flexShrink: 0,
      }}
    >
      {hasAnalysisData && (
        <p
          style={{
            fontSize: '10px',
            color: 'var(--color-muted)',
            marginBottom: '8px',
            textAlign: 'center',
            letterSpacing: '0.3px',
          }}
        >
          Confirm the auto-detected answer or type your own
        </p>
      )}

      <ChipBar
        chips={chips}
        isMultiSelect={isMultiSelect}
        multiSelectAnswers={multiSelectAnswers}
        onToggleMultiSelect={onToggleMultiSelect}
        onSubmitAnswer={onSubmitAnswer}
        detectedAnswer={detectedAnswer}
      />

      <TextInputRow
        input={input}
        onInputChange={onInputChange}
        onSubmitAnswer={onSubmitAnswer}
        isMultiSelect={isMultiSelect}
        multiSelectAnswers={multiSelectAnswers}
        onToggleMultiSelect={onToggleMultiSelect}
        onSubmitMultiSelect={onSubmitMultiSelect}
      />
    </div>
  )
}

function ChipBar({
  chips,
  isMultiSelect,
  multiSelectAnswers,
  onToggleMultiSelect,
  onSubmitAnswer,
  detectedAnswer,
}: {
  chips: string[]
  isMultiSelect: boolean
  multiSelectAnswers: string[]
  onToggleMultiSelect: (chip: string) => void
  onSubmitAnswer: (text: string) => void
  detectedAnswer: string | null
}) {
  if (chips.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
      {chips.map((chip) => {
        if (isMultiSelect) {
          const selected = multiSelectAnswers.includes(chip)
          return (
            <button
              key={chip}
              type="button"
              onClick={() => onToggleMultiSelect(chip)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-colors',
                selected
                  ? 'border-[var(--color-terracotta)] text-[var(--color-terracotta)]'
                  : 'border-[var(--color-border-1)] text-[var(--color-text-1)] hover:border-[var(--color-terracotta)] hover:text-[var(--color-terracotta)]'
              )}
              style={{
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                background: selected ? 'rgba(192,123,85,0.08)' : 'transparent',
              }}
            >
              {chip}
            </button>
          )
        }

        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSubmitAnswer(chip)}
            className="text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              borderColor: detectedAnswer ? 'var(--color-terracotta)' : 'var(--color-border-1)',
              color: detectedAnswer ? 'var(--color-terracotta)' : 'var(--color-text-1)',
              background: detectedAnswer ? 'rgba(192,123,85,0.08)' : 'transparent',
            }}
          >
            {chip}
          </button>
        )
      })}
    </div>
  )
}

function TextInputRow({
  input,
  onInputChange,
  onSubmitAnswer,
  isMultiSelect,
  multiSelectAnswers,
  onToggleMultiSelect,
  onSubmitMultiSelect,
}: {
  input: string
  onInputChange: (v: string) => void
  onSubmitAnswer: (text: string) => void
  isMultiSelect: boolean
  multiSelectAnswers: string[]
  onToggleMultiSelect: (chip: string) => void
  onSubmitMultiSelect: () => void
}) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (isMultiSelect) {
      if (input.trim()) {
        onToggleMultiSelect(input.trim())
        onInputChange('')
      }
    } else {
      onSubmitAnswer(input)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      <input
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Or type your own answer..."
        style={{
          flex: 1,
          padding: '10px 13px',
          border: '0.5px solid var(--color-border-1)',
          borderRadius: '8px',
          fontSize: '13px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-text-1)',
          background: '#F9F6F2',
          outline: 'none',
        }}
      />
      {isMultiSelect ? (
        <Button onClick={onSubmitMultiSelect} disabled={multiSelectAnswers.length === 0} size="sm">
          Continue
        </Button>
      ) : (
        <Button onClick={() => onSubmitAnswer(input)} disabled={!input.trim()} size="sm">
          Confirm & next →
        </Button>
      )}
    </div>
  )
}
