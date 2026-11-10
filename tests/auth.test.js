import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signUserIdCookie } from '../src/auth-cookie.js';
import { createDatabase } from '../src/db.js';
import { requireUser } from '../src/middleware/require-user.js';

const cookieSecret = 'test-cookie-secret-with-at-least-32-bytes';

describe('mock authentication', () => {
  let directory;
  let db;
  let app;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'docs-auth-'));
    db = createDatabase(join(directory, 'app.db'));
    app = createApp(db, { cookieSecret });
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('lists the three seeded users', async () => {
    const response = await request(app).get('/auth/users');

    expect(response.status).toBe(200);
    expect(response.body.map(({ username }) => username)).toEqual([
      'emma',
      'ishmael',
      'jim',
    ]);
  });

  it('logs in a seeded user and sets an httpOnly uid cookie', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ username: 'emma' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, username: 'emma' });
    expect(response.headers['set-cookie'][0]).toMatch(/uid=1\.[A-Za-z0-9_-]+/);
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('rejects missing and unknown usernames with JSON errors', async () => {
    const missing = await request(app).post('/auth/login').send({});
    const unknown = await request(app)
      .post('/auth/login')
      .send({ username: 'dave' });

    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'Username is required' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual({ error: 'Unknown user' });
  });

  it('clears the uid cookie on logout', async () => {
    const response = await request(app).post('/auth/logout');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers['set-cookie'][0]).toMatch(/Max-Age=0/i);
  });

  it('requires a valid uid cookie for protected routes', async () => {
    const protectedApp = express();
    protectedApp.get('/protected', requireUser(db, cookieSecret), (req, res) => {
      res.json({ username: req.user.username });
    });

    const unauthenticated = await request(protectedApp).get('/protected');
    const authenticated = await request(protectedApp)
      .get('/protected')
      .set('Cookie', `uid=${signUserIdCookie(2, cookieSecret)}`);
    const tampered = await request(protectedApp)
      .get('/protected')
      .set('Cookie', `uid=${signUserIdCookie(1, cookieSecret).replace(/^1/, '2')}`);

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: 'Authentication required' });
    expect(authenticated.status).toBe(200);
    expect(authenticated.body).toEqual({ username: 'ishmael' });
    expect(tampered.status).toBe(401);
    expect(tampered.body).toEqual({ error: 'Authentication required' });
  });

  it('creates the schema and seeds only once when reopened', () => {
    db.close();
    db = createDatabase(join(directory, 'app.db'));

    expect(db.prepare('SELECT username FROM users ORDER BY id').all()).toEqual([
      { username: 'emma' },
      { username: 'ishmael' },
      { username: 'jim' },
    ]);
  });

  it('renames existing users without changing their IDs or documents', () => {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run('alice', 1);
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run('bob', 2);
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run('carol', 3);
    db.prepare(
      'INSERT INTO documents (owner_id, title) VALUES (?, ?)',
    ).run(1, 'Existing document');
    db.close();

    db = createDatabase(join(directory, 'app.db'));

    expect(db.prepare('SELECT id, username FROM users ORDER BY id').all()).toEqual([
      { id: 1, username: 'emma' },
      { id: 2, username: 'ishmael' },
      { id: 3, username: 'jim' },
    ]);
    expect(db.prepare('SELECT owner_id, title FROM documents').all()).toEqual([
      { owner_id: 1, title: 'Existing document' },
    ]);
  });
});
