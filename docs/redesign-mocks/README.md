# Redesign mocks

Historical reference, **not spec.** The landing page and the auth dialogs these
mocks describe are built, so `src/features/marketing/` and
`src/features/auth/` are the truth for them. If a mock and the code disagree,
the code wins. If a mock and [DESIGN.md](../../DESIGN.md) disagree, DESIGN.md
wins — the landing mocks predate Contour and still carry the pre-Contour
palette (`--paper: #f1f0ea`, a `--raised` card gradient, lime hairlines on
paper), all of which the shipped page deliberately does not use.

| Mock                                            | Surface                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| `landing.html`                                  | The full landing scroll — built, self-contained |
| `landing.template.html` + `build_landing.py`    | Its editable source and assembler               |
| `direction-01.html`                             | The original token/direction study              |
| `auth.html`                                     | The split-page auth pass, superseded by dialogs |
| `kontuur-*.html`                                | Per-surface app mocks                           |
| `img-*-c.jpg`                                   | The fal.ai photography the mocks embed          |

The calendar has two files doing different jobs: `kontuur-calendar.html` is the
diagnosis and the phased plan; `kontuur-calendar-v2.html` is the screen — a
real-scale frame whose Week / Month / Clients views all render from one shared
data model. Read the second for the design, the first for why.

Older mocks are in [`archive/`](./archive/), several of them still cited by name
from code comments.

## The dashboard screenshot

`public/landing/dashboard.png` is a real capture of the real dashboard, with
every identifying string replaced: the workspace is "Northwind Studio", and the
three clients are the same GreenLeaf Café / VitaFit Nutrition / Atelier Nord the
rest of the page uses. The capture it came from showed a test workspace name and
three real clients, including one client's actual drafts — legible medical copy
belonging to a named third party, which must never appear on a public page.

**Every state indicator is untouched.** The failure card, the counts, the
unscheduled coverage rows — those are what the product looked like at that
moment, and repainting them would turn a photograph into a drawing. If a
healthier-looking dashboard is wanted, re-shoot from a seeded workspace rather
than editing this file: the anonymisation is safe to redo, invented state is not.

## Generating photography

Every photograph in the product's marketing is generated, and **no image is
reused across two surfaces** — a café shot in the hero wall may not also be the
approvals card. The shipped set lives in `public/landing/`; the copies here are
what the mocks embed.

```
POST https://fal.run/fal-ai/flux/schnell
Authorization: Key $FAL_API_KEY
{ "prompt": "...", "image_size": "landscape_4_3" | "portrait_4_3",
  "num_inference_steps": 4, "num_images": 1 }
```

- **The `.env.local` value is quoted** — strip the quotes before sending it, or
  every request comes back 401.
- Downsize after: `sips -Z 900 -s format jpeg -s formatOptions 72 out.jpg --out out.jpg`.
- Prompt shape: *"Editorial ⟨niche⟩ photography, ⟨the specific thing the caption
  names⟩, soft natural light, minimal calm styling, shallow depth of field, no
  people, no text, no logos"*.
- **Always look at the output before shipping it.** "No people" is a request,
  not a guarantee — the editor-canvas frame came back with a figure at a table
  behind the glass on the first pass and had to be regenerated.
- Where a caption names something, the photograph has to contain it. The engine
  demo's café copy says *pumpkin cortado* and *cardamom buns*, so its two images
  are a pumpkin cortado and cardamom buns. A picture that could sit under any
  caption is the exact failure that section exists to deny.
