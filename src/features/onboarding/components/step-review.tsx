'use client'

import { useState } from 'react'
import { AlertTriangle, User, Users, Target, Pencil, XCircle, Quote, Share2, Calendar, Palette as PaletteIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PillarEditor } from '@/components/ui/pillar-editor'
import { WEEKDAY_OPTIONS } from '@/utils/constants'
import type { OnboardProfile } from '@/features/onboarding/types'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { VisualIdentity } from '@/types/visual'
import { VisualIdentityPanel } from '@/features/visual-identity/components/visual-identity-panel'
import type { ExtractionStatus } from '@/features/visual-identity/hooks/use-extraction-status'

interface StepReviewProps {
  profile: OnboardProfile
  clientName: string
  onClientNameChange: (v: string) => void
  editSection: string | null
  onEditSection: (k: string | null) => void
  editValue: string
  onEditValueChange: (v: string) => void
  onFieldSave: (key: string, value: string) => void
  onPillarsChange: (pillars: WeightedPillar[]) => void
  onContactEmailChange: (v: string) => void
  scheduleDay: string
  onScheduleDayChange: (v: string) => void
  scheduleTime: string
  onScheduleTimeChange: (v: string) => void
  saving: boolean
  onSave: () => void
  onRedo: () => void
  websiteUrl: string
  visualIdentity: VisualIdentity
  onVisualIdentityChange: (identity: VisualIdentity) => void
  extractionStatus: ExtractionStatus
}

