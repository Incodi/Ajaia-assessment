import { randomBytes } from 'node:crypto';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUser } from './middleware/require-user.js';
import { createAuthRouter } from './routes/auth.js';
import { createDocumentsRouter } from './routes/documents.js';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

export function createApp(
  db,
  { cookieSecret = process.env.DOCS_COOKIE_SECRET ?? randomBytes(32).toString('base64url') } = {},
) {
  if (typeof cookieSecret !== 'string' || Buffer.byteLength(cookieSecret) < 32) {
    throw new Error('DOCS_COOKIE_SECRET must contain at least 32 bytes');
  }

  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use('/auth', createAuthRouter(db, cookieSecret));
  app.use('/api/documents', createDocumentsRouter(db, cookieSecret));
  app.use(express.static(publicDirectory));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const message = status >= 500
      ? 'Internal server error'
      : error.type === 'entity.too.large'
        ? 'Request body is too large'
        : error.message;
    res.status(status).json({ error: message });
  });

  return app;
}

export { requireUser };
