Companion Agent (Electron)

Overview
- Desktop app that chats with you, can proactively message on a schedule, and uses an OpenAI-compatible API.
- Left sidebar: conversations; right: chat area. Memory library and settings included.
- macOS notifications show when the app is not focused and the agent sends a proactive message.

Features
- Multiple conversations with history
- System prompt (persona) configuration
- Memory library: add/edit/delete; summarize conversation into memory
- OpenAI-compatible API config: base URL, API key, model, max tokens, temperature
- Proactive loop: every N minutes decide SKIP or SEND, with notifications when not focused
- Avatars for you and the agent
- Gemini multimodal (images/PDF): send local images and PDFs; summarization and proactive checks include attachments
- Export with attachments: one-click zip including Markdown/JSON and all files

Getting Started
1. Install dependencies
   - npm install
2. Run the app
   - npm run dev
3. Configure API
   - Open Settings → enter Base URL (e.g. https://api.openai.com) and API Key; choose model.
4. Grant notifications
   - On first notification, macOS prompts for permission; allow to receive proactive alerts.

Notes
- Data is stored locally under Electron userData/store (settings.json, conversations.json, memory.json).
- Attachments are copied into userData/store under a structured path when you send them:
  - store/attachments/YYYY/MM/<conversationId>/<messageId>/<filename>
  - This keeps files organized by year/month and conversation/message.
- Proactive messages: The app sends a special prompt to the model. The model must reply either `SKIP` or `SEND: <message>`. Non-conforming replies are treated as `SEND`.
- Memory usage: Latest 5 memory items are included into the system prompt automatically.
- Security: API key is saved locally in plaintext JSON for convenience. Consider system keychain integration for production.

Customization
- UI is vanilla HTML/CSS/JS; adjust styles in src/renderer/style.css.
- Proactive logic and prompts live in src/common/openai.js.
- Persistence is in src/common/persist.js.

Packaging
- This repo includes only a dev script. To produce binaries, integrate electron-builder or similar.

Export With Attachments (Zip)
- Open the Export menu in the chat header. Two toggles are available:
  - Include timestamps: keep or strip message timestamps
  - Include attachments: when enabled, exports a .zip containing:
    - The conversation as Markdown or JSON
    - An `attachments/` directory with all image/PDF files for that conversation
- Markdown export embeds images inline as `![](attachments/...)` and links PDFs as `[PDF: file](attachments/...)` using relative paths inside the zip.
- Export All produces a single zip with `所有对话.md`/`所有对话.json` and an `attachments/` tree per conversation.
- Requires dependency `archiver`. Run `npm install` before using attachment zips.
