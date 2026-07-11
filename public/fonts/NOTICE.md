# Baked fonts

Self-hosted default-kit fonts for the render service. Latin + Cyrillic subsets only; the Cyrillic
subset carries the Bulgarian `locl` letterforms. Variable weight ranges. `@font-face` declarations
live in `src/app/render/[postVisualId]/baked-fonts.css`.

| File | Family | Subset | Weights |
| --- | --- | --- | --- |
| `source-sans-3-latin.woff2` | Source Sans 3 | latin | 400–600 |
| `source-sans-3-cyrillic.woff2` | Source Sans 3 | cyrillic | 400–600 |
| `source-serif-4-latin.woff2` | Source Serif 4 | latin | 600–700 |
| `source-serif-4-cyrillic.woff2` | Source Serif 4 | cyrillic | 600–700 |

## License

Both families are licensed under the **SIL Open Font License 1.1** (see `OFL.txt`).

- Source Sans 3 — Copyright 2010–2020 Adobe (https://www.adobe.com/), with Reserved Font Name "Source".
- Source Serif 4 — Copyright 2014–2021 Adobe (https://www.adobe.com/), with Reserved Font Name "Source".

Subsetted from the Google Fonts distribution. The full library (20 families) is fetched on demand via
Google Fonts; only these baked defaults are self-hosted for zero-latency default rendering.
