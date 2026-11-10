import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';

const cookieSecret = 'test-cookie-secret-with-at-least-32-bytes';
const minimalDocx = Buffer.from(
  'UEsDBBQAAAAIAJV6al15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAlXpqXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAJV6al36aEbE1QAAAE8BAAARAAAAd29yZC9kb2N1bWVudC54bWxtkEFrwzAMhf+K0X11usMYIXYPHaW3FbrBro6tNgHbCrbWNP9+STy6yy4SD7338VCzuwcvbphyT1HBdlOBwGjJ9fGq4PPj8PQKIrOJzniKqGDCDDvdjLUj+x0wspgBMdejgo55qKXMtsNg8oYGjPPtQikYnmW6ypGSGxJZzHnmBy+fq+pFBtNHWJAtuWnZwzpOaV1nnjyKsb4Zr+CIZmm2Bakb+fCsg/Xb+/5LdMWxXHn1pOJ8cEuiBNuC+VWsz+aCoiXvBOOd/2VktHxKJVf6yr9f6B9QSwECFAMUAAAACACVempdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAJV6al2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAJV6al36aEbE1QAAAE8BAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADzAgAAAAA=',
  'base64',
);

describe('imports and attachments', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'docs-uploads-'));
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

  async function createDocument() {
    return request(app)
      .post('/api/documents')
      .set('Cookie', emmaCookie)
      .send({ title: 'Upload tests' });
  }

  it('imports text and DOCX files and sanitizes converted DOCX HTML', async () => {
    const text = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.from('first line\nsecond line'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });
    const markdown = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.from('# Heading\n- item'), {
        filename: 'outline.md',
        contentType: 'text/markdown',
      });
    const docx = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', minimalDocx, {
        filename: 'report.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(text.status).toBe(201);
    expect(text.body).toMatchObject({
      title: 'notes',
      contentHtml: '<p>first line</p><p>second line</p>',
    });
    expect(markdown.status).toBe(201);
    expect(markdown.body).toMatchObject({
      title: 'outline',
      contentHtml: '<p># Heading</p><p>- item</p>',
    });
    expect(docx.status).toBe(201);
    expect(docx.body.title).toBe('report');
    expect(docx.body.contentHtml).toContain('<h1>DOCX heading</h1>');
    expect(docx.body.contentHtml).toContain('<p><strong>Safe bold text</strong></p>');
    expect(docx.body.contentHtml).not.toMatch(/script|onclick|onerror|<img/i);
  });

  it('returns JSON errors for unsupported files, missing files, and size limits', async () => {
    const unsupported = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.from('not allowed'), {
        filename: 'program.exe',
        contentType: 'application/octet-stream',
      });
    const html = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.from('<p>HTML is no longer accepted</p>'), {
        filename: 'old-format.html',
        contentType: 'text/html',
      });
    const malformedDocx = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.from('not a DOCX archive'), {
        filename: 'broken.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    const missing = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie);
    const oversizedImport = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 97), {
        filename: 'large.txt',
        contentType: 'text/plain',
      });
    const oversizedContent = await request(app)
      .post('/api/documents/import')
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.alloc(500 * 1024 + 1, 97), {
        filename: 'large-content.txt',
        contentType: 'text/plain',
      });

    expect(unsupported.status).toBe(415);
    expect(unsupported.body).toEqual({
      error: 'Unsupported file type. Accepted: .txt, .md, .docx',
    });
    expect(html.status).toBe(415);
    expect(html.body.error).toContain('.docx');
    expect(malformedDocx.status).toBe(400);
    expect(malformedDocx.body).toEqual({ error: 'Could not read the DOCX file' });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'A file is required' });
    expect(oversizedImport.status).toBe(413);
    expect(oversizedImport.body).toHaveProperty('error');
    expect(oversizedContent.status).toBe(400);
    expect(oversizedContent.body.error).toContain('500 KB');
  });

  it('stores, lists, and downloads attachments for users with document access', async () => {
    const created = await createDocument();
    const unauthorizedUpload = await request(app)
      .post(`/api/documents/${created.body.id}/attachments`)
      .set('Cookie', ishmaelCookie)
      .attach('file', Buffer.from('private'), {
        filename: 'private.txt',
        contentType: 'text/plain',
      });
    const uploaded = await request(app)
      .post(`/api/documents/${created.body.id}/attachments`)
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.from('attachment contents'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });
    const list = await request(app)
      .get(`/api/documents/${created.body.id}/attachments`)
      .set('Cookie', emmaCookie);
    const download = await request(app)
      .get(`/api/documents/${created.body.id}/attachments/${uploaded.body.id}`)
      .set('Cookie', emmaCookie);

    expect(unauthorizedUpload.status).toBe(403);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({
      document_id: created.body.id,
      filename: 'notes.txt',
      mime: 'text/plain',
      size: 19,
    });
    expect(uploaded.body).not.toHaveProperty('stored_path');
    expect(list.body.attachments).toMatchObject([
      { id: uploaded.body.id, filename: 'notes.txt' },
    ]);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.text).toBe('attachment contents');

    await request(app)
      .post(`/api/documents/${created.body.id}/share`)
      .set('Cookie', emmaCookie)
      .send({ username: 'ishmael' });
    const shareeDownload = await request(app)
      .get(`/api/documents/${created.body.id}/attachments/${uploaded.body.id}`)
      .set('Cookie', ishmaelCookie);
    const privateDownload = await request(app)
      .get(`/api/documents/${created.body.id}/attachments/${uploaded.body.id}`)
      .set('Cookie', jimCookie);

    expect(shareeDownload.status).toBe(200);
    expect(shareeDownload.text).toBe('attachment contents');
    expect(privateDownload.status).toBe(403);
    expect(privateDownload.body).toEqual({ error: 'Access denied' });

    const storedPath = db.prepare(
      'SELECT stored_path FROM attachments WHERE id = ?',
    ).get(uploaded.body.id).stored_path;
    const removed = await request(app)
      .delete(`/api/documents/${created.body.id}`)
      .set('Cookie', emmaCookie);

    expect(removed.status).toBe(204);
    expect(existsSync(storedPath)).toBe(false);
  });

  it('enforces the 10 MB per-attachment limit', async () => {
    const created = await createDocument();
    const response = await request(app)
      .post(`/api/documents/${created.body.id}/attachments`)
      .set('Cookie', emmaCookie)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 97), {
        filename: 'too-large.bin',
        contentType: 'application/octet-stream',
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toContain('10 MB');
    expect(db.prepare('SELECT COUNT(*) AS count FROM attachments').get().count).toBe(0);
  });
});
