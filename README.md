# ShortsForge - AI Shorts Studio

Turn a story idea into a five-scene YouTube Shorts production pack: voice-over, image prompts, Google Flow prompts, character bible and publish kit. Vanilla JS frontend, Node.js 24 serverless API on Vercel, MongoDB Atlas storage, any OpenAI-compatible LLM (Groq free tier by default).

## Structure
```
public/        index.html, style.css, app.js (static frontend)
api/           health.js, generate.js, projects/index.js, projects/[id].js (Vercel functions)
lib/           ai.js, prompts.js, validate.js, db.js, http.js
vercel.json    output dir, 60 s limit for /api/generate, security headers
.env.example   variable template (copy to .env locally; never commit .env)
```

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `AI_API_KEY` | yes | Provider API key (server only) |
| `AI_MODEL` | yes | Model id, e.g. `openai/gpt-oss-120b` on Groq |
| `AI_BASE_URL` | no | OpenAI-compatible base URL. Default `https://api.groq.com/openai/v1` |
| `AI_TIMEOUT_MS` | no | Per-attempt timeout, default 25000 (two attempts fit in 60 s) |
| `AI_JSON_MODE` | no | `false` if your model rejects `response_format: json_object` |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB_NAME` | no | Default `shortsforge` |
| `ALLOWED_ORIGIN` | no | Only for cross-origin API use (CORS). Empty = same-origin only |

Switching provider = change `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`. Examples: OpenRouter `https://openrouter.ai/api/v1` (use a `:free` model); Gemini `https://generativelanguage.googleapis.com/v1beta/openai`. Free tiers change, so check your provider's current limits and data-use terms.

## Setup
1. **Groq:** create a key at console.groq.com/keys; pick a model id from their models page.
2. **MongoDB Atlas:** create a free cluster, add a database user, and under Network Access allow `0.0.0.0/0` (Vercel IPs are dynamic). Copy the connection string into `MONGODB_URI`.
3. **Local:** `cp .env.example .env`, fill it in, run `npm install`, then `npm run dev` (Vercel CLI; API routes need it). Open the printed URL.
4. **Deploy:** push to GitHub, then Vercel > Add New > Project > import the repo (framework preset "Other"). Add the variables above under Settings > Environment Variables, deploy, and redeploy after any variable change.
5. **Verify:** open `https://YOUR-APP.vercel.app/api/health`. `ok: true` means AI and database are configured and the database is reachable (it never returns secrets).

## How it works
- `/api/generate` validates input, calls the LLM with `lib/prompts.js`, parses and validates the JSON (`lib/validate.js`), and retries once with a repair prompt. If it still fails, the user sees an error; there is no template fallback.
- The server assembles the voice-over from the five scene narrations, so they always match, and computes word count and duration at 2.5 words/second.
- Projects: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`.

## Security notes
- **There are no user accounts.** Each browser generates a random key (localStorage) sent as `X-Owner-Key`; the server stores only its SHA-256 hash and filters every query by it. Projects are not publicly listable, but anyone holding the key can access them, and clearing browser data loses access. It is not secure multi-user privacy.
- Secrets stay on the server. Rendering uses `textContent` only (no `innerHTML`), plus a strict CSP.
- Rate limiting is in-memory per serverless instance (best effort). For stronger abuse control add Vercel Firewall rate limits.

## Not tested
Unit-level checks (syntax, validation, JSON parse/repair/retry with a mocked provider) were run. Not run: a real LLM call, MongoDB Atlas, Vercel deployment, or browsers/phones. Test those after you add your keys.
