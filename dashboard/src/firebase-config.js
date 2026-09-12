/**
 * Firebase Firestore Configuration for Team Lead Dashboard
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

// Default Firebase Client Credentials (Replace with your actual Firebase Project config)
export const firebaseConfig = {
  apiKey: "AIzaSyYOUR_DEMO_FIREBASE_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

let db = null;
let isConnected = false;

try {
  if (firebaseConfig.projectId && firebaseConfig.projectId !== 'your-project-id') {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isConnected = true;
    console.log('[Dashboard Firebase] Connected to Firestore project:', firebaseConfig.projectId);
  } else {
    console.warn('[Dashboard Firebase] Standard placeholder config active. Demo data mode active.');
  }
} catch (err) {
  console.error('[Dashboard Firebase] Error initializing Firebase:', err);
}

export { db, isConnected };

/**
 * Listen to live submissions collection from Firestore
 */
export function subscribeToSubmissions(callback) {
  if (!db) {
    return null;
  }
  try {
    const q = query(collection(db, 'submissions'), orderBy('timestamp', 'desc'), limit(1000));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(docs);
    }, (error) => {
      console.error('[Dashboard Firebase] Snapshot listener error:', error);
      callback(null);
    });
  } catch (err) {
    console.error('[Dashboard Firebase] Failed to subscribe to Firestore:', err);
    return null;
  }
}
