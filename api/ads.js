
import { api } from '../lib/http.js';

function scriptSrc(v) {
  if (!v) return null;
  const m = /src\s*=\s*["']([^"']+)["']/i.exec(v) || /((?:https?:)?\/\/[^\s"'<>]+)/.exec(v);
  if (!m) return null;
  let u = m[1].trim();
  if (u.startsWith('//')) u = `https:${u}`;
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

function banner(v) {
  if (!v) return null;
  const key = /['"]key['"]\s*:\s*['"]([\w-]+)['"]/.exec(v)?.[1];
  const height = Number(/['"]height['"]\s*:\s*(\d+)/.exec(v)?.[1]);
  const width = Number(/['"]width['"]\s*:\s*(\d+)/.exec(v)?.[1]);
  const src = scriptSrc(v);
  if (!key || !src || !(width > 0 && width <= 1000) || !(height > 0 && height <= 1000)) return null;
  return { key, width, height, src };
}

export default api(['GET'], async () => {
  if (process.env.ADS_ENABLED === 'false') return { body: {} };
  const e = process.env;
  return { body: { popunder: scriptSrc(e.ADS_POPUNDER), socialBar: scriptSrc(e.ADS_SOCIAL_BAR), banner: banner(e.ADS_BANNER) } };
});
