import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BillingDocuments } from '../billing-documents'

describe('BillingDocuments', () => {
  it('lists each document with its number, kind, date, amount and link', () => {
    render(
      <BillingDocuments
        documents={[
          {
            id: 'doc_1',
            number: 1_000_000_001,
            kind: 'invoice',
            issued_at: '2025-10-01T18:30:05.000Z',
            gross_cents: 6840,
            storage_path: 'a1/1000000001.pdf',
            url: 'https://signed/1',
          },
          {
            id: 'doc_2',
            number: 1_000_000_002,
            kind: 'credit_note',
            issued_at: '2025-10-05T07:00:00.000Z',
            gross_cents: 2261,
            storage_path: null,
            url: null,
          },
        ]}
      />
    )
    expect(screen.getByText('1000000001')).toBeInTheDocument()
    expect(screen.getByText('Invoice')).toBeInTheDocument()
    expect(screen.getByText('1 October 2025')).toBeInTheDocument()
    expect(screen.getByText('€68.40')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://signed/1'
    )
    expect(screen.getByText('Credit note')).toBeInTheDocument()
    expect(screen.getByText('Preparing…')).toBeInTheDocument()
  })

  it('says so when there is nothing yet', () => {
    render(<BillingDocuments documents={[]} />)
    expect(screen.getByText(/No documents yet/)).toBeInTheDocument()
  })

  it('says a stored document with no link is unavailable and asks for a reload, while one still being made is still being made', () => {
    render(
      <BillingDocuments
        documents={[
          {
            id: 'doc_1',
            number: 1_000_000_001,
            kind: 'invoice',
            issued_at: '2025-10-01T18:30:05.000Z',
            gross_cents: 6840,
            storage_path: 'a1/1000000001.pdf',
            url: null,
          },
          {
            id: 'doc_2',
            number: 1_000_000_002,
            kind: 'invoice',
            issued_at: '2025-10-02T18:30:05.000Z',
            gross_cents: 6840,
            storage_path: null,
            url: null,
          },
        ]}
      />
    )
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('Preparing…')).toBeInTheDocument()
    expect(screen.getByText(/Reload the page to try again/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument()
  })
})
