# Stitch UI Integration & Manual Blocking Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a generated HTML/Tailwind template into the React frontend and add a Manual Block override flag to the ESP32 C++ backend.

**Architecture:** ESP32 adds `bool manualBlock` to `Dev` tracing and updates DNS forwarding logic. The frontend translates 5 static HTML files into interactive React components referencing the C++ API.

**Tech Stack:** C++, PlatformIO, React, Vite, Tailwind CSS.

## Global Constraints
- Target hardware: ESP32-C3 with 4MB flash (no PSRAM).
- ESP32 must compile successfully with `pio run -e c3`.
- The frontend app must be developed in the `frontend` folder.

---

### Task 1: ESP32 C++ Backend Update (Manual Blocking)

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Produces: `&block=` argument on `/api/assign`. Outputs `manualBlock` in `/stats.json`.

- [ ] **Step 1: Data Model Update**
In `struct Dev`, add `bool manualBlock;`. 
In `getClient()`, initialize `c->manualBlock = false;`.

- [ ] **Step 2: Read/Write Config Update**
In `saveConfig()`, add `ms["manual"] = clients[i].manualBlock;`.
In `loadConfig()` JSON parsing (`JsonObject valObj = ...`), add `bool manBlocked = false; if(!valObj["manual"].isNull()) manBlocked = valObj["manual"].as<bool>();`. Assign `clients[i].manualBlock = manBlocked;`, and similarly initialize the new client with `manBlocked`.

- [ ] **Step 3: Modify DNS Routing**
In `handleDns()` and `handleTcpDns()`, update the blocked logic:
```cpp
bool blocked = c ? c->manualBlock : false;
if (!blocked) {
  blocked = isTimeBlocked(pid);
}
```

- [ ] **Step 4: Update APIs**
In `handleStats()`, in the clients loop, add the property:
`j += ",\"manualBlock\":" + (c.manualBlock ? String("true") : String("false"));`
In `handleAssignProfile()`, add handling for `block`:
```cpp
if (web.hasArg("block")) {
  clients[i].manualBlock = (web.arg("block") == "true");
}
```

- [ ] **Step 5: Verify Compilation**
Run: `pio run -e c3`
Expected: SUCCESS

- [ ] **Step 6: Commit**
```bash
git add src/main.cpp
git commit -m "feat: add manual block override to backend"
```

### Task 2: Port Visual Foundations & Styles

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: The `DESIGN.md` and HTML files in `frontend/stitch_gateway_access_manager`.

- [ ] **Step 1: Extract Tailwind Config**
Copy the `theme.extend.colors`, `borderRadius`, `spacing`, `fontFamily`, and `fontSize` objects out of the HTML `<script>` block in `dashboard_overview/code.html` over to `frontend/tailwind.config.js`.

- [ ] **Step 2: Copy Global CSS**
Copy the `body { ... }` and `.material-symbols-outlined` styles into `index.css`. Import the `Inter`, `JetBrains Mono`, and `Material Symbols Outlined` web fonts in `frontend/index.html`.

- [ ] **Step 3: Commit**
```bash
git add frontend/tailwind.config.js frontend/src/index.css frontend/index.html
git commit -m "style: import stitch ui foundations and tailwind configuration"
```

### Task 3: Port React Views (Gateway & Settings)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/ConnectView.tsx`
- Modify: `frontend/src/SettingsView.tsx`

**Interfaces:**
- Consumes: Stitch `connect_to_gateway/code.html` and `system_settings/code.html`.

- [ ] **Step 1: Port Connect View**
Translate the `connect_to_gateway` layout into `frontend/src/ConnectView.tsx`. Retain the previous logic from Task 3 (the URL inputs, `btoa` encoding, pinging `/stats.json`).

- [ ] **Step 2: Port App Navigation**
Translate the Bottom Navigation (`home`, `groups`, `devices`, `settings`) and Top AppBar header into `frontend/src/App.tsx`, maintaining state to switch between tabs.

- [ ] **Step 3: Port Settings View**
Translate `system_settings` into `SettingsView.tsx`. Maintain the `TIMEZONES` mapped dropdown mapping and the `/setpass` change password posting logic.

- [ ] **Step 4: Commit**
```bash
git add frontend/src
git commit -m "feat: port stitch ui frames for auth and settings"
```

### Task 4: Port Core Dashboard & Client Controls

**Files:**
- Modify: `frontend/src/DashboardView.tsx`
- Modify: `frontend/src/ProfilesPanel.tsx`
- Modify: `frontend/src/ClientTable.tsx`
- Modify: `frontend/src/interfaces.ts`

**Interfaces:**
- Consumes: Stitch `dashboard_overview`, `access_profiles`, `connected_clients`.

- [ ] **Step 1: Interfaces Update**
Add `manualBlock: boolean` to the `Client` interface in `frontend/src/interfaces.ts`.

- [ ] **Step 2: Dashboard Overview**
In `DashboardView.tsx` (the "Home" tab), map the donut chart placeholders and stat widgets directly to `stats?.uptime`, `stats?.temp`, `stats?.heap`. Donut values map to `clients.filter(c => !c.blocked).length`.

- [ ] **Step 3: Extract & Port Profiles List**
In `ProfilesPanel.tsx` (the "Profiles" tab), map the `access_profiles` HTML. **REMOVE** the "Secondary DNS" input field as directed. Ensure inputs map to `name`, `start`, `end`, and `dns`. Submit to `/api/profiles` with token.

- [ ] **Step 4: Port Connected Clients List**
In `ClientTable.tsx` (the "Clients" tab), map the `connected_clients` HTML. The status pill changes based on `!client.blocked && !client.manualBlock`. Add the block/unblock click handler posting `&block=true/false` to `/api/assign`. Add the "Manual Add" form block at the bottom mapping the inputs.

- [ ] **Step 5: Verify Compilation**
Run `npm run build` in `frontend`. Expected: SUCCESS.

- [ ] **Step 6: Commit**
```bash
git add frontend/src
git commit -m "feat: complete stitch ui translations and api wiring"
```