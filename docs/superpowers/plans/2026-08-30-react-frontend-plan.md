# Decoupled React Front-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the UI from the ESP32 into a standalone React application that connects to the ESP32's local API.

**Architecture:** The ESP32 WebServer will be modified to serve `Access-Control-Allow-Origin: *` to prevent CORS issues and `OPTIONS` preflight handling. The frontend will be a Vite+React app built in a `frontend` folder for eventual Cloudflare Pages deployment.

**Tech Stack:** C++, PlatformIO, React, Vite, Tailwind CSS, TypeScript.

## Global Constraints
- Target hardware: ESP32-C3 with 4MB flash (no PSRAM).
- ESP32 must compile successfully with `pio run -e c3`.
- The frontend app must be developed in the `frontend` folder inside the project and start via `npm run dev`.

---

### Task 1: ESP32 WebServer CORS Implementation

**Files:**
- Modify: `src/main.cpp`
- Modify: `src/dashboard_html.h`

**Interfaces:**
- Produces: API accessible from any origin.

- [ ] **Step 1: Simplify HTML Landing Page**
Edit `src/dashboard_html.h` completely. Replace the massive DASHBOARD_HTML template with a minimalist string:
```cpp
const char PAGE[] PROGMEM = "<html><body><h1>ESP32-C3 Gateway API</h1><p>The dashboard is now hosted externally. Please go to your Cloudflare URL to manage this device.</p></body></html>";
```

- [ ] **Step 2: Add CORS Headers globally**
In `src/main.cpp`, add a utility function to inject CORS headers easily:
```cpp
static void sendCorsHeaders() {
  web.sendHeader("Access-Control-Allow-Origin", "*");
  web.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  web.sendHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}
```

- [ ] **Step 3: Update Handlers**
Call `sendCorsHeaders();` inside `handleStats()`, `handleSaveProfiles()`, `handleAssignProfile()`, and `handleRoot()`, right before `web.send(...)`.

- [ ] **Step 4: Handle Preflight OPTIONS requests**
In `setup()`, add a handler to gobble `OPTIONS` requests for preflight checks:
```cpp
  web.onNotFound([]() {
    if (web.method() == HTTP_OPTIONS) {
      sendCorsHeaders();
      web.send(204);
    } else {
      web.send(404, "text/plain", "Not Found");
    }
  });
```

- [ ] **Step 5: Verify Compilation**
Run: `pio run -e c3`
Expected: SUCCESS

- [ ] **Step 6: Commit**
```bash
git add src/main.cpp src/dashboard_html.h
git commit -m "feat: enable CORS and intercept OPTIONS preflight requests for external React app"
```

### Task 2: Scaffold Frontend Workspace

**Files:**
- Create: `frontend/`

**Interfaces:**
- Produces: Base Vite React App.

- [ ] **Step 1: Scaffold Vite App**
Execute the initialization:
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configure Tailwind**
Edit `frontend/tailwind.config.js` to scan files:
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```
Add tailwind directives to `frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Commit**
```bash
git add frontend
git commit -m "chore: scaffold vite react typescript frontend with tailwind"
```

### Task 3: Build the Connect/Auth View

**Files:**
- Create: `frontend/src/ConnectView.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: `localStorage` keys for `router_ip` and `router_auth`.

- [ ] **Step 1: Create API Utility**
Create `frontend/src/api.ts` with a global Axios or Fetch helper that automatically reads the `router_ip` and `router_auth` from `localStorage` to execute `fetch(ip + endpoint, { headers: { Authorization: auth } })`.

- [ ] **Step 2: Create Connect Component**
Write `frontend/src/ConnectView.tsx`. It needs two fields (IP Address, Password). When submitted, base64 encode `admin:PASSWORD`, send a test GET request to `http://IP/stats.json`.
If status is 200, save to `localStorage` and `setConnected(true)`.
If status is 401, display "Invalid Password".
If network fails, display "Cannot reach device. Ensure you are on the same WiFi."

- [ ] **Step 3: Hook into App.tsx**
Update `App.tsx` to conditionally render `ConnectView` if `localStorage` contains no valid credentials or if a ping fails.

- [ ] **Step 4: Commit**
```bash
git add frontend/src
git commit -m "feat: login portal and connection pinging for esp32"
```

### Task 4: Build the Dashboard Core

**Files:**
- Create: `frontend/src/DashboardView.tsx`
- Create: `frontend/src/ProfilesPanel.tsx`
- Create: `frontend/src/ClientTable.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `/stats.json`, `/api/profiles`, `/api/assign`

- [ ] **Step 1: Build the Fetch Loop & Hero**
In `DashboardView.tsx`, use React `useEffect` to poll `/stats.json` every 5 seconds. Render a top bar with Uptime, Ping, and clients connected.

- [ ] **Step 2: Build Profiles Grid**
Write `ProfilesPanel.tsx`. Iterate `stats.profiles`. Render a nice Tailwind CSS card for each, showing Name, Start Time, End Time, and Upstream DNS. Include an "Add Group" and "Save Array" button that POSTs the modified array back to the API.

- [ ] **Step 3: Build Client Table & Renaming**
Write `ClientTable.tsx`. Render the `stats.clients` in a stylish table format. Include an dropdown for Profile mapping. Include an inline-editable text field or a pencil icon to change the client's `name`. Both actions POST to `/api/assign` then trigger a re-fetch.

- [ ] **Step 4: Commit**
```bash
git add frontend/src
git commit -m "feat: complete headless react dashboard mapping to esp32 api"
```