'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { serializePillars } from '@/lib/clients/content-pillars'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import { PillarEditor } from '@/features/generate/components/pillar-editor'
import type { UrlAnalysisResponse } from '@/types/api'
import { WEEKDAY_OPTIONS } from '@/utils/constants'

// --- Types ---

interface Question {
  id: string
  text: string
  chips: string[]
  multiSelect?: boolean
  confirmationText?: (detected: string) => string
}

interface Message {
  role: 'ai' | 'user'
  text: string
}

interface RecommendedPlatform {
  platform: string
  priority: string
  reason: string
}

interface OnboardProfile {
  niche: string
  niche_reasoning: string
  target_audience: string[]
  social_goals: string[]
  content_pillars: WeightedPillar[]
  content_pillars_reasoning: string
  tone: string
  avoid_topics: string
  client_testimonial_voice: string
  recommended_platforms: RecommendedPlatform[]
  platform_reasoning: string
  is_health_niche: boolean
  suggested_post_frequency: string
  language: string
  language_formality: string
  contact_email: string
}

// --- Questions ---

const QUESTIONS: Question[] = [
  {
    id: 'q0',
    text: 'What\'s the name of this client or business?',
    chips: [],
  },
  {
    id: 'q1',
    text: 'Describe what your client does — include specific services, products, or specialties.',
    chips: [
      'Medical clinic / doctor',
      'Restaurant / café',
      'Fitness studio / gym',
      'Beauty salon / spa',
      'Online shop / e-commerce',
      'Consulting / coaching',
    ],
  },
  {
    id: 'q2',
    text: 'Who follows them or should follow them? Think about who actually buys from them.',
    chips: [
      'Women 25–45, health-conscious',
      'Local residents nearby',
      'Business owners / professionals',
      'Young adults 18–30 on social media',
    ],
  },
  {
    id: 'q3',
    text: 'What should a good post make someone do?',
    chips: [
      'Book an appointment / visit',
      'Buy a product online',
      'Follow and engage',
      'Learn something and trust the brand',
    ],
  },
  {
    id: 'q4',
    text: 'Pick an example that sounds closest to how this client should post.',
    chips: [
      'Warm and approachable — like a friend giving advice',
      'Expert and trustworthy — like a doctor explaining',
      'Energetic and bold — like a coach motivating',
      'Polished and elegant — like a luxury brand',
    ],
  },
  {
    id: 'q4b',
    text: 'What language should posts be in, and how formal?',
    chips: [
      'English — professional (you)',
      'English — casual (hey, you guys)',
      'Bulgarian — formal (Вие)',
      'Bulgarian — casual (ти)',
      'Spanish — formal (usted)',
      'Spanish — casual (tú)',
    ],
  },
  {
    id: 'q5',
    text: 'What should we never post about? Any sensitive topics for this client?',
    chips: [
      'No medical/health claims',
      'No politics or religion',
      'No competitor mentions',
      'No price discussions',
      'No before/after photos',
    ],
  },
  {
    id: 'q6',
    text: 'If their best customer left a review, what would they say? Be specific.',
    chips: [
      'They changed my life / health',
      'Best experience in the city',
      'I trust them completely',
      'They actually listen to what I need',
    ],
  },
  {
    id: 'q7',
    text: 'What types of posts should we create? Pick the content pillars.',
    chips: [
      'Services & offers',
      'Educational / tips',
      'Behind the scenes',
      'Client results / testimonials',
    ],
    multiSelect: true,
  },
]

// Map analysis fields to question IDs
function getDetectedAnswer(
  questionId: string,
  analysis: UrlAnalysisResponse | null
): string | null {
  if (!analysis) return null
  switch (questionId) {
    case 'q0':
      return analysis.detected_business_name || null
    case 'q1':
      return analysis.detected_niche || null
    case 'q2':
      return analysis.detected_target_audience?.length
        ? analysis.detected_target_audience.join(', ')
        : null
    case 'q4':
      return analysis.detected_tone || null
    case 'q4b': {
      if (!analysis.detected_language) return null
      return `${analysis.detected_language} — ${analysis.detected_language_formality}`
    }
    case 'q5':
      return analysis.detected_avoid_topics || null
    case 'q6':
      return analysis.detected_testimonial_voice || null
    case 'q7':
      return analysis.detected_content_pillars?.length
        ? analysis.detected_content_pillars.map((p) => p.pillar).join(', ')
        : null
    default:
      return null
  }
}

