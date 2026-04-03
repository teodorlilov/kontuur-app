-- Seed English language rules: formality_rules, language_instructions, opener_examples, native_cta_phrases

INSERT INTO language_rules (
  language,
  native_cta_phrases,
  formality_default,
  formality_rules,
  language_instructions,
  opener_examples
) VALUES (
  'English',
  '{
    "carousel_swipe": ["Swipe to see more →", "Keep reading →", "See what''s inside →", "Swipe through →"],
    "book_appointment": ["Book a consultation", "Get in touch", "Reserve your spot", "Schedule a call"],
    "engagement": ["Can you relate?", "Has this happened to you?", "What do you think?", "Share in the comments"]
  }',
  'neutral',
  '{
    "registers": {
      "formal": {
        "rules": [
          "ADDRESS: Use the second person ''you'' but avoid direct ''you'' in openers. Prefer passive or objective framing.",
          "CONTRACTIONS: Strictly prohibited. Use ''do not'' instead of ''don''t'', ''it is'' instead of ''it''s''.",
          "VOCABULARY: Use Latinate/sophisticated verbs (e.g., ''purchase'' instead of ''buy'', ''utilize'' instead of ''use'', ''inform'' instead of ''tell'').",
          "STRUCTURE: Avoid starting sentences with conjunctions (And, But, So). Use transitional phrases (Furthermore, However, Consequently).",
          "PROHIBITED: No phrasal verbs where a single word exists (e.g., use ''extinguish'' instead of ''put out''). No slang or idioms.",
          "DISTANCE: Maintain an expert-to-client distance. No personal anecdotes or ''I'' statements unless representing a corporate ''We''."
        ],
        "examples": {
          "english": [
            {
              "bad": "So, we''re going to talk about why you should buy this.",
              "good": "This report examines the primary advantages of acquisition.",
              "reason": "Removes contractions, casual openers, and simple verbs."
            },
            {
              "bad": "I asked a client yesterday what they thought...",
              "good": "Market feedback indicates that client priorities are shifting.",
              "reason": "Replaces personal storytelling with data-driven observation."
            }
          ]
        }
      },
      "casual": {
        "rules": [
          "ADDRESS: Direct and personal. Frequent use of ''you'' and ''your''.",
          "CONTRACTIONS: Mandatory for a natural flow (e.g., ''you''re'', ''won''t'', ''can''t'').",
          "VOCABULARY: Use phrasal verbs and common Germanic words (e.g., ''get'', ''help'', ''check out'').",
          "STRUCTURE: Sentence fragments are acceptable for emphasis. Can start sentences with ''And'', ''But'', or ''Plus''.",
          "INTERACTION: Use rhetorical questions, exclamations, and direct calls to action (e.g., ''Give it a try!'').",
          "STORYTELLING: First-person singular (''I'') is encouraged to build relatability."
        ],
        "examples": {
          "english": [
            {
              "bad": "It is recommended that one checks the oil regularly.",
              "good": "Don''t forget to check your oil—it''ll save you a headache later.",
              "reason": "Uses contractions, direct address, and relatable reasoning."
            },
            {
              "bad": "We would like to assist you with your search.",
              "good": "Looking for a hand with your search? We''ve got you covered.",
              "reason": "Uses a conversational question and idiomatic phrasing."
            }
          ]
        }
      },
      "neutral": {
        "rules": [
          "ADDRESS: Direct but professional. Use ''you'' sparingly.",
          "CONTRACTIONS: Occasional use is permitted to avoid sounding robotic, but avoid overusing them.",
          "VOCABULARY: Clear, plain English. Avoid both high-level jargon and low-level slang.",
          "TONE: Instructive and helpful. Like a modern user manual or a professional news article.",
          "BALANCE: No ''Dear Valued Customer'' (too formal) and no ''Hey guys!'' (too casual). Start with the main point.",
          "CLARITY: Prioritize brevity and active voice without being overly ''chatty''."
        ],
        "examples": {
          "english": [
            {
              "too_formal": "Should you require further assistance, do not hesitate to contact us.",
              "too_casual": "Hit us up if you need anything else!",
              "good_neutral": "Please let us know if you have any other questions.",
              "reason": "Helpful and polite without being stiff or overly familiar."
            },
            {
              "too_formal": "The aforementioned property encompasses three bedrooms.",
              "too_casual": "This 3-bed place is honestly a total steal.",
              "good_neutral": "This property features three bedrooms and is located near the city center.",
              "reason": "Focuses on facts using standard, accessible language."
            }
          ]
        }
      }
    }
  }',
  'LANGUAGE RULES — ENGLISH:
You are a native English copywriter. Think in natural, idiomatic English.
Do NOT write in "AI English" — avoid the predictable patterns that make AI-generated content instantly recognizable.
If a sentence sounds like it came from ChatGPT or a corporate press release, rewrite it from scratch.

