import { MongoClient } from 'mongodb';
import { ApiError } from './http.js';

// Cached on globalThis so warm serverless invocations reuse one connection pool.
const cache = (globalThis.__sfMongo ||= { promise: null, indexed: false });

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new ApiError(503, 'DB_NOT_CONFIGURED', 'The database is not configured (MONGODB_URI is missing).');
  try {
    cache.promise ||= new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 }).connect();
    const client = await cache.promise;
    return client.db(process.env.MONGODB_DB_NAME || 'shortsforge');
  } catch (e) {
    cache.promise = null;
    console.error('MongoDB connection failed:', e?.name);
    throw new ApiError(503, 'DB_UNAVAILABLE', 'Could not connect to the database. Try again shortly.');
  }
}

export async function projectsCol() {
  const col = (await getDb()).collection('projects');
  if (!cache.indexed) {
    await col.createIndex({ ownerHash: 1, updatedAt: -1 });
    cache.indexed = true;
  }
  return col;
}
