import type { BaseGenerateInput } from './types'

export interface WritingContextParams {
  niche: string
  targetAudience: string
  formality: string
  tone: string
  clientTestimonialVoice?: string
  language: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  nativeCTAPhrases?: string
}

/**
 * Encapsulates all writing parameters — register, brand voice, and language config.
 * Use WritingContext.from(input) in generators rather than constructing manually.
 *
 * Carries language config (language, bannedAnglicisms, bannedCalques,
 * nativeCTAPhrases) so buildClientProfile receives one context object
 * instead of parallel separate parameters.
 */
export class WritingContext {
  readonly niche: string
  readonly targetAudience: string
  readonly formality: string
  readonly tone: string
  readonly clientTestimonialVoice: string | undefined
  readonly language: string
  readonly bannedAnglicisms: string[]
  readonly bannedCalques: string[]
  readonly nativeCTAPhrases: string | undefined

  constructor(params: WritingContextParams) {
    this.niche = params.niche
    this.targetAudience = params.targetAudience
    // Guard against undefined — prevents literal "undefined" in rendered prompts
    this.formality = params.formality ?? 'neutral'
    this.tone = params.tone
    this.clientTestimonialVoice = params.clientTestimonialVoice
    this.language = params.language
    this.bannedAnglicisms = params.bannedAnglicisms
    this.bannedCalques = params.bannedCalques
    this.nativeCTAPhrases = params.nativeCTAPhrases
  }

  /**
   * Factory — creates a WritingContext from any BaseGenerateInput.
   * This is the standard way to create a context in generator classes.
   */
  static from(input: BaseGenerateInput): WritingContext {
    return new WritingContext({
      niche: input.niche,
      targetAudience: input.targetAudience,
      formality: input.languageFormality,
      tone: input.tone,
      clientTestimonialVoice: input.clientTestimonialVoice,
      language: input.language,
      bannedAnglicisms: input.bannedAnglicisms,
      bannedCalques: input.bannedCalques,
      nativeCTAPhrases: input.nativeCTAPhrases,
    })
  }
}
