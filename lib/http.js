import { createHash } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const MAX_BODY = 300 * 1024;
const hits = new Map();

// Best-effort per-instance rate limit (serverless instances do not share memory).
export function rateLimit(req, bucket, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Wait a few minutes and try again.');
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
}

// Anonymous per-browser key. NOT an account system: it only keeps projects out of other browsers' lists.
export function ownerHash(req) {
  const k = req.headers['x-owner-key'];
  if (typeof k !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(k)) {
    throw new ApiError(401, 'OWNER_KEY_REQUIRED', 'Missing or invalid browser key. Reload the page and try again.');
  }
  return createHash('sha256').update(k).digest('hex');
}

export function api(methods, fn) {
  return async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Owner-Key');
      res.setHeader('Access-Control-Allow-Methods', `${methods.join(',')},OPTIONS`);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      if (!methods.includes(req.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      if (Number(req.headers['content-length'] || 0) > MAX_BODY) throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
      const out = await fn(req);
      return res.status(out.status || 200).json(out.body);
    } catch (e) {
      if (e instanceof ApiError) {
        return res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
      }
      console.error('Unhandled error:', e?.name, e?.message);
      if (String(e?.name).startsWith('Mongo')) {
        return res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'The database is unavailable. Try again shortly.' } });
      }
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error.' } });
    }
  };
}
