/**
 * Content Script for Rooya AI Annotation Tracker
 * Detects Submit & Skip actions across all frames and bridges live events to Dashboard tabs.
 */

(function () {
  'use strict';

  console.log('%c[Rooya Tracker Active]', 'color: #10b981; font-weight: bold; font-size: 14px;', 'Listening on:', window.location.href);

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
  // 2. DOM USER EMAIL EXTRACTION
  // Specifically searches for something@rooya.ai / something@rooya.com / email pattern
  // Explicitly EXCLUDES Event Details & Fleet Card containers.
  // --------------------------------------------------------------------------
  function extractUserInfo() {
    const config = window.TRACKER_CONFIG || {};

    // Priority 0: Check if user saved a custom username in popup settings
    if (config.CUSTOM_USERNAME && config.CUSTOM_USERNAME.trim().length > 0) {
      const custom = config.CUSTOM_USERNAME.trim();
      return { userName: custom, userId: custom.split('@')[0] };
    }

    let userEmail = null;

    // 1. Look specifically at bottom-left user profile selectors
    const profileSelectors = [
      '#user-profile-email',
      '.user-profile-email',
      '.user-details',
      '.user-profile-container',
      '.profile-username',
      '[data-testid="user-email"]'
    ];

    for (const selector of profileSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const raw = el.getAttribute('title') || 
                      el.getAttribute('data-email') || 
                      el.getAttribute('aria-label') || 
                      (el.textContent || el.innerText || '').trim();
          const match = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (match) {
            userEmail = match[1].toLowerCase();
            break;
          }
        }
      } catch (e) {}
    }

    // 2. Search DOM specifically for something@rooya.ai or email pattern (EXCLUDING Event details & Fleet cards)
    if (!userEmail) {
      const excludedSelectors = '.details-card, .current-info-card, .event-details, [class*="event"], [class*="fleet"]';
      const candidateElements = document.querySelectorAll('aside, sidebar, .sidebar, footer, .user-info-text, [class*="user"], [class*="profile"]');

      for (const el of candidateElements) {
        if (el.closest && el.closest(excludedSelectors)) continue;

        const attrVal = el.getAttribute('title') || el.getAttribute('data-email') || el.getAttribute('data-username');
        const text = attrVal || (el.textContent || el.innerText || '').trim();

        if (text && text.includes('@')) {
          // Prefer @rooya.ai or @rooya.com email match
          const rooyaMatch = text.match(/([a-zA-Z0-9._%+-]+@rooya\.(ai|com))/i);
          if (rooyaMatch) {
            userEmail = rooyaMatch[1].toLowerCase();
            break;
          }

          const genericMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
          if (genericMatch) {
            userEmail = genericMatch[1].toLowerCase();
            break;
          }
        }
      }
    }

    if (!userEmail) {
      userEmail = config.FALLBACK_USERNAME || 'Unknown User';
    }

    return { userName: userEmail, userId: userEmail.includes('@') ? userEmail.split('@')[0] : userEmail };
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
      if (config.SKIP_BUTTON_SELECTOR) {
        try {
          if (curr.matches(config.SKIP_BUTTON_SELECTOR)) return 'skip';
        } catch (e) {}
      }

      if (config.SUBMIT_BUTTON_SELECTOR) {
        try {
          if (curr.matches(config.SUBMIT_BUTTON_SELECTOR)) return 'submit';
        } catch (e) {}
      }

      const idClass = (curr.id + ' ' + curr.className).toLowerCase();
      const actionAttr = (curr.getAttribute('data-action') || '').toLowerCase();

      if (actionAttr === 'skip' || idClass.includes('skip-btn') || idClass.includes('btn-skip')) {
        return 'skip';
      }
      if (actionAttr === 'submit' || idClass.includes('submit-btn') || idClass.includes('btn-submit')) {
        return 'submit';
      }

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

    const targetText = (target.textContent || target.innerText || '').trim().toLowerCase();
    if (targetText === 'skip') return 'skip';
    if (targetText === 'submit') return 'submit';

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

    console.log(`%c[Rooya Tracker DETECTED] ${actionType.toUpperCase()} Click! User: ${userInfo.userName}`, 'color: #10b981; font-weight: bold; font-size: 16px;', payload);

    try {
      window.postMessage({ type: 'ROOYA_LIVE_SUBMISSION', record: payload }, '*');
      const syncChannel = new BroadcastChannel('rooya_tracker_sync');
      syncChannel.postMessage({ type: 'NEW_SUBMISSION', record: payload });
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'RECORD_ACTION', payload }, (response) => {
        processingClick = false;
        if (chrome.runtime.lastError) {
          console.warn('[Rooya Tracker] Background communication warning:', chrome.runtime.lastError.message);
        } else if (response && response.success) {
          console.log('%c[Rooya Tracker SYNCED]', 'color: #38bdf8; font-weight: bold;', `User: ${userInfo.userName}, Today Submits: ${response.todaySubmits}`);
        }
      });
    } else {
      processingClick = false;
    }
  }

  window.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('click', handleDocumentClick, true);

})();
