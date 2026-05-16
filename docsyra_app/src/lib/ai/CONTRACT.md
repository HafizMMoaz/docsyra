# Docsyra AI integration — build contract

All AI code builds against `src/lib/ai/types.ts`. Read it first. This file pins
the decisions every agent must follow so the parts compose without conflict.

## Architecture

```
editor (client) ──fetch──▶  /api/ai (route)  ──▶ resolveAIProvider(env)
                                  │                      │
                            buildPrompt(action)     provider.stream()
                                  │                      │
                            ◀── streamed plain text ◀─────┘
```

- **Providers** (`providers/{anthropic,openai,groq,gemini}.ts`) — each exports a
  `const provider: AIProvider`. Implement `stream()` as an async generator that
  yields plain-text deltas, using `fetch` only (edge-runtime safe, no SDKs, no
  new npm deps). Throw `AIError` before the first yield on failure.
- **Registry** (`index.ts`) — `resolveAIProvider(env): { provider, config }`.
  Reads `AI_PROVIDER` (default `"anthropic"`), picks the matching provider,
  reads its `*_API_KEY` (throw `AIError(…, 500)` if missing) and `*_MODEL`
  (fall back to `provider.defaultModel`).
- **Prompts** (`prompts.ts`) — `buildPrompt(body: AIRunRequestBody):
  AICompletionRequest`. One system prompt per action; maps body fields into
  `messages`. Throw `AIError(…, 400)` on invalid/missing fields.
- **Route** (`src/app/api/ai/route.ts`) — `export const runtime = "edge"`,
  POST only, `rejectCsrf` first, then validate the session
  (`createLucia`/`readSessionIdFromRequest`/`validateSession`). Parse
  `AIRunRequestBody`, call `buildPrompt`, `resolveAIProvider`, then return a
  streaming `Response` (`Content-Type: text/plain; charset=utf-8`) whose body is
  the concatenated text deltas. On `AIError` before streaming, return
  `Response.json({ success:false, error }, { status })`.

## Wire format

- Client → route: `POST /api/ai`, JSON body `AIRunRequestBody`, CSRF header.
- Route → client: **raw streamed UTF-8 text** (not SSE, not JSON). The client
  reads the `ReadableStream`, decodes, and appends deltas as they arrive.

## Provider HTTP details

- **anthropic** — `POST https://api.anthropic.com/v1/messages`; headers
  `x-api-key`, `anthropic-version: 2023-06-01`; body `{model, max_tokens,
  system:[{type:"text",text,cache_control:{type:"ephemeral"}}], messages,
  stream:true}`; SSE, read `content_block_delta` → `delta.text`. Default model
  `claude-opus-4-7`.
- **openai** — `POST https://api.openai.com/v1/chat/completions`; `Authorization:
  Bearer`; `stream:true`; SSE `choices[0].delta.content`. Default `gpt-4o`.
- **groq** — OpenAI-compatible: `POST
  https://api.groq.com/openai/v1/chat/completions`; same shape as openai.
  Default `llama-3.3-70b-versatile`.
- **gemini** — `POST https://generativelanguage.googleapis.com/v1beta/models/
  {model}:streamGenerateContent?alt=sse&key=…`; SSE, read
  `candidates[0].content.parts[0].text`. Default `gemini-2.0-flash`.

For openai/groq/gemini map our `system` to the provider's system field and our
`messages` to the provider's message format.

## Frontend contract

- **Hook** `src/lib/ai/useAI.ts` (or similar) — exposes a function that POSTs to
  `/api/ai`, streams the response, and calls an `onDelta(text)` callback plus
  `onDone()` / `onError()`. Supports abort.
- **Result popover** `src/components/editor/ai/AIResultPopover.tsx` — shows
  streaming output with **Accept / Discard / Retry** actions. Presentational +
  streaming state only; the caller wires Accept into the editor.
- New AI UI components live under `src/components/editor/ai/`. Wave-B agents
  create components ONLY there + in `src/lib/ai/` — they must NOT edit the
  editor page, `RichTextEditor.tsx`, `SlashCommandList.tsx`, the slash
  extension, or `globals.css`. A single integration agent owns those files.

## Styling

Match the redesign's "Archival Print" system: tokens `paper`, `paper-card`,
`paper-raised`, `ink`, `ink-soft`, `ink-faint`, `rule`, `rule-strong`, `clay`,
`clay-wash`, `pine`; the `eyebrow` class; `rounded-sm`. See the existing GitHub
modal in the editor page for reference.

## Rules

- No new npm dependencies. `fetch` + web streams only. Edge-runtime compatible.
- Do not commit — the orchestrator commits after each wave.
- Keep `export const runtime = "edge"` on the route.
- Secrets (`*_API_KEY`) are Wrangler secrets read from `env`; never hardcode.
