import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set')
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const DEFAULT_MODEL = 'claude-sonnet-4-5'
/** Lighter model for analytical/extraction tasks (pillars, sources, best-time, URL analysis) */
export const LIGHT_MODEL = 'claude-haiku-4-5'
export const DEFAULT_MAX_TOKENS = 4096

