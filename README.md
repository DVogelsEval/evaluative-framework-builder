# Evaluative Framework Builder

A **local-first** tool that walks an evaluator through building an *explicit* evaluative
framework — an Overall Judgement rubric, criterion/component rubrics beneath it, and the
evidence and data descriptors beneath those — and then renders the synthesis as a readable
map and a data matrix.

Its job is to make evaluative reasoning **explicit, inspectable and revisable**. It is a
**planning tool**: it never records evaluation results, and it never runs AI inference.

> **AI critiques and expands; it never silently authors the evaluative claims.**
> The app can compose a prompt *about* part of your framework for you to paste into an AI of
> your choice — but nothing is ever sent from the app, and nothing an AI returns is applied
> automatically. You stay the author of every judgement.

Methodological grounding: Gullickson (2020), the extended logic of evaluation, and
Meldrum & Gullickson (2026).

## Principles

- **Local-first.** Your work lives in plain `.evalq.json` files on your machine and an
  autosave in your browser. There is **no backend, no account, and no cloud sync** — your
  (often sensitive) evaluation data never leaves your device.
- **The file format is the contract.** One Evaluation Question is one pretty-printed,
  git-diffable JSON document with a `schemaVersion`; a Project is a folder/manifest listing
  its questions. Every breaking format change ships a migration.
- **No AI inference in the app**, no API keys, no telemetry, no numeric rubric weighting.
- **Offline-capable.** The browser build is a PWA that precaches itself and opens with no
  network once loaded.

## Run it

Requires [Node.js](https://nodejs.org) (LTS).

```
npm install
npm run dev
```

Then open http://localhost:5173 in your browser. Your work autosaves to that browser; use the
**Save** buttons on the Home Window to write the `.evalq.json` and `project.json` files to a
folder you keep together.

## Saving and opening files

- On **Chrome/Edge** (File System Access API) the first Save asks where to put the file and
  every later Save overwrites that same file in place. Opening a file the same way lets the
  next Save write straight back to it.
- On **Firefox/Safari** Save falls back to a download and Open to an upload — same data, same
  files.

## Delivery

- **Primary — static browser build (PWA).** Zero install, offline-capable, hostable on any
  static host (e.g. GitHub Pages). This is the recommended way to use the tool.
- **Secondary — Tauri desktop builds** for Windows/macOS/Linux, produced by a GitHub Actions
  matrix. Unsigned builds trigger an "unidentified developer" warning until code signing is
  set up, so the browser build is the smoother path for now.

## Develop

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the app locally (Vite) |
| `npm test` | Unit tests (Vitest): domain model, invariants, migrations |
| `npm run e2e` | The walking-skeleton Playwright test (starts its own server) |
| `npm run typecheck` | TypeScript `strict` check |
| `npm run build` | Production build to `dist/` (emits the service worker + manifest) |

First E2E run needs the browser once: `npx playwright install chromium`.

The domain model is documented in the code. `src/domain/schema.ts` is the single canonical `zod`
schema for the saved document and is the best starting point; `src/domain/invariants.ts` holds the
rules that must stay true over it, and `src/domain/migrate.ts` the format migrations.

## Contributing

The AI hand-off prompt templates (`src/templates/ai-handoff/*.md`) are plain Markdown with
frontmatter and are meant to be improved — better critique prompts are a genuine contribution.
Please keep the project's non-goals intact: no backend/accounts/cloud sync, no in-app AI
inference or model calls, and no telemetry.

## Licence

[MIT](LICENSE). Use, modify, and redistribute freely; keep the copyright and licence notice.
(The copyright line names "Evaluative Framework Builder contributors" — replace it with your own
name if you prefer.)
