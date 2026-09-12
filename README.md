# Production Chrome Extension & Firebase Productivity Tracking System

> **Developed by Turjo**

A complete enterprise productivity tracking system designed for web-based annotation platforms. Includes a Chrome Extension (Manifest V3) for non-intrusive Submit button click monitoring, persistent PC identification, offline queueing, Firebase Firestore synchronization, and a modern Team Lead Web Dashboard with real-time analytics and Excel/CSV exports.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Web Annotation Platform                  │
│  [User Email: bottom-left]   [Submit / Skip: bottom-right]│
└────────────────────────────┬────────────────────────────┘
                             │ (Content Script Listener & Deduplication)
┌────────────────────────────▼────────────────────────────┐
│              Chrome Extension (Manifest V3)             │
│  • Configurable Selectors (Submit, Skip, Username)      │
│  • Persistent PC ID (chrome.storage.local UUID)         │
│  • Offline Queue & Event Syncing                        │
│  • Extension Popup UI (Live counts & Connection Status) │
└────────────────────────────┬────────────────────────────┘
                             │ (Firebase Firestore REST / SDK Sync)
┌────────────────────────────▼────────────────────────────┐
│                    Firebase Firestore                   │
│  • /submissions collection                              │
│  • /dailyStats collection                               │
│  • Immutable Audit Security Rules                       │
└────────────────────────────┬────────────────────────────┘
                             │ (Realtime Snapshots & Queries)
┌────────────────────────────▼────────────────────────────┐
│                 Team Lead Dashboard (Vite)              │
│  • KPI Summaries (Today Submissions, Active PCs/Users)  │
│  • Productivity Timeline Trend Chart                    │
│  • Side-by-Side Summary & User/PC Status Tables         │
│  • Filtering & Excel (.xlsx) / CSV Exports              │
└────────────────────────────┴────────────────────────────┘
```

---

## Table of Contents

1. [Chrome Extension Overview](#1-chrome-extension-overview)
2. [Firebase Configuration & Setup Instructions](#2-firebase-configuration--setup-instructions)
3. [Firestore Database Structure](#3-firestore-database-structure)
4. [Firestore Security Rules](#4-firestore-security-rules)
5. [Team Lead Dashboard](#5-team-lead-dashboard)
6. [Excel/CSV Export](#6-excelcsv-export)
7. [Extension Installation Instructions](#7-extension-installation-instructions)
8. [Installing the Extension on Multiple PCs](#8-installing-the-extension-on-multiple-pcs)
9. [How to Change the Username Selector](#9-how-to-change-the-username-selector)
10. [How to Change the Submit Button Selector](#10-how-to-change-the-submit-button-selector)
11. [How to Change the Activity Timeout](#11-how-to-change-the-activity-timeout)
12. [How to Deploy the Dashboard](#12-how-to-deploy-the-dashboard)
13. [Testing Instructions](#13-testing-instructions)

---

## 1. Chrome Extension Overview

The Chrome Extension (`chrome-extension/`) operates silently in the background on your target annotation webpage.

- **Target Web Domain Scoping**: Strictly scoped to run on `https://label-master-sa.rooya.ai/*` and `https://labelmaster.rooya.ai/*` (plus `localhost` for testing).
- **Non-Intrusive Detection**: Attaches a capture-phase listener that detects genuine clicks on the Submit button. It never calls `event.preventDefault()` or `event.stopPropagation()`, ensuring the underlying website is completely unaffected.
- **Skip Button Isolation**: Clicks on the Skip button are explicitly ignored (+0).
- **Anti-Duplication**: Built-in 1000ms debounce protection prevents double counting caused by event bubbling, React state re-renders, or dynamic DOM replacements.
- **Dynamic DOM Handling**: Employs event delegation + `MutationObserver` to ensure tracking continues seamlessly during SPA page navigations or button reconstructions.
- **Offline Storage & Resiliency**: If internet connectivity drops, submissions are queued locally in `chrome.storage.local` and automatically flushed when the connection is restored.

---

## 2. Firebase Configuration & Setup Instructions

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g., `annotation-tracker`).
2. In the project dashboard, click **Add app** and choose **Web (`</>`)**.
3. Register your app (e.g., `Annotation Tracker Web`).
4. Copy the `firebaseConfig` object provided by Firebase:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
5. Navigate to **Firestore Database** in the console and click **Create database** (start in production mode).
6. Enable Cloud Firestore in your preferred region.

---

## 3. Firestore Database Structure

Submissions are saved as individual document records inside the `submissions` collection.

### Collection: `/submissions`
Each document has an auto-generated Document ID:

```json
{
  "userName": "farhan.sadik@rooya.ai",
  "userId": "farhan.sadik",
  "pcId": "PC-7F82A1",
  "timestamp": "2026-09-12T15:16:00.000Z",
  "date": "2026-09-12",
  "action": "submit"
}
```

### Collection: `/dailyStats/{YYYY-MM-DD}` (Optional Aggregation)
```json
{
  "totalSubmissions": 1634,
  "date": "2026-09-12",
  "users": {
    "farhan.sadik@rooya.ai": 387,
    "user2@rooya.ai": 421
  },
  "pcs": {
    "PC-01": 387,
    "PC-02": 421
  }
}
```

---

## 4. Firestore Security Rules

