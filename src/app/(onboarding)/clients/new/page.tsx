'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { serializePillars } from '@/lib/clients/content-pillars'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
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

  // Schedule state
  const [scheduleFreqType, setScheduleFreqType] = useState('per_week')
  const [scheduleFreqValue, setScheduleFreqValue] = useState('3')
  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleTime, setScheduleTime] = useState('09:00')

  function handleCancel() {
    const confirmed = window.confirm('Cancel onboarding? Any unsaved progress will be lost.')
    if (confirmed) router.push('/clients')
  }

  async function handleAnalyzeUrl() {
    if (!websiteUrl.trim() && !instagramHandle.trim()) {
      toast.error('Please enter a website URL or Instagram handle')
      return
    }

    setStep('loading')
    setAnalysisComplete(false)

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
