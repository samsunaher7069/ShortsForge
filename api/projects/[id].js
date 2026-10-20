import { ObjectId } from 'mongodb';
import { api, rateLimit, ApiError } from '../../lib/http.js';
import { ownerId as ownerHash } from '../../lib/auth.js';
import { projectsCol } from '../../lib/db.js';
import { validateProjectBody, full } from '../../lib/validate.js';

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Project not found.');

export default api(['GET', 'PUT', 'DELETE'], async (req) => {
  const owner = ownerHash(req);
  const id = String(req.query.id || '');
  if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError(400, 'INVALID_ID', 'Invalid project id.');
  const col = await projectsCol();
  const filter = { _id: new ObjectId(id), ownerHash: owner };
  if (req.method === 'GET') {
    const doc = await col.findOne(filter);
    if (!doc) throw notFound();
    return { body: { project: full(doc) } };
  }
  rateLimit(req, 'save', 30, 10 * 60 * 1000);
  if (req.method === 'PUT') {
    const data = validateProjectBody(req.body);
    const doc = await col.findOneAndUpdate(filter, { $set: { ...data, updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!doc) throw notFound();
    return { body: { project: full(doc) } };
  }
  const r = await col.deleteOne(filter);
  if (!r.deletedCount) throw notFound();
  return { body: { deleted: true } };
});
