# Open Atlas

A field guide to **121 free-to-access AI resources** — 61 public datasets and 60 open-weight models across 15 categories.

Every entry includes a plain-language summary, best-for uses, tags, license and license class, access route, scale, year, and a direct link to the source. The goal is a trustworthy starting point, not an exhaustive index.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Features

- Full-text search with `/` and `⌘K` / `Ctrl K` shortcuts
- Filters for type, category, license class, access, and saved items
- Sorting by curated order, recency, name, or category
- Saved shortlist persisted in `localStorage`
- Light and dark themes, remembered between visits
- Detail drawer with field notes and license/access caveats
- Responsive layout with a mobile filter sheet
- Keyboard support: `/` or `⌘K` to search, `Esc` to close panels

## Project structure

```text
src/
  App.tsx                  interface, filtering, saved state, overlays
  data.ts                  curated catalog and category metadata
  types.ts                 shared domain types
  components/
    CategoryIcon.tsx       category-to-icon mapping
  index.css                design system and responsive styles
```

## Data and licensing notes

The catalog lives in `src/data.ts`. Each resource uses one of four license classes:

| Class | Meaning |
| --- | --- |
| `permissive` | Standard open licenses, usually safe for commercial use with attribution |
| `conditional` | Free, but with acceptable-use rules, thresholds, or registration |
| `noncommercial` | Research and personal use only; commercial use needs permission |
| `research` | Usually gated and limited to non-commercial research |

**Free to access does not mean unrestricted.** Gated and application-only resources are still free, but terms vary. Licenses can change, and several models add acceptable-use policies on top of their base license. Always verify at the source.

This project is informational, not legal advice, and is not affiliated with any dataset or model maker.
