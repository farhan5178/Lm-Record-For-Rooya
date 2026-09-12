/**
 * Configuration for Rooya AI Productivity Tracker Content Script
 * Contains customizable CSS selectors and parameters for DOM detection.
 */

window.TRACKER_CONFIG = {
  // Selector for actual Submit button
  SUBMIT_BUTTON_SELECTOR: 'button#submit-btn, button.submit-btn, [data-action="submit"], .btn-submit, #btn-submit, button[type="submit"], [aria-label*="submit" i], [title*="submit" i], [class*="submit" i], [id*="submit" i]',

  // Selector for Skip button (must not increase submit count)
  SKIP_BUTTON_SELECTOR: 'button#skip-btn, button.skip-btn, [data-action="skip"], .btn-skip, #btn-skip, [aria-label*="skip" i], [title*="skip" i], [class*="skip" i], [id*="skip" i]',

  // Selector for logged in user's email / username element (Bottom-left area)
  USERNAME_SELECTOR: '#user-profile-email, .user-profile-email, .user-name, [data-testid="user-email"], #user-email, .profile-username, aside, sidebar, footer',

  // Selector for optional persistent user ID attribute or text
  USER_ID_SELECTOR: '[data-user-id], #user-id, .user-id',

  // Debounce window in milliseconds
  DEBOUNCE_MS: 800,

  // Fallback username
  FALLBACK_USERNAME: 'Unknown User'
};

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['customConfig'], (result) => {
    if (result && result.customConfig) {
      window.TRACKER_CONFIG = Object.assign({}, window.TRACKER_CONFIG, result.customConfig);
    }
  });
}

