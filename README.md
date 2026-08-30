## What's new in this version

This version builds directly on **9M2PJU's heavily upgraded fork** of the original `esp32-c3-adblock`. 

---

### Custom Additions & Fixes in This Build
* **Wi-Fi & AP Connection Fixes:** Resolved issues where the setup Access Point (AP) wouldn't broadcast or Wi-Fi failed to connect by enforcing `WiFi.disconnect(false)` and setting explicit RF output power (`11 dBm`).
* **Wi-Fi Scanner in Setup Portal:** Added a live Wi-Fi network scanning feature (`/scan-wifi`) to the captive portal, allowing users to discover nearby SSIDs, signal strength (RSSI), and encryption status.
* **Mandatory Password Flow:** Implemented a hardcoded initial password (`admin123`) on boot with dynamic dashboard detection that forces the user to set a secure custom password.
* **Live Partition Storage Stats:** Extended `/stats.json` using `LittleFS.totalBytes()` and `LittleFS.usedBytes()` to calculate and display exact filesystem usage right on the dashboard status cards.

---

### Improvements Inherited from 9M2PJU's Upgraded Base

#### Performance
- **Bloom filter in RAM** (128 KB) — skips flash for ~93% of non-blocked queries. Average lookup is **0 flash reads** instead of ~18.
- **Async upstream forwarding** — handles up to 32 concurrent queries instead of blocking on one reply at a time.
- **Custom domains binary search** — sorted and binary-searched (up from a linear scan).
- **Loop optimization** — removed `delay(1)` capping loop throughput and optimized `isBlocked` string parsing.

#### Correctness & Protocol Handling
- **AAAA sinkhole** — answers `::` for blocked IPv6 queries instead of leaking upstream.
- **TCP DNS (Port 53)** — handles truncated responses and DNSSEC fallbacks.
- **RFC 6891 UDP Buffer** — expanded to 1232 bytes to prevent reply truncation.
- **LRU Client Eviction** — handles active client tracking cleanly up to 96 clients.
- **Banned IP Persistence** — decoupled banning rules from temporary client table entries.
- **Idle-Gated Auto-Updates** — waits for 3+ seconds of DNS inactivity before fetching remote blocklists.

#### Security & Quality of Life
- **Dashboard Authentication & CSRF Protection** — Basic Auth support + token validation on mutating actions.
- **CA-Verified HTTPS** — secures remote blocklist downloads against MITM attacks.
- **Captive Portal & Optional DHCP** — streamlined setup flow and optional built-in DHCP server.
- **Blocklist v1 Binary Format** — includes `CADB` magic header verification.
- **Automated Testing Suite** — includes 33 Python unit tests for hashing, normalization, and Bloom filters.

## Hardware

- Any **ESP32-C3** board (tested on a C3 SuperMini), 4 MB flash, **no PSRAM needed**
- Power it from a **stable USB source** (a phone charger or your router's USB port).
  Cheap/loose USB-C→A adapters can brown out the radio during WiFi transmit.
- A **USB-A → USB-C dongle** lets it plug straight into the spare USB port on the
  back of most routers — no power supply, no extra box.

### Enclosure

A printable case for the C3 SuperMini: [`hardware/esp32-c3-supermini-enclosure.stl`](hardware/esp32-c3-supermini-enclosure.stl)

Printing notes:
- No supports needed; 0.2 mm layers, ~15% infill is plenty.
- **Keep the antenna end clear.** The C3's PCB antenna is the zig-zag trace on the
  short edge opposite the USB-C port — don't bury it in solid plastic or put metal
  near it, or your RSSI will suffer.
- Leave the vents open: the board idles around 45–55 °C.



## Installation

### Flash a prebuilt release (GUI / ESP Flasher)

1. **Download the latest release** from
   [GitHub Releases](https://github.com/SASA97A/ESP32-C3-AdBlocker/releases).
   You need:
   - `ESP32-flash.bin` — everything in one file (bootloader + partitions + firmware). 
   - `blocklist.bin` — the prebuilt blocklist by 9M2PJU (~140k domains).

2. **Download ESP Flasher:**
   - Download the latest executable for your OS from 
     [ESP Flasher Releases](https://github.com/Jason2866/ESP_Flasher/releases).

3. **Plug in your ESP32-C3** via USB to your computer.
> **Note:** If your board gets stuck in a connect/disconnect loop, hold down the **BOOT** button while plugging in the USB cable to force it into bootloader mode.

4. **Flash the firmware:**
   - Open **ESP Flasher**.
   - Select your ESP32-C3's **COM Port** from the dropdown menu (if it doesn't appear, click the reload button).
   - Click **Browse** under **Firmware / binary** and select `ESP32-flash.bin`.
   - Click **Flash ESP**. Wait until the progress bar reaches 100% and displays success.

5. **Continue to first-boot setup** below.



### First-boot setup

1. **Connect to the Wi-Fi Setup AP:**
   - On your phone or computer, look for the Wi-Fi network named **`C3AdBlock-Setup`** and connect to it.
   - A captive portal page should automatically open at **`http://192.168.4.1`**. If it doesn't, open a browser and go to `192.168.4.1`.

2. **Configure Your Home Wi-Fi:**
   - Scan for nearby networks or select your Wi-Fi SSID from the list.
   - Enter your Wi-Fi password and click **Connect / Save**.
   - The ESP32-C3 will save your credentials, reboot, and connect to your local network.

3. **Access the Dashboard:**
   - Open your browser and navigate to **`http://c3adblock.local`**. 
   - *(If mDNS isn't supported on your network, check your router's client list for the C3's IP address, e.g., `http://192.168.1.42`).*

4. **Log In with Default Credentials:**
   - When prompted for Basic Auth, enter:
     - **Username:** `admin`
     - **Password:** `admin123`

5. **Change Password & Upload Blocklist:**
   - **Update Password:** The dashboard will prompt you to change the default password immediately. Enter a secure custom password to save it.
   - **Upload Blocklist:** Scroll to **BLOCKLIST — UPLOAD**, click **Browse...**, select your `blocklist.bin` file, and click **Upload blocklist** to populate your filtering rules.

### Pointing your devices at the ad-blocker

You have three options:

**Option 1: Manual DNS (simplest, no DHCP changes)**
- Set your device's DNS server to the C3's IP address.
- On most OSes: Settings → Network → DNS → Custom → enter the C3's IP.
- Test: `dig @<c3-ip> doubleclick.net` should return `0.0.0.0`.

**Option 2: Router DNS (whole-network, recommended)**
- In your router's DHCP settings, set the primary DNS server to the C3's IP.
- Set the secondary DNS to a real resolver (e.g. `1.1.1.1`) as a fallback.
- Every device on your network now uses the C3 for DNS automatically.

**Option 3: Built-in DHCP server (true plug-and-play)**
- **Disable your router's DHCP server first** (having two DHCP servers on one
  network causes conflicts).
- In the C3 dashboard, scroll to **DHCP SERVER** and click **Enable / Disable DHCP**.
- The C3 now hands out IP addresses and tells every device to use itself as DNS.
- Reconnect your devices (or reboot them) so they pick up the new DHCP lease.

## License

MIT — see [LICENSE](LICENSE).
