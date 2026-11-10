import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';

const directory = mkdtempSync(join(tmpdir(), 'docs-browser-'));
const db = createDatabase(join(directory, 'app.db'));
const app = createApp(db);
const server = app.listen(Number(process.env.PORT) || 4174, '127.0.0.1');

function shutdown() {
  server.close(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
