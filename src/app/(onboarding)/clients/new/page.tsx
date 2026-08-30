'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createClient } from '@/features/clients/actions/client-actions'
import { useExtractionStatus } from '@/features/onboarding/hooks/use-extraction-status'
import { PillarSourceStepper } from '@/features/sources/components/stepper/pillar-source-stepper'
import type { StepperSummary, FetchStatus } from '@/features/sources/types'
import type { SourceSuggestion, UrlAnalysisResponse } from '@/types/api'
import type { SourceKind } from '@/types/visual'
import { toHostLabel, toWebsiteUrl } from '@/utils/url'
import { OnboardingShell } from '@/features/onboarding/components/onboarding-shell'
import { OnboardingSuccess } from '@/features/onboarding/components/onboarding-success'
import { StepEntry } from '@/features/onboarding/components/step-entry'
import { DraftSheet } from '@/features/onboarding/components/draft-sheet'
import { DraftSaveBar } from '@/features/onboarding/components/draft-save-bar'
import { buildDraftFromAnalysis, buildEmptyDraft } from '@/features/onboarding/lib/build-draft'
import {
  ANSWERABLE_FIELDS,
  blockingFields,
  buildCreateInput,
  countFilled,
  hasValue,
} from '@/features/onboarding/lib/draft-payload'
import { DRAFT_ROWS } from '@/features/onboarding/lib/draft-rows'
import type { DraftFieldId, DraftProfile, FieldProvenance } from '@/features/onboarding/types'

