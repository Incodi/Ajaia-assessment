import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';

const cookieSecret = 'test-cookie-secret-with-at-least-32-bytes';

describe('static frontend', () => {
  let directory;
  let db;
  let app;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'docs-frontend-'));
    db = createDatabase(join(directory, 'app.db'));
    app = createApp(db, { cookieSecret });
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('serves the app shell and vanilla JavaScript client', async () => {
    const page = await request(app).get('/');
    const client = await request(app).get('/app.js');

    expect(page.status).toBe(200);
    expect(page.text).toContain('<title>Docs with Friends</title>');
    expect(page.text).toContain('Docs with <span>Friends</span>');
    expect(page.text).toContain('<main id="app"');
    expect(client.status).toBe(200);
    expect(client.text).toContain('document.execCommand');
    expect(client.text).toContain('5000');
    expect(client.text).toContain('Accepted: .txt, .md, .docx');
    expect(client.text).toContain('Attachments');
    expect(client.text).toContain('DANGEROUS');
    expect(client.text).toContain('Delete document');
  });
});
