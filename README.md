# ESP32-C3 NetGuard

ESP32-C3 NetGuard is a lightweight, fast, and feature-rich parental control gateway and routing manager built expressly for the ESP32-C3 microcontroller.

## Overview
NetGuard acts as an intercepting DNS gateway on your network, allowing administrators to group devices, define strict bedtimes, and conditionally route traffic using custom DNS protocols. It is bundled with a sleek, modern React Progressive Web App (PWA) interface, ensuring an intuitive management experience from any mobile device or desktop browser.

## Key Features
* **Device Management:** Automatically detect connected clients via DHCP intercepts and assign them friendly names for easy tracking.
* **Access Profiles (Grouping):** Organize devices into distinct profiles (e.g., "Kids", "Adults", "IoT").
* **Scheduled Blocking (Bedtimes):** Define exact start and end times for internet cutoffs on a per-profile basis.
* **DNS Routing:** Conditionally route specific profiles through custom upstream DNS servers for filtering or tracking.
* **Secure Authentication:** Locally authenticated dashboard ensures only network administrators can alter routing rules.
* **Real-time Polling & PWA:** The dashboard operates as an installable Progressive Web App, securely polling your ESP32 in the background to reflect network statistics, hardware temperatures, and access states dynamically.

## Installation / Usage

Users are not required to compile the project manually to enjoy NetGuard.

1. Navigate to the **Releases** section on GitHub.
2. Download the latest `firmware.bin` payload.
3. Flash the `.bin` to your ESP32-C3 device using a standard flashing tool (e.g., Espressif's Flash Download Tools or esptool.py).
4. Power on the device, connect to the emitted Setup WiFi, and configure it for your local network.
5. Visit the device's IP address in your browser to load the dashboard.

## Development

If you wish to compile the firmware from source, this project relies on PlatformIO.

* **Backend Compilation:** Execute `pio run -e c3` to compile the firmware.
* **Frontend Compilation:** The dashboard interface is built using Vite and React. Navigate to the `frontend/` directory and run `npm run dev` for live compilation, or `npm run build` to package the static assets.

## CI/CD and Versioning
This repository utilizes GitHub Actions. Merging C++ backend changes to the `main` branch automatically triggers a test build, safely advances the internal firmware version string, packages the compiled binary, and publishes a formal GitHub Release.

## License
Refer to the embedded LICENSE file (if applicable) for distribution rules.
