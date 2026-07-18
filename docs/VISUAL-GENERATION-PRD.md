Product Requirement Document (PRD)

Enterprise AI Carousel Creator & Automated Brand Engine


1. Product Vision & Value Proposition
This platform transforms raw business data (websites/social accounts) into highly engaging, consistent, multi-slide social media carousels. It eliminates the need for manual design skills. By combining brand data extraction with context-aware AI design, the application solves the "blank canvas" problem while ensuring every post looks professional, on-brand, and completely unique.


2. The End-to-End User Journey


📥 Onboarding         ✍️ Copy Gen          🎨 Visual Handshake   🛠️ Canvas Polish
┌────────────────┐    ┌────────────────┐    ┌─────────────────┐   ┌─────────────────┐
│ Paste URL/IG   │ ──>│ Pick Platform  │ ──>│ AI Auto-Blends  │──>│ Tweak Text/Crop │
│ Auto-Extract   │    │ Select Slides  │    │ Brand + Topic   │   │ Inpaint Brush   │
│ Brand Profile  │    │ Generate Copy  │    │ Wide Backdrop   │   │ Export Slides   │
└────────────────┘    └────────────────┘    └─────────────────┘   └─────────────────┘

Phase 1: Intelligent Onboarding & Brand Extraction
* The Input: The user pastes a business website URL or Instagram handle.
* The AI Background Scan: The system scrapes and builds a Core Brand Profile identifying:
    * Color Palette: Primary, secondary, and background hex colors.
    * Typography: Brand fonts or closest web-safe alternatives.
    * Identity Details: Brand name, exact niche, and target demographic.
    * Tone of Voice: Style of copy (e.g., professional, witty, casual).
    * Content Pillars: Master topics the business frequently covers.

Phase 2: Content Briefing & Copy Generation
* Client Selection: User chooses a client profile
* Platform Selection: User chooses single image or carousel post
* Slide Count: User selects the length of the carousel (e.g., 4 to 10 slides).
* AI Copy Generation: The writing engine crafts a cohesive hook, body points, and call-to-action (CTA), explicitly split across the chosen number of slides.

Phase 3: Visual Generation & Design Handshake
* The Design Blend: Before the user enters the editor, the app merges the Onboarding Brand Profile with the Generated Slide Content.
* Visual Backdrop: The AI outputs a relevant visual for the post topic while strictly respecting the brand's preset visual identity.
* Canvas Initialization: The text copy is instantly placed onto the slides over the background, delivering a 90%-finished layout immediately.

Phase 4: Creative Workspace & Final Polish
* Live Editing: Users tweak copy, drag elements across slides, crop media, or swap colors.
*  Export or Publishing: User can either export or publish the complete visuals

3. The Core Visual Engine (Presets & Prompt Matrix)
To cater to a broad spectrum ranging from sterile, luxury aesthetic clinics to high-energy digital marketing agencies, your app needs a highly versatile core framework. Instead of offering a massive list of confusing artistic terms, you should group your AI design engine into four distinct "Vibe Presets."
This allows any industry to find a matching visual language while keeping your app’s backend prompt templates manageable and highly scalable.

                           ┌───────────────────┐
                           ┌───────────────────┐
                           │   CORE ENGINE     │
                           └─────────┬─────────┘
                                     │
         ┌───────────────────┬───────┴───────────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│Luxury Minimalist│ │ Modern Tech 3D  │ │Creative & Edgy  │ │Polished Photo   │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│• Aesthetic      │ │• Digital        │ │• Freelancers    │ │• E-commerce     │
│  Clinics        │ │  Marketing      │ │• Gen-Z Brands   │ │• Lifestyle      │
│• Skincare/Real  │ │• SaaS & B2B     │ │• Fashion Media  │ │• Food/Fitness   │
│  Estate         │ │  Startups       │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
🌟 3.1. The "Luxury Minimalist" Preset
* Target Clients: Aesthetic clinics, skincare brands, premium real estate, high-end coaching.
* Visual Style: Soft lighting, beige/neutral color palettes, marble or satin textures, and heavy negative space. It mimics editorial lookbooks and high-end magazine spreads.
* Why it works for carousels: It instantly builds trust and looks highly professional. The clean, uncluttered backgrounds ensure that text overlays remain effortlessly legible.
* AI Prompt Modifiers to hardcode: minimalist studio lighting, neutral muted tones, editorial composition, soft focus, vast negative space for text, high-end luxury aesthetic, clean lines --ar 4:1

