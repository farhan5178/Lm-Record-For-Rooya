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
    if (!event.data) return;

    if (event.data.type === 'REQUEST_EXTENSION_LOGS') {
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

    if (event.data.type === 'DELETE_USER_LOGS' && event.data.userName) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'DELETE_USER_LOGS', userName: event.data.userName });
      }
    }

    if (event.data.type === 'CLEAR_EXTENSION_LOGS') {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CLEAR_ALL_LOGS' });
      }
    }
  });

  // --------------------------------------------------------------------------
  // 2. DOM USER EMAIL EXTRACTION & NOISE CLEANING
  // --------------------------------------------------------------------------
  function cleanEmail(rawStr) {
    if (!rawStr) return null;

    const emailMatch = rawStr.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (!emailMatch) return null;

    let email = emailMatch[1].toLowerCase();

    // Noise terms that get prepended by parent element innerText concatenation
    const noiseWords = [
      'fleettamkeenlanguagef', 'fleettamkeenlanguage', 'fleet', 'tamkeen', 'language',
      'currenteventtype', 'currentevent', 'currentfleet', 'eventtype', 'event',
      'data', 'useremail', 'user', 'email', 'profile', 'username', 'logout', 'login'
    ];

    let username = email.split('@')[0];
    const domain = email.split('@')[1];

    for (const word of noiseWords) {
      if (username.startsWith(word) && username.length > word.length) {
        username = username.substring(word.length);
      }
    }

    // Handle single leading character noise like 'Ffarhan.sadik' -> 'farhan.sadik'
    if (username.length > 3 && username.includes('.')) {
      const parts = username.split('.');
      if (parts[0].length > 1 && /^[a-z]/.test(parts[0])) {
        // clean valid username format
      }
    }

    return `${username}@${domain}`;
  }

  function extractUserInfo() {
    const config = window.TRACKER_CONFIG || {};

    if (config.CUSTOM_USERNAME && config.CUSTOM_USERNAME.trim().length > 0) {
      const custom = config.CUSTOM_USERNAME.trim();
      return { userName: custom, userId: custom.split('@')[0] };
    }

    let userEmail = null;

    // A. Prioritize LEAF nodes (elements with no children) to avoid text concatenation of UI labels
    try {
      const allLeafs = Array.from(document.querySelectorAll('span, td, div, p, b, strong, font, a, label, small, aside, footer'))
        .filter(el => el.children.length === 0);

      for (const el of allLeafs) {
        const txt = (el.textContent || el.innerText || '').trim();
        if (txt && txt.includes('@')) {
          const rooyaMatch = txt.match(/([a-zA-Z0-9._%+-]+@rooya\.(ai|com))/i);
          if (rooyaMatch) {
            userEmail = cleanEmail(rooyaMatch[1]);
            if (userEmail) break;
          }

          const genericMatch = txt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
          if (genericMatch) {
            userEmail = cleanEmail(genericMatch[1]);
            if (userEmail) break;
          }
        }
      }
    } catch (e) {}

    // B. Check explicitly defined user selectors or attributes if leaf search yielded nothing
    if (!userEmail) {
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
            userEmail = cleanEmail(raw);
            if (userEmail) break;
          }
        } catch (e) {}
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

    const SUBMIT_REGEX = /^(submit|submit & next|submit task|save & next|save submission|submit annotation|complete task|submit\(ctrl\+enter\))$/i;
    const SKIP_REGEX = /^(skip|skip task|skip & next|pass|pass task)$/i;

    const SUBMIT_PARTIAL = /\b(submit|save & next|submit & next|complete task|submit task)\b/i;
    const SKIP_PARTIAL = /\b(skip|skip task|skip & next|pass task)\b/i;

    while (curr && depth < 6 && curr !== document.body && curr !== document.documentElement) {
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

      const idClassAttr = (
        (curr.id || '') + ' ' + 
        (curr.className || '') + ' ' + 
        (curr.getAttribute('data-action') || '') + ' ' + 
        (curr.getAttribute('aria-label') || '') + ' ' + 
        (curr.getAttribute('title') || '') + ' ' +
        (curr.name || '')
      ).toLowerCase();

      if (idClassAttr.includes('skip-btn') || idClassAttr.includes('btn-skip') || idClassAttr.includes('action-skip')) {
        return 'skip';
      }
      if (idClassAttr.includes('submit-btn') || idClassAttr.includes('btn-submit') || idClassAttr.includes('action-submit')) {
        return 'submit';
      }

      const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
      const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || curr.getAttribute('role') === 'button' || curr.onclick;

      if (isClickable || tag === 'button' || tag === 'input') {
        const text = (curr.textContent || curr.innerText || curr.value || '').trim();
        
        if (SUBMIT_REGEX.test(text) || SUBMIT_PARTIAL.test(text)) return 'submit';
        if (SKIP_REGEX.test(text) || SKIP_PARTIAL.test(text)) return 'skip';
        if (curr.getAttribute('type') === 'submit') return 'submit';
      }

      curr = curr.parentElement;
      depth++;
    }

    const targetText = (target.textContent || target.innerText || target.value || '').trim();
    if (SUBMIT_REGEX.test(targetText) || SUBMIT_PARTIAL.test(targetText)) return 'submit';
    if (SKIP_REGEX.test(targetText) || SKIP_PARTIAL.test(targetText)) return 'skip';

    return null;
  }

  // --------------------------------------------------------------------------
  // 4. ACTION DISPATCHER & EVENT LISTENERS
  // --------------------------------------------------------------------------
  function triggerRecordAction(actionType) {
    const now = Date.now();
    const config = window.TRACKER_CONFIG || {};
    const debounceMs = config.DEBOUNCE_MS || 800;

    if (now - lastActionTimestamp < debounceMs || processingClick) {
      console.log(`%c[Rooya Tracker] Ignored debounced ${actionType} action.`, 'color: #f59e0b;');
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

  function handleInteractionEvent(event) {
    const target = event.target;
    if (!target) return;

    const actionType = detectButtonAction(target);
    if (actionType) {
      triggerRecordAction(actionType);
    }
  }

  // Keyboard shortcut listener (Ctrl+Enter / Cmd+Enter for Submit)
  function handleKeyDownEvent(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      console.log('%c[Rooya Tracker] Hotkey Ctrl+Enter detected!', 'color: #10b981;');
      triggerRecordAction('submit');
    }
  }

  // Attach capture phase listeners for click, pointerdown, mouseup, and keydown
  window.addEventListener('click', handleInteractionEvent, true);
  document.addEventListener('click', handleInteractionEvent, true);
  window.addEventListener('pointerdown', handleInteractionEvent, true);
  window.addEventListener('keydown', handleKeyDownEvent, true);

})();

