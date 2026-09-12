/**
 * Firebase Firestore Configuration for Team Lead Dashboard
 * Supports SDK snapshot listening and REST API polling across all team PCs.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

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
  const activeProjectId = localStorage.getItem('rooya_firebase_project_id') || firebaseConfig.projectId;
  if (activeProjectId && activeProjectId !== 'your-project-id') {
    firebaseConfig.projectId = activeProjectId;
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isConnected = true;
    console.log('[Dashboard Firebase] Connected to Firestore project:', activeProjectId);
  } else {
    console.warn('[Dashboard Firebase] Placeholder config active.');
  }
} catch (err) {
  console.error('[Dashboard Firebase] Error initializing Firebase:', err);
}

export { db, isConnected };

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

/**
 * Universal REST API polling for multi-PC team sync
 */
export async function fetchCloudSubmissions(projectIdOverride) {
  const projectId = projectIdOverride || localStorage.getItem('rooya_firebase_project_id') || firebaseConfig.projectId;
  if (!projectId || projectId === 'your-project-id') return null;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/submissions?pageSize=1000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.documents) return [];

    return data.documents.map(doc => {
      const f = doc.fields || {};
      return {
        id: doc.name.split('/').pop(),
        userName: f.userName?.stringValue || 'Unknown User',
        userId: f.userId?.stringValue || null,
        pcId: f.pcId?.stringValue || 'PC-UNKNOWN',
        timestamp: f.timestamp?.stringValue || new Date().toISOString(),
        date: f.date?.stringValue || new Date().toISOString().split('T')[0],
        action: f.action?.stringValue || 'submit'
      };
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[Dashboard Firebase REST API Fetch Error]', err);
    return null;
  }
}

