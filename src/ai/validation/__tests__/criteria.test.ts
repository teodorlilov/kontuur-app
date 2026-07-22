import { describe, it, expect } from 'vitest'
import { carouselStructureRules } from '../criteria'

describe('carouselStructureRules', () => {
  it('collapses the middle roles for a 3-slide carousel (no unsatisfiable 4-role demand)', () => {
    const rules = carouselStructureRules(3).join('\n')
    expect(rules).toContain('Cover slide (slide 1)')
    expect(rules).toContain('Middle slide (slide 2)')
    expect(rules).toContain('CTA slide (slide 3')
    expect(rules).not.toContain('Value/payoff')
    expect(rules).not.toContain('Content slides')
  })

  it('uses concrete slide numbers for a 6-slide carousel', () => {
    const rules = carouselStructureRules(6).join('\n')
    expect(rules).toContain('Content slides (slides 2–4)')
    expect(rules).toContain('Value/payoff slide (slide 5)')
    expect(rules).toContain('CTA slide (slide 6')
  })

  it('uses the singular content-slide wording for a 4-slide carousel', () => {
    const rules = carouselStructureRules(4).join('\n')
    expect(rules).toContain('Content slide (slide 2)')
    expect(rules).toContain('Value/payoff slide (slide 3)')
    expect(rules).toContain('CTA slide (slide 4')
  })

  it('always includes the shared rules, including the slide-body length bound', () => {
    for (const count of [3, 4, 6, 10]) {
      const rules = carouselStructureRules(count).join('\n')
      expect(rules).toContain('DISTINCT idea')
      expect(rules).toContain('at most ~30 words')
      expect(rules).toContain('Main caption: 40-60 words')
    }
  })
})
