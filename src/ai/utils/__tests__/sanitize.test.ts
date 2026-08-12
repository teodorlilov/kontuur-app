import { describe, it, expect } from 'vitest'
import { stripMarkdownArtifacts } from '../sanitize'

describe('stripMarkdownArtifacts', () => {
  it('strips heading markers at line starts', () => {
    expect(stripMarkdownArtifacts('# Flat pricing моделът стартира от $1,499')).toBe(
      'Flat pricing моделът стартира от $1,499'
    )
    expect(stripMarkdownArtifacts('Intro\n## Второ заглавие\ntext')).toBe(
      'Intro\nВторо заглавие\ntext'
    )
  })

  it('unwraps paired bold, underscore and inline-code markers', () => {
    expect(stripMarkdownArtifacts('**Headline** and `код` and __точка__')).toBe(
      'Headline and код and точка'
    )
  })

  it('keeps hashtags — no whitespace after # means it is a tag, not a heading', () => {
    expect(stripMarkdownArtifacts('Great tips!\n#marketing #социални')).toBe(
      'Great tips!\n#marketing #социални'
    )
  })

  it('keeps dash lists and lone asterisks — likely the writer’s intent', () => {
    const caption = 'Три съвета:\n- първи\n- втори\nрезултат: 5* хотел'
    expect(stripMarkdownArtifacts(caption)).toBe(caption)
  })

  it('leaves clean text untouched', () => {
    const caption = 'Обикновен пост без форматиране. Свържете се с нас.'
    expect(stripMarkdownArtifacts(caption)).toBe(caption)
  })
})