⚡ 3.2 The "Modern Tech & Vector" Preset
* Target Clients: Digital marketing agencies, SaaS companies, crypto/finance startups, B2B creators.
* Visual Style: Clean 3D isometric shapes, vibrant flat vectors, glassmorphism UI elements, and sharp geometric layouts.
* Why it works for carousels: Marketing and tech agencies love data visualization, charts, and step-by-step frameworks. This style makes complex data look accessible, friendly, and highly shareable.
* AI Prompt Modifiers to hardcode: 3D minimalist vector illustration, flat vibrant colors, isometric view, tech corporate design style, isolated on solid background, clean corporate memphis --ar 4:1

🎨 3.3 The "Creative & Edgy" Preset
* Target Clients: Freelance designers, video editors, Gen-Z brands, streetwear lines, modern media agencies.
* Visual Style: Risograph textures, halftone dots, subtle cyberpunk neon accents, or 90s vintage vaporwave.
* Why it works for carousels: This style is designed to break the scroll on Instagram and TikTok. It stands out violently in a feed and positions the client as a forward-thinking trendsetter.
* AI Prompt Modifiers to hardcode: risograph texture print style, high contrast, vibrant ink overlay, retro-modern graphic design, gritty halftone, bold aesthetic --ar 4:1

📸 3.4 The "Polished Editorial Photo" Preset
* Target Clients: E-commerce stores, lifestyle influencers, restaurants, fitness trainers.
* Visual Style: Crisp, realistic lifestyle photography featuring real people, product close-ups, and natural sunlight.
* Why it works for carousels: Some clients just want real-looking photos. By utilizing a "seamless multi-slide background" technique, an aesthetic clinic can showcase a beautiful treatment room that spans continuously across three slides.
* AI Prompt Modifiers to hardcode: photorealistic candid photography, natural sunlight, organic textures, commercial lifestyle shoot, crisp details, neutral background --ar 4:1


🛠️ How to Implement This in the App’s UI
To deliver a true "multipurpose" experience without overwhelming a plastic surgeon or a media buyer, structure the user flow like this:
1. Step 1 (Select Industry Vibe): The user clicks one of the four presets above (labeled simply as Elegant Luxury, Modern Tech, Bold Creative, or Corporate Photo).
2. Step 2 (The Hook): Behind the scenes, your app injects the hardcoded style prompts.
3. Step 3 (The Text Overlays): Ensure your app automatically pairs the style with appropriate typography. For example, selecting the "Luxury Minimalist" vibe should auto-lock the carousel font to a sleek Serif or a thin Sans-Serif, while "Modern Tech" defaults to a bold, clean geometric font.




4. Advanced Canvas Customization & Intelligence
To step beyond static templates, the workspace includes on-demand asset generation and precise background interaction tools.

  ✨ SVGs-on-Demand (Recraft)                     ✂️ Smart Separation (DIS Model)
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│ • Type prompt ("3D abstract")   │               │ • User clicks background object │
│ • Vector loads instantly on stage│     ───>     │ • DIS model cuts it instantly   │
│ • Pure vector: infinite scale   │               │ • Object becomes separate layer │
│ • Change colors inside editor   │               │ • Move across slide boundaries  │
└─────────────────────────────────┘               └─────────────────────────────────┘

4.1 On-Demand SVG Element Generator (Powered by Recraft V4.1)
Users can inject unique supporting graphics mid-edit via a "Generate SVG" sidebar panel powered by the Recraft V4.1 Vector engine.
* Workflow: A user types a quick prompt (e.g., "Flat icon of an arrow" or "Minimalist line art leaf").
* Canvas Behavior: The asset drops onto the active canvas as an editable vector graphic. It can be resized infinitely 
* Brand Injection: The editor parses the SVG code paths, allowing users to map the asset's individual color channels directly to their onboarding brand color palette.

