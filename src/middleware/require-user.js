import { verifyUserIdCookie } from '../auth-cookie.js';

function cookieValue(cookieHeader, name) {
  for (const part of (cookieHeader ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function requireUser(db, cookieSecret) {
  const findUser = db.prepare('SELECT id, username FROM users WHERE id = ?');

  return (req, res, next) => {
    const userId = verifyUserIdCookie(
      cookieValue(req.headers.cookie, 'uid'),
      cookieSecret,
    );

    if (userId === null) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = findUser.get(userId);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    req.user = user;
    return next();
  };
}
