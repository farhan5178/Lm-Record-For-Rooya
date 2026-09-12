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
  // 2. CLEAN EMAIL EXTRACTION HELPER
  // Strips UI labels like Fleet, Tamkeen, Language, Data, avatar initials, and trailing text.
  // --------------------------------------------------------------------------
  function cleanEmail(rawText) {
    if (!rawText) return null;

    // Remove known Rooya UI noise words
    let cleaned = rawText
      .replace(/Fleet/gi, ' ')
      .replace(/Tamkeen/gi, ' ')
      .replace(/Language/gi, ' ')
      .replace(/Driver/gi, ' ')
      .replace(/Labeling/gi, ' ')
      .replace(/Current/gi, ' ')
      .replace(/Logged in as/gi, ' ')
      .replace(/Data/gi, ' ')
      .trim();

    // Match email pattern
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4})/i;
    const match = cleaned.match(emailRegex);

    if (match) {
      let email = match[1];

      // Remove avatar initial prefix if concatenated e.g. "Ffarhan" -> "farhan"
      if (/^[A-Z][a-z0-9._-]+@/.test(email) && /^[A-Z][a-z]/.test(email)) {
        email = email.substring(1);
      }

      // Clean up TLD if trailing text concatenated e.g. ".aiData" -> ".ai"
      email = email.replace(/(\.(ai|com|org|net|io|co|sa|ae|gov))[a-zA-Z]*$/i, '$1');

      return email.toLowerCase().trim();
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // 3. DOM USER DATA EXTRACTION
  // --------------------------------------------------------------------------
  function extractUserInfo() {
    const config = window.TRACKER_CONFIG || {};
    let userName = null;
    let userId = null;

    // Priority 0: Check if user saved a custom username in popup settings
    if (config.CUSTOM_USERNAME && config.CUSTOM_USERNAME.trim().length > 0) {
      return { userName: config.CUSTOM_USERNAME.trim(), userId: null };
    }

    // Priority 1: Check configured USERNAME_SELECTOR
    if (config.USERNAME_SELECTOR) {
      try {
        const userEl = document.querySelector(config.USERNAME_SELECTOR);
        if (userEl) {
          const raw = userEl.getAttribute('title') || 
                      userEl.getAttribute('data-email') || 
                      userEl.getAttribute('aria-label') || 
                      (userEl.textContent || userEl.innerText || '').trim();
          userName = cleanEmail(raw);
        }
      } catch (err) {}
    }

    // Priority 2: Targeted scan of profile containers
    if (!userName) {
      const candidates = document.querySelectorAll('.user-profile-email, [class*="profile"], [class*="user"], [id*="profile"], [id*="user"]');
      for (const el of candidates) {
        const attrVal = el.getAttribute('title') || el.getAttribute('data-email') || el.getAttribute('data-username');
        userName = cleanEmail(attrVal) || cleanEmail(el.textContent || el.innerText);
        if (userName) break;
      }
    }

    // Priority 3: Scan entire sidebar/aside
    if (!userName) {
      const sidebars = document.querySelectorAll('aside, sidebar, .sidebar, footer');
      for (const sb of sidebars) {
        userName = cleanEmail(sb.textContent || sb.innerText);
        if (userName) break;
      }
    }

    if (!userName) {
      userName = config.FALLBACK_USERNAME || 'Unknown User';
    }

    return { userName, userId };
  }

  // --------------------------------------------------------------------------
  // 4. UNIVERSAL SUBMIT / SKIP BUTTON DETECTION
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
  // 5. CLICK EVENT LISTENER (CAPTURE PHASE)
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
