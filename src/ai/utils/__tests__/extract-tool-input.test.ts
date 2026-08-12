import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

// utils/ai re-exports from ai-client, which throws at import without an API key.
vi.mock('@/utils/ai-client')

import { extractToolInput } from '@/utils/ai'
import type { SlideText } from '@/types/slide'

/** A response carrying one tool_use block with the given input. */
function toolMessage(input: unknown): Anthropic.Message {
  return {
    content: [{ type: 'tool_use', id: 'tu_1', name: 'output', input }],
  } as unknown as Anthropic.Message
}

describe('extractToolInput array repair', () => {
  it('repairs a top-level array the model returned as a JSON-encoded string', () => {
    const schema = { properties: { issues: { type: 'array' } } }
    const message = toolMessage({ issues: '["one","two"]' })

    const { issues } = extractToolInput<{ issues: string[] }>(message, schema)

    expect(issues).toEqual(['one', 'two'])
  })

  it('repairs a NULLABLE array, declared type: ["array","null"]', () => {
    // The judges declare corrected_slides this way. Matching only the bare
    // string 'array' left it unrepaired, and a stringified value then indexed
    // into characters downstream — every slide shipped with headline: undefined.
    const schema = { properties: { corrected_slides: { type: ['array', 'null'] } } }
    const message = toolMessage({
      corrected_slides: '[{"headline":"H","body":"B"}]',
    })

    const { corrected_slides } = extractToolInput<{
      corrected_slides: SlideText[]
    }>(message, schema)

    expect(corrected_slides).toEqual([{ headline: 'H', body: 'B' }])
  })

  it('accepts a schema whose branch is declared with anyOf and carries no own type', () => {
    // The merged judge's corrected_slides is an anyOf. This shape previously did
    // not typecheck as a schema argument at all, which is why callers passed none.
    const schema = {
      properties: {
        corrected_slides: { anyOf: [{ type: 'null' }, { type: 'array' }] },
        issues: { type: 'array' },
      },
    }
    const message = toolMessage({ corrected_slides: null, issues: '["a"]' })

    const parsed = extractToolInput<{ corrected_slides: null; issues: string[] }>(message, schema)

    expect(parsed.corrected_slides).toBeNull()
    expect(parsed.issues).toEqual(['a'])
  })

  it('leaves a well-formed array untouched', () => {
    const schema = { properties: { issues: { type: 'array' } } }
    const message = toolMessage({ issues: ['already', 'fine'] })

    const { issues } = extractToolInput<{ issues: string[] }>(message, schema)

    expect(issues).toEqual(['already', 'fine'])
  })

  it('throws when the response carries no tool_use block', () => {
    const message = { content: [{ type: 'text', text: 'hello' }] } as unknown as Anthropic.Message

    expect(() => extractToolInput(message)).toThrow(/No tool_use block/)
  })
})
