import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JobsTray } from '../components/workspace/jobs-tray'
import type { EditorJob } from '../hooks/use-editor-jobs'

/**
 * The tray exists so a wait survives you walking away from it.
 *
 * Every op used to report its progress in the bar that launched it, which meant the report existed
 * only while you stood still: switch slides during a 45s repair and nothing on screen said it was
 * running, though it was, and though it would land on a slide you were no longer looking at. These
 * assertions are about that — what the tray says, and that it says which slide.
 */

function job(overrides: Partial<EditorJob> = {}): EditorJob {
  return {
    id: 'job-0',
    kind: 'repair',
    label: 'Repair a zone',
    slide: 1,
    typicalSeconds: 45,
    // Fixed rather than "now": elapsed is rendered, so a moving clock would make it unassertable.
    startedAt: Date.now() - 12_000,
    ...overrides,
  }
}

function renderTray(jobs: EditorJob[]) {
  const discard = vi.fn()
  render(<JobsTray jobs={jobs} discard={discard} />)
  return discard
}

describe('the pill', () => {
  it('is absent when nothing is running', () => {
    renderTray([])
    // A permanent "0 running" chip teaches people to stop reading that corner of the screen.
    expect(screen.queryByTitle('What the editor is working on')).toBeNull()
  })

  it('names a single job', () => {
    renderTray([job()])
    expect(screen.getByTitle('What the editor is working on')).toHaveTextContent('Repair a zone')
  })

  it('counts several rather than listing them', () => {
    renderTray([job(), job({ id: 'job-1', kind: 'expand', label: 'Expand the picture' })])
    expect(screen.getByTitle('What the editor is working on')).toHaveTextContent('2 running')
  })
})

describe('the rows', () => {
  function open(jobs: EditorJob[]) {
    const discard = renderTray(jobs)
    fireEvent.click(screen.getByTitle('What the editor is working on'))
    return discard
  }

  it('says which slide the work belongs to', () => {
    open([job({ slide: 3 })])
    // One-based, matching the header — a job that lands somewhere else has to name where.
    expect(screen.getByText('Slide 4')).toBeInTheDocument()
  })

  it('shows elapsed against the estimate, never a bare percentage', () => {
    open([job()])
    expect(screen.getByText('12s of ~45s')).toBeInTheDocument()
  })

  it('stops predicting once the estimate is passed', () => {
    open([job({ startedAt: Date.now() - 52_000 })])
    expect(screen.getByText('52s · still going')).toBeInTheDocument()
    expect(screen.queryByText(/of ~45s/)).toBeNull()
  })

  it('discards by id', () => {
    const discard = open([job({ id: 'job-7' })])
    fireEvent.click(screen.getByText('Discard result'))
    expect(discard).toHaveBeenCalledWith('job-7')
  })

  it('admits that discarding cannot recall the work', () => {
    open([job()])
    // The control is called "Discard result" for this reason; the panel says it in full.
    expect(screen.getByText(/cannot be recalled/)).toBeInTheDocument()
  })
})
