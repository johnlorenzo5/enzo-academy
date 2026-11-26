import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { createApi } from './api-client.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail, verifyBeforeUpdateEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

// Object: named properties group the Firebase configuration into one value.
export const firebaseConfig = {
  apiKey: 'AIzaSyDMbGQ4ArRfVaaVOnkIpDH6OzW3UX94rmA',
  authDomain: 'ap-6-95cb9.firebaseapp.com',
  projectId: 'ap-6-95cb9',
  storageBucket: 'ap-6-95cb9.firebasestorage.app',
  messagingSenderId: '898548583966',
  appId: '1:898548583966:web:c7ac0aa2affa5d12f2280f',
};
// Singleton pattern (module-based): this module initializes shared services once per
// module environment. Importers reuse auth and api; there is no getInstance() class.
export const auth = getAuth(initializeApp(firebaseConfig));
export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail, verifyBeforeUpdateEmail, reauthenticateWithCredential, EmailAuthProvider };

export const api = createApi(auth);

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  return signInWithPopup(auth, provider);
}

export async function changeAccountEmail(email, password) {
  if (!auth.currentUser?.email) throw new Error('Log in again to change your email.');
  await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password));
  await verifyBeforeUpdateEmail(auth.currentUser, email);
}
