/**
 * Main Controller for Rooya AI Team Lead Productivity Dashboard
 * Bridges Chrome Extension submissions and Firestore snapshots in real time.
 */

import { subscribeToSubmissions, isConnected } from './firebase-config.js';
import { generateSampleSubmissions } from './sample-data.js';
import { renderProductivityChart } from './chart-util.js';
import { exportToExcel, exportToCSV } from './export-util.js';

let allSubmissions = [];
let activeThresholdMinutes = 10;
let autoRefreshEnabled = true;
let refreshIntervalTimer = null;
let isDemoMode = false;

document.addEventListener('DOMContentLoaded', () => {
  setupExtensionMessageBridge();
  initDataFeed();
  setupEventListeners();
});

/**
 * Setup Window PostMessage listener to receive events directly from Chrome Extension Content Script
 */
function setupExtensionMessageBridge() {
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    // 1. Single Live Event pushed from extension
    if (event.data.type === 'ROOYA_LIVE_SUBMISSION' && event.data.record) {
      console.log('[Dashboard Window Bridge] Received live submission:', event.data.record);
      mergeNewRecord(event.data.record);
    }

    // 2. Full Extension Logs Response
    if (event.data.type === 'ROOYA_EXTENSION_LOGS_RESPONSE' && Array.isArray(event.data.logs)) {
      console.log(`[Dashboard Window Bridge] Received ${event.data.logs.length} stored logs from extension.`);
      event.data.logs.forEach(rec => mergeNewRecord(rec));
    }
  });

  // Request stored logs from Chrome Extension on startup
  requestExtensionLogs();
  setInterval(requestExtensionLogs, 4000);
}

function requestExtensionLogs() {
  if (!isDemoMode) {
    window.postMessage({ type: 'REQUEST_EXTENSION_LOGS' }, '*');
  }
}

function mergeNewRecord(record) {
  if (!record || !record.timestamp) return;

  // Check if already present by timestamp + pcId + userName
  const exists = allSubmissions.some(s => 
    s.timestamp === record.timestamp && 
    s.pcId === record.pcId && 
    s.userName === record.userName
  );

  if (!exists) {
    allSubmissions.unshift(record);
    
    // Save to localStorage
    try {
      const stored = JSON.parse(localStorage.getItem('rooya_real_submissions') || '[]');
      stored.unshift(record);
      if (stored.length > 1000) stored.pop();
      localStorage.setItem('rooya_real_submissions', JSON.stringify(stored));
    } catch (e) {}

    processAndRender();
  }
}

function initDataFeed() {
  if (isConnected) {
    subscribeToSubmissions((docs) => {
      if (docs && docs.length > 0) {
        allSubmissions = docs;
      } else {
        loadDataForCurrentMode();
      }
      processAndRender();
    });
  } else {
    loadDataForCurrentMode();
    processAndRender();
  }

  startAutoRefresh();
}

function loadDataForCurrentMode() {
  if (isDemoMode) {
    allSubmissions = generateSampleSubmissions();
  } else {
    try {
      allSubmissions = JSON.parse(localStorage.getItem('rooya_real_submissions') || '[]');
    } catch (e) {
      allSubmissions = [];
    }
  }
}

function startAutoRefresh() {
  if (refreshIntervalTimer) clearInterval(refreshIntervalTimer);
  refreshIntervalTimer = setInterval(() => {
    if (autoRefreshEnabled) {
      document.getElementById('footer-last-updated').textContent = `Last Updated: ${new Date().toLocaleTimeString()}`;
      requestExtensionLogs();
      processAndRender();
    }
  }, 10000);
}

function processAndRender() {
  const filteredSubmissions = filterSubmissions(allSubmissions);

  populateDropdownFilters(allSubmissions);

  const userSummaryMap = computeUserSummary(filteredSubmissions);
  const pcSummaryMap = computePcSummary(filteredSubmissions);

  const userList = Object.values(userSummaryMap);
  const pcList = Object.values(pcSummaryMap);

  renderKPIs(filteredSubmissions, userList, pcList);
  renderProductivityChart(filteredSubmissions);

  renderSideBySideTable(userList);
  renderUserTable(userList);
  renderPcTable(pcList);
  renderRawTable(filteredSubmissions);
}

