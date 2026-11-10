# Docs with Friends.

A currently minimal document editor built with Node.js, Express, SQLite, and static
HTML/CSS/vanilla JavaScript. Users can create and edit rich-text documents,
share them with the seeded users, import a file, and attach downloadable files.

## Requirements

- Node.js 24 or newer
- npm

## Setup and run

```sh
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). Set `PORT` to change the
port. The server creates `data/app.db` and its schema on startup; it seeds the
users only when they are not already present.

Authentication uses an HMAC-signed, HttpOnly cookie. For deployments, set
`DOCS_COOKIE_SECRET` to a persistent random value of at least 32 bytes; without
it, the server generates a temporary key on startup and users must log in again
after a restart.

## Tests

```sh
npm test
```

Vitest and Supertest exercise the Express app against temporary SQLite
databases. Tests cover authentication, document permissions and sharing,
DOCX imports and sanitization, and attachment storage/downloads.

Browser-level editor and sharing flows run with Playwright:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

## Seeded users

Choose one of these users in the login dropdown. Authentication is intentionally
mocked; there are no passwords.

- `emma`
- `ishmael`
- `jim`

These are plain names just used for testing.

## File types and limits

- Import accepts only `.txt`, `.md`, and `.docx` files up to 2 MB. Unsupported
  extensions return error HTTP 415. DOCX files are converted in to HTML and sanitized on the server. Text and Markdown files are imported as plain text with line breaks.
- Imported content must also fit the document content limit of 500 KB.
- Attachments can be any file type up to 10 MB each. They are stored under
  `data/uploads/` and downloaded as attachments by users who can access the
  document.

## Deploy to Render with Docker

1. Push this project to a Git repository and create a Render **Web Service**
   from that repository.
2. Select Docker as the runtime and deploy from the repository root.
3. Configure a persistent disk mounted at `/app/data` (on a plan that supports
   persistent disks). The SQLite database and uploaded attachments are both
   stored there.
4. Set `DOCS_COOKIE_SECRET` to a persistent random value of at least 32 bytes.
5. Deploy. The app listens on the `PORT` environment variable provided by
   Render.

To run the tool locally:

```sh
docker build -t docs-app .
docker run --rm -p 3000:3000 --mount source=docs-data,target=/app/data docs-app
```

## Architecture & tradeoffs

- **SQLite:** a simple single-file database keeps setup and deployment small and
  requires no separate database service. It fits this simple app. Note tha it is not a shared database for multiple app instances
- **`contentEditable` and `execCommand`:** they provide basic rich-text editing
  without a frontend framework or build step. The browser editing commands are
  deprecated and can vary across browsers, which is a stretch goal. 
- **Local files:** attachments live beside the SQLite file so one persistent
  volume can preserve both. Object storage and multi-instance coordination are
  cut and for stretch goals.
- **Deliberately cut/stretch goals:** real passwords/OAuth, comments, version   history, real-time collaboration, presence cursors, folders, pagination, image embedding, a mobile app, TypeScript, and an ORM.
