# Repository Guidelines

## Project Structure & Module Organization
- `electron/`: main process (`main.js`) and bridge (`preload.js`).
- `src/common/`: shared Node modules for persistence (`persist.js`) and model calls (`openai.js`).
- `src/renderer/`: UI (`index.html`, `renderer.js`, `style.css`).
- Runtime data: Electron `userData/store` with JSON files (`settings.json`, `conversations.json`, `memory.json`).

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev` (or `npm start`): launch the Electron app locally.
- `npm run lint`: placeholder; linting not configured yet.
- Tip: open DevTools via View → Toggle Developer Tools for renderer debugging.

## Coding Style & Naming Conventions
- JavaScript: 2-space indent, semicolons, single quotes; keep modules small.
- File names: lowercase, short (e.g., `src/common/new-module.js`).
- IPC channels: use clear namespaces (e.g., `settings:*`, `conversations:*`, `memory:*`).
- Keep business logic in `src/common`, UI logic in `src/renderer`, Electron app wiring in `electron/`.

## Testing Guidelines
- No formal test suite yet; perform manual smoke tests:
  - Configure API in Settings (Base URL, Key, Model) and send a message.
  - Set proactive interval to 1–2 minutes and verify notifications when app is unfocused.
- If adding tests: prefer Jest/Vitest for units and Playwright for e2e; name files `*.spec.js`.

## Commit & Pull Request Guidelines
- Commits: imperative, concise; Conventional Commits encouraged (e.g., `feat: restart proactive loop on settings change`).
- PRs: include description, linked issues, screenshots/GIFs for UI changes, verification steps, and notes for any store JSON changes.
- Update `README.md` and this doc when commands, structure, or configuration change.

## Security & Configuration Tips
- Do not hardcode API keys. Keys are stored locally in plaintext JSON; never commit anything from `userData/store`.
- Use `.gitignore` as-is; add any local scripts/secrets to environment or OS keychain if introduced later.