4.2 Intelligent Object Isolation (Dichotomous Image Segmentation - DIS)
To remove the limitation of a flat background image, users can extract elements directly out of the generated visual using an advanced DIS model.
* Workflow: A user toggles "Isolate Object" and clicks an element inside the generated background (e.g., a serum bottle or a geometric tech block).
* Canvas Behavior: The DIS model runs a high-precision boundary cut. The original background is preserved intact underneath, while the selected element is duplicated into a transparent cutout layer.
* Swipe-Bait Mechanics: Users can drag this newly isolated cutout directly on top of the slide boundaries, creating visual continuity that encourages scrolling.

4.3 Interactive Canvas Layer Architecture
The multi-slide canvas manages elements across four strict depth layers to optimize editing speed:
1. Layer 1: Continuous Backdrop (Bottom) – The generated image during the copy step, which is fully interactive using the DIS separation tool.
2. Layer 2: Custom Elements (Middle) – Holds on-demand generated Recraft SVGs and objects isolated via DIS, allowing users to layer decorative components freely.
3. Layer 3: Branding & Extras – Houses transparent brand logos, custom geometric layout borders, and structural frames.
4. Layer 4: Interactive Typography (Top) – Locked at the top to ensure font headlines and text calls-to-action (CTAs) never get buried or obscured by images.




5. Functional Editor Feature Requirements
To keep the design tool approachable for non-technical users, the editing canvas incorporates automated creative guardrails.

🔤 Advanced Typography & Guardrails
* Social Media Font Pairings: Includes pre-configured typography sets optimized for conversion rates (e.g., Cormorant Garamond paired with Montserrat for Luxury, Space Grotesk paired with Inter for Tech).
* Proportion Protection: Text bounding boxes only permit width expansion. Font sizes wrap lines automatically rather than stretching letters unevenly.
* Contrast Safety Mesh: The editor monitors background chaos. If an AI background is too cluttered, a semi-transparent brand-colored overlay drops behind the text to guarantee contrast.

🖌️ AI Brush Repair (Inpainting Mode)
* The Brush Tool: Users can enter an edit mode and paint a mask over any specific zone on their generated canvas.
* Text Commands: Users type what they want to change in that spot (e.g., "replace this vase with a skincare bottle" or "remove this abstract shape").
* Visual Blending: The background-repair engine swaps the item seamlessly without altering the rest of the layout or background texture.

🛡️ Platform Guardrails & Overlays
* Safe Zone Toggles: Visual overlays simulate target social platforms (e.g., where Instagram profile badges, UI counters, or LinkedIn navigation arrows live).
* Visual Warning Alerts: Warns users instantly if text or vital visual elements drift into platform interface dead-zones.

6. Other Considerations 
6.1 The "First Slide vs. Middle Slide" Visual Hierarchy Problem
* The Gap: Inpainting, SVGs, treat all slides with equal weight. In reality, Slide 1 (The Hook) must have massive visual impact, while Slide 2 to 9 need high legibility for data, and the Final Slide requires a high-contrast Call to Action (CTA).
* The Solution: Adjust the Fal.ai prompt distribution. Instead of generating an identical texture density across the entire ribbon, the prompt must explicitly inject a heavy visual anchor on the far left (Slide 1) and a structured frame on the far right (Final Slide), keeping the center panels clean for body text.
6.2. Text Box Overflow Handling
* The Gap: The LLM generates text copy, and the app places it. However, if the LLM generates a paragraph that is too long for a single slide, the text will overflow past the grid boundary line into the next slide, ruining the user's layout.
* The Solution: Implement a Text-Overflow Boundary Guard. If a generated text block exceeds the bounding height limit of a single slide zone, Konva must automatically truncate the text, create a "Continued on next slide..." node, or alert the user with a highlight box.



—————

User Flow Specification: "Isolate Object" (DIS Model Integration)
This module defines the user experience, interaction states, and feedback loops for the Dichotomous Image Segmentation (DIS) tool within the editing workspace. The goal is to make a complex backend machine-learning process feel instantaneous, predictable, and foolproof for non-technical users.



🗺️ 1. The 4-State Tool Lifecycle

	[ 1. Idle State ] 	➔ [ 2. Active Selection ] 	➔ [ 3. Processing State ] 	➔ [ 4. Success Handoff ]
  • Background Flat     • Hover outlines         		• Background dims       	• New independent layer
  • Toolbar button off  • Crosshair cursor       		• Loading spinner       	• Transformer attached

