import { api, rateLimit } from '../lib/http.js';
import { validateInput } from '../lib/validate.js';
import { generatePack } from '../lib/ai.js';

export default api(['POST'], async (req) => {
  rateLimit(req, 'generate', 6, 10 * 60 * 1000);
  const input = validateInput(req.body);
  const pack = await generatePack(input);
  return { body: { input, pack } };
});