// --- Main Component ---

export function ClientOnboarding() {
  const router = useRouter()
  const [stage, setStage] = useState<
    'url-input' | 'analyzing' | 'interview' | 'generating' | 'review'
  >('url-input')
  const [currentQ, setCurrentQ] = useState(0)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: QUESTIONS[0]!.text },
  ])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [input, setInput] = useState('')
  const [profile, setProfile] = useState<OnboardProfile | null>(null)
  const [clientName, setClientName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editSection, setEditSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // URL analysis state
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [analysisData, setAnalysisData] = useState<UrlAnalysisResponse | null>(null)
  const [analyzeProgress, setAnalyzeProgress] = useState('')

  // Multi-select state for Q7
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<string[]>([])

  // Posting schedule state
  const [scheduleFreqType, setScheduleFreqType] = useState('per_week')
  const [scheduleFreqValue, setScheduleFreqValue] = useState('3')
  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleTime, setScheduleTime] = useState('09:00')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleAnalyzeUrl() {
    if (!websiteUrl.trim() && !instagramHandle.trim()) {
      toast.error('Please enter a website URL or Instagram handle')
      return
    }

    setStage('analyzing')
    setAnalyzeProgress('Fetching content...')

    try {
      const res = await fetch('/api/ai/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim() || undefined,
          instagramHandle: instagramHandle.trim() || undefined,
        }),
      })

      setAnalyzeProgress('Analyzing brand presence...')

      if (res.ok) {
        const data = (await res.json()) as UrlAnalysisResponse
        setAnalysisData(data)
        toast.success('Brand analysis complete')
      } else {
        toast.error('Could not analyze the provided URLs — continuing manually')
      }
    } catch {
      toast.error('Analysis failed — continuing manually')
    }

    setStage('interview')
  }

  function handleSkipAnalysis() {
    setStage('interview')
  }

  function submitAnswer(text: string) {
    if (!text.trim()) return

    const qId = QUESTIONS[currentQ]!.id
    const newAnswers = { ...answers, [qId]: text }
    setAnswers(newAnswers)

    const newMessages: Message[] = [...messages, { role: 'user', text }]

    if (currentQ < QUESTIONS.length - 1) {
      const nextQ = currentQ + 1
      setCurrentQ(nextQ)

      // Build question text with detected answer context
      const detected = getDetectedAnswer(QUESTIONS[nextQ]!.id, analysisData)
      const questionText = detected
        ? `${QUESTIONS[nextQ]!.text}\n\nBased on their website, we think: "${detected}"`
        : QUESTIONS[nextQ]!.text

      setMessages([...newMessages, { role: 'ai', text: questionText }])
    } else {
      setMessages([
        ...newMessages,
        { role: 'ai', text: 'Building your client profile...' },
      ])
      setStage('generating')
      generateProfile(newAnswers)
    }

    setInput('')
    setMultiSelectAnswers([])
  }

  function toggleMultiSelect(chip: string) {
    setMultiSelectAnswers((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    )
  }

  function submitMultiSelect() {
    if (multiSelectAnswers.length === 0) return
    submitAnswer(multiSelectAnswers.join(', '))
  }

  async function generateProfile(answersMap: Record<string, string>) {
    try {
      const res = await fetch('/api/ai/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: answersMap,
          analysisData: analysisData ?? undefined,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate profile')

      const data = (await res.json()) as { profile: Omit<OnboardProfile, 'contact_email'> }
      setProfile({ ...data.profile, contact_email: '' })
      if (answersMap.q0) setClientName(answersMap.q0)
      setStage('review')
    } catch {
      toast.error('Failed to generate profile. Please try again.')
      setStage('interview')
    }
  }

  async function handleSave() {
    if (!clientName.trim()) {
      toast.error('Please enter a client name')
      return
    }
    if (!profile) return

    setSaving(true)

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientName,
          niche: profile.niche,
          language: profile.language,
          website_url: websiteUrl.trim() || null,
          contact_email: profile.contact_email.trim() || null,
          brand_profile: {
            tone: profile.tone,
            target_audience: profile.target_audience.join(', '),
            content_pillars: serializePillars(profile.content_pillars),
            avoid_topics: profile.avoid_topics,
            client_testimonial_voice: profile.client_testimonial_voice,
            language_formality: profile.language_formality,
            is_health_niche: profile.is_health_niche,
          },
          posting_schedule: {
            frequency_type: scheduleFreqType,
            frequency_value: parseInt(scheduleFreqValue, 10),
            auto_generate_day: scheduleDay,
            auto_generate_time: scheduleTime,
          },
        }),
      })

      if (!res.ok) throw new Error('Failed to save client')

      const data = (await res.json()) as { client_id: string }

      // Trigger best-time generation in background (no await)
      fetch('/api/ai/best-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: data.client_id }),
      }).catch(() => null)

      toast.success('Client saved!')
      router.push(`/clients/${data.client_id}/sources?onboarding=true`)
    } catch {
      toast.error('Failed to save client. Please try again.')
      setSaving(false)
    }
  }

  function handleRedo() {
    setStage('url-input')
    setCurrentQ(0)
    setMessages([{ role: 'ai', text: QUESTIONS[0]!.text }])
    setAnswers({})
    setInput('')
    setProfile(null)
    setAnalysisData(null)
    setWebsiteUrl('')
    setInstagramHandle('')
    setMultiSelectAnswers([])
  }

  // --- URL Input Stage ---
  if (stage === 'url-input') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-xl bg-[#534AB7] flex items-center justify-center mx-auto">
              <span className="text-white text-lg">✦</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">New client onboarding</h1>
            <p className="text-sm text-gray-500">
              Share a website or Instagram handle and we&apos;ll auto-detect their brand profile.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Input
              label="Website URL"
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
            <Input
              label="Instagram handle"
              type="text"
              placeholder="@username"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => { void handleAnalyzeUrl() }}
              className="w-full"
              disabled={!websiteUrl.trim() && !instagramHandle.trim()}
            >
              Analyze & continue
            </Button>
            <button
              type="button"
              onClick={handleSkipAnalysis}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              Skip — I&apos;ll answer manually
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Analyzing Stage (overlay) ---
  if (stage === 'analyzing') {
    return (
      <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center space-y-4">
          <div className="h-12 w-12 rounded-xl bg-[#534AB7] flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Analyzing brand presence</p>
            <p className="text-xs text-gray-500 mt-1">{analyzeProgress}</p>
          </div>
        </div>
      </div>
    )
  }

  // --- Interview / Generating ---
  if (stage === 'interview' || stage === 'generating') {
    const currentQuestion = QUESTIONS[currentQ]
    const isMultiSelect = currentQuestion?.multiSelect
    const detected = currentQuestion
      ? getDetectedAnswer(currentQuestion.id, analysisData)
      : null

    return (
      <InterviewStage
        stage={stage}
        messages={messages}
        currentQ={currentQ}
        input={input}
        setInput={setInput}
        submitAnswer={submitAnswer}
        messagesEndRef={messagesEndRef}
        isMultiSelect={isMultiSelect ?? false}
        multiSelectAnswers={multiSelectAnswers}
        toggleMultiSelect={toggleMultiSelect}
        submitMultiSelect={submitMultiSelect}
        detectedAnswer={detected}
        analysisData={analysisData}
      />
    )
  }

  return (
    <ReviewStage
      profile={profile!}
      clientName={clientName}
      setClientName={setClientName}
      editSection={editSection}
      setEditSection={setEditSection}
      editValue={editValue}
      setEditValue={setEditValue}
      setProfile={setProfile}
      scheduleFreqType={scheduleFreqType}
      setScheduleFreqType={setScheduleFreqType}
      scheduleFreqValue={scheduleFreqValue}
      setScheduleFreqValue={setScheduleFreqValue}
      scheduleDay={scheduleDay}
      setScheduleDay={setScheduleDay}
      scheduleTime={scheduleTime}
      setScheduleTime={setScheduleTime}
      saving={saving}
      handleSave={handleSave}
      handleRedo={handleRedo}
    />
  )
}

