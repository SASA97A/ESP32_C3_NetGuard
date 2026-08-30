# Task 3 Implementation Report: Data Model for Profiles & Clients

## Implemented Features
1. **Added Dependency**:
   - Added `bblanchon/ArduinoJson` library to `platformio.ini`.
   - Included `<ArduinoJson.h>` in `src/main.cpp`.

2. **Defined Data Models**:
   - `struct Profile` with `startBedtimeMinutes`, `endBedtimeMinutes`, and `upstreamDNS`.
   - `Profile profiles[3]` (Default, Kids, Adults) and `String timezoneStr = "UTC0"`.
   - `struct Dev` with `uint32_t ip`, `String mac`, `uint8_t currentProfileId`, and `uint32_t lastSeen`.

3. **Persistence Engine (`loadConfig` / `saveConfig`)**:
   - `initDefaultProfiles()` to set baseline settings for default, kids, and adults profiles.
   - `loadConfig()` loads `/config.json` via LittleFS, parsing `timezoneStr`, `profiles` array, and MAC-to-profile mappings (`macs` object).
   - `saveConfig()` serializes current configuration to `/config.json`.
   - Integrated `loadConfig()` call into `setup()`.

4. **Updated References**:
   - Adapted `getClient(ip)` to lookup clients by MAC address first, keeping persistent profile assignments across dynamic IP re-assignments.
   - Removed obsolete `banned`, `blocked`, and `allowed` struct references in `handleDns`, `handleTcpDns`, and `handleStats`.

## Verification Results
- Executed PlatformIO build command:
  `& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run`
- Output:
  ```
  Library Manager: ArduinoJson@7.4.3 has been installed!
  Building in release mode
  Compiling .pio\build\c3\src\main.cpp.o
  Linking .pio\build\c3\firmware.elf
  Checking size .pio\build\c3\firmware.elf
  RAM:   [==        ]  16.8% (used 54996 bytes from 327680 bytes)
  Flash: [=======   ]  65.1% (used 896612 bytes from 1376256 bytes)
  Building .pio\build\c3\firmware.bin
  ========================= [SUCCESS] Took 20.29 seconds =========================
  ```

## Files Changed
- `platformio.ini`
- `src/main.cpp`

## Self-Review
- Completeness: All steps 1 through 6 completed.
- Quality: Code strictly adheres to existing C++/Arduino conventions and brief requirements.
- Verification: Clean compilation with 0 errors.

## Concerns
- None.
