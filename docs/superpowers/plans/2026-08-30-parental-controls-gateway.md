# ESP32-C3 Parental Control Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ESP32-C3 adblocker into a DNS gateway that enforces scheduled parental controls based on device profiles mapped to MAC addresses.

**Architecture:** Strips out the Bloom filter blocking mechanism and replaces it with an NTP-driven scheduler. DNS requests from known clients are matched against a Profile (Default, Kids, Adults) that dictates their bedtime window and upstream DNS provider.

**Tech Stack:** C++, PlatformIO, ESP32 Arduino Core, LittleFS.

## Global Constraints
- Target hardware: ESP32-C3 with 4MB flash (no PSRAM).
- Web frontend must remain a single minimized HTML string in `dashboard_html.h`.
- Must compile successfully with `pio run`.

---

### Task 1: Scaffold the New Workspace

**Files:**
- Create: `D:\Private Projects\ESP32-C3-Parental controls\` (various)

- [ ] **Step 1: Copy base files from AdBlocker directory**
```bash
Copy-Item -Path "D:\Private Projects\ESP32-C3-AdBlocker\*" -Destination "D:\Private Projects\ESP32-C3-Parental controls" -Recurse -Force -Exclude ".pio", ".git"
```

- [ ] **Step 2: Initialize Git in the new directory**
```bash
cd "D:\Private Projects\ESP32-C3-Parental controls"
git init
git add .
git commit -m "chore: scaffold base from ESP32-C3-AdBlocker"
```

- [ ] **Step 3: Remove AdBlocker specific tools**
```bash
cd "D:\Private Projects\ESP32-C3-Parental controls"
Remove-Item -Path "tools\build_blocklist.py", "tools\test_build_blocklist.py", "hardware\*" -Force -Recurse
git rm "tools\build_blocklist.py" "tools\test_build_blocklist.py" "hardware\*"
git commit -m "chore: remove adblocker specific python tools and hardware stl"
```

### Task 2: Strip Ad-Blocker Core Logic from main.cpp

**Files:**
- Modify: `D:\Private Projects\ESP32-C3-Parental controls\src\main.cpp`

**Interfaces:**
- Removes: `isBlocked`, `loadBanned`, `saveBanned`, `handleUpload`, `handleBan`, Bloom filter allocations.

- [ ] **Step 1: Modify `main.cpp` to remove the blocklist data structures**
Edit `src/main.cpp` to completely remove:
- `uint8_t *bloom;` and all memory allocation logic inside `loadBlocklist()`
- The `isBlocked(const char *domain, size_t len)` function.
- The `bannedIP` array, `isBannedIP()`, `addBannedIP()`, `removeBannedIP()`, `loadBanned()`, `saveBanned()` functions.
- The `dashboard_html.h` inclusion will fail if we remove handles now, so temporarily comment out `handleBan`, `handleAddBlock`, `handleUnblock`, `handleUpload`, `handleUploadDone` endpoints from `web.on()`.

- [ ] **Step 2: Verify it compiles**
Run: `pio run`
Expected: PASS (It will compile as a basic DNS forwarder with missing web logic).

- [ ] **Step 3: Commit**
```bash
git add src/main.cpp
git commit -m "refactor: strip out bloom filter and adblock specific globals"
```

### Task 3: Implement Data Model for Profiles & Clients

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Produces: `struct Profile`, `struct Dev`, `loadConfig()`, `saveConfig()`

- [ ] **Step 1: Define `Profile` struct and variables**
```cpp
// Add to src/main.cpp:
#include <ArduinoJson.h> // Ensure you add bblanchon/ArduinoJson to platformio.ini later

struct Profile {
  int startBedtimeMinutes; // Minutes since midnight (e.g. 1260 for 21:00)
  int endBedtimeMinutes;   // (e.g. 420 for 07:00)
  IPAddress upstreamDNS;
};

Profile profiles[3]; // 0=Default, 1=Kids, 2=Adults
String timezone = "UTC0";
```

- [ ] **Step 2: Update `Dev` struct for MAC mapping**
```cpp
// Replace old `Dev` struct:
struct Dev {
  uint32_t ip;
  String mac;
  uint8_t currentProfileId; // 0, 1, or 2
  uint32_t lastSeen;
};
// Array: Dev clients[MAX_CLIENTS];
```

- [ ] **Step 3: Implement `loadConfig()` and `saveConfig()`**
Write parsing logic using LittleFS to read/write `/config.json` defining `profiles` array, assigned MAC mappings, and `timezone`. Make `loadConfig()` call `setupTime()`.

- [ ] **Step 4: Verify it compiles**
Run: `pio run`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/main.cpp
git commit -m "feat: implement profile and client mapping data models"
```

