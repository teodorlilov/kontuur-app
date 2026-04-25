import { fetchFormContext } from '@/lib/ideas'
import { IdeaFormClient } from '@/components/ideas/idea-form-client'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function IdeaFormPage({ params }: PageProps) {
  const { token } = await params

  const context = await fetchFormContext(token)

  if (!context) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: '#1A2630',
              marginBottom: 8,
            }}
          >
            This link is invalid or has expired.
          </div>
          <div style={{ fontSize: 13, color: '#8A8070', lineHeight: 1.6 }}>
            Please contact your agency for a new link.
          </div>
        </div>
      </div>
    )
  }

  return (
    <IdeaFormClient
      token={token}
      clientName={context.clientName}
      agencyName={context.agencyName}
    />
  )
}
