import { NextResponse, type NextRequest } from 'next/server'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchSaleDocumentsBetween } from '@/lib/billing/documents'
import { AuditFileError, auditMonthSchema, buildAuditFile } from '@/lib/billing/audit-file'
import { DOCUMENT_TIMEZONE } from '@/utils/constants'
import { getMonthRange } from '@/utils/date-helpers'

/**
 * The founder's download of one month's Н-18 audit file, for upload at inetdec.nra.bg by the
 * 15th. Behind the cron bearer — the one secret the founder holds and nobody else — because the
 * admin client the read needs is `server-only`, so a script outside Next cannot make this file.
 * 204 for a month with nothing sold: no file is due then. A month the schema cannot carry
 * (`AuditFileError`) answers 409 with the question to take to the accountant; any other failure
 * is logged here and answers 500.
 */
export async function GET(request: NextRequest) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  const parsed = auditMonthSchema.safeParse(request.nextUrl.searchParams.get('month'))
  if (!parsed.success) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const month = parsed.data

  try {
    const { from, to } = getMonthRange(month, DOCUMENT_TIMEZONE)
    const documents = await fetchSaleDocumentsBetween(createAdminSupabaseClient(), from, to)
    const xml = buildAuditFile({ month, documents, createdOn: new Date() })
    if (!xml) return new NextResponse(null, { status: 204 })

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=windows-1251',
        'Content-Disposition': `attachment; filename="audit-${month}.xml"`,
      },
    })
  } catch (err) {
    if (err instanceof AuditFileError) {
      console.warn(`[billing:audit-file] ${month}: ${err.message}`)
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error(`[billing:audit-file] ${month} failed:`, err)
    return NextResponse.json({ error: 'The audit file could not be built.' }, { status: 500 })
  }
}
