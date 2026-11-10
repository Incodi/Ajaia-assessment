# Copilot instructions

## Stack

- Node.js with ESM modules and Express.
- SQLite through `better-sqlite3`; the default database is `data/app.db`.
- Static HTML, CSS, and vanilla JavaScript served directly by Express. There is
  no frontend build step or framework.
- Rich text uses a `contentEditable` element and `document.execCommand`.
- Tests use Vitest and Supertest with temporary SQLite database files.

## Conventions

- Keep changes within the existing stack; do not add React, TypeScript, an ORM,
  or a frontend bundler.
- Use parameterized SQL for values and preserve the idempotent schema setup and
  seeded users.
- Protect document and file APIs with `requireUser`; enforce ownership or
  sharing permissions on the server rather than relying on UI visibility.
- Keep the `uid` authentication cookie HMAC-signed and HttpOnly; configure
  `DOCS_COOKIE_SECRET` for deployments.
- Validate user input on the server and return JSON errors as `{ "error":
  "message" }`. Show API errors inline in the frontend; do not use `alert()`.
- Sanitize imported HTML and render document HTML only inside the editor body.
  Keep filenames and document titles in the UI as text, not interpolated HTML.
- Store runtime state only under `data/`; do not commit the SQLite database or
  uploaded files.
- Add or update Vitest/Supertest coverage for API changes, including validation
  and access control. Use temporary database files so tests do not touch the
  developer database.
- Keep the minimal, no-build frontend accessible and preserve the existing
  formatting, naming, and error-handling patterns.

## Phase and review workflow

- When a request defines phases or approval gates, work only on the current
  phase and stop at each requested review point.
- If approval is requested before implementation, present the proposed file
  tree first and wait for explicit approval before editing.
- After a phase, report the changed files and relevant test results, then wait
  for approval before proceeding. Never claim approval or review that did not
  occur.