function filterSubmissions(submissions) {
  const dateRange = document.getElementById('filter-date-range').value;
  const userFilter = document.getElementById('filter-user').value;
  const pcFilter = document.getElementById('filter-pc').value;
  const searchQuery = document.getElementById('filter-search').value.toLowerCase().trim();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return submissions.filter(sub => {
    if (!sub.timestamp) return false;

    const subDateStr = sub.date || sub.timestamp.split('T')[0];

    if (dateRange === 'today' && subDateStr !== todayStr) return false;
    if (dateRange === 'yesterday' && subDateStr !== yesterdayStr) return false;
    if (dateRange === '7days') {
      const diffDays = (now - new Date(sub.timestamp)) / (1000 * 60 * 60 * 24);
      if (diffDays > 7) return false;
    }
    if (dateRange === '30days') {
      const diffDays = (now - new Date(sub.timestamp)) / (1000 * 60 * 60 * 24);
      if (diffDays > 30) return false;
    }
    if (dateRange === 'custom') {
      const startDate = document.getElementById('filter-start-date').value;
      const endDate = document.getElementById('filter-end-date').value;
      if (startDate && subDateStr < startDate) return false;
      if (endDate && subDateStr > endDate) return false;
    }

    if (userFilter !== 'all' && sub.userName !== userFilter) return false;
    if (pcFilter !== 'all' && sub.pcId !== pcFilter) return false;

    if (searchQuery) {
      const matchUser = (sub.userName || '').toLowerCase().includes(searchQuery);
      const matchPc = (sub.pcId || '').toLowerCase().includes(searchQuery);
      if (!matchUser && !matchPc) return false;
    }

    return true;
  });
}

function computeUserSummary(submissions) {
  const map = {};
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thresholdMs = activeThresholdMinutes * 60 * 1000;

  submissions.forEach(sub => {
    const user = sub.userName || 'Unknown User';
    if (!map[user]) {
      map[user] = {
        userName: user,
        pcId: sub.pcId || 'N/A',
        todaySubmits: 0,
        todaySkips: 0,
        weeklySubmits: 0,
        weeklySkips: 0,
        totalSubmits: 0,
        totalSkips: 0,
        lastSubmitDate: null,
        lastSubmitStr: 'Never',
        isActive: false
      };
    }

    const subDate = new Date(sub.timestamp);
    const action = sub.action === 'skip' ? 'skip' : 'submit';

    if (action === 'submit') {
      map[user].totalSubmits += 1;
    } else {
      map[user].totalSkips += 1;
    }

    if (sub.date === todayStr || sub.timestamp.startsWith(todayStr)) {
      if (action === 'submit') map[user].todaySubmits += 1;
      else map[user].todaySkips += 1;
    }

    const diffDays = (now - subDate) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      if (action === 'submit') map[user].weeklySubmits += 1;
      else map[user].weeklySkips += 1;
    }

    if (!map[user].lastSubmitDate || subDate > map[user].lastSubmitDate) {
      map[user].lastSubmitDate = subDate;
      map[user].lastSubmitStr = subDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      map[user].pcId = sub.pcId || map[user].pcId;
    }
  });

  Object.values(map).forEach(u => {
    if (u.lastSubmitDate && (now - u.lastSubmitDate) <= thresholdMs) {
      u.isActive = true;
    }
  });

  return map;
}

function computePcSummary(submissions) {
  const map = {};
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thresholdMs = activeThresholdMinutes * 60 * 1000;

  submissions.forEach(sub => {
    const pcId = sub.pcId || 'PC-UNKNOWN';
    if (!map[pcId]) {
      map[pcId] = {
        pcId: pcId,
        userName: sub.userName || 'Unknown',
        todaySubmits: 0,
        todaySkips: 0,
        totalSubmits: 0,
        totalSkips: 0,
        lastActivityDate: null,
        lastActivityStr: 'Never',
        isActive: false
      };
    }

    const subDate = new Date(sub.timestamp);
    const action = sub.action === 'skip' ? 'skip' : 'submit';

    if (action === 'submit') {
      map[pcId].totalSubmits += 1;
    } else {
      map[pcId].totalSkips += 1;
    }

    if (sub.date === todayStr || sub.timestamp.startsWith(todayStr)) {
      if (action === 'submit') map[pcId].todaySubmits += 1;
      else map[pcId].todaySkips += 1;
    }

    if (!map[pcId].lastActivityDate || subDate > map[pcId].lastActivityDate) {
      map[pcId].lastActivityDate = subDate;
      map[pcId].lastActivityStr = subDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      map[pcId].userName = sub.userName || map[pcId].userName;
    }
  });

  Object.values(map).forEach(p => {
    if (p.lastActivityDate && (now - p.lastActivityDate) <= thresholdMs) {
      p.isActive = true;
    }
  });

  return map;
}