### Task 4: Add NTP Time Synchronization

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Produces: `setupTime()`, `isTimeBlocked(uint8_t profileId)`

- [ ] **Step 1: Include time dependencies**
```cpp
#include <time.h>
```

- [ ] **Step 2: Write Time tracking functions**
```cpp
void setupTime() {
  configTzTime(timezone.c_str(), "pool.ntp.org", "time.nist.gov");
}

bool isTimeBlocked(uint8_t profileId) {
  if (profileId > 2) return false;
  
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return false; // Fail open if no time

  int currentMinutes = timeinfo.tm_hour * 60 + timeinfo.tm_min;
  int start = profiles[profileId].startBedtimeMinutes;
  int end = profiles[profileId].endBedtimeMinutes;
  
  if (start == -1 || end == -1) return false; // Disabled
  
  if (start > end) {
    // Crosses midnight (e.g. 21:00 to 07:00)
    return (currentMinutes >= start || currentMinutes < end);
  } else {
    return (currentMinutes >= start && currentMinutes < end);
  }
}
```

- [ ] **Step 3: Invoke `setupTime()` in `setup()`**
Call it right after WiFi initialization.

- [ ] **Step 4: Verify it compiles**
Run: `pio run`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/main.cpp
git commit -m "feat: establish NTP time synchronization for schedules"
```

### Task 5: Implement Smart DNS Routing

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Consumes: `isTimeBlocked()`, `profiles[]`

- [ ] **Step 1: Modify `handleDns()` logic**
Replace the old `isBlocked()` logic with profile evaluation.
```cpp
// Inside handleDns()
Dev *c = getClient((uint32_t)cip);
uint8_t pid = c ? c->currentProfileId : 0; // Default to restricted if unknown

bool blocked = isTimeBlocked(pid);

if (blocked) {
  // Build blocked response 
  int rlen = buildBlocked(dnsBuf, qend, qtype);
  // Send back blocked UDP response (0.0.0.0)
} else {
  // Use profile's upstream DNS instead of the hardcoded `upstream`
  IPAddress pDNS = profiles[pid].upstreamDNS;
  // Send async DNS via UDP
}
```

- [ ] **Step 2: Modify `handleTcpDns()`**
Apply the same logic in TCP handler: sinkhole if `isTimeBlocked(pid)`, or forward to `profiles[pid].upstreamDNS`.

- [ ] **Step 3: Verify it compiles**
Run: `pio run`

- [ ] **Step 4: Commit**
```bash
git add src/main.cpp
git commit -m "feat: enforce profile bedtimes and custom upstream DNS"
```

### Task 6: Implement Setting API Endpoints

**Files:**
- Modify: `src/main.cpp`

**Interfaces:**
- Produces: `/stats.json`, `/save_profiles`, `/assign_profile`

- [ ] **Step 1: Rewrite `handleStats()`**
Return a JSON containing: NTP status, current local time, timezone, full profile array, full client list (IP, MAC, Profile ID, Online Status).

- [ ] **Step 2: Create Web Handlers for Config**
- `handleSaveProfiles()`: receive JSON representing `profiles[0..2]` and `timezone`, save to LittleFS, re-trigger `setupTime()`.
- `handleAssignProfile()`: receive `?mac=XX:XX&profile=1`, update the tracking array and persist to LittleFS.

- [ ] **Step 3: Map Endpoints**
Bind `web.on("/api/profiles", HTTP_POST, handleSaveProfiles);` etc. in `setup()`.

- [ ] **Step 4: Verify it compiles**
Run: `pio run`

- [ ] **Step 5: Commit**
```bash
git add src/main.cpp
git commit -m "feat: API endpoints for retrieving/saving schedules and clients"
```

### Task 7: Craft the Dashboard UI

**Files:**
- Modify: `src/dashboard_html.h`

**Interfaces:**
- Consumes: `/stats.json`, `/save_profiles`, `/assign_profile`

- [ ] **Step 1: Replace HTML Layout**
Remove all upload/bloom/dashboard cards. Create a Timezone input. Create card rows for Default, Kids, and Parent profiles with `time type="time"` inputs and text inputs for Upstream IPs.

- [ ] **Step 2: Bind API fetchers in JS**
Write frontend JS to POST `handleSaveProfiles()` and cleanly handle success states. 

- [ ] **Step 3: Client Table Update**
Remap the client rendering loop to generate `<select>` dropdowns instead of "Ban" buttons. Make the dropdown send requests to `/assign_profile`.

- [ ] **Step 4: Verify it compiles**
Run: `pio run`

- [ ] **Step 5: Commit**
```bash
git add src/dashboard_html.h
git commit -m "feat: complete UI for timezone, schedule profiling, and client assignment"
```