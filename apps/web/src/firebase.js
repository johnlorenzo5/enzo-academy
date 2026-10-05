import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: 'AIzaSyDMbGQ4ArRfVaaVOnkIpDH6OzW3UX94rmA',
  authDomain: 'ap-6-95cb9.firebaseapp.com',
  projectId: 'ap-6-95cb9',
  storageBucket: 'ap-6-95cb9.firebasestorage.app',
  messagingSenderId: '898548583966',
  appId: '1:898548583966:web:c7ac0aa2affa5d12f2280f',
};
export const auth = getAuth(initializeApp(firebaseConfig));
export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail };

export async function api(path, {method='GET',body} = {}) {
  const headers = {'Content-Type':'application/json'};
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  const response = await fetch(`/api${path}`, {method,headers,body:body === undefined ? undefined : JSON.stringify(body)});
  let result;
  try { result=await response.json(); } catch { throw new Error('The API is unavailable. Start both apps with npm run dev.'); }
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}
