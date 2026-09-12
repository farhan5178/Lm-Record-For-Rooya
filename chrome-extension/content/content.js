/**
 * Content Script for Rooya AI Annotation Tracker
 * Detects Submit & Skip actions on annotation pages AND bridges live logs to the Team Lead Dashboard tab.
 */

(function () {
  'use strict';

  console.log('[Rooya Tracker] Content script active on:', window.location.href);

  let lastActionTimestamp = 0;
  let processingClick = false;

  // --------------------------------------------------------------------------
  // 1. EXTENSION TO DASHBOARD TAB COMMUNICATION BRIDGE
  // --------------------------------------------------------------------------
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'LIVE_SUBMISSION_EVENT' && message.record) {
        window.postMessage({ type: 'ROOYA_LIVE_SUBMISSION', record: message.record }, '*');
      }
    });
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'REQUEST_EXTENSION_LOGS') {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_ALL_LOGS' }, (response) => {
          if (response && response.success && response.logs) {
            window.postMessage({
              type: 'ROOYA_EXTENSION_LOGS_RESPONSE',
              logs: response.logs,
              stats: response.stats
            }, '*');
          }
        });
      }
    }
  });

  // --------------------------------------------------------------------------
  // 2. DOM USER DATA EXTRACTION
  // --------------------------------------------------------------------------
  function extractUserInfo() {
    const config = window.TRACKER_CONFIG || {};
    let userName = null;
    let userId = null;

    // Priority 0: Check if user manually saved a custom username in popup settings
    if (config.CUSTOM_USERNAME && config.CUSTOM_USERNAME.trim().length > 0) {
      return { userName: config.CUSTOM_USERNAME.trim(), userId: null };
    }

    // Priority 1: Check configured USERNAME_SELECTOR
    if (config.USERNAME_SELECTOR) {
      try {
        const userEl = document.querySelector(config.USERNAME_SELECTOR);
        if (userEl) {
          userName = userEl.getAttribute('title') || 
                     userEl.getAttribute('data-email') || 
                     userEl.getAttribute('aria-label') || 
                     (userEl.textContent || userEl.innerText || '').trim();
        }
      } catch (err) {}
    }

    // Priority 2: Scan sidebar / profile containers for email or username
    if (!userName || userName.includes('...')) {
      const candidates = document.querySelectorAll('aside, sidebar, .sidebar, footer, [class*="profile"], [class*="user"], [id*="profile"], [id*="user"]');
      for (const el of candidates) {
        const attrVal = el.getAttribute('title') || el.getAttribute('data-email') || el.getAttribute('data-username');
        if (attrVal && attrVal.includes('@')) {
          userName = attrVal.trim();
          break;
        }

        const text = (el.textContent || el.innerText || '').trim();
        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
        if (emailMatch) {
          userName = emailMatch[1];
          break;
        }

        const parts = text.split(/\s+/);
        for (const p of parts) {
          if (p.includes('@') && p.length > 5) {
            userName = p.replace(/[^a-zA-Z0-9._-@]/g, '');
            break;
          }
        }
        if (userName) break;
      }
    }

    if (userName) {
      userName = userName.replace(/\.\.\.$/, '');
    }

    if (!userName || userName.length < 2) {
      userName = config.FALLBACK_USERNAME || 'Unknown User';
    }

    return { userName, userId };
  }

  // --------------------------------------------------------------------------
  // 3. SUBMIT / SKIP BUTTON DETECTION
  // --------------------------------------------------------------------------
  function detectButtonAction(target) {
    if (!target) return null;
    const config = window.TRACKER_CONFIG || {};

    if (config.SKIP_BUTTON_SELECTOR) {
      try {
        const skipMatch = target.closest(config.SKIP_BUTTON_SELECTOR);
        if (skipMatch) return 'skip';
      } catch (e) {}
    }

    if (config.SUBMIT_BUTTON_SELECTOR) {
      try {
        const submitMatch = target.closest(config.SUBMIT_BUTTON_SELECTOR);
        if (submitMatch) return 'submit';
      } catch (e) {}
    }

    const btn = target.closest('button, [role="button"], input[type="submit"], a.btn');
    if (btn) {
      const text = (btn.textContent || btn.innerText || btn.value || '').trim().toLowerCase();
      if (text === 'skip' || text.includes('skip')) {
        return 'skip';
      }
      if (text === 'submit' || text.includes('submit') || btn.getAttribute('type') === 'submit') {
        return 'submit';
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // 4. CLICK EVENT LISTENER (CAPTURE PHASE)
  // --------------------------------------------------------------------------
  function handleDocumentClick(event) {
    const target = event.target;
    if (!target) return;

    const actionType = detectButtonAction(target);
    if (!actionType) {
      return;
    }

    const now = Date.now();
    const config = window.TRACKER_CONFIG || {};
    const debounceMs = config.DEBOUNCE_MS || 1000;

    if (now - lastActionTimestamp < debounceMs || processingClick) {
      console.log(`[Rooya Tracker] Debounced ${actionType} click.`);
      return;
    }

    lastActionTimestamp = now;
    processingClick = true;

    const userInfo = extractUserInfo();

    const payload = {
      userName: userInfo.userName,
      userId: userInfo.userId,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      action: actionType
    };

    console.log(`[Rooya Tracker] ${actionType.toUpperCase()} action detected:`, payload);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'RECORD_ACTION', payload }, (response) => {
        processingClick = false;
        if (chrome.runtime.lastError) {
          console.error('[Rooya Tracker] Messaging error:', chrome.runtime.lastError.message);
        } else if (response && response.success) {
          console.log(`[Rooya Tracker] Action logged! User: ${userInfo.userName}, Submits: ${response.todaySubmits}`);
        }
      });
    } else {
      processingClick = false;
    }
  }

  document.addEventListener('click', handleDocumentClick, true);

})();
