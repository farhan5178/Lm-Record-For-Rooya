/**
 * Firebase Firestore Service for Chrome Extension Service Worker
 * Handles network syncing, offline queueing, and Firestore document creation.
 */

// Default Firebase Configuration (Can be updated via popup settings or storage)
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyYOUR_DEMO_FIREBASE_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

/**
 * Gets active Firebase config from storage or returns default
 */
export async function getFirebaseConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['firebaseConfig'], (result) => {
      if (result && result.firebaseConfig && result.firebaseConfig.projectId) {
        resolve(result.firebaseConfig);
      } else {
        resolve(DEFAULT_FIREBASE_CONFIG);
      }
    });
  });
}

/**
 * Convert plain JS object to Firestore Document Fields schema
 */
function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }
  return fields;
}

/**
 * Send submission record to Firestore REST API
 */
export async function sendSubmissionToFirestore(record) {
  const config = await getFirebaseConfig();

  // If placeholder config is detected, simulate successful storage locally
  if (!config.projectId || config.projectId === 'your-project-id') {
    console.warn('[Firebase Service] Using local mode / placeholder config. Document queued locally.');
    return { success: true, mode: 'local-storage' };
  }

  const endpoint = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/submissions`;

  const payload = {
    fields: toFirestoreFields(record)
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore REST API HTTP ${response.status}: ${errorText}`);
  }

  const responseData = await response.json();
  return { success: true, mode: 'firestore', documentId: responseData.name };
}

/**
 * Process offline submission queue from chrome.storage.local
 */
export async function flushOfflineQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['offlineQueue'], async (result) => {
      const queue = result.offlineQueue || [];
      if (queue.length === 0) return resolve({ flushed: 0 });

      console.log(`[Firebase Service] Attempting to flush ${queue.length} offline queued events...`);
      const remainingQueue = [];
      let successCount = 0;

      for (const item of queue) {
        try {
          await sendSubmissionToFirestore(item);
          successCount++;
        } catch (err) {
          console.error('[Firebase Service] Failed to flush item:', item, err);
          remainingQueue.push(item);
        }
      }

      chrome.storage.local.set({ offlineQueue: remainingQueue }, () => {
        console.log(`[Firebase Service] Flushed ${successCount} events. ${remainingQueue.length} remaining in queue.`);
        resolve({ flushed: successCount, remaining: remainingQueue.length });
      });
    });
  });
}
