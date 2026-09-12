/**
 * Popup Script for Rooya Productivity Tracker Extension
 * Fetches stats from background worker and renders live counters.
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const valUser = document.getElementById('val-user');
  const valPc = document.getElementById('val-pc');

  const valTodaySubmits = document.getElementById('val-today-submits');
  const valTodaySkips = document.getElementById('val-today-skips');
  const valTotalSubmits = document.getElementById('val-total-submits');
  const valTotalSkips = document.getElementById('val-total-skips');

  const valLastTime = document.getElementById('val-last-time');
  const pendingSyncRow = document.getElementById('pending-sync-row');
  const valPending = document.getElementById('val-pending');

  const btnSync = document.getElementById('btn-sync');
  const btnOptions = document.getElementById('btn-options');
  const settingsPanel = document.getElementById('settings-panel');
  const btnSaveCfg = document.getElementById('btn-save-cfg');
  const btnCloseCfg = document.getElementById('btn-close-cfg');

  const cfgCustomUser = document.getElementById('cfg-custom-user');
  const cfgSubmitSel = document.getElementById('cfg-submit-sel');
  const cfgSkipSel = document.getElementById('cfg-skip-sel');
  const cfgUserSel = document.getElementById('cfg-user-sel');
  const cfgFbProject = document.getElementById('cfg-fb-project');

  function formatTime(isoString) {
    if (!isoString || isoString === 'No activity yet') return 'No activity yet';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return isoString;
    }
  }

  function loadStats() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
        if (chrome.runtime.lastError) return;

        if (response && response.success && response.stats) {
          const stats = response.stats;
          valUser.textContent = stats.lastUserName || 'Awaiting DOM...';
          valPc.textContent = stats.pcId || 'PC-UNKNOWN';

          valTodaySubmits.textContent = (stats.todaySubmits || 0).toLocaleString();
          valTodaySkips.textContent = (stats.todaySkips || 0).toLocaleString();
          valTotalSubmits.textContent = (stats.totalSubmits || 0).toLocaleString();
          valTotalSkips.textContent = (stats.totalSkips || 0).toLocaleString();

          const actionLabel = stats.lastAction && stats.lastAction !== 'none' ? ` (${stats.lastAction.toUpperCase()})` : '';
          valLastTime.textContent = formatTime(stats.lastSubmissionTime) + actionLabel;

          if (stats.pendingSyncCount > 0) {
            pendingSyncRow.style.display = 'flex';
            valPending.textContent = `${stats.pendingSyncCount} queued`;
          } else {
            pendingSyncRow.style.display = 'none';
          }

          if (stats.isConnected) {
            statusBadge.classList.remove('offline');
            statusText.textContent = 'Connected';
          } else {
            statusBadge.classList.add('offline');
            statusText.textContent = 'Offline';
          }
        }
      });
    }
  }

  loadStats();
  setInterval(loadStats, 3000);

  btnSync.addEventListener('click', () => {
    btnSync.textContent = 'Syncing...';
    btnSync.disabled = true;
    chrome.runtime.sendMessage({ type: 'FLUSH_QUEUE' }, () => {
      btnSync.textContent = 'Sync Now';
      btnSync.disabled = false;
      loadStats();
    });
  });

  btnOptions.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    if (!settingsPanel.classList.contains('hidden')) {
      chrome.storage.local.get(['customConfig', 'firebaseConfig'], (result) => {
        if (result.customConfig) {
          cfgCustomUser.value = result.customConfig.CUSTOM_USERNAME || '';
          cfgSubmitSel.value = result.customConfig.SUBMIT_BUTTON_SELECTOR || '';
          cfgSkipSel.value = result.customConfig.SKIP_BUTTON_SELECTOR || '';
          cfgUserSel.value = result.customConfig.USERNAME_SELECTOR || '';
        }
        if (result.firebaseConfig) {
          cfgFbProject.value = result.firebaseConfig.projectId || '';
        }
      });
    }
  });

  btnCloseCfg.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  btnSaveCfg.addEventListener('click', () => {
    const customConfig = {
      CUSTOM_USERNAME: cfgCustomUser.value.trim() || undefined,
      SUBMIT_BUTTON_SELECTOR: cfgSubmitSel.value.trim() || undefined,
      SKIP_BUTTON_SELECTOR: cfgSkipSel.value.trim() || undefined,
      USERNAME_SELECTOR: cfgUserSel.value.trim() || undefined
    };

    const firebaseConfig = {
      projectId: cfgFbProject.value.trim() || undefined
    };

    chrome.storage.local.set({ customConfig, firebaseConfig }, () => {
      alert('Settings saved successfully!');
      settingsPanel.classList.add('hidden');
      loadStats();
    });
  });

  const btnResetAll = document.getElementById('btn-reset-all');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all stored user logs and reset counters to 0?')) {
        chrome.runtime.sendMessage({ type: 'CLEAR_ALL_LOGS' }, () => {
          alert('All extension memory and user logs have been cleared successfully!');
          settingsPanel.classList.add('hidden');
          loadStats();
        });
      }
    });
  }
});
