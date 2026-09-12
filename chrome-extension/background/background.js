/**
 * Background Service Worker for Rooya AI Annotation Tracker
 * Manages persistent PC ID, Submit & Skip counters, offline queue, and Firestore sync.
 */

import { sendSubmissionToFirestore, flushOfflineQueue } from '../utils/firebase-service.js';

function generatePcId() {
  const randomHex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
  return `PC-${randomHex}`;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['pcId', 'todaySubmits', 'todaySkips', 'totalSubmits', 'totalSkips', 'todayDate'], (result) => {
    const updates = {};
    if (!result.pcId) {
      updates.pcId = generatePcId();
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (result.todayDate !== todayStr) {
      updates.todayDate = todayStr;
      updates.todaySubmits = 0;
      updates.todaySkips = 0;
    }

    if (result.totalSubmits === undefined) updates.totalSubmits = 0;
    if (result.totalSkips === undefined) updates.totalSkips = 0;

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

setInterval(() => {
  if (navigator.onLine) {
    flushOfflineQueue().catch(err => console.error('[Background] Queue flush error:', err));
  }
}, 30000);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECORD_ACTION' || message.type === 'RECORD_SUBMISSION') {
    handleRecordAction(message.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_STATS') {
    handleGetStats()
      .then((stats) => sendResponse({ success: true, stats }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_ALL_LOGS') {
    handleGetAllLogs()
      .then((res) => sendResponse({ success: true, ...res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'CLEAR_ALL_LOGS') {
    handleClearAllLogs()
      .then((res) => sendResponse({ success: true, ...res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'FLUSH_QUEUE') {
    flushOfflineQueue()
      .then((res) => sendResponse({ success: true, ...res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleRecordAction(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['pcId', 'todaySubmits', 'todaySkips', 'totalSubmits', 'totalSkips', 'todayDate', 'submissionLogs', 'offlineQueue'],
      async (data) => {
        const pcId = data.pcId || generatePcId();
        const todayStr = new Date().toISOString().split('T')[0];

        let todaySubmits = data.todaySubmits || 0;
        let todaySkips = data.todaySkips || 0;
        let totalSubmits = data.totalSubmits || 0;
        let totalSkips = data.totalSkips || 0;

        if (data.todayDate !== todayStr) {
          todaySubmits = 0;
          todaySkips = 0;
        }

        const action = payload.action === 'skip' ? 'skip' : 'submit';

        if (action === 'submit') {
          todaySubmits += 1;
          totalSubmits += 1;
        } else {
          todaySkips += 1;
          totalSkips += 1;
        }

        const fullRecord = {
          userName: payload.userName || 'Unknown User',
          userId: payload.userId || null,
          pcId: pcId,
          timestamp: payload.timestamp || new Date().toISOString(),
          date: todayStr,
          action: action
        };

        const logs = data.submissionLogs || [];
        logs.unshift(fullRecord);
        if (logs.length > 500) logs.pop();

        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
              try {
                chrome.tabs.sendMessage(tab.id, { type: 'LIVE_SUBMISSION_EVENT', record: fullRecord });
              } catch (e) {}
            });
          });
        }

        let firestoreStatus = 'synced';
        try {
          if (navigator.onLine) {
            await sendSubmissionToFirestore(fullRecord);
          } else {
            throw new Error('Offline');
          }
        } catch (err) {
          firestoreStatus = 'queued_offline';
          const queue = data.offlineQueue || [];
          queue.push(fullRecord);
          chrome.storage.local.set({ offlineQueue: queue });
        }

        chrome.storage.local.set({
          pcId: pcId,
          todaySubmits: todaySubmits,
          todaySkips: todaySkips,
          totalSubmits: totalSubmits,
          totalSkips: totalSkips,
          todayDate: todayStr,
          lastSubmissionTime: fullRecord.timestamp,
          lastAction: action,
          lastUserName: fullRecord.userName,
          submissionLogs: logs
        }, () => {
          resolve({
            success: true,
            todaySubmits: todaySubmits,
            todaySkips: todaySkips,
            totalSubmits: totalSubmits,
            totalSkips: totalSkips,
            pcId: pcId,
            status: firestoreStatus
          });
        });
      }
    );
  });
}

async function handleGetStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['pcId', 'todaySubmits', 'todaySkips', 'totalSubmits', 'totalSkips', 'todayDate', 'lastSubmissionTime', 'lastAction', 'lastUserName', 'offlineQueue'],
      (data) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const isToday = (data.todayDate === todayStr);

        resolve({
          pcId: data.pcId || 'Generating...',
          todaySubmits: isToday ? (data.todaySubmits || 0) : 0,
          todaySkips: isToday ? (data.todaySkips || 0) : 0,
          totalSubmits: data.totalSubmits || 0,
          totalSkips: data.totalSkips || 0,
          lastSubmissionTime: data.lastSubmissionTime || 'No activity yet',
          lastAction: data.lastAction || 'none',
          lastUserName: data.lastUserName || 'None detected',
          pendingSyncCount: (data.offlineQueue || []).length,
          isConnected: navigator.onLine
        });
      }
    );
  });
}

async function handleGetAllLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['pcId', 'submissionLogs', 'todaySubmits', 'todaySkips', 'totalSubmits', 'totalSkips'],
      (data) => {
        resolve({
          pcId: data.pcId || 'PC-UNKNOWN',
          logs: data.submissionLogs || [],
          stats: {
            todaySubmits: data.todaySubmits || 0,
            todaySkips: data.todaySkips || 0,
            totalSubmits: data.totalSubmits || 0,
            totalSkips: data.totalSkips || 0
          }
        });
      }
    );
  });
}

async function handleClearAllLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      submissionLogs: [],
      todaySubmits: 0,
      todaySkips: 0,
      totalSubmits: 0,
      totalSkips: 0,
      offlineQueue: []
    }, () => {
      resolve({ success: true });
    });
  });
}
