-- Seed Bulgarian language rules: formality_rules, language_instructions, opener_examples, native_cta_phrases

INSERT INTO language_rules (
  language,
  native_cta_phrases,
  formality_default,
  formality_rules,
  language_instructions,
  opener_examples
) VALUES (
  'Bulgarian',
  '{
    "carousel_swipe": ["Плъзни надясно →", "Виж следващото →", "Продължи →", "Разлисти →"],
    "book_appointment": ["Запази час", "Запиши се за консултация", "Свържи се с нас", "Пиши ни"],
    "engagement": ["Разпознаваш ли се?", "Случвало ли ти се е?", "Какво мислиш?", "Сподели в коментар"]
  }',
  'neutral',
  '{
    "registers": {
      "formal": {
        "rules": [
          "ADDRESS: Consistently use the formal/polite plural. In Bulgarian, pronouns MUST be capitalized (''Вие'', ''Вас'', ''Ви'', ''Вашият'').",
          "TONE: Maintain professional distance. Act as a trusted expert/consultant, not a friend.",
          "PROHIBITED: No slang, no ''rhetorical intimacy'' (fake friendship), no casual interjections (e.g., ''well'', ''anyway'').",
          "STRUCTURE: No first-person storytelling (''Yesterday a client asked me...''). Use ''One of the most frequent inquiries is...'' instead.",
          "VOCABULARY: Use precise terminology. Avoid shortened verb forms or particles like ''май'', ''майче'', ''я''.",
          "STYLING: Professional and punchy. Avoid robotic ''bureaucratic'' phrasing, but remain strictly respectful."
        ],
        "examples": {
          "bulgarian": [
            {
              "bad": "Вчера един клиент ме попита: ''Колко струва реклама на магистралата?''",
              "good": "Един от най-честите въпроси, които получаваме, е за стойността на рекламно присъствие край магистралата.",
              "reason": "Replaces casual anecdote with professional framing."
            },
            {
              "bad": "Знаете ли какво е най-готиното при тази локация?",
              "good": "Ключовото предимство на тази локация е отличната видимост от магистралата.",
              "reason": "Removes slang (''най-готиното'') and uses objective vocabulary."
            }
          ],
          "general": [
            {
              "bad": "Let''s be real — most people have no clue.",
              "good": "The reality is that many stakeholders underestimate these factors.",
              "reason": "Transitions from colloquial to direct professional observation."
            }
          ]
        }
      },
      "casual": {
        "rules": [
          "ADDRESS: Use the informal singular. In Bulgarian: ''ти'', ''теб'', ''те'' (always lowercase).",
          "TONE: Peer-to-peer. Write as if texting a trusted colleague or talking to a friend.",
          "ENCOURAGED: Use first-person anecdotes, contractions, sentence fragments, and rhetorical questions.",
          "EMOTION: Emojis (limit 1-2) and expressive punctuation (''!'', ''...'') are permitted.",
          "CONSTRAINTS: Casual does not mean sloppy. Maintain perfect grammar and spelling despite the relaxed tone."
        ],
        "examples": {
          "bulgarian": [
            {
              "bad": "Бихме желали да Ви информираме за новата ни услуга.",
              "good": "Искаш ли да знаеш какво ново имаме? Ето кратък апдейт.",
              "reason": "Replaces corporate stiffness with direct, friendly engagement."
            },
            {
              "bad": "Уважаеми клиенти, с удоволствие ви съобщаваме...",
              "good": "Хей, имаме нещо ново, което ще ти хареса.",
              "reason": "Uses personal, high-energy openers."
            }
          ],
          "general": [
            {
              "bad": "It has come to our attention that many clients are unaware...",
              "good": "Most people don''t realize this, but here''s the deal...",
              "reason": "Uses conversational idioms instead of passive corporate phrasing."
            }
          ]
        }
      },
      "neutral": {
        "rules": [
          "ADDRESS: Use lowercase plural in Bulgarian (''вие'', ''вас'', ''ви'') to address a general audience without high-formal weight.",
          "TONE: Balanced and functional. Like a Wikipedia entry or a high-quality news snippet.",
          "OBJECTIVITY: Minimize ''I'' or ''We''. Focus on facts, data, and utility.",
          "VOCABULARY: Avoid both extremes (no ''super cool'' but also no ''we are honored to invite you'').",
          "APPLICATION: Ideal for informational posts where the focus is the content, not the relationship."
        ],
        "examples": {
          "bulgarian": [
            {
              "too_formal": "Бихме желали да ви уведомим, че разполагаме с нов парцел.",
              "too_casual": "Ей, имаме нов парцел, супер е!",
              "good_neutral": "На пазара е нов парцел с добра локация — ето основните характеристики.",
              "reason": "Removes unnecessary politeness markers and emotional hype."
            }
          ],
          "general": [
            {
              "too_formal": "We wish to inform you that a new property has become available.",
              "too_casual": "Hey, check this out — new place just dropped!",
              "good_neutral": "A new property is available — here is what you should know about the location.",
              "reason": "Maintains professionalism without sounding like a legal notice."
            }
          ]
        }
      }
    }
  }',
  'LANGUAGE RULES — BULGARIAN:
You are a native Bulgarian copywriter. Think in Bulgarian from the start.
Do NOT compose in English and translate — every phrase, idiom, and sentence structure must originate in Bulgarian.
If you catch yourself translating an English expression, stop and ask: how would a Bulgarian SMM manager in Sofia actually say this?

NATURALNESS TEST:
After writing, read each sentence and ask: would a Bulgarian person actually post this on Instagram?
If it sounds like it was translated from English — even if grammatically defensible — rewrite it from scratch in Bulgarian. Do not patch a translation.',
  '[
    {"formality": "formal", "id": "professional_observation", "description": "Open with a specific observation from clinical or professional practice — something the expert notices that clients often miss. Framed as knowledge, not intimacy. NOT: \"Many people struggle with X\" (too generic).", "content": "Пациентите с хронично напрежение в лумбалната област последователно показват 30% намаление в мобилността на диафрагмата при вдишване."},
    {"formality": "formal", "id": "counterintuitive_professional", "description": "State a professional insight that contradicts a common assumption in the niche. Must be specific to this field — not a generic \"surprising fact\". Must contain a concrete niche-specific claim.", "content": "Най-предписваното лечение за болки в кръста — пълен покой — беше опровергано като първа линия на терапия преди повече от две десетилетия."},
    {"formality": "formal", "id": "specific_question_expert", "description": "Ask a precise diagnostic question that a professional would ask — one that names a specific situation the target audience is already in. NOT \"Have you ever thought about X?\" (too broad). The question must make the reader stop and think about their own situation.", "content": "Кога за последен път Вашият вътрешен одит идентифицира несъответствие в амортизационния план на нематериалните активи?"},
    {"formality": "formal", "id": "reframe", "description": "Take a concept the audience thinks they understand and reframe it from a professional perspective in one sentence. The reframe must be genuinely surprising — not just rewording. Sets up expert credibility without claiming authority.", "content": "Това, което често се определя като \u201eпрокрастинация\u201d в контекста на високия мениджмънт, в клиничен план представлява сложен дефицит в емоционалната регулация."},
    {"formality": "casual", "id": "specific_feeling_now", "description": "Name a very specific feeling or physical sensation the reader is likely experiencing RIGHT NOW or regularly. Not an emotion category (\"anxiety\") — a specific moment. Must be so precise the reader thinks \"how did they know?\"", "content": "Онзи момент, в който стомахът ти се свива, щом осъзнаеш, че току-що прати поверителен мейл на грешния човек в контактите си..."},
    {"formality": "casual", "id": "counterintuitive_claim", "description": "Open with a claim that directly contradicts what the reader probably believes — stated with confidence, no hedging. Must be specific to the niche, not a generic \"surprising\" opener. The claim should make the reader want to disagree AND keep reading.", "content": "Правилото за 10 000 крачки? Измислено за маркетингова кампания на японски педометър през 60-те. Реалната наука казва, че ползите спират да растат след 7 000."},
    {"formality": "casual", "id": "mid_thought", "description": "Drop the reader into the middle of a thought or scene as if they missed the beginning — creates instant curiosity about what came before. Works like starting a story at chapter 3. Reader must feel they are catching up, not being introduced.", "content": "...и точно в този момент разбрах, че 80-часовата работна седмица не е \u201eуспех\u201d, а просто срив на забавен каданс."},
    {"formality": "casual", "id": "specific_question", "description": "Ask about a very specific experience the audience has definitely had — not a general topic question. The question must name a situation so precisely that anyone who has been through it feels seen. NOT: \"Do you struggle with X?\"", "content": "Кога за последно прочете етикета на \u201eздравословния\u201d си протеинов бар и наистина позна всяка съставка?"},
    {"formality": "casual", "id": "uncomfortable_truth", "description": "Name something true about the niche or the audience''s situation that people know but rarely say out loud. Not a criticism — an observation that feels honest and slightly brave to say. Must feel like relief to read, not a lecture.", "content": "Никой не иска да си го признае, но повечето от нас просто се преструват, че разбират как всъщност работят данъците върху криптото."},
    {"formality": "casual", "id": "specific_detail", "description": "Open with one hyper-specific concrete detail — a number, a moment, a sensory observation — that implies a larger story without stating it. The detail must be so specific it could only come from direct experience.", "content": "След 14 месеца проследяване на всяко хранене, моделът, който изплува, нямаше нищо общо с калориите — проблемът беше прозорецът около 15:00 часа."},
    {"formality": "neutral", "id": "specific_observation", "description": "Open with a precise observation from the niche — something specific enough that only someone with real experience in this field would say it. Framed informatively, not dramatically. Must contain a concrete detail that grounds the observation.", "content": "Имотите, обявени в понеделник сутрин, получават 22% повече прегледи в първите 48 часа в сравнение с обявените в петък следобед."},
    {"formality": "neutral", "id": "counterintuitive_claim", "description": "State a claim that contradicts a common assumption — delivered with confidence but without aggression. Specific to the niche, not a generic hook. Must make the reader want to understand why, not just be surprised.", "content": "Най-скъпите имоти в центъра често носят най-ниска доходност от наем в сравнение с проектите в покрайнините на града."},
    {"formality": "neutral", "id": "specific_question", "description": "Ask a precise question about a specific situation the audience is in or has been in. The question must be concrete enough that the reader can answer yes or no based on a real experience — not a hypothetical.", "content": "Когато преглеждате месечните си абонаменти за софтуер, забелязвате ли повече от три инструмента с дублиращи се функции?"},
    {"formality": "neutral", "id": "specific_detail", "description": "Open with one concrete, specific detail — a precise number, a named moment, a specific object or outcome — that creates immediate curiosity about the context. Must be grounded in the niche world, not invented for effect.", "content": "Над 65% от купувачите на първо жилище пренебрегват състоянието на покрива за сметка на интериорния дизайн на кухнята."},
    {"formality": "neutral", "id": "reframe", "description": "Take a concept the audience already has an opinion on and present it from a different angle in one sentence — without telling them their current view is wrong. The reframe reveals something they had not considered. Should feel like a useful lens, not a correction.", "content": "Това, което повечето купувачи описват като \u201eинтуиция\u201d за даден имот, обикновено е подсъзнателната им обработка на три конкретни сигнала от средата."}
  ]'
)
ON CONFLICT (language) DO UPDATE SET
  native_cta_phrases = EXCLUDED.native_cta_phrases,
  formality_rules = EXCLUDED.formality_rules,
  language_instructions = EXCLUDED.language_instructions,
  opener_examples = EXCLUDED.opener_examples;
