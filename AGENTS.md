# Repository Guidelines

## Project Structure & Module Organization
The app is a Vite React + TypeScript UI rooted at `index.tsx`, which mounts `App.tsx`. Shared widgets (UploadZone, Sidebar, Graph3D, AnalysisChat) live in `components/`, while API helpers stay under `services/` such as `services/geminiService.ts`. Update `types.ts` before touching UI state, and keep entry/config files (`index.html`, `vite.config.ts`, `tsconfig.json`, `metadata.json`) minimal. Add new modules next to their peers (e.g., `components/InsightsPanel.tsx`) and keep related assets in the same folder to preserve the flat layout.

## Build, Test, and Development Commands
- `npm install` — installs dependencies once per checkout.
- `npm run dev` — launches the Vite dev server on `http://localhost:5173` with hot reload.
- `npm run build` — emits the optimized `dist/` bundle for release validation.
- `npm run preview` — serves `dist/` locally to spot deployment-only bugs.
- `npx vitest run --coverage` — run after adding Vitest to block regressions in flows like `extractGraphFromMarkdown`.

## Coding Style & Naming Conventions
Embrace TypeScript strictness: type every prop and hook, reuse enums from `types.ts`, and avoid `any`. Components and files use PascalCase (`Graph3D.tsx`), while functions, variables, and state setters use camelCase. Keep JSX readable with two-space indentation and concise utility-class strings, and run Prettier/ESLint locally before submitting.

## Testing Guidelines
Add Vitest with React Testing Library. Store specs as `ComponentName.test.tsx` next to each component or in a local `__tests__/` folder. Snapshot Graph3D and Sidebar, verify `AnalysisChat` persistence and Markdown rendering, mock Gemini responses to verify `services/geminiService.ts`, and add integration smoke tests that assert `App.tsx` transitions through `AppState.IDLE → PARSING → VISUALIZING`. Target ≥80% coverage for services and critical hooks, and run `npx vitest run --coverage` before every PR. Note: Mocking should account for the new `thinking` field in responses if strictly typed.

## Commit & Pull Request Guidelines
The repo currently lacks recorded Git history, so adopt Conventional Commit headers (`feat:`, `fix:`, `chore:`) followed by an imperative sentence under 72 characters and optional wrapped body details. Each PR should link its issue, outline UX impacts, list verification steps (`npm run dev`, `npx vitest run` output), and attach screenshots or clips whenever graph visuals change.

## Security & Configuration Tips
`services/geminiService.ts` requires `process.env.API_KEY`. Configure it via `.env.local` or your shell profile, never commit keys, rotate per environment, and redact Gemini payloads in logs because entity text often contains sensitive content.
