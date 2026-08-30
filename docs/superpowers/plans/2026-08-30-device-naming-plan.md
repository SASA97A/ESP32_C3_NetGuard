# Device Naming & Dynamic Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the C++ backend and HTML frontend to support up to 10 dynamic grouping profiles, Friendly Names for devices, and explicit offline device addition.

**Architecture:** We will increase the static `profiles[3]` array to `profiles[10]` with a `numProfiles` tracker. The config persisting methods will loop dynamically up to `numProfiles`. Friendly names will be added to the `Dev` struct and mapped directly in the `/config.json`. The web server API endpoints (`/stats.json`, `/api/assign`, `/api/profiles`) will be rewritten to expect arrays.

**Tech Stack:** C++, PlatformIO, ArduinoJson

## Global Constraints
- Target hardware: ESP32-C3 with 4MB flash (no PSRAM).
- Web frontend must remain a single fully contained HTML string in `dashboard_html.h`.
- Must compile successfully with `pio run -e c3`.

---

### Task 1: Update Domain Model and Config Store

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Consumes: C++ global variables
- Produces: `String name` in `Profile`, `String friendlyName` in `Dev`, `int numProfiles`.

- [ ] **Step 1: Increase Profile Storage**
Change `Profile profiles[3];` to `Profile profiles[10];` and add `int numProfiles = 3;`.
Update the `Profile` struct to include `String name;`.

- [ ] **Step 2: Update Initial Default Profiles**
In `initDefaultProfiles()`, add names for the first 3: 
`profiles[0].name = "Default";`, `profiles[1].name = "Kids";`, `profiles[2].name = "Adults";`.
Ensure `numProfiles = 3;`.

- [ ] **Step 3: Update `Dev` struct**
Add `String friendlyName;` to `struct Dev`.

- [ ] **Step 4: Update `saveConfig()` and `loadConfig()`**
Replace the hardcoded `for (int i = 0; i < 3; i++)` loops with `int i = 0; i < numProfiles; i++`.
Save `name` into `doc["profiles"][i]["name"]`.
For MACs, change `doc["macs"][clients[i].mac] = clients[i].currentProfileId;` to a nested object:
`JsonObject ms = doc["macs"][clients[i].mac].to<JsonObject>();`
`ms["profile"] = clients[i].currentProfileId;`
`ms["name"] = clients[i].friendlyName;`
In `loadConfig()`, deserialize the `name` for profiles, read `numProfiles` length, and deserialize the `name` property out of `doc["macs"]`.

- [ ] **Step 5: Verify Compilation**
Run `pio run -e c3`.
Expected: SUCCESS.

- [ ] **Step 6: Commit**
```bash
git add src/main.cpp
git commit -m "feat: expand models for dynamic profiles and friendly names"
```

### Task 2: Enhance API Endpoints

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Consumes: Models from Task 1

- [ ] **Step 1: Update `/stats.json`**
In `handleStats()` change the loop for profiles to `numProfiles` and output the profile `name`. In the clients array, output `name` using `c.friendlyName`.

- [ ] **Step 2: Update `/api/profiles` POST Handler**
In `handleSaveProfiles()`, remove the hard break `if(idx >= 3) break;` and instead rely on `numProfiles = profArray.size();` (up to a max of 10). Parse `p["name"]` into `profiles[idx].name`. Add deletion capabilities by wiping out leftover items.

- [ ] **Step 3: Update `/api/assign` POST Handler**
Update `handleAssignProfile()` to look for `web.hasArg("name")`. If present, update `clients[i].friendlyName = web.arg("name");`. Allow `profile` argument to be bounded by `numProfiles`, not `2`.

- [ ] **Step 4: Add explicit Add Endpoint or modify `assign`**
If a mac doesn't exist during `/api/assign`, the current code already uses `numClients++`. This will naturally handle "Add Device Manually" out of the box because it creates the entry. We just ensure `friendlyName` handles correctly during this offline creation.

- [ ] **Step 5: Verify Compilation**
Run `pio run -e c3`.
Expected: SUCCESS.

- [ ] **Step 6: Commit**
```bash
git add src/main.cpp
git commit -m "feat: enhance APIs for dynamic profiles and device naming"
```

### Task 3: Dashboard Reactivity

**Files:**
- Modify: `src/dashboard_html.h`

**Interfaces:**
- Consumes: `/stats.json`, `/api/profiles`, `/api/assign`

- [ ] **Step 1: Re-structure Dashboard HTML**
Update the core template. The profiles list should render dynamically based on `stats.profiles`. Include an "Add New Group" button at the bottom of the section.
In the client table, add a new cell for "Name". Add a tiny "Edit Name" action which prompts the user (`prompt("Enter name:")`) and calls `/api/assign` with `&name=...`.

- [ ] **Step 2: Add Manual Device Input**
At the bottom of the clients table, add a raw HTML form: `Input MAC`, `Input Name`, `Dropdown Group`, `Add Button`. Bind it to a JS function that posts to `/api/assign`.

- [ ] **Step 3: Verify Compilation**
Run `pio run -e c3`.
Expected: SUCCESS.

- [ ] **Step 4: Commit**
```bash
git add src/dashboard_html.h
git commit -m "feat: dynamic ui groups and device naming forms"
```