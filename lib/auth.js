import { createHmac, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { ApiError } from './http.js';

const COOKIE = 'sf_session';
const MAX_AGE = 7 * 24 * 3600;
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Login is not configured on the server (SESSION_SECRET).');
  return s;
};
const sign = (p) => createHmac('sha256', secret()).update(p).digest('base64url');

export function makeCookie(u) {
  const payload = Buffer.from(JSON.stringify({ sub: u.sub, email: u.email, name: u.name, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export function getUser(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const u = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return u.exp > Date.now() / 1000 ? u : null;
  } catch { return null; }
}

export function requireUser(req) {
  const u = getUser(req);
  if (!u) throw new ApiError(401, 'LOGIN_REQUIRED', 'Please sign in with Google to continue.');
  return u;
}
export const ownerId = (req) => `g:${requireUser(req).sub}`;

export async function verifyGoogle(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Google login is not configured (GOOGLE_CLIENT_ID).');
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email_verified) throw new Error('unverified');
    return { sub: p.sub, email: p.email, name: p.name || p.email };
  } catch {
    throw new ApiError(401, 'LOGIN_FAILED', 'Google sign-in could not be verified. Try again.');
  }
}
