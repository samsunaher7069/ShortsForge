import { api, rateLimit, ownerHash } from '../../lib/http.js';
import { projectsCol } from '../../lib/db.js';
import { validateProjectBody, summary } from '../../lib/validate.js';

export default api(['GET', 'POST'], async (req) => {
  const owner = ownerHash(req);
  const col = await projectsCol();
  if (req.method === 'GET') {
    const docs = await col
      .find({ ownerHash: owner }, { projection: { name: 1, 'input.storyType': 1, 'pack.publishing.title': 1, createdAt: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    return { body: { projects: docs.map(summary) } };
  }
  rateLimit(req, 'save', 30, 10 * 60 * 1000);
  const data = validateProjectBody(req.body);
  const now = new Date();
  const r = await col.insertOne({ ...data, ownerHash: owner, createdAt: now, updatedAt: now });
  return { status: 201, body: { project: { id: String(r.insertedId), name: data.name, createdAt: now, updatedAt: now } } };
});
