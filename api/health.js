import { api } from '../lib/http.js';
import { getDb } from '../lib/db.js';

export default api(['GET'], async () => {
  const checks = {
    ai: { configured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL) },
    db: { configured: Boolean(process.env.MONGODB_URI), connected: false },
  };
  if (checks.db.configured) {
    try { await (await getDb()).command({ ping: 1 }); checks.db.connected = true; }
    catch (e) { checks.db.error = e?.details?.reason || e?.name || 'unknown'; }
  }
  const ok = checks.ai.configured && checks.db.connected;
  return { status: ok ? 200 : 503, body: { ok, service: 'shortsforge', time: new Date().toISOString(), checks } };
});
