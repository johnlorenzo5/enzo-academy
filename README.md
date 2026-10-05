# enzoAcademy monorepo

A course and quiz platform using npm workspaces, Vite, a TypeScript/Fastify API, Firebase Authentication, and Firestore.

## Start locally

Use Node.js 22.12+ and npm 10+:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The API runs on port 3001. The default application uses Firebase project `ap-6-95cb9`. Complete [Firebase server setup](docs/firebase-setup.md) before using shared courses and accounts. Firebase Web configuration is already installed; Analytics is not enabled.

## Structure

- `apps/web`: Firebase-connected interface, shared module builder, and original local demo.
- `apps/api`: ID-token verification, administrator authorization, course CRUD, enrollments, and server grading.
- `packages/domain`: enrollment deadlines, module validation, and quiz grading.
- `packages/catalog`: original demo seed courses and lessons.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run web and API together |
| `npm run dev:web` / `npm run dev:api` | Run either app |
| `npm test` | Domain, API, and virtual-DOM integration tests |
| `npm run typecheck` | Generate declarations and type-check the API |
| `npm run build` | Build shared declarations, API, and web |
| `npm run check` | Type checking, all tests, and production builds |
| `npm run preview -w @enzo/web` | Preview the built web app |
| `npm start -w @enzo/api` | Run the compiled API |

CI runs `npm ci` and `npm run check`. Tests use isolated in-memory data and virtual DOMs; they do not access the live Firebase project. Transitive gRPC and gaxios/uuid overrides select patched dependencies; check these when upgrading Firebase SDKs.

## Course administration

Sign in using the Firebase account whose UID is configured as `FIREBASE_ADMIN_UID`. The old demo admin password does not authorize Firebase access. The database starts empty; it is not automatically populated from browser-local data.

Open **Courses → Add course**, then **Modules & quizzes**. New courses start inactive so you can author content before opening enrollment. Modules support lesson text, practice instructions, and up to 50 questions:

- Multiple choice: one correct option.
- Checkboxes: an exact set of correct options, with no partial credit.
- Identification: accepted answers matched without case or extra whitespace differences.

Set points and a passing percentage. Learners can retry while access permits; their latest score is retained. Passing once keeps module completion credit. Modules without quizzes require practice notes. Enrollments snapshot course content so later edits or archiving do not reset existing progress. Archiving hides a course from new enrollments; cancellation explicitly stops an existing learner's access.

The server checks Firebase ID tokens, limits administration to the configured UID, computes deadlines using server time, and grades from private stored answer keys. The web app never receives answer keys in learner responses. The Firestore rules deny direct browser access; all database operations use the API.

## Existing local demo

Open http://127.0.0.1:5173/?demo=1 for the original browser-local prototype and its saved data. Its demo account is separate from Firebase. No local accounts, course edits, or scores are automatically uploaded or trusted. Browser storage remains tied to the original hostname and port. The old read-only seed API can be selected explicitly with `API_MODE=demo`; it is not compatible with the Firebase UI.

## Deployment

Web output: `apps/web/dist`. API output: `apps/api/dist`. Keep workspace packages and installed dependencies with the API. Supply server credentials through the hosting environment or Application Default Credentials. `apps/api/.env` is loaded when starting via the workspace npm command and is ignored by Git.

Use a production reverse proxy from `/api` to Fastify. The Vite development proxy is not part of the static build or preview server. Set `HOST` and `PORT` for your hosting environment; add your deployed domain in Firebase Authentication settings. Do not place a service-account key in web environment variables, static assets, or source control.
