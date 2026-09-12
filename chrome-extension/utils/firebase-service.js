/**
 * Firebase Firestore Service for Chrome Extension Service Worker
 * Handles network syncing, offline queueing, and Firestore document creation.
 * Ensures each User has 1 persistent device record in /userDevices collection.
 */

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyYOUR_DEMO_FIREBASE_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

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
 * 1. Creates raw event document in /submissions
 * 2. Upserts single device mapping document in /userDevices/{userName}
 */
export async function sendSubmissionToFirestore(record) {
  const config = await getFirebaseConfig();

  if (!config.projectId || config.projectId === 'your-project-id') {
    return { success: true, mode: 'local-storage' };
  }

  // 1. Save raw submission event log
  const submissionsEndpoint = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/submissions`;
  const subResponse = await fetch(submissionsEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(record) })
  });

  if (!subResponse.ok) {
    const errorText = await subResponse.text();
    throw new Error(`Firestore REST API HTTP ${subResponse.status}: ${errorText}`);
  }

  // 2. Ensure 1 User -> 1 Device document mapping in /userDevices collection
  const safeDocId = record.userName.replace(/[^a-zA-Z0-9]/g, '_');
  const userDeviceEndpoint = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/userDevices/${safeDocId}?updateMask.fieldPaths=userName&updateMask.fieldPaths=pcId&updateMask.fieldPaths=lastSubmissionTime&updateMask.fieldPaths=date&updateMask.fieldPaths=lastAction`;

  await fetch(userDeviceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: toFirestoreFields({
        userName: record.userName,
        pcId: record.pcId,
        lastSubmissionTime: record.timestamp,
        date: record.date,
        lastAction: record.action
      })
    })
  });

  return { success: true, mode: 'firestore' };
}

export async function flushOfflineQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['offlineQueue'], async (result) => {
      const queue = result.offlineQueue || [];
      if (queue.length === 0) return resolve({ flushed: 0 });

      console.log(`[Firebase Service] Flushing ${queue.length} offline queued events...`);
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
