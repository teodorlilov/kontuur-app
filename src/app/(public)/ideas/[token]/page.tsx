import { fetchFormContext } from '@/features/ideas/lib/ideas'
import { IdeaFormClient } from '@/features/ideas/components/idea-form-client'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function IdeaFormPage({ params }: PageProps) {
  const { token } = await params

  const context = await fetchFormContext(token)

  if (!context) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-[400px] text-center">
          <div className="mb-2 text-lead font-medium text-ink">
            This link is invalid or has expired.
          </div>
          <div className="text-body text-text2">Please contact your agency for a new link.</div>
        </div>
      </div>
    )
  }

  return (
    <IdeaFormClient token={token} clientName={context.clientName} agencyName={context.agencyName} />
  )
}
