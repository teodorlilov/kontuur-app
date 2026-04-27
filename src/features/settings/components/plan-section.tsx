'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { SectionCard } from '@/components/ui/section-card'
import type { AgencyInfo } from '@/types/api'

interface PlanSectionProps {
  agency: AgencyInfo
}

function formatPlanDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Plan info table with optional upgrade banner. */
export function PlanSection({ agency }: PlanSectionProps) {
  const isTrial = agency.subscription_status === 'trialing'
  const isExpired = agency.subscription_status === 'expired'
  const isActive = agency.subscription_status === 'active'

  function handleUpgrade() {
    toast.info('Billing integration coming soon')
  }

  return (
    <SectionCard
      title="Plan & billing"
      subtitle="Your current plan, usage limits, and trial status"
      headerAction={
        !isActive ? (
          <Button size="sm" onClick={handleUpgrade} style={{ flexShrink: 0 }}>
            Upgrade plan
          </Button>
        ) : undefined
      }
    >
      <div style={{ padding: '16px 22px' }}>
        <PlanRow label="Current plan">
          <Badge variant="info">{capitalize(agency.plan)}</Badge>
        </PlanRow>

        <PlanRow label="Status">
          <Badge variant={isActive ? 'success' : 'default'}>
            {isTrial ? 'Trial' : capitalize(agency.subscription_status)}
          </Badge>
        </PlanRow>

        {(isTrial || isExpired) && agency.trial_ends_at && (
          <PlanRow label="Trial ends">
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: isExpired ? 'var(--color-error-fg)' : 'var(--color-text-1)',
              }}
            >
              {formatPlanDate(agency.trial_ends_at)}
              {isExpired ? ' · expired' : ''}
            </span>
          </PlanRow>
        )}

        <PlanRow label="Client limit">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-1)' }}>
            {agency.plan_client_limit === -1
              ? 'Unlimited'
              : `${agency.plan_client_limit} client${agency.plan_client_limit !== 1 ? 's' : ''}`}
          </span>
        </PlanRow>

        <PlanRow label="Mode" isLast>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-1)' }}>
            {agency.mode === 'solo' ? 'Solo' : 'Agency'}
          </span>
        </PlanRow>

        {!isActive && <UpgradeBanner isExpired={isExpired} trialEnds={agency.trial_ends_at} onUpgrade={handleUpgrade} />}
      </div>
    </SectionCard>
  )
}

function PlanRow({
  label,
  children,
  isLast,
}: {
  label: string
  children: React.ReactNode
  isLast?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 0',
        borderBottom: isLast ? 'none' : '0.5px solid rgba(44,62,80,0.06)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{label}</span>
      {children}
    </div>
  )
}

function UpgradeBanner({
  isExpired,
  trialEnds,
  onUpgrade,
}: {
  isExpired: boolean
  trialEnds: string
  onUpgrade: () => void
}) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '14px 16px',
        background: 'rgba(192,123,85,0.06)',
        border: '0.5px solid rgba(192,123,85,0.20)',
        borderRadius: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-terracotta)', marginBottom: 3 }}>
          {isExpired ? 'Your trial has expired' : 'You are on a free trial'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>
          {isExpired
            ? 'Upgrade to continue using Kontuur. All your clients and content will be preserved.'
            : `Trial ends ${formatPlanDate(trialEnds)}. Upgrade to keep access after the trial.`}
        </div>
      </div>
      <Button size="sm" onClick={onUpgrade} style={{ flexShrink: 0 }}>
        {isExpired ? 'Upgrade now' : 'See plans'}
      </Button>
    </div>
  )
}
