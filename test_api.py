import urllib.request
import urllib.parse
import json
import base64
import sys

# Replace with the actual IP address or hostname if mDNS doesn't work locally
ESP32_URL = "http://c3adblock.local"
PASSWORD = "admin" # Replace if you changed the dashboard password naturally
AUTH_HEADER = "Basic " + base64.b64encode(f"admin:{PASSWORD}".encode()).decode()

def test_api():
    req = urllib.request.Request(f"{ESP32_URL}/stats.json")
    req.add_header("Authorization", AUTH_HEADER)
    
    try:
        response = urllib.request.urlopen(req, timeout=5)
        data = json.loads(response.read().decode())
        
        print("✅ Received stats.json!")
        print(f"   Timezone: {data.get('timezone')}")
        print(f"   Profiles configured: {len(data.get('profiles', []))}")
        print(f"   Clients tracked: {len(data.get('clients', []))}")
        
    except urllib.error.URLError as e:
        print(f"❌ Failed to reach the ESP32: {e}")
        print("   Make sure the ESP32 is powered on, connected to WiFi, and on the same network.")
        sys.exit(1)

if __name__ == "__main__":
    print("Running ESP32-C3 Parental Controls API tests...")
    test_api()
