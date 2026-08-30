import urllib.request
import urllib.parse
import json
import base64
import sys

ESP32_URL = "http://192.168.1.164"

if len(sys.argv) < 2:
    print("Usage: python test_api.py [password]")
    print("Example: python test_api.py admin123")
    sys.exit(1)

PASSWORD = sys.argv[1]
AUTH_HEADER = "Basic " + base64.b64encode(f"admin:{PASSWORD}".encode()).decode()

def test_api():
    req = urllib.request.Request(f"{ESP32_URL}/stats.json")
    req.add_header("Authorization", AUTH_HEADER)
    
    try:
        response = urllib.request.urlopen(req, timeout=5)
        data = json.loads(response.read().decode())
        
        print("SUCCESS: Received stats.json!")
        print(f"   Timezone: {data.get('timezone')}")
        print(f"   Profiles configured: {len(data.get('profiles', []))}")
        print(f"   Clients tracked: {len(data.get('clients', []))}")
        
    except urllib.error.URLError as e:
        print(f"ERROR: Failed to reach the ESP32: {e}")
        print("   Make sure the ESP32 is powered on, connected to WiFi, and on the same network.")
        sys.exit(1)

if __name__ == "__main__":
    print("Running ESP32-C3 Parental Controls API tests...")
    test_api()
