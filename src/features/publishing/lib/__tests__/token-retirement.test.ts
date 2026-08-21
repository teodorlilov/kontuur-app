import { describe, expect, it } from 'vitest'
import { classifyGraphError, type GraphErrorShape } from '@/lib/meta/graph-errors'
import { isTokenRetirable } from '../refresh-tokens'

function failureFor(shape: Partial<GraphErrorShape>) {
  return classifyGraphError({
    httpStatus: 400,
    code: null,
    subcode: null,
    type: null,
    message: '',
    fbtraceId: null,
    ...shape,
  })
}

/**
 * The refresh cron's one branch: retire the credential and tell the agency, or
 * leave it alone and say nothing. Getting the second half wrong is what sent
 * "please reconnect the account" for a Meta hiccup.
 */
describe('isTokenRetirable', () => {
  it('retires a token Meta has declared dead', () => {
    // The 190 family, plus the scope/App Review codes nothing but a reconnect fixes.
    expect(isTokenRetirable(failureFor({ code: 190 }))).toBe(true)
    expect(isTokenRetirable(failureFor({ code: 102 }))).toBe(true)
    expect(isTokenRetirable(failureFor({ code: 200 }))).toBe(true)
  })

  it('leaves a transient or throttled answer alone — tomorrow fixes it', () => {
    expect(isTokenRetirable(failureFor({ code: 2 }))).toBe(false)
    expect(isTokenRetirable(failureFor({ code: 4 }))).toBe(false)
    expect(isTokenRetirable(failureFor({ httpStatus: 429 }))).toBe(false)
    expect(isTokenRetirable(failureFor({ httpStatus: 503 }))).toBe(false)
  })

  it('leaves an unclassifiable failure alone rather than retiring on a guess', () => {
    expect(isTokenRetirable(failureFor({ httpStatus: 400 }))).toBe(false)
  })
})
