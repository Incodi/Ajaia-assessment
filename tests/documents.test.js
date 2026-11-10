import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';

const cookieSecret = 'test-cookie-secret-with-at-least-32-bytes';

describe('document CRUD API', () => {
  let directory;
  let db;
  let app;
  let emmaCookie;
  let ishmaelCookie;
  let jimCookie;

  async function login(username) {
    const response = await request(app)
      .post('/auth/login')
      .send({ username });
    return response.headers['set-cookie'][0].split(';')[0];
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'docs-documents-'));
    db = createDatabase(join(directory, 'app.db'));
    app = createApp(db, { cookieSecret });
    [emmaCookie, ishmaelCookie, jimCookie] = await Promise.all([
      login('emma'),
      login('ishmael'),
      login('jim'),
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function createDocument(title = 'Project notes') {
    return request(app)
      .post('/api/documents')
      .set('Cookie', emmaCookie)
      .send({ title });
  }

  it('requires authentication and validates new document titles', async () => {
    const unauthenticated = await request(app)
      .post('/api/documents')
      .send({ title: 'Private' });
    const blankTitle = await request(app)
      .post('/api/documents')
      .set('Cookie', emmaCookie)
      .send({ title: '   ' });
    const longTitle = await createDocument('x'.repeat(201));

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: 'Authentication required' });
    expect(blankTitle.status).toBe(400);
    expect(blankTitle.body).toHaveProperty('error');
    expect(longTitle.status).toBe(400);
    expect(longTitle.body).toHaveProperty('error');
  });

  it('creates, reads, patches, and lists an owned document', async () => {
    const created = await createDocument('  Meeting notes  ');

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      owner_id: 1,
      title: 'Meeting notes',
      contentHtml: '',
    });

    const patched = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie)
      .send({ title: 'Updated notes', contentHtml: '<p>Hello</p>' });
    const read = await request(app)
      .get(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie);
    const list = await request(app)
      .get('/api/documents')
      .set('Cookie', emmaCookie);

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      title: 'Updated notes',
      contentHtml: '<p>Hello</p>',
    });
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(created.body.id);
    expect(list.status).toBe(200);
    expect(list.body.owned).toHaveLength(1);
    expect(list.body.owned[0].title).toBe('Updated notes');
    expect(list.body.shared).toEqual([]);
  });

  it('allows sharees to read and edit content but not rename or delete', async () => {
    const created = await createDocument();
    const shared = await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'ishmael' });
    const sharedList = await request(app)
      .get('/api/documents')
      .set('Cookie', ishmaelCookie);

    const read = await request(app)
      .get(`/api/documents/${created.body.id}`)
      .set('Cookie', ishmaelCookie);
    const patchContent = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', ishmaelCookie)
      .send({ contentHtml: '<h1>Ishmael edited</h1>' });
    const rename = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', ishmaelCookie)
      .send({ title: 'Ishmael renamed it' });
    const remove = await request(app)
      .delete(`/api/documents/${created.body.id}`)
      .set('Cookie', ishmaelCookie);

    expect(shared.status).toBe(201);
    expect(shared.body).toMatchObject({ user_id: 2, username: 'ishmael' });
    expect(sharedList.body.shared).toMatchObject([
      { id: created.body.id, title: 'Project notes' },
    ]);
    expect(read.status).toBe(200);
    expect(patchContent.status).toBe(200);
    expect(patchContent.body.contentHtml).toBe('<h1>Ishmael edited</h1>');
    expect(rename.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('validates sharing, lists collaborators, and lets only the owner revoke access', async () => {
    const created = await createDocument();

    const unknownUser = await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'dave' });
    const selfShare = await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'emma' });
    const nonOwnerShare = await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', ishmaelCookie)
      .send({ username: 'jim' });
    const shared = await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'ishmael' });
    const duplicate = await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'ishmael' });
    const collaborators = await request(app)
      .get(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie);
    const nonOwnerList = await request(app)
      .get(`/api/documents/${created.body.id}/share`)
      .set('Cookie', ishmaelCookie);
    const nonOwnerRemove = await request(app)
      .delete(`/api/documents/${created.body.id}/share/2`)
      .set('Cookie', ishmaelCookie);
    const removed = await request(app)
      .delete(`/api/documents/${created.body.id}/share/2`)
      .set('Cookie', emmaCookie);
    const revokedRead = await request(app)
      .get(`/api/documents/${created.body.id}`)
      .set('Cookie', ishmaelCookie);
    const ishmaelList = await request(app)
      .get('/api/documents')
      .set('Cookie', ishmaelCookie);

    expect(unknownUser.status).toBe(400);
    expect(unknownUser.body).toEqual({ error: 'Unknown user' });
    expect(selfShare.status).toBe(400);
    expect(nonOwnerShare.status).toBe(403);
    expect(shared.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(collaborators.body.collaborators).toMatchObject([
      { user_id: 2, username: 'ishmael' },
    ]);
    expect(nonOwnerList.status).toBe(403);
    expect(nonOwnerRemove.status).toBe(403);
    expect(removed.status).toBe(204);
    expect(revokedRead.status).toBe(403);
    expect(ishmaelList.body.shared).toEqual([]);
  });

  it('returns 403 for a non-sharee and keeps shared documents out of their list', async () => {
    const created = await createDocument();

    const read = await request(app)
      .get(`/api/documents/${created.body.id}`)
      .set('Cookie', jimCookie);
    const list = await request(app)
      .get('/api/documents')
      .set('Cookie', jimCookie);

    expect(read.status).toBe(403);
    expect(read.body).toEqual({ error: 'Access denied' });
    expect(list.body).toEqual({ owned: [], shared: [] });
  });

  it('lets only the owner delete a document', async () => {
    const created = await createDocument();

    const removed = await request(app)
      .delete(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie);
    const missing = await request(app)
      .get(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie);

    expect(removed.status).toBe(204);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Document not found' });
  });

  it('rejects invalid patches and content above 500 KB', async () => {
    const created = await createDocument();

    const empty = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie)
      .send({});
    const invalidContent = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie)
      .send({ contentHtml: 42 });
    const tooMuchContent = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie)
      .send({ contentHtml: 'x'.repeat(500 * 1024 + 1) });

    expect(empty.status).toBe(400);
    expect(invalidContent.status).toBe(400);
    expect(tooMuchContent.status).toBe(400);
    expect(tooMuchContent.body.error).toContain('500 KB');
  });

  it('sanitizes stored content before shared users can read it', async () => {
    const created = await createDocument();
    await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'ishmael' });

    const patched = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie)
      .send({
        contentHtml: '<p onclick="alert(1)">Safe <script>alert(2)</script><img src=x onerror="alert(3)"><strong>text</strong></p>',
      });
    const readBySharee = await request(app)
      .get(`/api/documents/${created.body.id}`)
      .set('Cookie', ishmaelCookie);

    expect(patched.status).toBe(200);
    expect(patched.body.contentHtml).toBe('<p>Safe <strong>text</strong></p>');
    expect(readBySharee.status).toBe(200);
    expect(readBySharee.body.contentHtml).toBe('<p>Safe <strong>text</strong></p>');
  });
});
