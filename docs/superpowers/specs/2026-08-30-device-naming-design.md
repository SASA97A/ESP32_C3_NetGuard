# Device Naming and Dynamic Groups Design

## Overview
Currently, the ESP32-C3 Parental Controls gateway only tracks devices that actively query it and restricts users to 3 hardcoded profiles. This design introduces the ability to assign Friendly Names to devices, explicitly add offline devices by MAC address, and create up to 10 dynamic custom Profiles (Groups).

## Architecture & Data Model

### 1. Dynamic Profiles
- **Profile Struct**: Updated to `struct Profile { String name; int startBedtimeMinutes; int endBedtimeMinutes; IPAddress upstreamDNS; };`
- **Memory**: A statically allocated array `Profile profiles[10];` with an active counter `int numProfiles = 3;`.
- **Config**: `/config.json` will store up to 10 profiles in the JSON array, including their custom string `name`.
- **Default State**: Initial profiles will remain `Default`, `Kids`, and `Adults`.

### 2. Device Naming & Explicit Addition
- **Dev Struct Update**: The `Dev` tracking struct in `main.cpp` will be updated to include `String friendlyName`.
- **Config Storage**: `config.json` updates `macs` mappings from raw integer IDs to objects: `{"profile": 1, "name": "Timmy iPad"}` (or via a separate key strategy).
- **API Endpoints**: 
  - `POST /api/assign`: Updated to accept `&name=...`.
  - `POST /api/add_device`: Explicitly push a MAC address into tracking.
  - `POST /api/profiles`: Receives the dynamic profile array (up to 10).
  - `POST /api/del_profile`: Removes a custom profile by ID (IDs 0-2 are protected from deletion).

## Dashboard UI
- **Profiles Section**: Rendered dynamically from `/stats.json`. Will include an "Add Group" button that pushes a new empty schedule card locally.
- **Client Table**: Evolved to include a "Name" cell with an edit icon. The Group assignment `<select>` dropdown will dynamically populate based on the current available Groups. 
- **Manual Add Form**: A new inputs row below the table to explicitly define `MAC`, `Name`, and starting `Group`.