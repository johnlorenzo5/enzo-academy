# Firebase setup

Configured project: `ap-6-95cb9`

Configured administrator UID: `Ig0jPHHV9vSm887gPZNcuxFnzQH2`

The web application uses Firebase Authentication. The Fastify API verifies ID tokens and reads/writes Firestore with the Admin SDK. The Firebase Web configuration is public app identification; it does not authenticate the API to Firestore.

## One-time console setup

1. Enable Authentication → Email/Password and Google. Select a project support email for Google sign-in. Under Authentication → Settings → Authorized domains, include your app hostname. Both `localhost` and `127.0.0.1` are authorized for this project's local development.
2. Create a Standard Firestore database with ID `(default)` in production mode.
3. Keep the Firestore rules denying browser reads and writes. The intended rules are in `firestore.rules`; the Admin SDK bypasses them and the API performs authorization. These rules have not been deployed automatically.
4. Use the Firebase account with the administrator UID above when logging in. Demo browser accounts are separate.

## Authenticate the local API

On this computer, no Application Default Credentials or server credential path was configured when integration began. Choose one:

- With Google Cloud CLI installed, configure Application Default Credentials for the correct project. Firebase Authentication with user ADC can require additional OAuth client configuration; see the official Admin setup guide below.
- For a local service-account setup, open Firebase Project settings → Service accounts → Firebase Admin SDK → Generate new private key. Save the JSON outside this repository, for example `C:/Users/HP/.firebase/ap6-service-account.json`. Keep its contents private.

Copy `apps/api/.env.example` to `apps/api/.env`, then set:

```dotenv
FIREBASE_PROJECT_ID=ap-6-95cb9
FIREBASE_ADMIN_UID=Ig0jPHHV9vSm887gPZNcuxFnzQH2
GOOGLE_APPLICATION_CREDENTIALS=C:/Users/HP/.firebase/ap6-service-account.json
HOST=127.0.0.1
PORT=3001
```

Restart `npm run dev`. The credential file must belong to the configured project and have the required Firestore and Firebase Auth permissions. On managed hosting, prefer the host's assigned service identity instead of distributing a downloaded key.

## Verify

Open the app and sign in with your Firebase admin account. Create a course, author a module/quiz, then activate the course. Use a separate learner account to enroll and submit. A fresh database has no courses until an admin creates them. Existing local demo data remains available at `/?demo=1`; it is not silently migrated.

`GET /api/health` confirms that the API process is running, not that Firebase credentials are valid. Loading the catalog exercises Firestore. Signing in and loading `/api/me` exercises token verification. Automated tests use mocks and do not prove live Firebase connectivity.

If the API reports missing credentials, check the absolute path and restart it. If Firestore is unavailable, confirm the `(default)` database exists and the credential has access. Enable Email/Password if Firebase returns `auth/operation-not-allowed`. Do not loosen Firestore rules to work around API credential errors.

References: [Admin SDK setup](https://firebase.google.com/docs/admin/setup), [ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Firestore security](https://firebase.google.com/docs/firestore/security/overview).

## Google sign-in

Login and registration both offer **Continue with Google** using Firebase `GoogleAuthProvider` and a popup. The same authenticated API session and UID-based administrator checks apply. A pending guest enrollment resumes only after successful authentication and opens the course module after the enrollment API confirms success. Closing the popup keeps the email form available.

Allow popups for the app if the browser blocks the Google account chooser. The browser-local `?demo=1` mode keeps its separate demo accounts; Google sign-in is provided by the default Firebase app.

Reference: [Google sign-in for Firebase web apps](https://firebase.google.com/docs/auth/web/google-signin).
