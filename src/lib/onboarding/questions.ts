import type { Question } from '@/types/onboarding'
import type { UrlAnalysisResponse } from '@/types/api'

export const QUESTIONS: Question[] = [
  {
    id: 'q0',
    text: "What's the name of this client or business?",
    chips: [],
  },
  {
    id: 'q1',
    text: 'Describe what your client does — include specific services, products, or specialties.',
    chips: [
      'Medical clinic / doctor',
      'Restaurant / café',
      'Fitness studio / gym',
      'Beauty salon / spa',
      'Online shop / e-commerce',
      'Consulting / coaching',
    ],
  },
  {
    id: 'q2',
    text: 'Who follows them or should follow them? Think about who actually buys from them.',
    chips: [
      'Women 25–45, health-conscious',
      'Local residents nearby',
      'Business owners / professionals',
      'Young adults 18–30 on social media',
    ],
  },
  {
    id: 'q3',
    text: 'What should a good post make someone do?',
    chips: [
      'Book an appointment / visit',
      'Buy a product online',
      'Follow and engage',
      'Learn something and trust the brand',
    ],
  },
  {
    id: 'q4',
    text: 'Pick an example that sounds closest to how this client should post.',
    chips: [
      'Warm and approachable — like a friend giving advice',
      'Expert and trustworthy — like a doctor explaining',
      'Energetic and bold — like a coach motivating',
      'Polished and elegant — like a luxury brand',
    ],
  },
  {
    id: 'q4b',
    text: 'What language should posts be in, and how formal?',
    chips: [
      'English — professional (you)',
      'English — casual (hey, you guys)',
      'Bulgarian — formal (Вие)',
      'Bulgarian — casual (ти)',
      'Spanish — formal (usted)',
      'Spanish — casual (tú)',
    ],
  },
  {
    id: 'q5',
    text: 'What should we never post about? Any sensitive topics for this client?',
    chips: [
      'No medical/health claims',
      'No politics or religion',
      'No competitor mentions',
      'No price discussions',
      'No before/after photos',
    ],
  },
  {
    id: 'q6',
    text: 'If their best customer left a review, what would they say? Be specific.',
    chips: [
      'They changed my life / health',
      'Best experience in the city',
      'I trust them completely',
      'They actually listen to what I need',
    ],
  },
  {
    id: 'q7',
    text: 'What types of posts should we create? Pick the content pillars.',
    chips: [
      'Services & offers',
      'Educational / tips',
      'Behind the scenes',
      'Client results / testimonials',
    ],
    multiSelect: true,
  },
]

/** Maps analysis fields to a detected answer for the given question. */
export function getDetectedAnswer(
  questionId: string,
  analysis: UrlAnalysisResponse | null
): string | null {
  if (!analysis) return null
  switch (questionId) {
    case 'q0':
      return analysis.detected_business_name || null
    case 'q1':
      return analysis.detected_niche || null
    case 'q2':
      return analysis.detected_target_audience?.length
        ? analysis.detected_target_audience.join(', ')
        : null
    case 'q4':
      return analysis.detected_tone || null
    case 'q4b': {
      if (!analysis.detected_language) return null
      return `${analysis.detected_language} — ${analysis.detected_language_formality}`
    }
    case 'q5':
      return analysis.detected_avoid_topics || null
    case 'q6':
      return analysis.detected_testimonial_voice || null
    case 'q7':
      return analysis.detected_content_pillars?.length
        ? analysis.detected_content_pillars.map((p) => p.pillar).join(', ')
        : null
    default:
      return null
  }
}
