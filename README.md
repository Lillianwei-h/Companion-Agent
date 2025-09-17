# Companion Agent

<p align="center"><img src="build/logo.png" alt="Companion Agent logo" width="200"></p>

Built with Codex. Desktop AI companion for chat, memory, and proactive notifications. Uses OpenAI‑compatible APIs and Gemini (set Base URL as needed).

---

## Features
- Multiple conversations with full history and avatars
- Configurable system prompt (persona)
- Memory library: add/edit/delete; summarize conversations into memory
- OpenAI-compatible and Gemini support: base URL, API key, model, max new tokens, temperature
- Proactive loop: every N minutes decide SKIP or SEND; notifications when not focused
- Multimodal: images and PDFs; summaries and proactive checks include attachments
- One-click export with attachments (Markdown/JSON + files)

## Install
- MacOS(m chip): Download .dmg from releases and install
- Windows(x64): Download .exe from releases and install
- Others: Not supported yet; Run from source instead

## Run from source
1) Install dependencies
```bash
npm install
```
2) Run the app
```bash
npm run dev
```
3) Configure the API in Settings
- Base URL (OpenAI: https://api.openai.com, Gemini: https://generativelanguage.googleapis.com)
- API Key, Model, Max new tokens, Temperature
4) Allow notifications on first prompt from the OS.

## Data & Storage
- Runtime data lives under Electron `userData/store`:
  - `settings.json`, `conversations.json`, `memory.json`
- Attachments are copied into a structured path when sent:
```
store/attachments/YYYY/MM/<conversationId>/<messageId>/<filename>
```

## Proactive Messaging
- The app asks the model to decide:
  - `SKIP` to do nothing
  - `SEND: <message>` to send a message
- Non-conforming replies are treated as `SEND`.

## Keyboard Shortcuts
- ctrl/cmd + ,  open Settings
- ctrl/cmd + b  toggle Sidebar
- ctrl/cmd + m  open Memory
- esc           close Settings/Sidebar/Memory

## Project Structure
```
electron/        # main process (main.js) and preload bridge (preload.js)
src/common/      # shared modules (persist.js, openai.js)
src/renderer/    # UI (index.html, renderer.js, style.css)
build/           # app icons and logo
dist/            # packaged builds
```