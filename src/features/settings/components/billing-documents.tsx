// No 'use client': a list of links, rendered by the settings page for an admin.
import { FormSection } from '@/components/ui/form'
import { BILLING_DOCUMENTS, documentKindLabel } from '@/lib/billing/copy'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { DOCUMENT_TIMEZONE } from '@/utils/constants'
import { formatDocumentNumber, formatLongDate, formatMoney } from '@/utils/format'

type DocumentRow = Pick<
  SaleDocumentColumns,
  'id' | 'number' | 'kind' | 'issued_at' | 'gross_cents' | 'storage_path'
> & {
  url: string | null
}

/**
 * Every invoice and credit note of the workspace, newest first, each with the signed link the
 * page minted for it. Only an admin ever receives this list. A document still being prepared (no
 * PDF yet) says so instead of linking nowhere; a stored PDF with no link says it is unavailable,
 * and one line asks for a reload. Each is named as its PDF names it (`documentKindLabel`,
 * src/lib/billing/copy.ts); dates in Sofia time, the documents' own.
 */
export function BillingDocuments({ documents }: { documents: DocumentRow[] }) {
  const linksMissing = documents.some((document) => document.storage_path && !document.url)
  return (
    <FormSection legend={BILLING_DOCUMENTS.legend} description={BILLING_DOCUMENTS.description}>
      <div className="col-span-12">
        {documents.length === 0 ? (
          <p className="text-caption text-text2">{BILLING_DOCUMENTS.empty}</p>
        ) : (
          <>
            {linksMissing && (
              <p className="text-caption text-text2">{BILLING_DOCUMENTS.linksMissing}</p>
            )}
            <table className="w-full text-body">
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 font-medium tabular-nums text-ink">
                      {formatDocumentNumber(document.number)}
                    </td>
                    <td className="py-3 text-text2">{documentKindLabel(document.kind)}</td>
                    <td className="py-3 text-text2">
                      {formatLongDate(new Date(document.issued_at), DOCUMENT_TIMEZONE)}
                    </td>
                    <td className="py-3 text-right tabular-nums text-ink">
                      {formatMoney(document.gross_cents)}
                    </td>
                    <td className="py-3 text-right">
                      {document.url ? (
                        <a
                          href={document.url}
                          className="text-forest underline decoration-forest/40 underline-offset-2"
                        >
                          {BILLING_DOCUMENTS.download}
                        </a>
                      ) : (
                        <span className="text-text3">
                          {document.storage_path
                            ? BILLING_DOCUMENTS.unavailable
                            : BILLING_DOCUMENTS.preparing}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </FormSection>
  )
}