// --- Interview Stage ---

function InterviewStage({
  stage,
  messages,
  currentQ,
  input,
  setInput,
  submitAnswer,
  messagesEndRef,
  isMultiSelect,
  multiSelectAnswers,
  toggleMultiSelect,
  submitMultiSelect,
  detectedAnswer,
  analysisData,
}: {
  stage: 'interview' | 'generating'
  messages: Message[]
  currentQ: number
  input: string
  setInput: (v: string) => void
  submitAnswer: (text: string) => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  isMultiSelect: boolean
  multiSelectAnswers: string[]
  toggleMultiSelect: (chip: string) => void
  submitMultiSelect: () => void
  detectedAnswer: string | null
  analysisData: UrlAnalysisResponse | null
}) {
  const isGenerating = stage === 'generating'
  const currentQuestion = !isGenerating ? QUESTIONS[currentQ] : null
  const progress = Math.min(currentQ + 1, QUESTIONS.length)

  // When analysis data exists for this question, show only the detected answer as chip
  // Otherwise show normal chips
  const chips: string[] = (() => {
    if (isGenerating || !currentQuestion) return []
    if (detectedAnswer) return [detectedAnswer]
    return currentQuestion.chips
  })()

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">New client onboarding</p>
            {!isGenerating && (
              <p className="text-xs text-gray-400">
                Step {Math.min(currentQ + 1, QUESTIONS.length)} of {QUESTIONS.length}
              </p>
            )}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-[#534AB7] h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(progress / QUESTIONS.length) * 100}%` }}
            />
          </div>
          {analysisData && (
            <p className="text-xs text-[#534AB7] mt-2">Auto-detected answers shown — confirm or type your own</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'ai' && (
                <div className="h-8 w-8 rounded-lg bg-[#534AB7] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-sm">✦</span>
                </div>
              )}
              <div
                className={cn(
                  'max-w-sm px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line',
                  msg.role === 'ai'
                    ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                    : 'bg-[#534AB7] text-white rounded-tr-sm'
                )}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-lg bg-[#534AB7] flex items-center justify-center shrink-0">
                <span className="text-white text-sm">✦</span>
              </div>
              <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex gap-1 items-center h-5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      {!isGenerating && (
        <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => {
                  if (isMultiSelect) {
                    const selected = multiSelectAnswers.includes(chip)
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleMultiSelect(chip)}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-full border transition-colors',
                          selected
                            ? 'border-[#534AB7] bg-[#EEEDFE] text-[#534AB7]'
                            : 'border-gray-200 text-gray-800 hover:border-[#534AB7] hover:text-[#534AB7]'
                        )}
                      >
                        {chip}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => submitAnswer(chip)}
                      className={cn(
                        'text-xs px-3 py-1.5 rounded-full border transition-colors',
                        detectedAnswer
                          ? 'border-[#534AB7] bg-[#EEEDFE] text-[#534AB7] hover:bg-[#534AB7] hover:text-white'
                          : 'border-gray-200 text-gray-800 hover:border-[#534AB7] hover:text-[#534AB7]'
                      )}
                    >
                      {chip}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (isMultiSelect) {
                      if (input.trim()) {
                        toggleMultiSelect(input.trim())
                        setInput('')
                      }
                    } else {
                      submitAnswer(input)
                    }
                  }
                }}
                placeholder="Or type your own answer..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#534AB7] focus:ring-2 focus:ring-[#534AB7]/20"
              />
              {isMultiSelect ? (
                <Button
                  onClick={submitMultiSelect}
                  disabled={multiSelectAnswers.length === 0}
                  size="sm"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={() => submitAnswer(input)}
                  disabled={!input.trim()}
                  size="sm"
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Review Stage ---

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#EEEDFE] text-[#534AB7] text-xs font-medium">
      {label}
    </span>
  )
}

function ReviewSection({
  label,
  sectionKey,
  children,
  editSection,
  setEditSection,
  editValue,
  setEditValue,
  onSave,
}: {
  label: string
  sectionKey: string
  children: React.ReactNode
  editSection: string | null
  setEditSection: (k: string | null) => void
  editValue: string
  setEditValue: (v: string) => void
  onSave: (key: string, value: string) => void
}) {
  const isEditing = editSection === sectionKey
  return (
    <div className="border-b border-gray-100 py-4 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        {!isEditing && (
          <button
            type="button"
            onClick={() => {
              setEditSection(sectionKey)
              setEditValue('')
            }}
            className="text-xs text-[#534AB7] hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#534AB7] focus:ring-2 focus:ring-[#534AB7]/20 resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onSave(sectionKey, editValue)
                setEditSection(null)
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditSection(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// --- Review Stage Component ---

function ReviewStage({
  profile,
  clientName,
  setClientName,
  editSection,
  setEditSection,
  editValue,
  setEditValue,
  setProfile,
  scheduleFreqType,
  setScheduleFreqType,
  scheduleFreqValue,
  setScheduleFreqValue,
  scheduleDay,
  setScheduleDay,
  scheduleTime,
  setScheduleTime,
  saving,
  handleSave,
  handleRedo,
}: {
  profile: OnboardProfile
  clientName: string
  setClientName: (v: string) => void
  editSection: string | null
  setEditSection: (k: string | null) => void
  editValue: string
  setEditValue: (v: string) => void
  setProfile: (p: OnboardProfile) => void
  scheduleFreqType: string
  setScheduleFreqType: (v: string) => void
  scheduleFreqValue: string
  setScheduleFreqValue: (v: string) => void
  scheduleDay: string
  setScheduleDay: (v: string) => void
  scheduleTime: string
  setScheduleTime: (v: string) => void
  saving: boolean
  handleSave: () => void
  handleRedo: () => void
}) {
  function handleFieldSave(key: string, value: string) {
    const profileKey = key as keyof OnboardProfile
    if (profileKey === 'target_audience' || profileKey === 'social_goals') {
      setProfile({
        ...profile,
        [profileKey]: value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
    } else {
      setProfile({ ...profile, [profileKey]: value })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">
            Review client profile
          </p>
          <button
            type="button"
            onClick={handleRedo}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Redo interview
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Client name + contact email */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Input
              label="Client name"
              type="text"
              placeholder="Acme Coffee Co."
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <Input
              label="Client contact email"
              type="email"
              placeholder="client@example.com (optional — for sending approval links)"
              value={profile.contact_email}
              onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })}
            />
          </div>

          {/* Health niche warning */}
          {profile.is_health_niche && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <p className="text-sm font-medium text-amber-800">
                Health-related client detected
              </p>
              <p className="text-xs text-amber-700 mt-1">
                All generated posts will include medical safety instructions.
                Human review is mandatory before any post is published.
              </p>
            </div>
          )}

          {/* Profile sections */}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <div className="px-5">
              <ReviewSection
                label="Niche"
                sectionKey="niche"
                editSection={editSection}
                setEditSection={setEditSection}
                editValue={
                  editSection === 'niche'
                    ? editValue || profile.niche
                    : editValue
                }
                setEditValue={setEditValue}
                onSave={handleFieldSave}
              >
                <p className="text-sm text-gray-700">{profile.niche}</p>
                {profile.niche_reasoning && (
                  <p className="text-xs text-gray-400 mt-2 border-l-2 border-gray-200 pl-2 italic">
                    {profile.niche_reasoning}
                  </p>
                )}
              </ReviewSection>

              <ReviewSection
                label="Target audience"
                sectionKey="target_audience"
                editSection={editSection}
                setEditSection={setEditSection}
                editValue={
                  editSection === 'target_audience'
                    ? editValue || profile.target_audience.join(', ')
                    : editValue
                }
                setEditValue={setEditValue}
                onSave={handleFieldSave}
              >
                <div className="flex flex-wrap gap-1.5">
                  {profile.target_audience.map((a) => (
                    <Chip key={a} label={a} />
                  ))}
                </div>
              </ReviewSection>

              <ReviewSection
                label="Social media goals"
                sectionKey="social_goals"
                editSection={editSection}
                setEditSection={setEditSection}
                editValue={
                  editSection === 'social_goals'
                    ? editValue || profile.social_goals.join(', ')
                    : editValue
                }
                setEditValue={setEditValue}
                onSave={handleFieldSave}
              >
                <div className="flex flex-wrap gap-1.5">
                  {profile.social_goals.map((g) => (
                    <Chip key={g} label={g} />
                  ))}
                </div>
              </ReviewSection>

              <ReviewSection
                label="Brand tone"
                sectionKey="tone"
                editSection={editSection}
                setEditSection={setEditSection}
                editValue={
                  editSection === 'tone'
                    ? editValue || profile.tone
                    : editValue
                }
                setEditValue={setEditValue}
                onSave={handleFieldSave}
              >
                <p className="text-sm text-gray-700">{profile.tone}</p>
              </ReviewSection>

              <ReviewSection
                label="Topics to avoid"
                sectionKey="avoid_topics"
                editSection={editSection}
                setEditSection={setEditSection}
                editValue={
                  editSection === 'avoid_topics'
                    ? editValue || profile.avoid_topics
                    : editValue
                }
                setEditValue={setEditValue}
                onSave={handleFieldSave}
              >
                <p className="text-sm text-gray-700">{profile.avoid_topics}</p>
              </ReviewSection>

              <ReviewSection
                label="Client testimonial voice"
                sectionKey="client_testimonial_voice"
                editSection={editSection}
                setEditSection={setEditSection}
                editValue={
                  editSection === 'client_testimonial_voice'
                    ? editValue || profile.client_testimonial_voice
                    : editValue
                }
                setEditValue={setEditValue}
                onSave={handleFieldSave}
              >
                <p className="text-sm text-gray-700 italic">
                  &ldquo;{profile.client_testimonial_voice}&rdquo;
                </p>
              </ReviewSection>
            </div>
          </div>

          {/* Content pillars with weights */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Content pillars
            </p>
            {profile.content_pillars_reasoning && (
              <p className="text-xs text-gray-400 mb-3 border-l-2 border-gray-200 pl-2 italic">
                {profile.content_pillars_reasoning}
              </p>
            )}
            <PillarEditor
              pillars={profile.content_pillars}
              onChange={(pillars) =>
                setProfile({ ...profile, content_pillars: pillars })
              }
            />
          </div>

          {/* Recommended platforms */}
          {profile.recommended_platforms.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Recommended platforms
              </p>
              <div className="space-y-2">
                {profile.recommended_platforms.map((p) => (
                  <div key={p.platform} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded mt-0.5',
                        p.priority === 'primary'
                          ? 'bg-[#EEEDFE] text-[#534AB7]'
                          : 'bg-gray-100 text-gray-500'
                      )}
                    >
                      {p.platform}
                    </span>
                    <p className="text-xs text-gray-500 flex-1">{p.reason}</p>
                  </div>
                ))}
              </div>
              {profile.platform_reasoning && (
                <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                  {profile.platform_reasoning}
                </p>
              )}
            </div>
          )}

          {/* Autonomous schedule */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Autonomous schedule
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Frequency type"
                value={scheduleFreqType}
                onChange={(e) => setScheduleFreqType(e.target.value)}
                options={[
                  { value: 'per_week', label: 'Per week' },
                  { value: 'per_day', label: 'Per day' },
                  { value: 'per_month', label: 'Per month' },
                ]}
              />
              <Select
                label="How many"
                value={scheduleFreqValue}
                onChange={(e) => setScheduleFreqValue(e.target.value)}
                options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
              />
              <Select
                label="Auto-generate day"
                value={scheduleDay}
                onChange={(e) => setScheduleDay(e.target.value)}
                options={[...WEEKDAY_OPTIONS]}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auto-generate time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#534AB7] focus:ring-2 focus:ring-[#534AB7]/20"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button
            onClick={handleSave}
            loading={saving}
            className="flex-1"
          >
            Confirm and save client
          </Button>
          <Button variant="ghost" onClick={handleRedo} disabled={saving}>
            Redo interview
          </Button>
        </div>
      </div>
    </div>
  )
}
