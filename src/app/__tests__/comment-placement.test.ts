import { describe, expect, it } from 'vitest'
import { violations } from '../../../scripts/comment-placement.mjs'

const STEP = 'annotating a statement, not documenting a declaration'
const TRAILING = 'trailing a line of code'

/**
 * `violations()` of scripts/comment-placement.mjs, the gate behind `npm run comments`: which
 * comments it flags as annotating a step, and which it leaves as documenting a declaration.
 * Fixtures are arrays of lines so each expected line number can be counted off the array.
 */
describe('scripts/comment-placement.mjs violations', () => {
  it('flags a comment above an if inside a function body', () => {
    const source = [
      'function run(value: number) {',
      '  const doubled = value * 2',
      '  // Only positive values count.',
      '  if (doubled > 0) {',
      '    return doubled',
      '  }',
      '  return 0',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([{ line: 3, kind: STEP }])
  })

  it('leaves a comment above an interface method signature alone', () => {
    const source = [
      'interface Store {',
      '  /** Read one row by id. */',
      '  read(id: string): Promise<string>',
      '  // Write one row.',
      '  write(id: string, value: string): Promise<void>',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([])
  })

  it('leaves a JSDoc above a top-level function alone', () => {
    const source = [
      '/**',
      ' * Double a value.',
      ' */',
      'export function double(value: number): number {',
      '  return value * 2',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([])
  })

  it('flags a comment trailing a line of code', () => {
    const source = 'const limit = 10 // the page size'
    expect(violations(source)).toEqual([{ line: 1, kind: TRAILING }])
  })

  it('flags a comment above a return inside a function body', () => {
    const source = [
      'function total(values: number[]): number {',
      '  const sum = values.reduce((a, b) => a + b, 0)',
      '  // Rounded to cents.',
      '  return Math.round(sum * 100) / 100',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([{ line: 3, kind: STEP }])
  })

  it('flags a comment above a plain assignment inside a function body', () => {
    const source = [
      'function build(): string {',
      "  let body = ''",
      '  // The header goes first.',
      "  body = 'header'",
      '  return body',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([{ line: 3, kind: STEP }])
  })

  it('flags a comment above a JSX attribute inside a component', () => {
    const source = [
      'export function Card() {',
      '  return (',
      '    <div',
      '      id="card"',
      '      // Safari drops a drag payload on an unregistered MIME type.',
      '      draggable',
      '    />',
      '  )',
      '}',
    ].join('\n')
    expect(violations(source, 'card.tsx')).toEqual([{ line: 5, kind: STEP }])
  })

  it("flags a comment above a property of a call's argument object inside a function body", () => {
    const source = [
      'async function stream(send: (phase: string) => void) {',
      '  await runBatch({',
      '    // Progress reaches the browser as it happens.',
      '    onProgress: (phase: string) => send(phase),',
      '  })',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([{ line: 3, kind: STEP }])
  })

  it('leaves a comment above a member of a top-level object literal or class alone', () => {
    const source = [
      'export const LIMITS = {',
      '  // Per run, not per post.',
      '  images: 12,',
      '}',
      'class Counter {',
      '  /** How many have landed. */',
      '  landed = 0',
      '}',
    ].join('\n')
    expect(violations(source)).toEqual([])
  })

  it('flags a doc above a test case or a fixture inside a describe callback — the case title is its explanation', () => {
    const source = [
      "describe('runs', () => {",
      '  /** One run, shared by every case. */',
      "  const run = { id: 'r1' }",
      '  /** Closing copies the run. */',
      "  it('closes', () => {",
      '    expect({ ...run }).toBeDefined()',
      '  })',
      '})',
    ].join('\n')
    expect(violations(source)).toEqual([
      { line: 2, kind: STEP },
      { line: 4, kind: STEP },
    ])
  })

  it('leaves a doc above a top-level describe or mock alone', () => {
    const source = [
      '/** The network is mocked: the case never reaches Stripe. */',
      "vi.mock('stripe')",
      '/** The one suite. */',
      "describe('runs', () => {})",
    ].join('\n')
    expect(violations(source)).toEqual([])
  })
})
