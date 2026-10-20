import { ApiError } from './http.js';

export class PackError extends Error {}
export const PACE = 2.5; // spoken words per second used for duration estimates
export const OPT = {
  storyType: ['Motivational', 'Emotional', 'Funny', 'Horror', 'Mystery', 'Suspense', 'Life lesson', 'Historical biography', 'Fiction', 'Custom'],
  visualStyle: ['Minimal stick figure on paper', 'Realistic cinematic', '3D animated', 'Anime-inspired', 'Dark comic-book', 'Custom'],
  language: ['Hinglish', 'English', 'Hindi', 'Bangla', 'Custom'],
  duration: [30, 45, 60],
};

const clean = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

export function validateInput(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ApiError(400, 'INVALID_INPUT', 'Request body must be a JSON object.');
  const errs = {};
  const out = {};
  const str = (k, max, req) => {
    const v = b[k];
    if (v != null && typeof v !== 'string') { errs[k] = 'Must be text.'; return ''; }
    const s = clean(v || '');
    if (req && !s) errs[k] = 'This field is required.';
    else if (s.length > max) errs[k] = `Keep this under ${max} characters.`;
    return s;
  };
  out.projectName = str('projectName', 80, true);
  out.idea = str('idea', 1000, true);
  out.backgroundStyle = str('backgroundStyle', 200);
  out.tone = str('tone', 120);
  out.character = str('character', 1500);
  out.continuity = str('continuity', 800);
  out.custom = str('custom', 800);
  for (const k of ['storyType', 'visualStyle', 'language']) {
    if (!OPT[k].includes(b[k])) { errs[k] = 'Choose one of the listed options.'; out[k] = OPT[k][0]; continue; }
    out[k] = b[k];
    out[`${k}Custom`] = str(`${k}Custom`, 120, b[k] === 'Custom');
  }
  out.duration = Number(b.duration);
  if (!OPT.duration.includes(out.duration)) errs.duration = 'Choose 30, 45 or 60 seconds.';
  if (Object.keys(errs).length) throw new ApiError(400, 'INVALID_INPUT', 'Please fix the highlighted fields.', errs);
  return out;
}

// Validates and normalises a production pack. Narration is the source of truth: the voice-over is
// assembled from the five scene narrations, so the two always match exactly (unless keepVoiceover,
// used when saving a pack the user has deliberately edited).
export function sanitizePack(p, { keepVoiceover = false } = {}) {
  const bad = (m) => { throw new PackError(m); };
  if (!p || typeof p !== 'object' || Array.isArray(p)) bad('pack is not an object');
  const s = (v, max, n) => {
    if (typeof v !== 'string' || !clean(v)) bad(`${n} is missing or empty`);
    return clean(v).slice(0, max);
  };
  const list = (v, n, max = 12) => {
    if (!Array.isArray(v)) bad(`${n} must be an array`);
    return v
      .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x).filter((y) => typeof y === 'string').join(' - ') : ''))
      .map((x) => clean(x).slice(0, 400))
      .filter(Boolean)
      .slice(0, max);
  };
  if (!Array.isArray(p.scenes) || p.scenes.length !== 5) bad('scenes must contain exactly 5 items');
  const scenes = p.scenes.map((x, i) => {
    const n = `scene ${i + 1}`;
    if (!x || typeof x !== 'object') bad(`${n} is invalid`);
    const d = Number(x.durationSeconds);
    if (!Number.isFinite(d) || d <= 0) bad(`${n} durationSeconds is invalid`);
    return {
      sceneNumber: i + 1,
      beat: s(x.beat, 40, `${n} beat`),
      durationSeconds: Math.min(30, Math.max(1, Math.round(d))),
      narration: s(x.narration, 700, `${n} narration`),
      visualDescription: s(x.visualDescription, 1000, `${n} visualDescription`),
      characterAction: s(x.characterAction, 500, `${n} characterAction`),
      emotion: s(x.emotion, 150, `${n} emotion`),
      environment: s(x.environment, 500, `${n} environment`),
      camera: s(x.camera, 400, `${n} camera`),
      imagePrompt: s(x.imagePrompt, 2500, `${n} imagePrompt`),
      flowPrompt: s(x.flowPrompt, 2500, `${n} flowPrompt`),
      transitionToNext: s(x.transitionToNext, 500, `${n} transitionToNext`),
    };
  });
  const cb = p.characterBible;
  const pub = p.publishing;
  if (!cb || typeof cb !== 'object') bad('characterBible is missing');
  if (!pub || typeof pub !== 'object') bad('publishing is missing');
  const hashtags = list(pub.hashtags, 'hashtags', 15).map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`));
  if (!hashtags.length) bad('hashtags is empty');
  const joined = scenes.map((x) => x.narration).join(' ');
  const voiceover = keepVoiceover && typeof p.voiceover === 'string' && clean(p.voiceover) ? clean(p.voiceover).slice(0, 5000) : joined;
  const wordCount = voiceover.split(/\s+/).filter(Boolean).length;
  return {
    projectName: s(p.projectName, 80, 'projectName'),
    summary: s(p.summary, 800, 'summary'),
    language: s(p.language, 40, 'language'),
    voiceover,
    wordCount,
    estimatedDurationSeconds: Math.round(wordCount / PACE),
    paceWordsPerSecond: PACE,
    scenes,
    characterBible: {
      mainCharacter: s(cb.mainCharacter, 1500, 'mainCharacter'),
      supportingCharacters: list(cb.supportingCharacters, 'supportingCharacters'),
      fixedVisualTraits: list(cb.fixedVisualTraits, 'fixedVisualTraits'),
      outfitRules: list(cb.outfitRules, 'outfitRules'),
      continuityRules: list(cb.continuityRules, 'continuityRules'),
    },
    publishing: {
      title: s(pub.title, 100, 'title'),
      description: s(pub.description, 1500, 'description'),
      caption: s(pub.caption, 300, 'caption'),
      hashtags,
    },
  };
}

export function validateProjectBody(b) {
  if (!b || typeof b !== 'object') throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object.');
  const input = validateInput(b.input);
  let pack;
  try { pack = sanitizePack(b.pack, { keepVoiceover: true }); }
  catch (e) {
    if (e instanceof PackError) throw new ApiError(400, 'INVALID_PACK', `Cannot save: ${e.message}.`);
    throw e;
  }
  return { name: input.projectName, input, pack };
}

export const summary = (d) => ({
  id: String(d._id),
  name: d.name,
  storyType: d.input?.storyType,
  title: d.pack?.publishing?.title,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
export const full = (d) => ({ id: String(d._id), name: d.name, input: d.input, pack: d.pack, createdAt: d.createdAt, updatedAt: d.updatedAt });
