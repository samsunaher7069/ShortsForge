import { SYSTEM_PROMPT, buildUserPrompt, buildRepairPrompt } from './prompts.js';
import { sanitizePack, PackError } from './validate.js';
import { ApiError } from './http.js';

function config() {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI is not configured on the server (AI_API_KEY or AI_MODEL is missing).');
  return {
    apiKey,
    model,
    baseUrl: (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    timeout: Number(process.env.AI_TIMEOUT_MS) || 25000,
    jsonMode: process.env.AI_JSON_MODE !== 'false',
  };
}

async function chat(messages, c) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), c.timeout);
  try {
    const body = { model: c.model, messages, temperature: 0.8, max_tokens: 5000 };
    if (c.jsonMode) body.response_format = { type: 'json_object' };
    const r = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify(body),
    });
    if (r.status === 401 || r.status === 403) throw new ApiError(502, 'AI_AUTH', 'The AI provider rejected the API key. Check AI_API_KEY.');
    if (r.status === 429) throw new ApiError(429, 'AI_RATE_LIMITED', 'The free AI quota is used up for now. Try again in a minute.');
    if (!r.ok) {
      console.error('AI provider error status:', r.status);
      throw new ApiError(502, 'AI_UNAVAILABLE', `The AI provider returned an error (${r.status}). Check AI_MODEL and AI_BASE_URL, or try again.`);
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new PackError('the reply was empty');
    return text;
  } catch (e) {
    if (e instanceof ApiError || e instanceof PackError) throw e;
    if (e?.name === 'AbortError') throw new ApiError(504, 'AI_TIMEOUT', 'The AI took too long to respond. Try again.');
    console.error('AI request failed:', e?.name);
    throw new ApiError(502, 'AI_UNAVAILABLE', 'Could not reach the AI provider. Try again shortly.');
  } finally {
    clearTimeout(timer);
  }
}

export function extractJson(text) {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new PackError('the reply contained no JSON object');
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch { throw new PackError('the reply was not valid JSON'); }
}

// One generation plus one repair retry. Provider errors fail fast; there is no template fallback.
export async function generatePack(input) {
  const c = config();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(input) },
  ];
  let raw = '';
  let reason = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await chat(messages, c);
      return sanitizePack(extractJson(raw));
    } catch (e) {
      if (!(e instanceof PackError)) throw e;
      reason = e.message;
      messages.push({ role: 'assistant', content: raw || '{}' }, { role: 'user', content: buildRepairPrompt(reason) });
    }
  }
  throw new ApiError(502, 'AI_INVALID_JSON', `The AI returned an unusable result twice (${reason}). Try again.`);
}
