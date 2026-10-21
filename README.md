# ShortsForge - AI Shorts Studio

Turn one story idea into a complete YouTube Shorts production pack: five connected scenes, a natural voice-over (Hinglish, English, Hindi, Bangla or custom), image prompts, Google Flow image-to-video prompts, a character bible and a publish kit (title, description, caption, hashtags).

Vanilla JS frontend, Node.js 24 serverless API on Vercel, MongoDB Atlas storage, Google sign-in, and any OpenAI-compatible LLM (Groq free tier by default). Optional Adsterra ads.

Created by TutorSensi1.

## Features
- Real AI generation with validated JSON output, one automatic repair retry, and clear errors (no fake or template fallback)
- Exactly five scenes; the voice-over is assembled from scene narrations so they always match
- Character bible and per-scene continuity; real-person stories avoid invented quotes and events
- Editable results in five tabs, copy buttons, export/import as JSON
- Saved projects in MongoDB, private to each Google account
- Mobile-first dark UI, safe DOM rendering (no `innerHTML`)
- Optional Adsterra Social Bar, Banner and Popunder, controlled by environment variables

## Project structure
```
public/
  index.html  style.css  app.js     Frontend
  ads.js  ad-frame.html             Ad loader and sandboxed banner frame
api/
  health.js                         GET  health check (no secrets)
  generate.js                       POST generate a production pack (login required)
  session.js                        GET/POST/DELETE  Google sign-in session
  ads.js                            GET  ad configuration from env
  projects/index.js                 GET list, POST create
  projects/[id].js                  GET, PUT, DELETE one project
lib/
  ai.js  prompts.js                 LLM calls, prompts, retry/repair
  validate.js                       Input and pack validation
  auth.js                           Google token check, signed cookie sessions
  db.js  http.js                    MongoDB connection, API wrapper, rate limit
vercel.json  package.json  .env.example
```

## Environment variables
Set these in Vercel (Settings > Environment Variables) and in a local `.env`. Never commit `.env`.

| Variable | Required | Purpose |
|---|---|---|
| `AI_API_KEY` | yes | LLM provider key (server only) |
| `AI_MODEL` | yes | Model id, e.g. `openai/gpt-oss-120b` on Groq |
| `MONGODB_URI` | yes | Atlas connection string |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth Web client ID (public identifier) |
| `SESSION_SECRET` | yes | Random string, at least 32 characters, signs login cookies |
| `MONGODB_DB_NAME` | no | Default `shortsforge` |
| `AI_BASE_URL` | no | Default `https://api.groq.com/openai/v1` |
| `AI_TIMEOUT_MS` | no | Per-attempt timeout, default 25000 |
| `AI_JSON_MODE` | no | `false` if the model rejects JSON mode |
| `ALLOWED_ORIGIN` | no | Only for cross-origin API use (CORS) |
| `ADS_ENABLED` | no | `false` turns all ads off |
| `ADS_SOCIAL_BAR` | no | Full Adsterra Social Bar code (or its script URL) |
| `ADS_BANNER` | no | Full Adsterra Banner code (use 320x50 or 300x250 on phones) |
| `ADS_POPUNDER` | no | Full Adsterra Popunder code (or its script URL) |

Switching AI provider only needs `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`. OpenRouter: `https://openrouter.ai/api/v1` with a `:free` model. Gemini: `https://generativelanguage.googleapis.com/v1beta/openai`. Free tiers change, so check current limits and data-use terms.

Generate a session secret on a computer with Node:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Changing it later signs everyone out.

## Setup
1. **AI:** create a free key at console.groq.com/keys and choose a model id.
2. **MongoDB Atlas:** create a free cluster and a database user (letters and numbers in the password). Under Network Access allow `0.0.0.0/0`. Put the connection string in `MONGODB_URI`.
3. **Google sign-in:** in Firebase (Authentication > Sign-in method > Google) or Google Cloud (APIs & Services > Credentials) get the **Web client ID**. Add your site URL (`https://your-app.vercel.app`) under **Authorized JavaScript origins**. If the consent screen is in "Testing", only test users can sign in; publish it for everyone.
4. **Run locally:** `cp .env.example .env`, fill it in, `npm install`, `npm run dev` (uses the Vercel CLI).
5. **Deploy:** push to GitHub, then Vercel > Add New > Project > import the repo (preset "Other"). Add the variables, deploy, and redeploy after any variable change (untick "Use existing Build Cache" after adding dependencies).
6. **Verify:** open `/api/health`. `ok: true` means AI settings exist and the database is reachable. A failing database adds `checks.db.error` with the error name.

## Ads (Adsterra)
1. In Adsterra, open your approved site and create ad units: Social Bar, Banner (320x50 or 300x250), optionally Popunder.
2. Paste each full code into `ADS_SOCIAL_BAR`, `ADS_BANNER`, `ADS_POPUNDER` in Vercel and redeploy.
3. Check `/api/ads`: it should list the ads you set. `{}` means no variables are set, `ADS_ENABLED=false` is set, or you haven't redeployed.
4. Test with your ad blocker off. New ad units can take hours to start filling. Never click your own ads.

Only `https` script URLs are extracted from the pasted codes, so other code in the variable is ignored. The banner runs inside a sandboxed frame (`ad-frame.html`) and cannot read the app's cookies or storage.

## How it works
- `/api/generate` validates the input, calls the LLM with `lib/prompts.js`, parses and validates the JSON, and retries once with a repair prompt. If it still fails the user sees an error.
- Voice-over duration is estimated at 2.5 spoken words per second.
- Login: the browser gets a Google ID token, `/api/session` verifies it and sets a signed `HttpOnly` cookie valid for 7 days. Every project query is filtered by the Google account id.

## Security notes
- Secrets stay on the server; the Google client ID is public by design.
- Project data is private per Google account; other users get "not found".
- To allow third-party ad scripts, `vercel.json` sets a looser Content-Security-Policy (`https:` scripts and `unsafe-inline`). The app renders all user and AI text with `textContent`, but if you remove ads you can tighten the policy again.
- Rate limiting is in memory per serverless instance (best effort). Use Vercel Firewall for stronger limits.
- Popunder ads can annoy visitors. Start with Social Bar and Banner if retention matters.

## Troubleshooting
| Symptom | Likely fix |
|---|---|
| `/api/health` db not connected | Atlas Network Access `0.0.0.0/0`, correct URI and password, user has read/write |
| "Method not allowed" on load | Deployed `api/session.js` differs from the repo; check the file on GitHub, then redeploy |
| No Google button | `GOOGLE_CLIENT_ID` missing, site URL not in Authorized JavaScript origins, or an ad blocker is blocking Google |
| "Sign in" works but nothing saves | `SESSION_SECRET` missing or shorter than 32 characters |
| AI errors (400/404) | Wrong `AI_MODEL` or `AI_BASE_URL` |
| "Quota used up" | Free AI limit reached; wait and retry |
| "Unusable result twice" | Retry; if repeated set `AI_JSON_MODE=false` |
| No ads | See the Ads section; check `/api/ads` |

## Not covered
Google Flow is not connected: paste the generated prompts into Flow yourself. No image or audio generation is included. Check ad-network and Google terms for your use.
