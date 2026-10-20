
(async () => {
  let cfg;
  try { const r = await fetch('/api/ads'); if (!r.ok) return; cfg = await r.json(); } catch { return; }
  const load = (src) => { const s = document.createElement('script'); s.src = src; s.async = true; document.body.append(s); };
  if (cfg.socialBar) load(cfg.socialBar);
  if (cfg.popunder) load(cfg.popunder);
  const b = cfg.banner;
  const slot = document.getElementById('ad-slot');
  if (b && slot) {
    const f = document.createElement('iframe');
    f.src = `/ad-frame.html?key=${encodeURIComponent(b.key)}&w=${b.width}&h=${b.height}&s=${encodeURIComponent(b.src)}`;
    f.width = b.width; f.height = b.height; f.title = 'Advertisement'; f.loading = 'lazy';
    slot.append(f);
    slot.hidden = false;
  }
})();
