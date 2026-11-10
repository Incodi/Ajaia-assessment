import { Router } from 'express';
import { signUserIdCookie } from '../auth-cookie.js';

export function createAuthRouter(db, cookieSecret) {
  const router = Router();
  const listUsers = db.prepare('SELECT id, username FROM users ORDER BY id');
  const findUser = db.prepare('SELECT id, username FROM users WHERE username = ?');

  router.get('/users', (_req, res) => {
    res.json(listUsers.all());
  });

  router.post('/login', (req, res) => {
    const username = req.body?.username;
    if (typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const user = findUser.get(username.trim());
    if (!user) {
      return res.status(401).json({ error: 'Unknown user' });
    }

    const signedUserId = signUserIdCookie(user.id, cookieSecret);
    res.setHeader('Set-Cookie', `uid=${signedUserId}; Path=/; HttpOnly; SameSite=Lax`);
    return res.json({ id: user.id, username: user.username });
  });

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'uid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.json({ ok: true });
  });

  return router;
}