const SECTIONS = [
  { id: 'basic', label: 'Basic info', icon: User },
  { id: 'audience', label: 'Target audience', icon: Users },
  { id: 'goals', label: 'Social media goals', icon: Target },
  { id: 'brand', label: 'Brand tone', icon: Pencil },
  { id: 'pillars', label: 'Content pillars', icon: Pencil },
  { id: 'visual', label: 'Visual identity', icon: PaletteIcon },
  { id: 'platforms', label: 'Platforms', icon: Share2 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
] as const

/** Step 4: review sidebar with section nav + scrollable review cards. */
export function StepReview(props: StepReviewProps) {
  const [activeSection, setActiveSection] = useState('basic')

  function handleSectionClick(id: string) {
    setActiveSection(id)
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <ReviewSidebar
        activeSection={activeSection}
        onSectionClick={handleSectionClick}
        onConfirm={props.onSave}
        onRedo={props.onRedo}
        isSaving={props.saving}
        websiteUrl={props.websiteUrl}
        profile={props.profile}
      />
      <ReviewContent {...props} />
    </div>
  )
}

// --- Sidebar ---

function ReviewSidebar({
  activeSection,
  onSectionClick,
  onConfirm,
  onRedo,
  isSaving,
  websiteUrl,
  profile,
}: {
  activeSection: string
  onSectionClick: (id: string) => void
  onConfirm: () => void
  onRedo: () => void
  isSaving: boolean
  websiteUrl: string
  profile: OnboardProfile
}) {
  return (
    <div
      style={{
        width: '260px',
        flexShrink: 0,
        background: 'var(--forest-deep)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SidebarBrand />

      <div
        style={{
          fontSize: '9px',
          fontWeight: 500,
          color: 'rgba(242,245,241,0.4)',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}
      >
        Profile review
      </div>

      <div style={{ flex: 1, marginBottom: '20px' }}>
        {SECTIONS.map((s) => (
          <SidebarNavItem
            key={s.id}
            id={s.id}
            label={s.label}
            isActive={s.id === activeSection}
            hasData={hasSectionData(s.id, profile)}
            onClick={onSectionClick}
          />
        ))}
      </div>

      {websiteUrl && (
        <div style={{ fontSize: '11px', color: 'rgba(242,245,241,0.3)', lineHeight: 1.6, marginBottom: '20px' }}>
          Profile auto-detected from{' '}
          <span style={{ color: '#f2f5f1', fontWeight: 500 }}>{websiteUrl}</span>
          <br />
          <span style={{ color: 'rgba(242,245,241,0.25)' }}>Edit any section before saving</span>
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={isSaving}
        style={{
          width: '100%',
          padding: '12px',
          // The primary commit: Deep Pine ground, white ink at 11.03:1.
          background: 'var(--forest)',
          color: '#fff',
          border: 'none',
          borderRadius: '9px',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          marginBottom: '8px',
          opacity: isSaving ? 0.7 : 1,
          transition: 'all 0.15s',
        }}
      >
        {isSaving ? 'Saving...' : 'Confirm & save client'}
      </button>
      <button
        type="button"
        onClick={onRedo}
        style={{
          width: '100%',
          padding: '10px',
          background: 'rgba(242,245,241,0.08)',
          color: 'rgba(242,245,241,0.55)',
          border: 'none',
          borderRadius: '9px',
          fontSize: '12px',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Redo interview
      </button>
    </div>
  )
}

function SidebarBrand() {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          color: '#f2f5f1',
          letterSpacing: '3px',
          marginBottom: '3px',
        }}
      >
        KONTUUR
      </div>
      {/* Lime as a figure on the Pine Deep rail — 10.87:1, and part of the
          wordmark lockup, which is exempt from the one-per-band count. */}
      <div style={{ fontSize: '7px', color: 'var(--accent)', letterSpacing: '5px' }}>
        SOCIAL INTELLIGENCE
      </div>
    </div>
  )
}

function SidebarNavItem({
  id,
  label,
  isActive,
  hasData,
  onClick,
}: {
  id: string
  label: string
  isActive: boolean
  hasData: boolean
  onClick: (id: string) => void
}) {
  return (
    <div
      onClick={() => onClick(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '7px 8px',
        borderRadius: '5px',
        cursor: 'pointer',
        marginBottom: '2px',
        transition: 'background 0.15s',
        background: isActive ? 'rgba(242,245,241,0.10)' : 'transparent',
      }}
    >
      <div
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          flexShrink: 0,
          // Living Green Lite — --spring is too dark to read on the pine rail.
          background: hasData ? 'var(--spring-lite)' : 'rgba(242,245,241,0.2)',
        }}
      />
      <span
        style={{
          fontSize: '12px',
          color: isActive ? '#f2f5f1' : 'rgba(242,245,241,0.65)',
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  )
}

function hasSectionData(sectionId: string, profile: OnboardProfile): boolean {
  switch (sectionId) {
    case 'basic':
      return Boolean(profile.niche)
    case 'audience':
      return profile.target_audience.length > 0
    case 'goals':
      return profile.social_goals.length > 0
    case 'brand':
      return Boolean(profile.tone)
    case 'pillars':
      return profile.content_pillars.length > 0
    case 'visual':
      return true
    case 'platforms':
      return profile.recommended_platforms.length > 0
    case 'schedule':
      return true
    default:
      return false
  }
}

// --- Content ---

function ReviewContent(props: StepReviewProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--paper)' }}>
      {props.profile.is_health_niche && <HealthBanner />}

      <BasicInfoCard
        clientName={props.clientName}
        onClientNameChange={props.onClientNameChange}
        contactEmail={props.profile.contact_email}
        onContactEmailChange={props.onContactEmailChange}
        niche={props.profile.niche}
      />

      <EditableCard
        id="audience"
        title="Target audience"
        icon={<Users size={10} color="var(--text2)" />}
        sectionKey="target_audience"
        editSection={props.editSection}
        onEditSection={props.onEditSection}
        editValue={props.editValue}
        onEditValueChange={props.onEditValueChange}
        onFieldSave={props.onFieldSave}
        initialValue={props.profile.target_audience.join(', ')}
      >
        <ChipList items={props.profile.target_audience} />
      </EditableCard>

      <EditableCard
        id="goals"
        title="Social media goals"
        icon={<Target size={10} color="var(--text2)" />}
        sectionKey="social_goals"
        editSection={props.editSection}
        onEditSection={props.onEditSection}
        editValue={props.editValue}
        onEditValueChange={props.onEditValueChange}
        onFieldSave={props.onFieldSave}
        initialValue={props.profile.social_goals.join(', ')}
      >
        <ChipList items={props.profile.social_goals} />
      </EditableCard>

      <BrandToneCard
        profile={props.profile}
        editSection={props.editSection}
        onEditSection={props.onEditSection}
        editValue={props.editValue}
        onEditValueChange={props.onEditValueChange}
        onFieldSave={props.onFieldSave}
        onPillarsChange={props.onPillarsChange}
      />

      <ReviewCard id="visual" title="Visual identity" icon={<PaletteIcon size={10} color="var(--text2)" />}>
        <VisualIdentityPanel
          identity={props.visualIdentity}
          onChange={props.onVisualIdentityChange}
          status={props.extractionStatus}
        />
      </ReviewCard>

      <EditableCard
        id="avoid"
        title="Topics to avoid"
        icon={<XCircle size={10} color="var(--text2)" />}
        sectionKey="avoid_topics"
        editSection={props.editSection}
        onEditSection={props.onEditSection}
        editValue={props.editValue}
        onEditValueChange={props.onEditValueChange}
        onFieldSave={props.onFieldSave}
        initialValue={props.profile.avoid_topics}
      >
        <p style={{ fontSize: '13px', color: 'var(--ink)' }}>{props.profile.avoid_topics}</p>
      </EditableCard>

      <EditableCard
        id="testimonial"
        title="Client testimonial voice"
        icon={<Quote size={10} color="var(--text2)" />}
        sectionKey="client_testimonial_voice"
        editSection={props.editSection}
        onEditSection={props.onEditSection}
        editValue={props.editValue}
        onEditValueChange={props.onEditValueChange}
        onFieldSave={props.onFieldSave}
        initialValue={props.profile.client_testimonial_voice}
      >
        <p style={{ fontSize: '13px', color: 'var(--ink)', fontStyle: 'italic' }}>
          &ldquo;{props.profile.client_testimonial_voice}&rdquo;
        </p>
      </EditableCard>

      <PlatformsCard profile={props.profile} />

      <ScheduleCard
        scheduleDay={props.scheduleDay}
        onScheduleDayChange={props.onScheduleDayChange}
        scheduleTime={props.scheduleTime}
        onScheduleTimeChange={props.onScheduleTimeChange}
      />
    </div>
  )
}

// --- Sub-components ---

function HealthBanner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '11px 14px',
        // A genuine warning, so Amber. It was terracotta — which aliased to
        // green — making a health-safety notice read as an "all clear".
        background: 'var(--pending-bg)',
        borderLeft: '2px solid var(--pending)',
        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        marginBottom: '14px',
      }}
    >
      <AlertTriangle size={14} color="var(--pending)" style={{ flexShrink: 0, marginTop: '1px' }} />
      <div>
        <div style={{ fontSize: 'var(--text-caption-lg)', fontWeight: 500, color: 'var(--pending)', marginBottom: '2px' }}>
          Health-related client detected
        </div>
        <div style={{ fontSize: 'var(--text-micro)', color: 'var(--text2)', lineHeight: 1.55 }}>
          All posts will include medical safety instructions. Human review is mandatory before publishing.
        </div>
      </div>
    </div>
  )
}

