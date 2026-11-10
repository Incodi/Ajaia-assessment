import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { Router } from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import { requireUser } from '../middleware/require-user.js';

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_BYTES = 500 * 1024;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const importExtensions = new Set(['.txt', '.md', '.docx']);
const importedHtmlTags = [
  'b', 'br', 'div', 'em', 'h1', 'h2', 'i', 'li', 'ol', 'p', 'strong', 'u', 'ul',
];
const documentFields = `
  id,
  owner_id,
  title,
  content_html AS contentHtml,
  created_at,
  updated_at
`;

function uploadSingle(maxBytes, fileFilter) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter,
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (error) => {
      if (!error) {
        return next();
      }
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `File exceeds the ${maxBytes / 1024 / 1024} MB limit` });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'Upload must use the "file" field' });
        }
        return res.status(400).json({ error: error.message });
      }
      return next(error);
    });
  };
}

const importUpload = uploadSingle(MAX_IMPORT_BYTES, (_req, file, callback) => {
  if (!importExtensions.has(extname(file.originalname).toLowerCase())) {
    const error = new Error('Unsupported file type. Accepted: .txt, .md, .docx');
    error.status = 415;
    return callback(error);
  }
  return callback(null, true);
});

const attachmentUpload = uploadSingle(MAX_ATTACHMENT_BYTES);

function safeFilename(originalname) {
  const filename = basename(String(originalname).replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return filename || 'upload';
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeDocumentHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: importedHtmlTags,
    allowedAttributes: {},
    allowedSchemes: [],
  });
}

async function importedContent(extension, buffer) {
  if (extension === '.docx') {
    const converted = await mammoth.convertToHtml(
      { buffer },
      { externalFileAccess: false },
    );
    return sanitizeDocumentHtml(converted.value);
  }

  const text = buffer.toString('utf8');
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
    .join('');
}

function validateImportedContent(contentHtml) {
  if (Buffer.byteLength(contentHtml, 'utf8') > MAX_CONTENT_BYTES) {
    return 'Imported content must be at most 500 KB';
  }
  return null;
}

function parseDocumentId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateTitle(value) {
  if (typeof value !== 'string') {
    return 'Title must be a string';
  }

  const title = value.trim();
  if (title.length === 0) {
    return 'Title is required';
  }
  if ([...title].length > MAX_TITLE_LENGTH) {
    return `Title must be at most ${MAX_TITLE_LENGTH} characters`;
  }

  return null;
}

function getAccessibleDocument(db, id, userId) {
  const document = db.prepare(
    `SELECT ${documentFields} FROM documents WHERE id = ?`,
  ).get(id);

  if (!document) {
    return { document: null, status: 404 };
  }
  if (document.owner_id === userId) {
    return { document, status: 200 };
  }

  const share = db.prepare(
    'SELECT 1 FROM shares WHERE document_id = ? AND user_id = ?',
  ).get(id, userId);

  return share
    ? { document, status: 200 }
    : { document: null, status: 403 };
}

