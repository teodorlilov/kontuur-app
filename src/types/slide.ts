/**
 * The writable text of one carousel slide.
 *
 * Named because the pair is the unit every stage hands to the next — the writer
 * returns it, the judge corrects it, the compositor renders it — and it was
 * written out inline 23 times across 16 files. That anonymity had already cost
 * something: three functions parsing this same shape (generateCarousel,
 * reviseCarousel, rewriteCarousel) drifted into three different levels of
 * guarding, and the one with none threw a raw TypeError at the reviewer.
 *
 * Its own leaf module, importing nothing: `types/api.ts` re-exports from
 * `ai/validation/types.ts`, so putting this in either would make the two
 * circular the moment the other imported it.
 */
export interface SlideText {
  headline: string
  body: string
}
