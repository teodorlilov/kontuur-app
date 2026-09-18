import { NextResponse, type NextRequest } from 'next/server'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'
import { fetchSaleDocumentsBetween } from '@/lib/queries/db'
import {
  auditMonthSchema,
  buildAuditFile,
  documentsOfMonth,
  monthReadRange,
} from '@/lib/billing/audit-file'
import { documentIds } from '@/lib/billing/document-render'
import { COMPANY } from '@/utils/constants'

/**
 * The founder's download of one month's Н-18 audit file, for upload at inetdec.nra.bg by the
 * 15th. Behind the cron bearer — the one secret the founder holds and nobody else — because the
 * admin client the read needs is `server-only`, so a script outside Next cannot make this file.
 * 204 for a month with nothing sold: no file is due then.
 */
export async function GET(request: NextRequest) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  const parsed = auditMonthSchema.safeParse(request.nextUrl.searchParams.get('month'))
  if (!parsed.success) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const month = parsed.data

  const { fromIso, toIso } = monthReadRange(month)
  const documents = documentsOfMonth(await fetchSaleDocumentsBetween(fromIso, toIso), month)
  const ids = documentIds()
  const xml = buildAuditFile({
    seller: {
      eik: COMPANY.uic,
      eShopNumber: ids.eShopNumber,
      domain: COMPANY.domain,
      stripeAccountId: ids.stripeAccountId,
    },
    month,
    documents,
    createdOn: new Date(),
  })
  if (!xml) return new NextResponse(null, { status: 204 })

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=windows-1251',
      'Content-Disposition': `attachment; filename="audit-${month}.xml"`,
    },
  })
}
