# iOS Dashboard Redesign & Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the React app to feature an iOS-style mobile-first Interface, fix API bugs (403 and list keys), add friendly Timezone mappings, and implement a Settings view for password changes.

**Architecture:** We will refine `api.ts` to automatically inject `?token=` on POST commands. The `ClientTable` will filter clients. The layout will adapt to an iOS settings page mimic, employing `max-w-md` for the entire app body.

**Tech Stack:** React, Tailwind CSS, TypeScript.

## Global Constraints
- Target hardware constraints do not apply here; strictly frontend React code inside `frontend/`.
- Must compile cleanly via `npm run build`.

---

### Task 1: Fix Core React Bugs (Auth Token & Keys)

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/ClientTable.tsx`
- Modify: `frontend/src/DashboardView.tsx`

**Interfaces:**
- Produces: Correct `fetchApi` with `?token=` parameter for mutating requests. Corrected iteration map filtering out `00:00:00:00:00:00`.

- [ ] **Step 1: Update API wrapper**
In `frontend/src/api.ts`, modify `fetchApi` to retrieve the `token` from `stats.json` or `localStorage`. Wait, `stats` includes `token`, so in `DashboardView.tsx`, when `stats.json` succeeds, save the token: `localStorage.setItem('router_session_token', data.token);`.
In `api.ts`, `export function getSessionToken() { return localStorage.getItem('router_session_token') || ''; }`.
When making POST requests in `DashboardView` or `ClientTable`, append it:
`fetchApi('/api/profiles?token=' + getSessionToken(), ...)`
`fetchApi('/api/assign?token=' + getSessionToken(), ...)`

- [ ] **Step 2: Filter Ghost Clients**
In `ClientTable.tsx`, filter `cls = clients.filter(c => c.mac && c.mac !== "00:00:00:00:00:00")`. Use `cls.map(c => ... key={c.mac})` instead of raw `clients`.

- [ ] **Step 3: Verification**
Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src
git commit -m "fix(ui): attach token to mutating requests and filter ghost MAC addresses"
```

### Task 2: Implement Friendly Timezones & General Settings

**Files:**
- Create: `frontend/src/SettingsView.tsx`
- Modify: `frontend/src/DashboardView.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: A Settings tab for Password, Timezones.

- [ ] **Step 1: Extract Timezone Map**
In `SettingsView.tsx`, build a standard map of friendly names:
```typescript
export const TIMEZONES = [
  { label: "Eastern Time (US & Canada)", val: "EST5EDT,M3.2.0,M11.1.0" },
  { label: "Central Time (US & Canada)", val: "CST6CDT,M3.2.0,M11.1.0" },
  { label: "Mountain Time (US & Canada)", val: "MST7MDT,M3.2.0,M11.1.0" },
  { label: "Pacific Time (US & Canada)", val: "PST8PDT,M3.2.0,M11.1.0" },
  { label: "London / UK", val: "GMT0BST,M3.5.0/1,M10.5.0" },
  { label: "Central Europe", val: "CET-1CEST,M3.5.0,M10.5.0/3" },
  { label: "Australia / Sydney", val: "AEST-10AEDT,M10.1.0,M4.1.0/3" }
];
```

- [ ] **Step 2: Create Settings Component**
Build `SettingsView.tsx` accepting `timezone`, `onTimezoneChange`, and an input to "Change Dashboard Password", which calls `fetchApi("/setpass?token=...&p="+newPass, {method: "POST"})` and updates `localStorage.setItem('router_auth', ...)` upon success with the newly encoded `admin:newPass`.

- [ ] **Step 3: Bottom Navigation**
In `App.tsx`, build an iOS-style bottom tab bar (sticky, light gray background, 2 icons: "Gateway" and "Settings"). Conditional render `DashboardView` vs `SettingsView`.

- [ ] **Step 4: Verification**
Run `npm run build`. Expected: SUCCESS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src
git commit -m "feat: add settings view with timezone presets and password updates"
```

### Task 3: iOS Polishing (Impeccable Guidelines)

**Files:**
- Modify: `frontend/src/DashboardView.tsx`
- Modify: `frontend/src/ClientTable.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: Tailwind classes

- [ ] **Step 1: Canvas & Layout**
In `App.tsx`, wrap the main app body in a centered iOS container:
`<div className="min-h-screen bg-gray-100 font-sans sm:flex sm:justify-center"><div className="w-full sm:max-w-md bg-gray-100 min-h-screen relative pb-20 shadow-xl">...</div></div>`
Use `bg-gray-100` for the background canvas, matching Apple Settings backgrounds.

- [ ] **Step 2: Re-style Profile Cards**
In `DashboardView.tsx`, convert profile blocks to iOS grouped lists:
`<div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-6 divide-y divider-gray-200">`
Use plain full-width rows inside for Inputs: Name, Bedtime, DNS.

- [ ] **Step 3: Re-style Buttons**
Apply Apple-like buttons: `bg-blue-500 text-white font-semibold rounded-full py-2 px-4 shadow active:scale-95 transition-transform`.

- [ ] **Step 4: Verification**
Run `npm run build`. Expected: SUCCESS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src
git commit -m "style: apply iOS mobile-first aesthetic to dashboard"
```