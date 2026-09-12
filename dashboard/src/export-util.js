/**
 * Export Utility for Team Lead Dashboard
 * Exports structured User, PC, and Submission/Skip data to Excel (.xlsx) or CSV format.
 */

import * as XLSX from 'xlsx';

export function exportToExcel(userData, pcData, rawSubmissions, filename = 'Rooya_Productivity_Report') {
  const wb = XLSX.utils.book_new();

  // 1. User Performance Summary Sheet
  const userSheetData = userData.map(u => ({
    'User Email': u.userName,
    'PC ID': u.pcId,
    'Today Submits': u.todaySubmits,
    'Today Skips': u.todaySkips,
    'Today Total Actions': u.todaySubmits + u.todaySkips,
    'Weekly Submits': u.weeklySubmits,
    'Weekly Skips': u.weeklySkips,
    'Total Submits': u.totalSubmits,
    'Total Skips': u.totalSkips,
    'Last Activity Time': u.lastSubmitStr,
    'Status': u.isActive ? 'Active' : 'Idle/Offline'
  }));
  const wsUsers = XLSX.utils.json_to_sheet(userSheetData);
  XLSX.utils.book_append_sheet(wb, wsUsers, 'User Performance Summary');

  // 2. PC Workstation Status Sheet
  const pcSheetData = pcData.map(p => ({
    'PC ID': p.pcId,
    'Logged User': p.userName,
    'Today Submits': p.todaySubmits,
    'Today Skips': p.todaySkips,
    'Total Submits': p.totalSubmits,
    'Total Skips': p.totalSkips,
    'Last Activity Time': p.lastActivityStr,
    'Status': p.isActive ? 'Active' : 'Idle/Offline'
  }));
  const wsPCs = XLSX.utils.json_to_sheet(pcSheetData);
  XLSX.utils.book_append_sheet(wb, wsPCs, 'PC Workstations');

  // 3. Raw Activity Logs Sheet (Submits & Skips)
  const rawSheetData = rawSubmissions.slice(0, 3000).map(s => ({
    'Date': s.date,
    'Timestamp': s.timestamp,
    'User Email': s.userName,
    'PC ID': s.pcId,
    'Action Type': (s.action || 'submit').toUpperCase()
  }));
  const wsRaw = XLSX.utils.json_to_sheet(rawSheetData);
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Activity Logs');

  const todayStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}_${todayStr}.xlsx`);
}

export function exportToCSV(userData, filename = 'User_Productivity_Summary') {
  const csvData = userData.map(u => ({
    'User Email': u.userName,
    'PC ID': u.pcId,
    'Today Submits': u.todaySubmits,
    'Today Skips': u.todaySkips,
    'Weekly Submits': u.weeklySubmits,
    'Total Submits': u.totalSubmits,
    'Last Activity': u.lastSubmitStr,
    'Status': u.isActive ? 'Active' : 'Idle/Offline'
  }));

  const ws = XLSX.utils.json_to_sheet(csvData);
  const csvOutput = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const todayStr = new Date().toISOString().split('T')[0];

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${todayStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
