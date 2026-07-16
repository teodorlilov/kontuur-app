'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { serializePillars } from '@/lib/clients/content-pillars'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import { saveBrandKit } from '@/features/clients/actions/brand-kit-actions'
import { requestDesignSystem } from '@/features/clients/lib/design-system-client'
import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import { STARTER_FEED_SYSTEMS } from '@/lib/brand-kit/feed-systems'
import type { ExtractionReport } from '@/lib/brand-kit/extract/report'
import { DEFAULT_TOKENS, type BrandTokens } from '@/lib/scene-graph'
import type { UrlAnalysisResponse } from '@/types/api'
import type { OnboardingStep, OnboardProfile, Message } from '@/features/onboarding/types'
import { QUESTIONS, getDetectedAnswer } from '@/features/onboarding/lib/questions'
import { PillarSourceStepper } from '@/features/sources/components/stepper/pillar-source-stepper'
import { OnboardingShell } from '@/features/onboarding/components/onboarding-shell'
import { StepEntry } from '@/features/onboarding/components/step-entry'
import { StepLoading } from '@/features/onboarding/components/step-loading'
import { StepInterview } from '@/features/onboarding/components/step-interview'
import { StepReview } from '@/features/onboarding/components/step-review'

export default function NewClientPage() {
  const router = useRouter()

  // Step state
  const [step, setStep] = useState<OnboardingStep>('entry')

  // Interview state
  const [currentQ, setCurrentQ] = useState(0)
  const [messages, setMessages] = useState<Message[]>([{ role: 'ai', text: QUESTIONS[0]!.text }])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [input, setInput] = useState('')
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<string[]>([])

  // Profile state
  const [profile, setProfile] = useState<OnboardProfile | null>(null)
  const [clientName, setClientName] = useState('')

  // URL analysis state
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [analysisData, setAnalysisData] = useState<UrlAnalysisResponse | null>(null)
  const [analysisComplete, setAnalysisComplete] = useState(false)

  // Review edit state
  const [editSection, setEditSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Save + stepper state
  const [saving, setSaving] = useState(false)
  const [showStepper, setShowStepper] = useState(false)
  const [savedClientId, setSavedClientId] = useState<string | null>(null)
  const [savedPillars, setSavedPillars] = useState<WeightedPillar[]>([])

  // Visual system state (§2.4) — the default kit until extraction (§2.3) hydrates it.
  const [onboardingSessionId] = useState(() => crypto.randomUUID())
  const [visualTokens, setVisualTokens] = useState<BrandTokens>(DEFAULT_TOKENS)
  const [visualReport, setVisualReport] = useState<ExtractionReport | null>(null)
  const [selectedFeedSystemSlug, setSelectedFeedSystemSlug] = useState<string | null>(null)
  const [extractionStarted, setExtractionStarted] = useState(false)
  const [visualTouched, setVisualTouched] = useState(false)
  // Generated design-system plates by role (from /api/onboarding/design-system): the real imagery shown
  // under the live token layer, seeded into the client's bank on save.
  const [designPlates, setDesignPlates] = useState<Record<string, { publicUrl: string; storagePath: string }> | null>(null)
  // Generated starter vector marks (from the same endpoint): shown in the review, seeded into the client's
  // vector bank on save.
  const [designVectors, setDesignVectors] = useState<{ svg: string; label: string }[] | null>(null)
  const [generatingDesign, setGeneratingDesign] = useState(false)
  const designAutoFiredRef = useRef(false)
  // The AI art direction, composed at review from the visual identity + the interview business context;
  // persisted to the new client's kit on save (drives every later post's design).
  const [artDirection, setArtDirection] = useState<ArtDirection | null>(null)
  const directionAutoFiredRef = useRef(false)

  // Auto-generate the design system once the operator reaches the review step (after extraction) — the
  // imagery is part of the onboarding pipeline, not a manual gate. The ref guards against re-firing on
  // navigation; a full "Redo" resets it (see handleRedo).
  useEffect(() => {
    if (step === 'review' && !designAutoFiredRef.current && !generatingDesign && !designPlates) {
      designAutoFiredRef.current = true
      void handleGenerateDesignSystem()
    }
    // handleGenerateDesignSystem is a stable function declaration; fire only on step change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Compose the art direction once the operator reaches review and the profile exists (it needs the
  // business answers, not just the screenshot). Ref-guarded; a Redo resets it.
  useEffect(() => {
    if (step === 'review' && profile && !directionAutoFiredRef.current) {
      directionAutoFiredRef.current = true
      void handleComposeArtDirection()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, profile])

  // Schedule state
  const [scheduleFreqType, setScheduleFreqType] = useState('per_week')
  const [scheduleFreqValue, setScheduleFreqValue] = useState('3')
  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleTime, setScheduleTime] = useState('09:00')

  function handleCancel() {
    const confirmed = window.confirm('Cancel onboarding? Any unsaved progress will be lost.')
    if (confirmed) router.push('/clients')
  }

  // Poll the async extraction (§2.3) and hydrate the Review in place. Never overwrites operator edits.
  useEffect(() => {
    if (!extractionStarted) return
    let cancelled = false
    let attempts = 0
    const timer = setInterval(() => {
      void (async () => {
        attempts += 1
        if (attempts > 72) {
          clearInterval(timer)
          return
        }
        try {
          const res = await fetch(`/api/extract/status?session=${onboardingSessionId}`)
          if (!res.ok) return
          const data = (await res.json()) as {
            status: string
            tokens: BrandTokens | null
            report: ExtractionReport | null
          }
          if (data.status === 'pending') return
          clearInterval(timer)
          if (cancelled) return
          setVisualReport(data.report)
          if (!visualTouched && data.status === 'ready' && data.tokens) {
            setVisualTokens(data.tokens)
            const recommended = data.report?.feedSystemRecommendation?.slug ?? null
            if (recommended) setSelectedFeedSystemSlug(recommended)
          }
        } catch {
          // transient — keep polling until resolved or capped
        }
      })()
    }, 2500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [extractionStarted, onboardingSessionId, visualTouched])

  async function handleAnalyzeUrl() {
    if (!websiteUrl.trim() && !instagramHandle.trim()) {
      toast.error('Please enter a website URL or Instagram handle')
      return
    }

    setStep('loading')
    setAnalysisComplete(false)

    // Kick visual extraction in the background (§2.3) — fire-and-forget; the Review polls for it.
    if (websiteUrl.trim()) {
      setExtractionStarted(true)
      void fetch('/api/extract/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingSessionId, url: websiteUrl.trim() }),
      }).catch(() => undefined)
    }

    try {
      const res = await fetch('/api/ai/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim() || undefined,
          instagramHandle: instagramHandle.trim() || undefined,
        }),
      })

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

    setAnalysisComplete(true)
  }

  function handleLoadingComplete() {
    setStep('interview')
  }

  function handleSkipToInterview() {
    setStep('interview')
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

      const detected = getDetectedAnswer(QUESTIONS[nextQ]!.id, analysisData)
      const questionText = detected
        ? `${QUESTIONS[nextQ]!.text}\n\nBased on their website, we think: "${detected}"`
        : QUESTIONS[nextQ]!.text

      setMessages([...newMessages, { role: 'ai', text: questionText }])
    } else {
      setMessages([...newMessages, { role: 'ai', text: 'Building your client profile...' }])
      setStep('generating')
      void generateProfile(newAnswers)
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
      setStep('review')
    } catch {
      toast.error('Failed to generate profile. Please try again.')
      setStep('interview')
    }
  }

  function handleFieldSave(key: string, value: string) {
    if (!profile) return
    const profileKey = key as keyof OnboardProfile
    if (profileKey === 'target_audience' || profileKey === 'social_goals') {
      setProfile({
        ...profile,
        [profileKey]: value.split(',').map((s) => s.trim()).filter(Boolean),
      })
    } else {
      setProfile({ ...profile, [profileKey]: value })
    }
  }

  async function handleSave() {
    if (!clientName.trim()) {
      toast.error('Please enter a client name')
      return
    }
    if (!profile) return

    setSaving(true)
    const pillarsWithIds: WeightedPillar[] = profile.content_pillars.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
    }))

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
            content_pillars: serializePillars(pillarsWithIds),
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

      // Persist the reviewed visual system for the new client (§2.4). Non-fatal — Phase 0 still renders
      // on the default kit if this fails.
      const kitResult = await saveBrandKit(data.client_id, visualTokens, selectedFeedSystemSlug, visualReport?.brief ?? null, designPlates ?? undefined, designVectors ?? undefined, artDirection ?? undefined)
      if (!kitResult.ok) toast.error('Client saved, but the visual system could not be saved.')

      // Trigger best-time generation in background
      fetch('/api/ai/best-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: data.client_id }),
      }).catch(() => null)

      toast.success('Client saved!')
      setSaving(false)
      setSavedClientId(data.client_id)
      setSavedPillars(pillarsWithIds)
      setShowStepper(true)
    } catch {
      toast.error('Failed to save client. Please try again.')
      setSaving(false)
    }
  }

  function handleRedo() {
    setStep('entry')
    setCurrentQ(0)
    setMessages([{ role: 'ai', text: QUESTIONS[0]!.text }])
    setAnswers({})
    setInput('')
    setProfile(null)
    setAnalysisData(null)
    setAnalysisComplete(false)
    setWebsiteUrl('')
    setInstagramHandle('')
    setMultiSelectAnswers([])
    setDesignPlates(null)
    setDesignVectors(null)
    designAutoFiredRef.current = false
    setArtDirection(null)
    directionAutoFiredRef.current = false
  }

  /** Generate the real design-system imagery from the current tokens + brief (§ Part B). Fills the
   *  preview's plate layer; the type keeps updating live on top. Seeded into the bank on save. */
  async function handleGenerateDesignSystem() {
    setGeneratingDesign(true)
    try {
      const { plates, vectors } = await requestDesignSystem({
        tokens: visualTokens,
        feedSystemSlug: selectedFeedSystemSlug,
        brief: visualReport?.brief ?? null,
      })
      if (Object.keys(plates).length > 0) setDesignPlates(plates)
      else toast.error('No design images were generated. Please try again.')
      // Vector marks are a bonus layer — set them independently of the plate result.
      if (vectors.length > 0) setDesignVectors(vectors)
    } finally {
      setGeneratingDesign(false)
    }
  }

  /** Compose the AI art direction from the visual read + the interview business context. Auto-fired at
   *  review, persisted on save. Fail-soft — the endpoint always returns a usable direction. */
  async function handleComposeArtDirection() {
    if (!profile) return
    try {
      const res = await fetch('/api/onboarding/art-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: visualReport?.brief?.mood ?? '',
          motifs: visualReport?.brief?.motifs ?? [],
          photographicSubjects: visualReport?.brief?.photographicSubjects ?? [],
          palette: Object.values(visualTokens.color),
          fontCategory: visualTokens.type.display.family,
          niche: profile.niche,
          audience: profile.target_audience.join(', '),
          goal: answers.q3 ?? '',
          tone: profile.tone,
          formalityNote: profile.language_formality,
          pillars: profile.content_pillars.map((p) => p.pillar),
          references: answers.q8 ?? '',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { artDirection?: ArtDirection }
      if (data.artDirection) setArtDirection(data.artDirection)
    } catch {
      // fail-soft: no art direction → generation falls back to the feed-system default
    }
  }

  const currentQuestion = QUESTIONS[currentQ]
  const isMultiSelect = currentQuestion?.multiSelect ?? false
  const detectedAnswer = currentQuestion ? getDetectedAnswer(currentQuestion.id, analysisData) : null

  return (
    <>
      <OnboardingShell currentStep={step} onCancel={handleCancel}>
        {step === 'entry' && (
          <StepEntry
            websiteUrl={websiteUrl}
            instagramHandle={instagramHandle}
            onWebsiteUrlChange={setWebsiteUrl}
            onInstagramHandleChange={setInstagramHandle}
            onAnalyze={() => void handleAnalyzeUrl()}
            onSkip={handleSkipToInterview}
          />
        )}
        {step === 'loading' && (
          <StepLoading
            analysisComplete={analysisComplete}
            onSkip={handleSkipToInterview}
            onComplete={handleLoadingComplete}
          />
        )}
        {(step === 'interview' || step === 'generating') && (
          <StepInterview
            messages={messages}
            currentQ={currentQ}
            input={input}
            onInputChange={setInput}
            onSubmitAnswer={submitAnswer}
            isMultiSelect={isMultiSelect}
            multiSelectAnswers={multiSelectAnswers}
            onToggleMultiSelect={toggleMultiSelect}
            onSubmitMultiSelect={submitMultiSelect}
            detectedAnswer={detectedAnswer}
            hasAnalysisData={analysisData !== null}
            isGenerating={step === 'generating'}
          />
        )}
        {step === 'review' && profile && (
          <StepReview
            profile={profile}
            clientName={clientName}
            onClientNameChange={setClientName}
            editSection={editSection}
            onEditSection={setEditSection}
            editValue={editValue}
            onEditValueChange={setEditValue}
            onFieldSave={handleFieldSave}
            onPillarsChange={(pillars) => setProfile({ ...profile, content_pillars: pillars })}
            onContactEmailChange={(v) => setProfile({ ...profile, contact_email: v })}
            scheduleDay={scheduleDay}
            onScheduleDayChange={setScheduleDay}
            scheduleTime={scheduleTime}
            onScheduleTimeChange={setScheduleTime}
            saving={saving}
            onSave={() => void handleSave()}
            onRedo={handleRedo}
            websiteUrl={websiteUrl}
            visual={{
              tokens: visualTokens,
              report: visualReport,
              feedSystems: STARTER_FEED_SYSTEMS,
              selectedFeedSystemSlug,
              primaryLanguage: profile.language,
              secondaryLanguage: '',
              onTokensChange: (next) => {
                setVisualTokens(next)
                setVisualTouched(true)
              },
              onFeedSystemChange: (slug) => {
                setSelectedFeedSystemSlug(slug)
                setVisualTouched(true)
              },
              designPlates: designPlates
                ? Object.fromEntries(Object.entries(designPlates).map(([role, p]) => [role, p.publicUrl]))
                : undefined,
              designVectors: designVectors?.map((v) => v.svg),
              generatingDesign,
              onGenerateDesignSystem: handleGenerateDesignSystem,
            }}
          />
        )}
      </OnboardingShell>
      {showStepper && savedClientId && profile && (
        <PillarSourceStepper
          open={showStepper}
          clientId={savedClientId}
          clientName={clientName}
          niche={profile.niche}
          websiteUrl={websiteUrl}
          pillars={savedPillars}
          onComplete={() => router.push(`/clients/${savedClientId}/sources`)}
          onDismiss={() => router.push(`/clients/${savedClientId}/sources`)}
        />
      )}
    </>
  )
}
