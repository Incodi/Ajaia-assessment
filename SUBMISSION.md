# Submission

## What's included

- A web app for creating, editing, importing, sharing, and deleting documents.
- Sharing flows between the seeded users, with document access and owner
  permissions enforced by the server.
- TXT, Markdown, and DOCX import, plus file attachments that can be downloaded
  by users with access to the document.
- A Node.js/Express backend, vanilla JavaScript frontend, SQLite database, and
  local attachment storage.
- Automated API/unit tests and Playwright browser tests.

## Credentials and test accounts

No external credentials or passwords are needed, this is a demo without working account creation. Select one of these seeded users from the login dropdown:

- `emma` 
- `ishmael`
- `jim`

Use different users to review sharing: sign in as one user, create a document,
share it with another seeded user, then sign in as that user to open the shared
document.

## Run locally

Requirements: Node.js 24 or newer and npm.

From the project directory, run:

```sh
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). The app creates
`data/app.db` and its schema on startup. Set `PORT` to use a different port.
For local use, no environment variables are required. The server generates a
temporary cookie-signing secret if `DOCS_COOKIE_SECRET` is not set; set a
persistent random value of at least 32 bytes when deploying.

Run the API and unit tests with:

```sh
npm test
```

To run browser tests, install Chromium once and run the Playwright suite:

```sh
npx playwright install chromium
npm run test:browser
```

## Working

- Document creation, editing, listing, sharing, and deletion.
- Owner and collaborator access checks, including owner-only rename, delete,
  and share management.
- Supported document imports and server-side HTML sanitization. But only small files.
- Attachment upload and authorized download.
- Local startup and Docker deployment with persistent storage.

## Incomplete and next steps

- Authentication is a seeded-user demo, not production-grade authentication.
- SQLite and local disk are designed for one basic app instance with a
  persistent data volume. Multiple instances would need shared database and
  file storage.
- The editor uses browser-native editing, rather than a full-on dedicated editor.

With another 2-4 hours, I would focus on managed authentication: choose and
configure an authentication provider, replace seeded-user login with a
provider-backed sign-in flow, verify that document ownership and sharing
continue to use the authenticated user's identity, make sure security is done correctly, like encrypting passwords with bcrypt and making sure there are no XSS holes.
