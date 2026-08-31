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

## Default Credentials
When accessing the dashboard for the first time, authenticate using:
* **Username:** `admin`
* **Password:** `adminpass123`

*(Note: It is highly recommended to change this password in the Settings tab immediately after your first login.)*

## Installation / Usage

**First-Time Installation (USB Only):**
Because the ESP32 chip requires the baseline web server and Over-The-Air (OTA) architecture to be present before accepting wireless updates, your very first installation must be conducted physically via a USB cable.

1. Navigate to the **Releases** section on GitHub.
2. Download the latest `firmware.bin` payload.
3. Flash the `.bin` to your ESP32-C3 device using a standard serial flashing tool (e.g., Espressif's Flash Download Tools or esptool.py) over your COM port.
4. Power on the device, and look for the newly emitted **C3NetGuard-Setup** WiFi network on your phone or laptop.
5. Connect to it, and a captive portal will appear (or visit `http://192.168.4.1`) prompting you to securely designate your home WiFi network.
6. Once connected, visit `http://c3netguard.local` in your browser to load the dashboard!

**Subsequent Updates (OTA):**
Once NetGuard is running, all future version upgrades can be performed wirelessly! Simply download the newest `.bin` from GitHub, navigate to the **Settings** tab in your dashboard, and use the **Flash Firmware** upload tool. 
* **Note on OTA Reboots:** Because the ESP32 physically drops its network connection to instantly hardware-reboot upon a successful flash, the dashboard may occasionally report a false "Connection Error" right at 100%. This is a known, harmless UI quirk. Simply wait a few moments and refresh the page to see your updated dashboard!

## Hardware Limitations
**Single-Device Dashboard Access:**
The ESP32-C3 is a highly efficient but extremely localized microcontroller. It enforces a strict physical limit on concurrent TCP sockets. Because the React PWA acts as a live monitor and aggressively polls the gateway for status updates in the background, keeping the dashboard open on multiple devices simultaneously (e.g., your smartphone and your desktop) will rapidly exhaust the processor's connection pool. 
* **Best Practice:** Keep the dashboard actively open on only one device at a time to prevent UI freezing and silent connection rejections.

## Development

If you wish to compile the firmware from source, this project relies on PlatformIO.

* **Backend Compilation:** Execute `pio run -e c3` to compile the firmware.
* **Frontend Compilation:** The dashboard interface is built using Vite and React. Navigate to the `frontend/` directory and run `npm run dev` for live compilation, or `npm run build` to package the static assets.

## CI/CD and Versioning
This repository utilizes GitHub Actions. Merging C++ backend changes to the `main` branch automatically triggers a test build, safely advances the internal firmware version string, packages the compiled binary, and publishes a formal GitHub Release.

## License
Refer to the embedded LICENSE file (if applicable) for distribution rules.
