# Open Atlas

A field guide to **121 free-to-access AI resources** — 61 public datasets and 60 open-weight models across 15 categories.

Every entry includes a plain-language summary, best-for uses, tags, license and license class, access route, scale, year, and a direct link to the source. The goal is a trustworthy starting point, not an exhaustive index.

Catalog search and facet filtering run locally in a **WebAssembly search core**. There is no backend, API, or server-side query processing: the production build is a static site.

## Run locally

```bash
npm install
npm run dev
```

`dev` compiles the WebAssembly module first, then starts Vite.

Production build:

```bash
npm run build
npm run preview
```

`build` regenerates the WASM artifact, type-checks the app, and emits a static `dist/` folder.

## Features

- Full-text search backed by WebAssembly, with `/` and `⌘K` / `Ctrl K` shortcuts
- One WASM pass for type, category, license, access, saved-only, and query filters
- Sorting by curated order, recency, name, or category
- Saved shortlist persisted in `localStorage`
- Light and dark themes, remembered between visits
- Detail drawer with field notes and license/access caveats
- Responsive layout with a mobile filter sheet
- Keyboard support: `/` or `⌘K` to search, `Esc` to close panels
- Visible engine badge showing when the WASM core is ready
- Automatic JavaScript fallback if WebAssembly cannot load

## WebAssembly search core

The search engine is written in WebAssembly text format and compiled with [WABT](https://github.com/AssemblyScript/wabt.js), so no Rust or emscripten toolchain is needed.

```text
wasm/
  catalog.wat              search and facet-filter engine source
scripts/
  build-wasm.mjs           validates and compiles the engine
public/wasm/
  catalog.wasm             generated static module (committed)
src/
  catalogFilter.ts         shared field index + JavaScript fallback
  wasm/catalogFilter.ts    WASM loader, memory bridge, and result reader
```

At startup the app fetches `catalog.wasm` as a static asset, encodes the catalog text and facet metadata into linear memory, and calls the exported `filter` function whenever the query changes. The module performs case-insensitive multi-word substring matching and all facet checks. React keeps presentation concerns such as sorting, pagination, and rendering.

If the module is missing, blocked, or unsupported, the app automatically uses the equivalent JavaScript filter and labels the active engine as `JS fallback` in the catalog toolbar.

Rebuild only the WASM artifact:

```bash
npm run build:wasm
```

The loader uses Vite's `BASE_URL`, so a build made with a matching base path can be deployed at a domain root or a subpath. No server configuration or API is required; the generated `dist/` directory can be served by any static host.

## Deploy to GitHub Pages

This branch includes a GitHub Actions workflow that builds the site with the correct project-page base path and publishes it to GitHub Pages.

One-time setup:

1. Open [Settings → Pages](https://github.com/mohitdhami/OpenAtlas/settings/pages).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

After that, every push to `wasm` deploys automatically. You can also run the [Deploy GitHub Pages workflow](https://github.com/mohitdhami/OpenAtlas/actions/workflows/deploy-pages.yml) manually.

Live URL: **https://mohitdhami.github.io/OpenAtlas/**

The workflow derives the Vite `--base` path from the repository name, so the HTML, assets, favicon, and `wasm/catalog.wasm` all resolve under `/OpenAtlas/`.

## Project structure

```text
src/
  App.tsx                  interface, filtering state, saved state, overlays
  catalogFilter.ts         shared search fields and JavaScript fallback
  data.ts                  curated catalog and category metadata
  types.ts                 shared domain types
  wasm/
    catalogFilter.ts       WASM loader and filtering bridge
  components/
    CategoryIcon.tsx       category-to-icon mapping
  index.css                design system and responsive styles
wasm/
  catalog.wat              WebAssembly search/filter engine
scripts/
  build-wasm.mjs           WAT validation and compilation
public/wasm/
  catalog.wasm             compiled engine served with the static site
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
