// No 'use client': a list of links, rendered by the settings page for an admin.
import { FormSection } from '@/components/ui/form'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { formatDocumentNumber, formatLongDate, formatMoney } from '@/utils/format'

type DocumentRow = Pick<
  SaleDocumentColumns,
  'id' | 'number' | 'kind' | 'issued_at' | 'gross_cents'
> & {
  url: string | null
}

/**
 * Every invoice and credit note of the workspace, newest first, each with the signed link the
 * page minted for it. Only an admin ever receives this list; a document still being prepared
 * (no PDF yet) says so instead of linking nowhere. Dates in Sofia time, the documents' own.
 */
export function BillingDocuments({ documents }: { documents: DocumentRow[] }) {
  return (
    <FormSection
      legend="Invoices"
      description="Every invoice and credit note, as issued at payment. Download links work for an hour."
    >
      <div className="col-span-12">
        {documents.length === 0 ? (
          <p className="text-caption text-text2">
            No documents yet — the first payment creates one.
          </p>
        ) : (
          <table className="w-full text-body">
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-b border-line last:border-b-0">
                  <td className="py-3 font-medium tabular-nums text-ink">
                    {formatDocumentNumber(document.number)}
                  </td>
                  <td className="py-3 text-text2">
                    {document.kind === 'invoice' ? 'Invoice' : 'Credit note'}
                  </td>
                  <td className="py-3 text-text2">
                    {formatLongDate(new Date(document.issued_at), 'Europe/Sofia')}
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
                        Download
                      </a>
                    ) : (
                      <span className="text-text3">Preparing…</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </FormSection>
  )
}
