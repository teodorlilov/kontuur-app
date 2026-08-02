'use client'

import { useRef, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { QUESTIONS } from '@/features/onboarding/lib/questions'
import type { Message } from '@/features/onboarding/types'

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

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <ChatMessages
          messages={messages}
          isGenerating={isGenerating}
          messagesEndRef={messagesEndRef}
        />

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
        background: 'var(--forest-deep)',
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
          className="text-label"
          style={{
            fontWeight: 500,
            color: 'rgba(242,245,241,0.4)',
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
        className="text-micro"
        style={{
          position: 'relative',
          zIndex: 2,
          color: 'rgba(242,245,241,0.28)',
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
        className="text-title"
        style={{
          fontFamily: 'var(--font-display)',
          color: '#f2f5f1',
          letterSpacing: '3px',
          marginBottom: '3px',
        }}
      >
        KONTUUR
      </div>
      {/* Lime as a figure on the Pine Deep rail — 10.87:1, and part of the
          wordmark lockup, which is exempt from the one-per-band count. */}
      <div
        className="text-label tracking-normal"
        style={{ color: 'var(--accent)', letterSpacing: '5px' }}
      >
        SOCIAL INTELLIGENCE
      </div>
    </div>
  )
}

function SidebarQuestion({
  label,
  index,
  currentQ,
}: {
  label: string
  index: number
  currentQ: number
}) {
  const isDone = index < currentQ
  const isActive = index === currentQ

  // On the Pine Deep rail the relationship inverts: lime is the figure, and the
  // question you are on is the rail's one lime answer (10.87:1). Done steps take
  // Living Green Lite, which is the spring that stays legible on dark.
  const dotColor = isDone
    ? 'var(--spring-lite)'
    : isActive
      ? 'var(--accent)'
      : 'rgba(242,245,241,0.18)'

  const textColor = isDone
    ? 'rgba(242,245,241,0.75)'
    : isActive
      ? '#f2f5f1'
      : 'rgba(242,245,241,0.35)'

  // Truncate long question labels for the sidebar
  const shortLabel = label.length > 40 ? `${label.slice(0, 40)}…` : label

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '7px 0',
        borderBottom: '1px solid rgba(242,245,241,0.07)',
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
        className="text-caption"
        style={{
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
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
      }}
      viewBox="0 0 260 620"
      fill="none"
    >
      <ellipse
        cx="240"
        cy="310"
        rx="200"
        ry="200"
        stroke="rgba(242,245,241,0.025)"
        strokeWidth="60"
      />
      <ellipse
        cx="240"
        cy="310"
        rx="130"
        ry="130"
        stroke="rgba(46,158,104,0.04)"
        strokeWidth="35"
      />
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
        msg.role === 'ai' ? (
          <AiMessage key={i} text={msg.text} />
        ) : (
          <UserMessage key={i} text={msg.text} />
        )
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
          background: 'var(--forest-deep)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <Pencil size={11} color="var(--forest)" strokeWidth={1.5} />
      </div>
      <div
        style={{
          background: 'var(--sunken)',
          border: '1px solid var(--line)',
          borderRadius: '0 10px 10px 10px',
          padding: '12px 14px',
          maxWidth: '480px',
        }}
      >
        <p
          className="text-body"
          style={{ color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0 }}
        >
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
        className="text-body"
        style={{
          background: 'var(--forest-deep)',
          color: '#f2f5f1',
          borderRadius: '10px 0 10px 10px',
          padding: '11px 14px',
          maxWidth: '440px',
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
          background: 'var(--forest-deep)',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          background: 'var(--sunken)',
          border: '1px solid var(--line)',
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
                background: 'var(--text2)',
                animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
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
        borderTop: '1px solid var(--line)',
        padding: '14px 20px',
        background: 'var(--surface)',
        flexShrink: 0,
      }}
    >
      {hasAnalysisData && (
        <p
          className="text-label tracking-normal"
          style={{
            color: 'var(--text2)',
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
                'text-caption px-3 py-1.5 rounded-full border transition-colors',
                selected
                  ? 'border-[var(--forest)] text-[var(--forest)]'
                  : 'border-[var(--line)] text-[var(--ink)] hover:border-[var(--forest)] hover:text-[var(--forest)]'
              )}
              style={{
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                background: selected ? 'rgba(46,158,104,0.08)' : 'transparent',
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
            className="text-caption px-3 py-1.5 rounded-full border transition-colors"
            style={{
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              borderColor: detectedAnswer ? 'var(--forest)' : 'var(--line)',
              color: detectedAnswer ? 'var(--forest)' : 'var(--ink)',
              background: detectedAnswer ? 'rgba(46,158,104,0.08)' : 'transparent',
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
        className="text-body"
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Or type your own answer..."
        style={{
          flex: 1,
          padding: '10px 13px',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--ink)',
          background: 'var(--sunken)',
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
