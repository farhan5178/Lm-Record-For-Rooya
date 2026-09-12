/**
 * Configuration for Productivity Tracker Content Script
 * Contains customizable CSS selectors and parameters for DOM detection.
 */

window.TRACKER_CONFIG = {
  // Selector for the actual Submit button (Bottom-right corner of annotation page)
  SUBMIT_BUTTON_SELECTOR: 'button#submit-btn, button.submit-btn, [data-action="submit"], .btn-submit, #btn-submit',

  // Selector for Skip button (clicks on Skip must explicitly be ignored)
  SKIP_BUTTON_SELECTOR: 'button#skip-btn, button.skip-btn, [data-action="skip"], .btn-skip, #btn-skip',

  // Selector for logged in user's email / username element (Bottom-left corner)
  USERNAME_SELECTOR: '#user-profile-email, .user-profile-email, .user-name, [data-testid="user-email"], #user-email, .profile-username',

  // Selector for optional persistent user ID attribute or text
  USER_ID_SELECTOR: '[data-user-id], #user-id, .user-id',

  // Debounce window in milliseconds to eliminate duplicate clicks from bubbling or re-renders
  DEBOUNCE_MS: 1000,

  // Safe fallback username if DOM element is missing or not rendered
  FALLBACK_USERNAME: 'Unknown User (Check Selectors)'
};

// Allow runtime override of config from chrome.storage.local if customized by team lead
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['customConfig'], (result) => {
    if (result && result.customConfig) {
      window.TRACKER_CONFIG = Object.assign({}, window.TRACKER_CONFIG, result.customConfig);
      console.log('[Tracker Config] Applied custom selectors from local storage:', window.TRACKER_CONFIG);
    }
  });
}
