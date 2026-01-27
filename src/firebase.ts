// ================================
// IMAGO VOICE - Firebase Configuration
// ================================

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDxovMIYU7GKiB2wUTHNIcVfbU2sH-IL8Y",
  authDomain: "agnes3000-cc5af.firebaseapp.com",
  projectId: "agnes3000-cc5af",
  storageBucket: "agnes3000-cc5af.firebasestorage.app",
  messagingSenderId: "1048338678359",
  appId: "1:1048338678359:web:fd106a8e6047e19c409912"
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export const initializeFirebase = (): { app: FirebaseApp; db: Firestore; auth: Auth } => {
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  }
  return { app, db: db!, auth: auth! };
};

export const signInAnonymousUser = async (): Promise<string | null> => {
  try {
    const { auth } = initializeFirebase();
    const result = await signInAnonymously(auth);
    return result.user.uid;
  } catch (error) {
    console.error('Firebase anonymous sign-in failed:', error);
    return null;
  }
};

export const getFirebaseDb = (): Firestore | null => {
  if (!db) {
    initializeFirebase();
  }
  return db;
};

export const getFirebaseAuth = (): Auth | null => {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
};