export default function NewClientPage() {
  const router = useRouter()

  const [showDraft, setShowDraft] = useState(false)
  const [manual, setManual] = useState(false)
  /**
   * Always a full `https://…` URL, or empty. Never a bare host.
   *
   * `StepEntry` normalises on the way in and shows only the host, so every consumer here — the
   * site read, source discovery, colour extraction, the saved `website_url` and the sources
   * stepper, which calls `new URL(...)` on it — can use this directly.
   */
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [rereading, setRereading] = useState(false)

  const [draft, setDraft] = useState<DraftProfile>(buildEmptyDraft)
  const [provenance, setProvenance] = useState<Partial<Record<DraftFieldId, FieldProvenance>>>({})
  const [unanswered, setUnanswered] = useState<DraftFieldId[]>([])

  // Brand colours are measured by a separate job that runs while the sheet is being read, and
  // land in place when they arrive — unless the user has already edited the palette by hand.
  const [sessionId] = useState(() => crypto.randomUUID())
  const [extractionStarted, setExtractionStarted] = useState(false)
  const [identityEdited, setIdentityEdited] = useState(false)
  const { status: extractionStatus } = useExtractionStatus({
    sessionId,
    enabled: extractionStarted,
    onResolved: (identity) => {
      if (!identityEdited) setDraft((current) => ({ ...current, identity }))
    },
  })

  const [saving, setSaving] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [confirmingReread, setConfirmingReread] = useState(false)
  const [savedClientId, setSavedClientId] = useState<string | null>(null)
  const [showStepper, setShowStepper] = useState(false)
  const [stepperSummary, setStepperSummary] = useState<StepperSummary | null>(null)

  // Source discovery runs in the background so the stepper opens with results in hand.
  const [prescanStatus, setPrescanStatus] = useState<FetchStatus>('idle')
  const [prescannedPages, setPrescannedPages] = useState<string[]>([])
  const [feedStatus, setFeedStatus] = useState<FetchStatus>('idle')
  const [feedSuggestions, setFeedSuggestions] = useState<SourceSuggestion[]>([])

  // Derived, never stored: a stored set only ever grew, so clearing a field the sheet had asked
  // about left the header saying "all checked" while the save bar blocked on that same field.
  const resolved = unanswered.filter((field) => hasValue(draft, field))
  const openAsks = unanswered.filter((field) => !resolved.includes(field))
  const blocking = blockingFields(draft, unanswered)
  const blockedBy = blocking[0]
    ? (DRAFT_ROWS.find((row) => row.id === blocking[0])?.label ?? 'A field')
    : undefined

  function handleCancel() {
    setConfirmingCancel(true)
  }

  /**
   * Applies an edit.
   *
   * Which questions that settles is read back off the draft rather than tracked here, so typing a
   * niche into the blank form settles it exactly as picking a post goal does — and clearing it
   * un-settles it again.
   */
  function handleChange(patch: Partial<DraftProfile>) {
    if (patch.identity) setIdentityEdited(true)
    setDraft((current) => ({ ...current, ...patch }))
  }

  /** Scan the website for pages in the background; the stepper reflects the status. */
  async function runSourcePrescan(url: string) {
    const trimmed = toWebsiteUrl(url)
    if (!trimmed) return
    setPrescanStatus('running')
    setPrescannedPages([])
    try {
      const res = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      if (!res.ok) throw new Error('scan failed')
      const data = (await res.json()) as { pages?: string[] }
      setPrescannedPages(data.pages ?? [])
      setPrescanStatus('done')
    } catch {
      setPrescanStatus('failed')
    }
  }

  /** Prefetch feed suggestions once the niche and pillars are known. */
  async function runFeedPrefetch(profile: DraftProfile) {
    setFeedStatus('running')
    try {
      const res = await fetch('/api/ai/suggest-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: profile.niche,
          clientName: profile.name || undefined,
          pillars: profile.pillars.map((pillar) => pillar.pillar),
          targetAudience: profile.audience,
          language: profile.language,
        }),
      })
      if (!res.ok) throw new Error('prefetch failed')
      const data = (await res.json()) as { suggestions?: SourceSuggestion[] }
      setFeedSuggestions(data.suggestions ?? [])
      setFeedStatus('done')
    } catch {
      setFeedStatus('failed')
    }
  }

  /** Kick off the async brand-colour extraction; it lands in the sheet when it finishes. */
  async function startExtraction() {
    try {
      const res = await fetch('/api/extract/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingSessionId: sessionId,
          websiteUrl: websiteUrl || undefined,
        }),
      })
      if (res.ok) setExtractionStarted(true)
    } catch {
      // Keep the default palette; the user can still edit and save.
    }
  }

  /** Reads the site and drafts the profile from it. */
  async function readSite(): Promise<UrlAnalysisResponse | null> {
    const res = await fetch('/api/ai/analyze-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteUrl }),
    })
    if (!res.ok) return null
    return (await res.json()) as UrlAnalysisResponse
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    void runSourcePrescan(websiteUrl)

    const analysis = await readSite().catch(() => null)
    setAnalyzing(false)

    if (!analysis) {
      // The site could not be read, so there is nothing to check — the blank form is the honest
      // fallback rather than a sheet full of empty rows dressed as a draft.
      toast.error('Could not read that site — fill the profile in by hand')
      startManual()
      return
    }

    const result = buildDraftFromAnalysis(analysis)
    setDraft(result.draft)
    setProvenance(result.provenance)
    setUnanswered(result.unanswered)
    setManual(false)
    setShowDraft(true)
    void startExtraction()
    void runFeedPrefetch(result.draft)
  }

  function startManual() {
    setDraft(buildEmptyDraft())
    setProvenance({})
    setUnanswered([])
    setManual(true)
    setShowDraft(true)
  }

  // A re-read replaces the whole draft, so it has to be asked for rather than assumed — the
  // ConfirmDialog below is the ask; this runs only once it is confirmed.
  async function handleReread() {
    setRereading(true)
    const analysis = await readSite().catch(() => null)
    setRereading(false)

    if (!analysis) {
      toast.error('Re-read failed — nothing changed')
      return
    }

    const result = buildDraftFromAnalysis(analysis)
    // The identity is deliberately carried over: brand colours come from a different job, and a
    // re-read of the page copy has nothing to say about them.
    setDraft({ ...result.draft, identity: draft.identity })
    setProvenance(result.provenance)
    setUnanswered(result.unanswered)
    toast.success('Read again')
  }

  function jumpToAsk() {
    const first = blocking[0] ?? openAsks[0]
    if (!first) return
    const row = document.querySelector(`[data-field="${first}"]`)
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function resolveIdentitySource(): SourceKind {
    if (identityEdited) return 'manual'
    return extractionStatus === 'ready' ? 'website' : 'default'
  }

  async function handleSave() {
    // The button is disabled while anything blocks, so this only catches a programmatic call.
    if (blocking.length > 0) return

    setSaving(true)
    const result = await createClient(buildCreateInput(draft, websiteUrl, resolveIdentitySource()))
    setSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    // Best-time generation is a nicety; a failure must not block the flow.
    void fetch('/api/ai/best-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: result.data }),
    }).catch(() => null)

    // The analysed path prefetched at read time; the blank form had no niche to prefetch from
    // until now. Without this the stepper's feed step reads an unstarted prefetch as one still
    // running and shows a skeleton that never resolves.
    if (feedStatus === 'idle') void runFeedPrefetch(draft)

    toast.success('Client saved')
    setSavedClientId(result.data)
    setShowStepper(true)
  }

  return (
    <>
      <OnboardingShell wide={showDraft} onCancel={handleCancel}>
        {showDraft ? (
          <DraftSheet
            draft={draft}
            onChange={handleChange}
            provenance={provenance}
            unanswered={unanswered}
            resolved={resolved}
            manual={manual}
            host={toHostLabel(websiteUrl)}
            paletteStatus={extractionStatus}
            onReread={() => setConfirmingReread(true)}
            rereading={rereading}
          />
        ) : (
          <StepEntry
            websiteUrl={websiteUrl}
            onWebsiteUrlChange={setWebsiteUrl}
            onAnalyze={() => void handleAnalyze()}
            onSkip={startManual}
            analyzing={analyzing}
          />
        )}
      </OnboardingShell>

      <ConfirmDialog
        open={confirmingCancel}
        title="Leave client setup?"
        confirmLabel="Leave"
        cancelLabel="Keep working"
        onConfirm={() => router.push('/clients')}
        onClose={() => setConfirmingCancel(false)}
      >
        Any unsaved progress will be lost.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingReread}
        title="Read the site again?"
        confirmLabel="Read again"
        onConfirm={() => {
          setConfirmingReread(false)
          void handleReread()
        }}
        onClose={() => setConfirmingReread(false)}
      >
        Anything you have changed will be replaced. Brand colours are kept — they come from a
        different job.
      </ConfirmDialog>

      <DraftSaveBar
        visible={showDraft && !showStepper && !stepperSummary}
        openAsks={openAsks.length}
        blockedBy={blockedBy}
        manual={manual}
        filled={countFilled(draft, ANSWERABLE_FIELDS)}
        total={ANSWERABLE_FIELDS.length}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={handleCancel}
        onJumpToAsk={jumpToAsk}
      />

      {showStepper && savedClientId && (
        <PillarSourceStepper
          open={showStepper}
          clientId={savedClientId}
          websiteUrl={websiteUrl}
          prescanStatus={prescanStatus}
          prescannedPages={prescannedPages}
          onScanRequested={(url) => {
            setWebsiteUrl(toWebsiteUrl(url))
            void runSourcePrescan(url)
          }}
          feedSuggestions={feedSuggestions}
          feedStatus={feedStatus}
          onRetryFeedSuggestions={() => void runFeedPrefetch(draft)}
          onFinished={(summary) => {
            setShowStepper(false)
            setStepperSummary(summary)
          }}
          onDismiss={() => router.push(`/clients/${savedClientId}/sources`)}
        />
      )}

      {stepperSummary && savedClientId && (
        <OnboardingSuccess
          clientName={draft.name}
          summary={stepperSummary}
          onGenerate={() => router.push(`/generate?client=${savedClientId}`)}
          onViewSources={() => router.push(`/clients/${savedClientId}/sources`)}
        />
      )}
    </>
  )
}