Deploy the rules from [`firestore.rules`](file:///d:/My%20design/Data%20Record/firestore.rules) to your Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /submissions/{submissionId} {
      allow create: if request.resource.data.action == 'submit'
                    && request.resource.data.userName is string
                    && request.resource.data.pcId is string
                    && request.resource.data.timestamp is string;
      allow read: if request.auth != null || true;
      allow update, delete: if false; // Immutable logs
    }
  }
}
```

---

## 5. Team Lead Dashboard

The Team Lead Dashboard (`dashboard/`) is a high-performance web dashboard built with Vite, HTML, and modern CSS.

### Features
- **Overview KPIs**: Real-time totals for Today's Submissions, Active Users, Active PCs, and Hourly Submission Rate.
- **Productivity Timeline Chart**: Live visual chart of submissions aggregated per hour.
- **Side-by-Side Quick Summary Table**:
  ```
  User                  PC ID        Today
  farhan.sadik@...      PC-01        387
  user2@...             PC-02        421
  user3@...             PC-03        356
  ```
- **Detailed User & PC Tables**: Active/Idle status indicators, weekly/total counts, and last activity timestamps.
- **Filters**: Date range (Today, Yesterday, Last 7 Days, Last 30 Days, Custom Range), User dropdown, PC dropdown, search, sorting, and auto-refresh.

---

## 6. Excel/CSV Export

Team Leads can export productivity reports at any time directly from the dashboard:

1. Click **Export Excel (.xlsx)** at the top-right of the dashboard to generate a multi-sheet workbook containing:
   - Sheet 1: User Summary
   - Sheet 2: PC Workstation Status
   - Sheet 3: Raw Submission Logs
2. Click **Export CSV** to download a CSV file of current user counts.

---

## 7. Extension Installation Instructions

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `chrome-extension` directory (`d:\My design\Data Record\chrome-extension`).
6. The **Productivity & Submit Tracker** extension icon will now appear in your Chrome toolbar.

---

## 8. Installing the Extension on Multiple PCs

To deploy across multiple operator PCs:

1. Copy the `chrome-extension/` folder to each PC (or distribute via network drive / ZIP).
2. Follow the installation steps above (`chrome://extensions/` -> Load unpacked).
3. On first launch, the extension automatically generates a **persistent unique PC ID** (e.g., `PC-7F82A1`) and stores it securely in `chrome.storage.local`.
4. The PC ID remains fixed and unchanged across browser restarts and computer reboots.

---

## 9. How to Change the Username Selector

If the DOM structure of your web annotation platform changes:

### Method A: Via Extension Popup Settings (No Code Edit Required)
1. Click the Chrome Extension popup icon.
2. Click **Settings**.
3. Enter your updated CSS selector in the **Username Selector** field (e.g., `#user-profile-email` or `.user-email`).
4. Click **Save Settings**.

### Method B: Via Source Code
Edit [`chrome-extension/content/config.js`](file:///d:/My%20design/Data%20Record/chrome-extension/content/config.js):
```javascript
window.TRACKER_CONFIG = {
  USERNAME_SELECTOR: '#your-new-user-element-id',
  // ...
};
```

---

## 10. How to Change the Submit Button Selector

### Method A: Via Extension Popup Settings
1. Click the Chrome Extension popup icon -> **Settings**.
2. Update the **Submit Button Selector** input (e.g., `button#submit-btn` or `[data-action="submit"]`).
3. Click **Save Settings**.

### Method B: Via Source Code
Edit [`chrome-extension/content/config.js`](file:///d:/My%20design/Data%20Record/chrome-extension/content/config.js):
```javascript
window.TRACKER_CONFIG = {
  SUBMIT_BUTTON_SELECTOR: 'button#submit-btn, button.submit-btn, [data-action="submit"]',
  // ...
};
```

---

## 11. How to Change the Activity Timeout

The active/idle threshold determines how recently a user or PC must have submitted to display as 🟢 Active on the dashboard.

1. Open the Team Lead Dashboard in your browser.
2. Locate the **Active Threshold** dropdown in the top navigation bar.
3. Select your preferred timeout: **5 Minutes**, **10 Minutes (Default)**, **15 Minutes**, or **30 Minutes**.
4. The dashboard automatically updates user and PC status badges in real-time.

---

## 12. How to Deploy the Dashboard

### Local Development / Testing
```bash
cd dashboard
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Production Build
```bash
cd dashboard
npm run build
```
Upload the generated `dashboard/dist/` folder to Firebase Hosting, Vercel, Netlify, or your internal web server.

### Deploying to Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

---

## 13. Testing Instructions

We have provided a local **Demo Annotation Page** matching your exact screenshot layout to perform end-to-end verification.

### Live End-to-End Test Walkthrough

1. **Serve Demo Annotation Page**:
   Open [`demo-page/index.html`](file:///d:/My%20design/Data%20Record/demo-page/index.html) directly in Chrome or serve it locally.

2. **Verify DOM Identification**:
   Notice the logged-in email at the bottom-left (`farhan.sadik@rooya.ai`) and the Submit/Skip buttons at the bottom-right.

3. **Test Submit Clicks (+1)**:
   Click **Submit**. Open the Chrome Extension popup icon to verify:
   - Today's Submissions increments (+1).
   - Detected User shows `farhan.sadik@rooya.ai`.
   - PC ID shows your generated `PC-XXXXXX`.
   - Last submission time updates.

4. **Test Skip Clicks (0)**:
   Click **Skip**. Open the extension popup—notice today's submission count does **NOT** increase.

5. **Test Deduplication**:
   Double-click the Submit button rapidly. Verify only 1 submission event is recorded.

6. **View Team Lead Dashboard**:
   Start the dashboard (`cd dashboard && npm run dev`) and visit `http://localhost:3000` to inspect live metrics, timeline charts, and Excel export downloads!