function BasicInfoCard({
  clientName,
  onClientNameChange,
  contactEmail,
  onContactEmailChange,
  niche,
}: {
  clientName: string
  onClientNameChange: (v: string) => void
  contactEmail: string
  onContactEmailChange: (v: string) => void
  niche: string
}) {
  return (
    <ReviewCard id="basic" title="Basic info" icon={<User size={10} color="var(--text2)" />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <Input label="Client name" value={clientName} onChange={(e) => onClientNameChange(e.target.value)} />
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text2)',
              marginBottom: '4px',
            }}
          >
            Niche
          </label>
          <p style={{ fontSize: '13px', color: 'var(--ink)', paddingTop: '6px' }}>{niche}</p>
        </div>
      </div>
      <div style={{ marginTop: '14px' }}>
        <Input
          label="Contact email"
          type="email"
          placeholder="client@example.com (optional)"
          value={contactEmail}
          onChange={(e) => onContactEmailChange(e.target.value)}
        />
      </div>
    </ReviewCard>
  )
}

function BrandToneCard({
  profile,
  editSection,
  onEditSection,
  editValue,
  onEditValueChange,
  onFieldSave,
  onPillarsChange,
}: {
  profile: OnboardProfile
  editSection: string | null
  onEditSection: (k: string | null) => void
  editValue: string
  onEditValueChange: (v: string) => void
  onFieldSave: (key: string, value: string) => void
  onPillarsChange: (pillars: WeightedPillar[]) => void
}) {
  return (
    <ReviewCard id="brand" title="Brand tone & pillars" icon={<Pencil size={10} color="var(--text2)" />}>
      <EditableField
        label="Tone"
        sectionKey="tone"
        editSection={editSection}
        onEditSection={onEditSection}
        editValue={editValue}
        onEditValueChange={onEditValueChange}
        onFieldSave={onFieldSave}
        initialValue={profile.tone}
      >
        <p style={{ fontSize: '13px', color: 'var(--ink)' }}>{profile.tone}</p>
      </EditableField>

      <div style={{ marginTop: '16px' }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 500,
            color: 'var(--spring-text)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          Content pillars
        </div>
        <PillarEditor pillars={profile.content_pillars} onChange={onPillarsChange} />
      </div>
    </ReviewCard>
  )
}

function PlatformsCard({ profile }: { profile: OnboardProfile }) {
  if (profile.recommended_platforms.length === 0) return null

  return (
    <ReviewCard id="platforms" title="Recommended platforms" icon={<Share2 size={10} color="var(--text2)" />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {profile.recommended_platforms.map((p) => (
          <div
            key={p.platform}
            style={{
              padding: '12px 14px',
              background: 'var(--paper)',
              borderRadius: '8px',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', marginBottom: '4px' }}>
              {p.platform}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.5 }}>{p.reason}</div>
          </div>
        ))}
      </div>
    </ReviewCard>
  )
}

function ScheduleCard({
  scheduleDay,
  onScheduleDayChange,
  scheduleTime,
  onScheduleTimeChange,
}: {
  scheduleDay: string
  onScheduleDayChange: (v: string) => void
  scheduleTime: string
  onScheduleTimeChange: (v: string) => void
}) {
  return (
    <ReviewCard id="schedule" title="Autonomous schedule" icon={<Calendar size={10} color="var(--text2)" />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Select
          label="Auto-generate day"
          value={scheduleDay}
          onChange={(e) => onScheduleDayChange(e.target.value)}
          options={[...WEEKDAY_OPTIONS]}
        />
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text2)', marginBottom: '4px' }}>
            Auto-generate time
          </label>
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => onScheduleTimeChange(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
        </div>
      </div>
    </ReviewCard>
  )
}

// --- Reusable building blocks ---

function ReviewCard({
  id,
  title,
  icon,
  children,
  onEdit,
}: {
  id: string
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  onEdit?: () => void
}) {
  return (
    <div
      id={`section-${id}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 18px',
          borderBottom: '1px solid rgba(15,21,18,0.07)',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--text2)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
          }}
        >
          {icon}
          {title}
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              fontSize: '11px',
              color: 'var(--spring-text)',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  )
}

function EditableCard({
  id,
  title,
  icon,
  sectionKey,
  editSection,
  onEditSection,
  editValue,
  onEditValueChange,
  onFieldSave,
  initialValue,
  children,
}: {
  id: string
  title: string
  icon: React.ReactNode
  sectionKey: string
  editSection: string | null
  onEditSection: (k: string | null) => void
  editValue: string
  onEditValueChange: (v: string) => void
  onFieldSave: (key: string, value: string) => void
  initialValue: string
  children: React.ReactNode
}) {
  const isEditing = editSection === sectionKey

  return (
    <ReviewCard
      id={id}
      title={title}
      icon={icon}
      onEdit={isEditing ? undefined : () => { onEditSection(sectionKey); onEditValueChange(initialValue) }}
    >
      {isEditing ? (
        <EditForm
          editValue={editValue}
          onEditValueChange={onEditValueChange}
          onSave={() => { onFieldSave(sectionKey, editValue); onEditSection(null) }}
          onCancel={() => onEditSection(null)}
        />
      ) : (
        children
      )}
    </ReviewCard>
  )
}

function EditableField({
  label,
  sectionKey,
  editSection,
  onEditSection,
  editValue,
  onEditValueChange,
  onFieldSave,
  initialValue,
  children,
}: {
  label: string
  sectionKey: string
  editSection: string | null
  onEditSection: (k: string | null) => void
  editValue: string
  onEditValueChange: (v: string) => void
  onFieldSave: (key: string, value: string) => void
  initialValue: string
  children: React.ReactNode
}) {
  const isEditing = editSection === sectionKey

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 500,
            color: 'var(--spring-text)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={() => { onEditSection(sectionKey); onEditValueChange(initialValue) }}
            style={{
              fontSize: '11px',
              color: 'var(--spring-text)',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <EditForm
          editValue={editValue}
          onEditValueChange={onEditValueChange}
          onSave={() => { onFieldSave(sectionKey, editValue); onEditSection(null) }}
          onCancel={() => onEditSection(null)}
        />
      ) : (
        children
      )}
    </div>
  )
}

function EditForm({
  editValue,
  onEditValueChange,
  onSave,
  onCancel,
}: {
  editValue: string
  onEditValueChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <textarea
        value={editValue}
        onChange={(e) => onEditValueChange(e.target.value)}
        rows={3}
        style={{
          width: '100%',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '13px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--ink)',
          outline: 'none',
          resize: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button size="sm" onClick={onSave}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            borderRadius: '20px',
            background: 'rgba(46,158,104,0.08)',
            color: 'var(--ink)',
            fontSize: '12px',
            border: '1px solid rgba(46,158,104,0.15)',
          }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}