export function createDocumentsRouter(db, cookieSecret) {
  const router = Router();
  router.use(requireUser(db, cookieSecret));
  const uploadDirectory = resolve(dirname(db.name), 'uploads');
  const findOwner = db.prepare('SELECT owner_id FROM documents WHERE id = ?');

  router.get('/', (req, res) => {
    const owned = db.prepare(
      `SELECT ${documentFields}
       FROM documents
       WHERE owner_id = ?
       ORDER BY updated_at DESC, id DESC`,
    ).all(req.user.id);

    const shared = db.prepare(
      `SELECT
         d.id,
         d.owner_id,
         d.title,
         d.content_html AS contentHtml,
         d.created_at,
         d.updated_at
       FROM documents d
       JOIN shares s ON s.document_id = d.id
       WHERE s.user_id = ? AND d.owner_id != ?
       ORDER BY d.updated_at DESC, d.id DESC`,
    ).all(req.user.id, req.user.id);

    res.json({ owned, shared });
  });

  router.post('/import', importUpload, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required' });
    }

    const filename = safeFilename(req.file.originalname);
    const extension = extname(filename).toLowerCase();
    const title = [...filename.slice(0, -extension.length).trim()]
      .slice(0, MAX_TITLE_LENGTH)
      .join('')
      || 'Imported document';
    let contentHtml;
    try {
      contentHtml = await importedContent(extension, req.file.buffer);
    } catch (error) {
      console.error('Failed to convert imported DOCX document', error);
      return res.status(400).json({ error: 'Could not read the DOCX file' });
    }
    const contentError = validateImportedContent(contentHtml);
    if (contentError) {
      return res.status(400).json({ error: contentError });
    }

    const result = db.prepare(
      'INSERT INTO documents (owner_id, title, content_html) VALUES (?, ?, ?)',
    ).run(req.user.id, title, contentHtml);
    const document = db.prepare(
      `SELECT ${documentFields} FROM documents WHERE id = ?`,
    ).get(result.lastInsertRowid);

    return res.status(201).json(document);
  });

  router.post(
    '/:id/attachments',
    (req, res, next) => {
      const id = parseDocumentId(req.params.id);
      if (id === null) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const result = getAccessibleDocument(db, id, req.user.id);
      if (result.status !== 200) {
        return res.status(result.status).json({
          error: result.status === 404 ? 'Document not found' : 'Access denied',
        });
      }
      req.documentId = id;
      return next();
    },
    attachmentUpload,
    async (req, res, next) => {
      if (!req.file) {
        return res.status(400).json({ error: 'A file is required' });
      }

      const filename = safeFilename(req.file.originalname);
      const storedPath = resolve(uploadDirectory, randomUUID());
      let fileWritten = false;
      try {
        await mkdir(uploadDirectory, { recursive: true });
        await writeFile(storedPath, req.file.buffer, { flag: 'wx' });
        fileWritten = true;
        const result = db.prepare(
          `INSERT INTO attachments
           (document_id, filename, mime, size, stored_path)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          req.documentId,
          filename,
          /^[\w.+-]+\/[\w.+-]+$/.test(req.file.mimetype)
            ? req.file.mimetype
            : 'application/octet-stream',
          req.file.size,
          storedPath,
        );
        const attachment = db.prepare(
          `SELECT id, document_id, filename, mime, size, created_at
           FROM attachments WHERE id = ?`,
        ).get(result.lastInsertRowid);
        return res.status(201).json(attachment);
      } catch (error) {
        if (fileWritten) {
          try {
            await unlink(storedPath);
          } catch (cleanupError) {
            console.error('Failed to remove an unreferenced attachment file', cleanupError);
          }
        }
        return next(error);
      }
    },
  );

  router.get('/:id/attachments', (req, res) => {
    const id = parseDocumentId(req.params.id);
    if (id === null) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const access = getAccessibleDocument(db, id, req.user.id);
    if (access.status !== 200) {
      return res.status(access.status).json({
        error: access.status === 404 ? 'Document not found' : 'Access denied',
      });
    }

    const attachments = db.prepare(
      `SELECT id, document_id, filename, mime, size, created_at
       FROM attachments
       WHERE document_id = ?
       ORDER BY created_at, id`,
    ).all(id);

    return res.json({ attachments });
  });

  router.get('/:id/attachments/:attId', (req, res, next) => {
    const id = parseDocumentId(req.params.id);
    const attachmentId = parseDocumentId(req.params.attId);
    if (id === null || attachmentId === null) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const access = getAccessibleDocument(db, id, req.user.id);
    if (access.status !== 200) {
      return res.status(access.status).json({
        error: access.status === 404 ? 'Document not found' : 'Access denied',
      });
    }

    const attachment = db.prepare(
      `SELECT filename, mime, stored_path
       FROM attachments
       WHERE id = ? AND document_id = ?`,
    ).get(attachmentId, id);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.download(
      attachment.stored_path,
      attachment.filename,
      { headers: { 'Content-Type': attachment.mime } },
      (error) => {
        if (!error || res.headersSent) {
          return;
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Attachment file is unavailable' });
        }
        return next(error);
      },
    );
  });

  router.post('/', (req, res) => {
    const titleError = validateTitle(req.body?.title);
    if (titleError) {
      return res.status(400).json({ error: titleError });
    }

    const result = db.prepare(
      'INSERT INTO documents (owner_id, title) VALUES (?, ?)',
    ).run(req.user.id, req.body.title.trim());
    const document = db.prepare(
      `SELECT ${documentFields} FROM documents WHERE id = ?`,
    ).get(result.lastInsertRowid);

    return res.status(201).json(document);
  });

  router.get('/:id', (req, res) => {
    const id = parseDocumentId(req.params.id);
    if (id === null) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = getAccessibleDocument(db, id, req.user.id);
    if (result.status !== 200) {
      return res.status(result.status).json({
        error: result.status === 404 ? 'Document not found' : 'Access denied',
      });
    }

    return res.json(result.document);
  });

  router.get('/:id/share', (req, res) => {
    const id = parseDocumentId(req.params.id);
    if (id === null) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = findOwner.get(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner may manage sharing' });
    }

    const collaborators = db.prepare(
      `SELECT s.user_id, u.username, s.created_at
       FROM shares s
       JOIN users u ON u.id = s.user_id
       WHERE s.document_id = ?
       ORDER BY s.created_at, u.username`,
    ).all(id);

    return res.json({ collaborators });
  });

  router.post('/:id/share', (req, res) => {
    const id = parseDocumentId(req.params.id);
    if (id === null) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = findOwner.get(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner may manage sharing' });
    }

    const username = req.body?.username;
    if (typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const target = db.prepare(
      'SELECT id, username FROM users WHERE username = ?',
    ).get(username.trim());
    if (!target) {
      return res.status(400).json({ error: 'Unknown user' });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot share a document with yourself' });
    }

    const existingShare = db.prepare(
      'SELECT 1 FROM shares WHERE document_id = ? AND user_id = ?',
    ).get(id, target.id);
    if (existingShare) {
      return res.status(409).json({ error: 'Document is already shared with this user' });
    }

    db.prepare(
      'INSERT INTO shares (document_id, user_id) VALUES (?, ?)',
    ).run(id, target.id);

    const collaborator = db.prepare(
      `SELECT s.user_id, u.username, s.created_at
       FROM shares s
       JOIN users u ON u.id = s.user_id
       WHERE s.document_id = ? AND s.user_id = ?`,
    ).get(id, target.id);

    return res.status(201).json(collaborator);
  });

  router.delete('/:id/share/:userId', (req, res) => {
    const id = parseDocumentId(req.params.id);
    const userId = parseDocumentId(req.params.userId);
    if (id === null || userId === null) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const document = findOwner.get(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner may manage sharing' });
    }

    const result = db.prepare(
      'DELETE FROM shares WHERE document_id = ? AND user_id = ?',
    ).run(id, userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    return res.status(204).end();
  });

  router.patch('/:id', (req, res) => {
    const id = parseDocumentId(req.params.id);
    if (id === null) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = getAccessibleDocument(db, id, req.user.id);
    if (result.status !== 200) {
      return res.status(result.status).json({
        error: result.status === 404 ? 'Document not found' : 'Access denied',
      });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }

    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((key) => !['title', 'contentHtml'].includes(key))) {
      return res.status(400).json({ error: 'Provide title and/or contentHtml' });
    }

    if (Object.hasOwn(body, 'title')) {
      if (result.document.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the owner may rename a document' });
      }

      const titleError = validateTitle(body.title);
      if (titleError) {
        return res.status(400).json({ error: titleError });
      }
    }

    if (Object.hasOwn(body, 'contentHtml')) {
      if (typeof body.contentHtml !== 'string') {
        return res.status(400).json({ error: 'contentHtml must be a string' });
      }
      if (Buffer.byteLength(body.contentHtml, 'utf8') > MAX_CONTENT_BYTES) {
        return res.status(400).json({ error: 'contentHtml must be at most 500 KB' });
      }
    }

    const assignments = [];
    const values = [];
    if (Object.hasOwn(body, 'title')) {
      assignments.push('title = ?');
      values.push(body.title.trim());
    }
    if (Object.hasOwn(body, 'contentHtml')) {
      assignments.push('content_html = ?');
      values.push(sanitizeDocumentHtml(body.contentHtml));
    }
    assignments.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(
      `UPDATE documents SET ${assignments.join(', ')} WHERE id = ?`,
    ).run(...values);

    const updatedDocument = db.prepare(
      `SELECT ${documentFields} FROM documents WHERE id = ?`,
    ).get(id);
    return res.json(updatedDocument);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseDocumentId(req.params.id);
    if (id === null) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = getAccessibleDocument(db, id, req.user.id);
    if (result.status !== 200) {
      return res.status(result.status).json({
        error: result.status === 404 ? 'Document not found' : 'Access denied',
      });
    }
    if (result.document.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner may delete a document' });
    }

    const storedFiles = db.prepare(
      'SELECT stored_path FROM attachments WHERE document_id = ?',
    ).all(id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    for (const file of storedFiles) {
      try {
        await unlink(file.stored_path);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Failed to remove an attachment for a deleted document', error);
        }
      }
    }
    return res.status(204).end();
  });

  return router;
}