NATURALNESS TEST:
After writing, read each sentence and ask: would a real person actually post this on social media?
If it sounds like it was generated by AI — even if grammatically perfect — rewrite it from scratch. Do not polish AI-sounding copy; replace it entirely.',
  '[
    {"formality": "formal", "id": "professional_observation", "description": "Open with a specific observation from clinical or professional practice — something the expert notices that clients often miss. Framed as knowledge, not intimacy. NOT: \"Many people struggle with X\" (too generic).", "content": "Patients who present with chronic lumbar tension consistently show a 30% reduction in diaphragm mobility during peak inhalation."},
    {"formality": "formal", "id": "counterintuitive_professional", "description": "State a professional insight that contradicts a common assumption in the niche. Must be specific to this field — not a generic \"surprising fact\". Must contain a concrete niche-specific claim.", "content": "The most prescribed exercise for lower back pain — bed rest — was disproven as a first-line treatment over two decades ago."},
    {"formality": "formal", "id": "specific_question_expert", "description": "Ask a precise diagnostic question that a professional would ask — one that names a specific situation the target audience is already in. NOT \"Have you ever thought about X?\" (too broad). The question must make the reader stop and think about their own situation.", "content": "When was the last time your internal audit identified a discrepancy in the depreciation schedule of intangible assets?"},
    {"formality": "formal", "id": "reframe", "description": "Take a concept the audience thinks they understand and reframe it from a professional perspective in one sentence. The reframe must be genuinely surprising — not just rewording. Sets up expert credibility without claiming authority.", "content": "What is commonly categorized as ''procrastination'' in executive coaching is, in clinical terms, a sophisticated emotional regulation deficit."},
    {"formality": "casual", "id": "specific_feeling_now", "description": "Name a very specific feeling or physical sensation the reader is likely experiencing RIGHT NOW or regularly. Not an emotion category (\"anxiety\") — a specific moment. Must be so precise the reader thinks \"how did they know?\"", "content": "That exact moment your stomach drops when you realize you''ve sent a sensitive email to the wrong ''John'' in your contacts..."},
    {"formality": "casual", "id": "counterintuitive_claim", "description": "Open with a claim that directly contradicts what the reader probably believes — stated with confidence, no hedging. Must be specific to the niche, not a generic \"surprising\" opener. The claim should make the reader want to disagree AND keep reading.", "content": "The 10,000 steps rule? Made up for a Japanese pedometer marketing campaign in the 1960s. The actual science says 7,000 is where the benefits plateau."},
    {"formality": "casual", "id": "mid_thought", "description": "Drop the reader into the middle of a thought or scene as if they missed the beginning — creates instant curiosity about what came before. Works like starting a story at chapter 3. Reader must feel they are catching up, not being introduced.", "content": "...and that''s the moment I realized that working 80 hours a week wasn''t a ''grind,'' it was a slow-motion collapse."},
    {"formality": "casual", "id": "specific_question", "description": "Ask about a very specific experience the audience has definitely had — not a general topic question. The question must name a situation so precisely that anyone who has been through it feels seen. NOT: \"Do you struggle with X?\"", "content": "When was the last time you read the ingredients list on your ''healthy'' protein bar and actually recognized every single one?"},
    {"formality": "casual", "id": "uncomfortable_truth", "description": "Name something true about the niche or the audience''s situation that people know but rarely say out loud. Not a criticism — an observation that feels honest and slightly brave to say. Must feel like relief to read, not a lecture.", "content": "Nobody wants to admit it, but most of us are just pretending to understand how crypto taxes actually work."},
    {"formality": "casual", "id": "specific_detail", "description": "Open with one hyper-specific concrete detail — a number, a moment, a sensory observation — that implies a larger story without stating it. The detail must be so specific it could only come from direct experience.", "content": "After 14 months of tracking every meal, the pattern that emerged had nothing to do with calories — it was the 3pm window that kept derailing everything."},
    {"formality": "neutral", "id": "specific_observation", "description": "Open with a precise observation from the niche — something specific enough that only someone with real experience in this field would say it. Framed informatively, not dramatically. Must contain a concrete detail that grounds the observation.", "content": "Properties listed on Monday mornings receive 22% more views in the first 48 hours than those listed on Friday afternoons."},
    {"formality": "neutral", "id": "counterintuitive_claim", "description": "State a claim that contradicts a common assumption — delivered with confidence but without aggression. Specific to the niche, not a generic hook. Must make the reader want to understand why, not just be surprised.", "content": "The most expensive real estate in the city center often yields the lowest rental ROI compared to suburban developments."},
    {"formality": "neutral", "id": "specific_question", "description": "Ask a precise question about a specific situation the audience is in or has been in. The question must be concrete enough that the reader can answer yes or no based on a real experience — not a hypothetical.", "content": "When you review your monthly SaaS subscriptions, do you notice more than three tools with overlapping features?"},
    {"formality": "neutral", "id": "specific_detail", "description": "Open with one concrete, specific detail — a precise number, a named moment, a specific object or outcome — that creates immediate curiosity about the context. Must be grounded in the niche world, not invented for effect.", "content": "Over 65% of first-time homebuyers overlook the structural integrity of the roof in favor of modern kitchen aesthetics."},
    {"formality": "neutral", "id": "reframe", "description": "Take a concept the audience already has an opinion on and present it from a different angle in one sentence — without telling them their current view is wrong. The reframe reveals something they had not considered. Should feel like a useful lens, not a correction.", "content": "What most buyers describe as a ''gut feeling'' about a property is usually their subconscious processing three specific environmental cues."}
  ]'
)
ON CONFLICT (language) DO UPDATE SET
  native_cta_phrases = EXCLUDED.native_cta_phrases,
  formality_rules = EXCLUDED.formality_rules,
  language_instructions = EXCLUDED.language_instructions,
  opener_examples = EXCLUDED.opener_examples;
