# Technical Specification: Decoupled React Front-End

## 1. Architecture Map
- **ESP32 Backend Data Layer**: The C++ firmware will be stripped of its dense HTML strings. It will act purely as a headless API (`/stats.json`, `/api/profiles`, `/api/assign`, etc.).
- **CORS Handling**: Crucially, the ESP32 WebServer will be updated to inject `Access-Control-Allow-Origin: *` headers into every response. Without this, the React app will be blocked by the browser from reading the data.
- **React Frontend**: A totally separate project built with Vite, React, Tailwind CSS, and headless UI components (shadcn/ui style), hosted externally (e.g., Cloudflare Pages).

## 2. React Application Flow
1. **Connect Screen (Root `/`)**: 
   - A beautiful, minimalist screen prompting: `Enter Gateway IP`. 
   - Accepts the IP (e.g., `192.168.1.164`) and the custom Dashboard Password.
   - Tests the connection via a hidden ping to `/stats.json`. If successful, it saves the IP and Base64 Auth Header to `localStorage` and moves to the dashboard.
2. **Main Dashboard**:
   - Reads the IP and Auth from `localStorage`.
   - **Hero Section**: Displays uptime, ping status, clients connected, and RAM/Flash usage.
   - **Profiles Panel**: A responsive grid card layout to manage the 10 dynamic groups, edit time scheduling, and change upstream DNS IPs. 
   - **Client Tracker**: A polished, mobile-friendly data table to assign devices to profiles dynamically, complete with the "Rename Device" inline editing ability.

## 3. Necessary C++ Refactoring
- Enable CORS by adding the `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers: Authorization, Content-Type` rules to the ESP32 CORS configuration (specifically inside `handleRoot`, `handleStats`, API handlers, and `OPTIONS` preflight handlers if necessary).
- Strip out the inline C++ `DASHBOARD_HTML` rendering, replacing the root `/` endpoint with a simple text/HTML response containing the local IP and a link/message directing users to the Cloudflare Pages deployment.