State 1: Idle (Standard Canvas Editing)
* Canvas Behavior: The user is interacting with text layers or moving existing shapes. The generated visual backdrop is locked at the bottom layer (listening: false configuration).
* Sidebar UI: The "Isolate Object" tool is visible in the toolbar with a clean icon (e.g., a magic wand or a cutout lasso).

State 2: Active Selection Mode (User Targeting)
* Trigger: The user clicks the "Isolate Object" button in the toolbar.
* Visual Shift:
    * The toolbar button switches to a highlighted active state.
    * The user's cursor transforms into a precise crosshair icon.
    * A floating tooltip appears next to the cursor reading: "Click an object on the background to isolate it."
    * The typography and brand logo layers are temporarily given a 30% opacity reduction to signal that the background layer is now the focus.
* Hover Effect: As the user moves their mouse over the background image, the app runs a lightweight local edge-detection overlay. A soft, glowing boundary outline tracing potential shapes follows the mouse cursor to guide their selection.

State 3: Processing State (The AI Cutout Calculation)
* Trigger: The user clicks a targeted object on the backdrop.
* Visual Shift:
    * The entire canvas area shifts to a dimmed 50% opacity.
    * The selected object remains at full opacity, highlighted by a pulsing neon border.
    * A clean loading spinner appears over the item with micro-copy reading: "Analyzing details and cutting outlines..."
    * All user input on the canvas is temporarily frozen to prevent layer corruption while the segmentation model runs.

State 4: Success & Handoff Mode (The Layer Split)
* Trigger: The segmentation endpoint completes and returns the isolated cutout asset coordinates.
* Visual Shift:
    * The workspace instantly snaps back to 100% full brightness.
    * The "Isolate Object" toolbar button automatically toggles off, returning the user to standard editing mode.
    * A localized particle confetti burst triggers over the newly separated object.
    * The Handoff: The original background stays untouched underneath, while the isolated cutout is automatically duplicated into Layer 2: Custom Elements.
    * The editor automatically attaches a Transformer bounding box around the new asset so the user can immediately scale, rotate, or slide it across slide seams.


🛑 2. Error Handling & Edge Cases
To prevent user frustration when the AI model encounters ambiguous shapes or low-resolution textures, implement these fallback paths:

Edge Case A: Clicking flat negative space (e.g., a blank wall)
* System Action: If the DIS model cannot find a definitive object edge cluster inside the click radius, it cancels the processing state.
* UX Solution: Shake the background image slightly, return to State 2 (Active Selection), and display a floating toast notification: "No distinct object found here. Try clicking a specific product, bottle, or gadget."

Edge Case B: Clicking an item that is heavily obscured by text overlays
* System Action: Because text layers live on a higher plane, clicking text could block the user's intent.
* UX Solution: During Active Selection Mode, text layers are set to listening: false. The user can click directly "through" their headlines to target the hidden background objects seamlessly.



🛠️ 3. Interface Layout & Wireframe Placement

┌───────────────────────────────────────────────────────────────────────────┐
│ [← Back]  Project: Winter Skincare        [Undo] [Redo]    [Export PNG ↓] │
├───────────────────────────────────────────────────────────────────────────┤
│ TOOLBAR     │ 🟩 ACTIVE VIEWPORT (State 2: Active Selection)              │
│ ┌─────────┐ │                                                             │
│ │ Select  │ │  ┌───────────────────────┬───────────────────────┐          │
│ ├─────────┤ │  │   TEXT HEADLINE       │                       │          │
│ │ Text    │ │  │ ┌─────────┐           │                       │          │
│ ├─────────┤ │  │ │ ✨(   ) │ 🌟 [Hover]│                       │           │
│ │*Isolate*│ │  │ │  ( _ )  │  Outline  │                       │          │
│ ├─────────┤ │  │ └─────────┘           │                       │          │
│ │ SVGs    │ │  │    SLIDE 1            │    SLIDE 2            │          │
│ └─────────┘ │  └───────────────────────┴───────────────────────┘          │
│             │  [💡 Click an object on the background to isolate it]       │
└─────────────┴─────────────────────────────────────────────────────────────┘


* The Floating Bar Control: Once an item enters State 4 (Successfully Isolated), a micro-menu pins itself to the top of the asset’s transformer box offering immediate actions:
    * [ 🗑️ Delete Cutout ]
    * [ 🎨 Match Brand Palette ]
    * [ 🔀 Send to Back / Bring to Front ]



