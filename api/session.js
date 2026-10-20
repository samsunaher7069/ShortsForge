import { api, rateLimit, ApiError } from '../lib/http.js';
import { getUser, makeCookie, clearCookie, verifyGoogle } from '../lib/auth.js';

export default api(['GET', 'POST', 'DELETE'], async (req) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || null;
  if (req.method === 'GET') {
    let u = null;
    try { u = getUser(req); } catch { /* not configured */ }
    return { body: { clientId, user: u && { email: u.email, name: u.name } } };
  }
  if (req.method === 'DELETE') return { body: { ok: true }, headers: { 'Set-Cookie': clearCookie() } };
  rateLimit(req, 'login', 20, 10 * 60 * 1000);
  const cred = req.body?.credential;
  if (typeof cred !== 'string' || cred.length > 4096) throw new ApiError(400, 'INVALID_BODY', 'Missing Google credential.');
  const u = await verifyGoogle(cred);
  return { body: { user: { email: u.email, name: u.name } }, headers: { 'Set-Cookie': makeCookie(u) } };
});
