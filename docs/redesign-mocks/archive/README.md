# Archived mocks

Historical reference, **not spec**. Every surface below is built, so the code is
the truth for it — these are kept because they record *why* certain constants
are what they are, and a few are cited from code comments for exactly that.

| Mock | Surface | Still cited by |
| --- | --- | --- |
| `dashboard-v2.html` | Dashboard, Contour ground | `components/layout/contour-field.tsx` — the field constants are tuned against this ground and will not reproduce if re-derived |
| `clients-contour.html` | Ground A/B/C study | `components/layout/contour-field.tsx` — state B is what shipped |
| `kontuur-headers-all-pages.html` | The page header across all nine surfaces | `components/layout/page-header/page-header.tsx` |
| `dashboard.html` | First dashboard pass | `components/layout/sidebar.tsx` — sidebar widths (240 / 78) |
| `clients.html` | First clients pass | — superseded by the shipped roster |
| `vision.html` | The redesign argument: one atom, many arrangements | — |

If a mock and the code disagree, **the code wins**. If a mock and
[DESIGN.md](../../../DESIGN.md) disagree, DESIGN.md wins.

Live mocks — surfaces not yet built — stay one level up in
[`docs/redesign-mocks/`](../): `landing.html`, `landing.template.html`,
`direction-01.html` (base CSS for `build_landing.py`), and `auth.html`.
