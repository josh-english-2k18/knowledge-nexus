# Repository Guidelines

## Architecture & Layout
- The app is a Vite + React 19 + TypeScript UI. `index.tsx` mounts `App.tsx`, while `index.html` stays minimal and loads Tailwind via CDN plus an import map. `vite.config.ts` binds the dev server to `http://localhost:3000` (`host: 0.0.0.0`) and injects the Gemini key into `process.env`.
- `App.tsx` orchestrates `AppState` (`IDLE → PARSING → VISUALIZING → ERROR`), toast notifications, search/highlight state, JSON import/export, Graph Expert refinement, and the floating AI chat. Keep new UI derived from `GraphData` + `ExtractionStats` and leave side effects inside hooks.
- Components live under `components/` and the folder stays flat: `UploadZone`, `Graph3D`, `Sidebar`, `AnalysisChat`, and `RefinementModal`. Add peers beside them (e.g., `components/NewPanel.tsx`) and colocate assets. Services stay under `services/`, shared helpers under `utils/`, and all shared contracts inside `types.ts`.

## Component Responsibilities
- `UploadZone.tsx` accepts `.md/.markdown/.txt`, maintains `dragActive` + `error` state, and funnels file text to `onFileLoaded`. Preserve the validation toast and `isLoading` animations when extending it.
- `Graph3D.tsx` wraps `react-force-graph-3d`, caches `SpriteText` labels (see `global.d.ts`), zooms new graphs into view, and handles highlight/focus logic via the `highlightedNodeIds`/`highlightedLinkKeys` Sets from `App.tsx`. Dispose SpriteText materials when nodes vanish to avoid GPU leaks.
- `Sidebar.tsx` renders metadata for the selected node (description, ID, importance meter) and uses pointer-events rules so the rest of the canvas remains interactive.
- `AnalysisChat.tsx` is a draggable/resizable chat window that streams prompts to `chatWithGraph`. Model replies are rendered with `react-markdown` and must preserve history in `App.tsx` to handle resets and session persistence.
- `RefinementModal.tsx` mirrors the `GraphExpertSystem` lifecycle (`PREPARING`, `REFINING`, `COMPLETED`) and compares `beforeStats` vs `afterStats`. When closing it, always go through the `refinementModal` state setter so App state stays consistent.
- `App.tsx` manages file ingestion, calls `extractGraphFromMarkdown`, normalizes data, handles JSON importing via `isGraphDataShape`, runs graph refinement through the expert system, and exports snapshots via `createGraphExportSnapshot`. Keep helper functions like `resetQueryState`, `handleResultSelect`, and `triggerToast` intact whenever you extend flows.

## Services & Data Flow
- `services/geminiService.ts` is the only file that calls Google GenAI. `extractGraphFromMarkdown` sends Markdown, enforces the response schema, maps `importance` → `val`, and biases Gemini toward ≥50 nodes. `chatWithGraph` compresses current nodes/links into context strings for AI Q&A, and `findBridgesBetweenClusters` returns bridging `GraphLink`s as JSON.
- `services/graphOptimizerService.ts` exports `GraphExpertSystem`, which validates links, finds disconnected clusters via union-find, and merges Gemini-proposed links without duplicating existing edges. Keep it framework-agnostic so it can be unit-tested.

## Types, Utilities & Shared Contracts
- `types.ts` defines `GraphNode`, `GraphLink`, `GraphData`, `AppState`, and `ExtractionStats`. Update it before touching components/services and remember that `GraphLink.source/target` can be `string` or `GraphNode` because `react-force-graph-3d` mutates the values.
- `utils/graph.ts` centralizes helpers: `getNodeId`, `buildLinkKey`, `normalizeGraphPayload`, `createGraphExportSnapshot`, and `isGraphDataShape`. Always run inbound GraphData through `normalizeGraphPayload` before storing it, and rely on `buildLinkKey` when comparing links (query highlights, refinement results, etc.).
- `global.d.ts` adds `three-spritetext` typings for the custom label objects. Update this declaration if Sprite props change so TS keeps compiling.

## Build, Scripts & Tooling
- `npm install` — install dependencies once per checkout.
- `npm run dev` — Vite dev server on `http://localhost:3000` (hot reload). Expects `GEMINI_API_KEY`/`API_KEY` defined via `.env`, `.env.local`, or shell.
- `npm run build` — produces the production bundle in `dist/`.
- `npm run preview` — serves the built bundle for deployment checks.
- Tests are not wired yet; after adding Vitest + React Testing Library run `npx vitest run --coverage` locally before submitting.
- Tailwind comes from the CDN in `index.html`. Avoid adding PostCSS/Tailwind config unless you are ready to rework entry files.

## Coding Style & Naming
- Embrace TypeScript strictness: type every prop/hook, avoid `any`, and reuse enums/interfaces from `types.ts`. Components/files use PascalCase, while functions, hooks, and setters stay camelCase. JSX uses two-space indentation and concise Tailwind utility strings.
- Prefer derived state plus memoized helpers over duplicative variables. When working with Sets (`highlightedNodeIds`, `highlightedLinkKeys`), always create new instances rather than mutating in place to keep React re-renders predictable.
- Entry/config files (`index.html`, `index.tsx`, `vite.config.ts`, `tsconfig.json`, `metadata.json`) should stay minimal. Use the `@` alias (root) set in `tsconfig.json`/`vite.config.ts` when useful.

## Testing Expectations
- Standard: Vitest + React Testing Library. Place specs next to their modules (`Graph3D.test.tsx`) or in local `__tests__/` folders.
- Snapshot complex visuals (Graph3D, Sidebar), test search/query transitions in `App.tsx`, ensure `AnalysisChat` preserves history and renders Markdown, and mock `@google/genai` when covering `extractGraphFromMarkdown`, `chatWithGraph`, and `findBridgesBetweenClusters`.
- Unit-test `GraphExpertSystem`: validation should flag broken links, union-find should produce clusters, and `unifyGraph` must dedupe Gemini-proposed links. Target ≥80% coverage for services and critical hooks before a PR.

## Security & Configuration
- Gemini access requires `process.env.API_KEY` (and mirrored `process.env.GEMINI_API_KEY`). Provide `GEMINI_API_KEY` in your environment; never commit API keys. Rotate per environment and redact sensitive payloads when logging (graph descriptions often contain private data).
- Graph JSON imports should be validated with `isGraphDataShape` before touching state. When logging normalization warnings, keep them high-level (number of dropped links) rather than dumping entire node data.

## Commit & Pull Request Guidelines
- The repo has no recorded history, so start with Conventional Commit headers (`feat:`, `fix:`, `chore:`) and imperative subjects <72 chars.
- Every PR should link to its issue, describe UX impacts, provide verification steps (`npm run dev`, `npm run build`, `npx vitest run --coverage` when it exists), and attach screenshots or clips whenever visual output changes (e.g., Graph3D tweaks, new modals).