function renderKPIs(submissions, userList, pcList) {
  const totalTodaySubmits = userList.reduce((acc, u) => acc + u.todaySubmits, 0);
  const totalTodaySkips = userList.reduce((acc, u) => acc + u.todaySkips, 0);
  const activeUsers = userList.filter(u => u.isActive).length;
  const activePcs = pcList.filter(p => p.isActive).length;

  document.getElementById('kpi-today-submits').textContent = totalTodaySubmits.toLocaleString();
  document.getElementById('kpi-today-skips').textContent = totalTodaySkips.toLocaleString();
  document.getElementById('kpi-active-users').textContent = activeUsers;
  document.getElementById('kpi-total-users').textContent = `Total: ${userList.length} users`;
  document.getElementById('kpi-active-pcs').textContent = activePcs;
  document.getElementById('kpi-total-pcs').textContent = `Total: ${pcList.length} workstations`;
}

function renderSideBySideTable(userList) {
  const tbody = document.getElementById('tbody-side-by-side');
  tbody.innerHTML = '';

  userList.sort((a, b) => b.todaySubmits - a.todaySubmits);

  userList.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="user-email-cell">${u.userName}</td>
      <td><span class="pc-id-badge">${u.pcId}</span></td>
      <td class="text-right"><strong style="color: #10b981;">${u.todaySubmits.toLocaleString()}</strong></td>
      <td class="text-right"><strong style="color: #f97316;">${u.todaySkips.toLocaleString()}</strong></td>
      <td class="text-right">${u.totalSubmits.toLocaleString()}</td>
      <td>${u.lastSubmitStr}</td>
      <td>
        <span class="status-pill ${u.isActive ? 'active' : 'idle'}">
          <span class="status-dot-sm"></span>
          ${u.isActive ? 'Active' : 'Idle'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderUserTable(userList) {
  const tbody = document.getElementById('tbody-users');
  tbody.innerHTML = '';

  userList.sort((a, b) => b.todaySubmits - a.todaySubmits);

  userList.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="user-email-cell">${u.userName}</td>
      <td><span class="pc-id-badge">${u.pcId}</span></td>
      <td class="text-right"><strong style="color: #10b981;">${u.todaySubmits.toLocaleString()}</strong></td>
      <td class="text-right"><strong style="color: #f97316;">${u.todaySkips.toLocaleString()}</strong></td>
      <td class="text-right">${u.weeklySubmits.toLocaleString()}</td>
      <td class="text-right">${u.totalSubmits.toLocaleString()}</td>
      <td>${u.lastSubmitStr}</td>
      <td>
        <span class="status-pill ${u.isActive ? 'active' : 'idle'}">
          <span class="status-dot-sm"></span>
          ${u.isActive ? 'Active' : 'Idle'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPcTable(pcList) {
  const tbody = document.getElementById('tbody-pcs');
  tbody.innerHTML = '';

  pcList.sort((a, b) => b.todaySubmits - a.todaySubmits);

  pcList.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pc-id-badge">${p.pcId}</span></td>
      <td class="user-email-cell">${p.userName}</td>
      <td class="text-right"><strong style="color: #10b981;">${p.todaySubmits.toLocaleString()}</strong></td>
      <td class="text-right"><strong style="color: #f97316;">${p.todaySkips.toLocaleString()}</strong></td>
      <td class="text-right">${p.totalSubmits.toLocaleString()}</td>
      <td>${p.lastActivityStr}</td>
      <td>
        <span class="status-pill ${p.isActive ? 'active' : 'idle'}">
          <span class="status-dot-sm"></span>
          ${p.isActive ? 'Active' : 'Idle/Offline'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRawTable(submissions) {
  const tbody = document.getElementById('tbody-raw');
  tbody.innerHTML = '';

  submissions.slice(0, 100).forEach(s => {
    const tr = document.createElement('tr');
    const timeStr = new Date(s.timestamp).toLocaleTimeString();
    const actionBadge = s.action === 'skip' 
      ? '<span class="status-pill idle">SKIP</span>' 
      : '<span class="status-pill active">SUBMIT</span>';
    tr.innerHTML = `
      <td>${timeStr}</td>
      <td>${s.date}</td>
      <td class="user-email-cell">${s.userName}</td>
      <td><span class="pc-id-badge">${s.pcId}</span></td>
      <td>${actionBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateDropdownFilters(submissions) {
  const userSelect = document.getElementById('filter-user');
  const pcSelect = document.getElementById('filter-pc');

  const selectedUser = userSelect.value;
  const selectedPc = pcSelect.value;

  const users = Array.from(new Set(submissions.map(s => s.userName).filter(Boolean))).sort();
  const pcs = Array.from(new Set(submissions.map(s => s.pcId).filter(Boolean))).sort();

  userSelect.innerHTML = '<option value="all">All Users</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    if (u === selectedUser) opt.selected = true;
    userSelect.appendChild(opt);
  });

  pcSelect.innerHTML = '<option value="all">All PCs</option>';
  pcs.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    if (p === selectedPc) opt.selected = true;
    pcSelect.appendChild(opt);
  });
}

function setupEventListeners() {
  const btnToggleDemo = document.getElementById('btn-toggle-demo');
  if (btnToggleDemo) {
    btnToggleDemo.addEventListener('click', () => {
      isDemoMode = !isDemoMode;
      if (isDemoMode) {
        btnToggleDemo.innerHTML = '<span>Mode: Sample Demo Data (1,639)</span>';
        btnToggleDemo.style.borderColor = '#f59e0b';
        btnToggleDemo.style.color = '#f59e0b';
      } else {
        btnToggleDemo.innerHTML = '<span>Mode: Live Real Data</span>';
        btnToggleDemo.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        btnToggleDemo.style.color = '#8b949e';
      }
      loadDataForCurrentMode();
      processAndRender();
    });
  }

  document.getElementById('active-threshold').addEventListener('change', (e) => {
    activeThresholdMinutes = parseInt(e.target.value, 10) || 10;
    processAndRender();
  });

  document.getElementById('btn-toggle-refresh').addEventListener('click', () => {
    autoRefreshEnabled = !autoRefreshEnabled;
    const textEl = document.getElementById('refresh-status-text');
    if (autoRefreshEnabled) {
      textEl.textContent = 'Auto Refresh: ON (10s)';
      startAutoRefresh();
    } else {
      textEl.textContent = 'Auto Refresh: PAUSED';
      if (refreshIntervalTimer) clearInterval(refreshIntervalTimer);
    }
  });

  document.getElementById('filter-date-range').addEventListener('change', (e) => {
    const customContainer = document.getElementById('custom-date-container');
    if (e.target.value === 'custom') {
      customContainer.style.display = 'flex';
    } else {
      customContainer.style.display = 'none';
      processAndRender();
    }
  });

  document.getElementById('filter-start-date').addEventListener('change', processAndRender);
  document.getElementById('filter-end-date').addEventListener('change', processAndRender);
  document.getElementById('filter-user').addEventListener('change', processAndRender);
  document.getElementById('filter-pc').addEventListener('change', processAndRender);
  document.getElementById('filter-search').addEventListener('input', processAndRender);

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('filter-date-range').value = 'today';
    document.getElementById('custom-date-container').style.display = 'none';
    document.getElementById('filter-user').value = 'all';
    document.getElementById('filter-pc').value = 'all';
    document.getElementById('filter-search').value = '';
    processAndRender();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  document.getElementById('btn-export-excel').addEventListener('click', () => {
    const userList = Object.values(computeUserSummary(filterSubmissions(allSubmissions)));
    const pcList = Object.values(computePcSummary(filterSubmissions(allSubmissions)));
    exportToExcel(userList, pcList, allSubmissions, 'Rooya_Productivity_Report');
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const userList = Object.values(computeUserSummary(filterSubmissions(allSubmissions)));
    exportToCSV(userList, 'User_Productivity_Summary');
  });
}
