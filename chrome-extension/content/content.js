/**
 * Content Script for Rooya AI Annotation Tracker
 * Detects Submit & Skip actions across all frames and bridges live events to Dashboard tabs.
 */

(function () {
  'use strict';

  console.log('%c[Rooya Tracker Active]', 'color: #10b981; font-weight: bold; font-size: 14px;', 'Listening for Submit & Skip actions on:', window.location.href);

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

    if (config.CUSTOM_USERNAME && config.CUSTOM_USERNAME.trim().length > 0) {
      return { userName: config.CUSTOM_USERNAME.trim(), userId: null };
    }

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

    if (!userName || userName.includes('...')) {
      const candidates = document.querySelectorAll('aside, sidebar, .sidebar, footer, [class*="profile"], [class*="user"], [id*="profile"], [id*="user"], div, span');
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
  // 3. UNIVERSAL SUBMIT / SKIP BUTTON DETECTION
  // --------------------------------------------------------------------------
  function detectButtonAction(target) {
    if (!target) return null;
    const config = window.TRACKER_CONFIG || {};

    let curr = target;
    let depth = 0;

    while (curr && depth < 5 && curr !== document.body) {
      // Check configured Skip selector
      if (config.SKIP_BUTTON_SELECTOR) {
        try {
          if (curr.matches(config.SKIP_BUTTON_SELECTOR)) return 'skip';
        } catch (e) {}
      }

      // Check configured Submit selector
      if (config.SUBMIT_BUTTON_SELECTOR) {
        try {
          if (curr.matches(config.SUBMIT_BUTTON_SELECTOR)) return 'submit';
        } catch (e) {}
      }

      // Check element class / id attributes
      const idClass = (curr.id + ' ' + curr.className).toLowerCase();
      const actionAttr = (curr.getAttribute('data-action') || '').toLowerCase();

      if (actionAttr === 'skip' || idClass.includes('skip-btn') || idClass.includes('btn-skip')) {
        return 'skip';
      }
      if (actionAttr === 'submit' || idClass.includes('submit-btn') || idClass.includes('btn-submit')) {
        return 'submit';
      }

      // Check text content of buttons / clickable containers
      const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
      const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || curr.getAttribute('role') === 'button' || curr.onclick;
      
      if (isClickable || tag === 'button') {
        const text = (curr.textContent || curr.innerText || curr.value || '').trim().toLowerCase();
        if (text === 'skip') return 'skip';
        if (text === 'submit' || curr.getAttribute('type') === 'submit') return 'submit';
      }

      curr = curr.parentElement;
      depth++;
    }

    // Direct text fallback on target
    const targetText = (target.textContent || target.innerText || '').trim().toLowerCase();
    if (targetText === 'skip') return 'skip';
    if (targetText === 'submit') return 'submit';

    return null;
  }

  // --------------------------------------------------------------------------
  // 4. CLICK EVENT LISTENER (CAPTURE PHASE ON WINDOW AND DOCUMENT)
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
      console.log(`%c[Rooya Tracker] Ignored duplicate/debounced ${actionType} click.`, 'color: #f59e0b;');
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

    console.log(`%c[Rooya Tracker DETECTED] ${actionType.toUpperCase()} Click!`, 'color: #10b981; font-weight: bold; font-size: 16px;', payload);

    // Broadcast directly to open dashboard window
    try {
      window.postMessage({ type: 'ROOYA_LIVE_SUBMISSION', record: payload }, '*');
      const syncChannel = new BroadcastChannel('rooya_tracker_sync');
      syncChannel.postMessage({ type: 'NEW_SUBMISSION', record: payload });
    } catch (e) {}

    // Send payload to background service worker
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'RECORD_ACTION', payload }, (response) => {
        processingClick = false;
        if (chrome.runtime.lastError) {
          console.warn('[Rooya Tracker] Background communication warning:', chrome.runtime.lastError.message);
        } else if (response && response.success) {
          console.log('%c[Rooya Tracker SYNCED]', 'color: #38bdf8; font-weight: bold;', `Today Submits: ${response.todaySubmits}, Today Skips: ${response.todaySkips}`);
        }
      });
    } else {
      processingClick = false;
    }
  }

  // Attach capture listener on both window and document to catch ALL clicks across shadow DOM / frames
  window.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('click', handleDocumentClick, true);

})();
