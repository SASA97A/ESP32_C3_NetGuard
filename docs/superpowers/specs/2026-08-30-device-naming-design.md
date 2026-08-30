# Device Naming and Explicit Addition Design

## Overview
Currently, the ESP32-C3 Parental Controls gateway only tracks devices that actively query it via port 53 and only displays their MAC addresses. This design introduces the ability to manually map Friendly Names to MAC addresses, as well as an interface to manually inject a known MAC address into the tracking table.

## Architecture & Data Model
- **Dev Struct Update**: The `Dev` tracking struct in `main.cpp` will be updated to include `String friendlyName`.
- **Persistent Storage**: `/config.json` will be updated so the `macs` object holds either a complex object `{"profile": 1, "name": "Timmy iPad"}` instead of just a raw integer profile ID.
- **API Endpoints**: 
  - `POST /api/assign` will be updated to also optionally accept `&name=...` to set the friendly name.
  - A new `POST /api/add_device` endpoint (or reuse `assign`) to explicitly push a MAC address into the tracking array even if it hasn't connected yet.

## Dashboard UI
- **Active Client Table**: A new column "Name" will be added. If empty, it displays "Unknown". Clicking a small "Edit" icon next to it will prompt the user to type a Friendly Name, which hits the `/api/assign` endpoint.
- **Manual Add Form**: Below the client table, a simple form with inputs for `MAC Address` and `Friendly Name` will allow manual onboarding of devices before they make DNS requests.
