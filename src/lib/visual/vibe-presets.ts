import type { Palette, VibePresetId } from '@/types/visual'
import type { FontKey } from './fonts'

/**
 * The four "vibe presets" (PRD §3) — the single source of truth for the app's visual languages.
 *
 * A preset is the join key between brand identity, AI image generation, and typography:
 * - `promptModifiers` + `negativePrompt` feed the fal.ai backdrop prompt (later phase),
 * - `fontPairing` (keys into the font registry) auto-locks the carousel typography,
 * - `defaultPalette` is the fallback palette when extraction is thin, and the base a measured accent
 *   is merged onto.
 */
/** How this preset generates backdrop imagery — the fal model + style, declared per preset so routing is
 *  data-driven and new presets need no code branches. `model`s are the cheap preview tier (premium at export). */
export type ImageConfig = { model: string; style?: string; ratio?: '4:5' | '1:1' }

export type VibePreset = {
  id: VibePresetId
  /** The label shown to non-technical users (PRD §"How to Implement"). */
  uiLabel: string
  targetClients: string
  description: string
  /** Hardcoded fal.ai style modifiers injected verbatim into the backdrop prompt. */
  promptModifiers: string
  /** What the image model must never render (text/logos etc. — the overlay owns typography). */
  negativePrompt: string
  fontPairing: { display: FontKey; body: FontKey }
  defaultPalette: Palette
  image: ImageConfig
}

const NO_TEXT_NEGATIVE =
  'text, words, letters, typography, captions, watermark, logo, signature, ui elements, low quality, blurry, distorted, extra fingers, deformed'

export const VIBE_PRESETS: Record<VibePresetId, VibePreset> = {
  'luxury-minimalist': {
    id: 'luxury-minimalist',
    uiLabel: 'Elegant Luxury',
    targetClients: 'Aesthetic clinics, skincare brands, premium real estate, high-end coaching',
    description:
      'Soft lighting, beige/neutral palettes, marble or satin textures, heavy negative space — editorial lookbook feel that reads as trustworthy and premium.',
    promptModifiers:
      'minimalist studio lighting, neutral muted tones, editorial composition, soft focus, vast negative space for text, high-end luxury aesthetic, clean lines',
    negativePrompt: NO_TEXT_NEGATIVE + ', clutter, harsh lighting, saturated colors, busy background',
    fontPairing: { display: 'cormorant-garamond', body: 'montserrat' },
    defaultPalette: {
      surface: '#F7F3EE',
      ink: '#2B2622',
      accent: '#B08D57',
      'accent-deep': '#6E5836',
      line: '#E4DBD0',
    },
    image: { model: 'fal-ai/flux/schnell', ratio: '4:5' },
  },
  'modern-tech': {
    id: 'modern-tech',
    uiLabel: 'Modern Tech',
    targetClients: 'Digital marketing agencies, SaaS companies, crypto/finance startups, B2B creators',
    description:
      'Clean 3D isometric shapes, vibrant flat vectors, glassmorphism and sharp geometric layouts — makes data and frameworks look accessible and shareable.',
    promptModifiers:
      '3D minimalist vector illustration, flat vibrant colors, isometric view, tech corporate design style, isolated on solid background, clean corporate memphis',
    negativePrompt: NO_TEXT_NEGATIVE + ', photorealistic, grunge, vintage, noise',
    fontPairing: { display: 'space-grotesk', body: 'inter' },
    defaultPalette: {
      surface: '#F4F6FB',
      ink: '#0E1525',
      accent: '#2563EB',
      'accent-deep': '#1E3A8A',
      line: '#DDE3EE',
    },
    image: { model: 'fal-ai/recraft/v3/text-to-image', style: 'vector_illustration', ratio: '4:5' },
  },
  'creative-edgy': {
    id: 'creative-edgy',
    uiLabel: 'Bold Creative',
    targetClients: 'Freelance designers, video editors, Gen-Z brands, streetwear, modern media agencies',
    description:
      'Risograph textures, halftone dots, cyberpunk neon accents and 90s vaporwave — designed to break the scroll and read as a forward-thinking trendsetter.',
    promptModifiers:
      'risograph texture print style, high contrast, vibrant ink overlay, retro-modern graphic design, gritty halftone, bold aesthetic',
    negativePrompt: NO_TEXT_NEGATIVE + ', corporate stock photo, muted colors, minimal',
    fontPairing: { display: 'archivo-black', body: 'space-grotesk' },
    defaultPalette: {
      surface: '#141414',
      ink: '#FAF5EA',
      accent: '#FF4D2E',
      'accent-deep': '#C7351C',
      line: '#3A3A3A',
    },
    image: { model: 'fal-ai/recraft/v3/text-to-image', style: 'digital_illustration', ratio: '4:5' },
  },
  'polished-photo': {
    id: 'polished-photo',
    uiLabel: 'Corporate Photo',
    targetClients: 'E-commerce stores, lifestyle influencers, restaurants, fitness trainers',
    description:
      'Crisp, realistic lifestyle photography with real people, product close-ups and natural sunlight — ideal for seamless multi-slide photo backgrounds.',
    promptModifiers:
      'photorealistic candid photography, natural sunlight, organic textures, commercial lifestyle shoot, crisp details, neutral background',
    negativePrompt: NO_TEXT_NEGATIVE + ', illustration, 3d render, cartoon, oversaturated, cgi',
    fontPairing: { display: 'fraunces', body: 'libre-franklin' },
    defaultPalette: {
      surface: '#FFFFFF',
      ink: '#1F2421',
      accent: '#C06A4B',
      'accent-deep': '#8A4832',
      line: '#ECE7E1',
    },
    image: { model: 'fal-ai/flux/schnell', ratio: '4:5' },
  },
}

export const DEFAULT_VIBE_PRESET_ID: VibePresetId = 'luxury-minimalist'

export const VIBE_PRESET_IDS = Object.keys(VIBE_PRESETS) as VibePresetId[]

/** Look up a preset by id, or the default when the id is unknown. */
export function getVibePreset(id: string | null | undefined): VibePreset {
  return VIBE_PRESETS[id as VibePresetId] ?? VIBE_PRESETS[DEFAULT_VIBE_PRESET_ID]
}

/** Narrow an arbitrary string to a known `VibePresetId`, falling back to the default. */
export function toVibePresetId(id: string | null | undefined): VibePresetId {
  return id && id in VIBE_PRESETS ? (id as VibePresetId) : DEFAULT_VIBE_PRESET_ID
}
