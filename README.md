# EnzoAcademy

A learning platform where administrators create courses and learners enroll, complete activities, take quizzes, and view their achievements. This repository contains the web interface, API, and shared course logic.

## Features

- Email/password and Google sign-in, with separate administrator and learner access.
- Course creation, module editing, enrollment dates, and course archiving.
- Guided lessons with YouTube videos, readings, practice activities, quizzes, and saved notes.
- Progress tracking, server-side quiz grading, and enrollment deadlines.
- Module certificates with PDF downloads, public verification, and administrator management.
- Learner profiles and achievement badges.

## Technology

The interface uses JavaScript, HTML, CSS, and Vite. The API uses TypeScript and Fastify. Firebase Authentication handles sign-in, and Firestore stores shared application data. npm workspaces connect the apps and shared packages in this repository.

## Finals programming checklist

These examples are used by the application. Comments beside the relevant code identify each concept.

| Requirement | Example | Source |
| --- | --- | --- |
| Arrays | `courses`, `enrollments`, and `learners` store lists used by the interface. | [cloud.js](apps/web/src/cloud.js) |
| Objects | `firebaseConfig` groups Firebase settings into named properties. | [firebase.js](apps/web/src/firebase.js) |
| Functions | `youtubeId(value)` accepts a video ID or URL and returns a valid ID or `null`. | [activities.js](packages/domain/src/activities.js) |
| Factory | `createAccountMenu(...)` creates a menu with its own state and returns an object with methods to control it. | [account-menu.js](apps/web/src/account-menu.js) |
| JavaScript basics: variables | `const` declares fixed bindings, while `let` allows application state to be reassigned. | [cloud.js](apps/web/src/cloud.js) |
| Singleton pattern | The Firebase module initializes and exports shared `auth` and `api` instances that importers reuse within the same module environment. | [firebase.js](apps/web/src/firebase.js) |

The Factory example is a **factory function**. The Singleton example uses **shared JavaScript module exports**. These implementations do not include a class-based Factory Method or a Singleton class with `getInstance()`; compare these forms with the course rubric when preparing the demonstration.

## Start locally

Use Node.js 22.12+ and npm 10+. Run the following commands from this repository's root folder (the `school` folder on the original development computer):

```sh
npm install
```

Complete the [Firebase server setup](docs/firebase-setup.md) for shared courses and accounts. This includes configuring Firebase Authentication and Firestore, copying `apps/api/.env.example` to `apps/api/.env`, and providing server credentials. The web configuration already identifies Firebase project `ap-6-95cb9`; using another project also requires updating `apps/web/src/firebase.js` and the server settings.

Start both the web interface and API:

```sh
npm run dev
```

Open http://127.0.0.1:5173. The API runs on port 3001. Keep the terminal running while using the app; press **Ctrl+C** to stop it. On later runs, use `npm run dev` again. Analytics is not enabled.

For a classroom demonstration, sign in as an administrator to create and activate a course, then use a separate learner account to enroll and complete its activities. Firebase setup is required for this shared-data workflow; automated tests do not verify live Firebase connectivity.

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

The Firebase app now includes a dedicated guided learning workspace with embedded YouTube videos, ordered activities, transcripts, notes, and resource links. See [Guided learning](docs/guided-learning.md) for authoring steps, completion rules, and compatibility details.

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

## Certificates and achievements

Module certificates, profile badges, public verification and Admin management are available in the Firebase app. See [Certificate setup and migration](docs/certificates.md) for email environment variables, historical completion backfill, deployment assets and testing.
