#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WiFiServer.h>
#include <LittleFS.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <Update.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoOTA.h>
#include <time.h>
#include <sntp.h>
#include "lwip/etharp.h"
#include "lwip/netif.h"
#include "secrets.h"
#include "scheduler.h"
#include "dashboard_html.h"

// ---- config ----
static const IPAddress UPSTREAM(9, 9, 9, 9);
static const uint16_t DNS_PORT = 53;
static const uint16_t DHCP_PORT = 67;
static const char *BLOCKLIST_PATH = "/blocklist.bin";
static const int HASH_BYTES = 5;
static const uint64_t HASH_MASK = (1ULL << (HASH_BYTES * 8)) - 1;
static const int DNS_BUF_SIZE = 1232;
static const int MAX_PENDING = 32;
static const int MAX_CLIENTS = 96;
static const int MAX_CUSTOM = 200;
static const int MAX_DHCP_LEASES = 32;
static const uint32_t UPSTREAM_TIMEOUT_MS = 2000;
static const uint32_t REMOTE_FETCH_IDLE_MS = 3000;
static const char *DASHBOARD_ETAG = "c3adb-v2";
static const char *DEFAULT_PASS = "adminpass123";

// ---- logging ----
#ifdef NDEBUG
#define LOG(...) ((void)0)
#define LOGN(...) ((void)0)
#else
#define LOG(...) Serial.printf(__VA_ARGS__)
#define LOGN(...) Serial.println(__VA_ARGS__)
#endif

// ---- forward declarations ----
WebServer web(80);
static const char *COLLECTED_HEADERS[] = {"Authorization", "If-None-Match", "Origin", "Referer"};
String updateUrl, updateStatus = "never";
uint32_t updateIntervalH = 24, lastCheckMs = 0;
static uint32_t lastDnsActivityMs = 0;
bool dhcpEnabled = false;
static void saveDhcpCfg();
static void saveWifiCfg(const String &ssid, const String &pass);
static bool fetchBlocklist(String url);

// ---- hashing ----------
static uint64_t fnv64(const char *s, size_t n)
{
  uint64_t h = 0xcbf29ce484222325ULL;
  for (size_t i = 0; i < n; i++)
  {
    h ^= (uint8_t)s[i];
    h *= 0x100000001b3ULL;
  }
  return h;
}
static inline uint64_t fnv40(const char *s, size_t n) { return fnv64(s, n) & HASH_MASK; }

// ---- custom domains ----
String customDom[MAX_CUSTOM];
uint64_t customHash[MAX_CUSTOM];
int numCustom = 0;

static void sortCustom()
{
  for (int i = 1; i < numCustom; i++)
  {
    uint64_t h = customHash[i];
    String d = customDom[i];
    int j = i - 1;
    while (j >= 0 && customHash[j] > h)
    {
      customHash[j + 1] = customHash[j];
      customDom[j + 1] = customDom[j];
      j--;
    }
    customHash[j + 1] = h;
    customDom[j + 1] = d;
  }
}

static bool inCustom(uint64_t h)
{
  int lo = 0, hi = numCustom - 1;
  while (lo <= hi)
  {
    int mid = (lo + hi) >> 1;
    if (customHash[mid] < h)
      lo = mid + 1;
    else if (customHash[mid] > h)
      hi = mid - 1;
    else
      return true;
  }
  return false;
}

static void loadCustom()
{
  numCustom = 0;
  File f = LittleFS.open("/custom.txt", "r");
  if (!f)
    return;
  while (f.available() && numCustom < MAX_CUSTOM)
  {
    String l = f.readStringUntil('\n');
    l.trim();
    l.toLowerCase();
    if (l.length() && l.indexOf('.') > 0)
    {
      customDom[numCustom] = l;
      customHash[numCustom] = fnv40(l.c_str(), l.length());
      numCustom++;
    }
  }
  f.close();
  sortCustom();
}

static void saveCustom()
{
  File f = LittleFS.open("/custom.txt", "w");
  if (!f)
    return;
  for (int i = 0; i < numCustom; i++)
    f.println(customDom[i]);
  f.close();
}

static bool addCustom(String d)
{
  d.trim();
  d.toLowerCase();
  if (d.startsWith("www."))
    d = d.substring(4);
  if (!d.length() || d.indexOf('.') < 0 || numCustom >= MAX_CUSTOM)
    return false;
  for (int i = 0; i < numCustom; i++)
    if (customDom[i] == d)
      return false;
  customDom[numCustom] = d;
  customHash[numCustom] = fnv40(d.c_str(), d.length());
  numCustom++;
  sortCustom();
  saveCustom();
  return true;
}

static void removeCustom(String d)
{
  d.toLowerCase();
  if (d.startsWith("www."))
    d = d.substring(4);
  for (int i = 0; i < numCustom; i++)
    if (customDom[i] == d)
    {
      for (int j = i; j < numCustom - 1; j++)
      {
        customDom[j] = customDom[j + 1];
        customHash[j] = customHash[j + 1];
      }
      numCustom--;
      saveCustom();
      return;
    }
}

// ---- profiles & clients ----
struct Profile {
  String name;
  int startBedtimeMinutes; // Minutes since midnight (e.g. 1260 for 21:00)
  int endBedtimeMinutes;   // (e.g. 420 for 07:00)
  IPAddress upstreamDNS;
};

Profile profiles[10]; // dynamic up to 10 profiles
int numProfiles = 3;
String timezoneStr = "UTC0";
const String FW_VERSION = "v0.9.1";

struct Dev
{
  uint32_t ip;
  String mac;
  String friendlyName;
  uint8_t currentProfileId; // Profile index
  bool manualBlock;
  uint32_t lastSeen;
};
Dev clients[MAX_CLIENTS];
int numClients = 0;
uint32_t totalBlocked = 0, totalAllowed = 0;

static void getMac(uint32_t ip, uint8_t *mac)
{
  memset(mac, 0, 6);
  ip4_addr_t ipa;
  ipa.addr = ip;
  struct eth_addr *eth = nullptr;
  const ip4_addr_t *ipret = nullptr;
  for (struct netif *nif = netif_list; nif; nif = nif->next)
    if (etharp_find_addr(nif, &ipa, &eth, &ipret) >= 0 && eth)
    {
      memcpy(mac, eth->addr, 6);
      return;
    }
}

static Dev *getClient(uint32_t ip)
{
  for (int i = 0; i < numClients; i++)
    if (clients[i].ip == ip)
    {
      clients[i].lastSeen = millis();
      return &clients[i];
    }

  uint8_t mbuf[6];
  getMac(ip, mbuf);
  char macBuf[18];
  snprintf(macBuf, sizeof(macBuf), "%02x:%02x:%02x:%02x:%02x:%02x", mbuf[0], mbuf[1], mbuf[2], mbuf[3], mbuf[4], mbuf[5]);
  String mac = String(macBuf);

  if (mac.length() > 0 && mac != "00:00:00:00:00:00")
  {
    for (int i = 0; i < numClients; i++)
    {
      if (clients[i].mac.equalsIgnoreCase(mac))
      {
        clients[i].ip = ip;
        clients[i].lastSeen = millis();
        return &clients[i];
      }
    }
  }

  int slot = numClients;
  if (numClients >= MAX_CLIENTS)
  {
    int oldest = 0;
    for (int i = 1; i < numClients; i++)
      if (clients[i].lastSeen < clients[oldest].lastSeen)
        oldest = i;
    slot = oldest;
  }
  else
  {
    numClients++;
  }
  Dev *c = &clients[slot];
  c->ip = ip;
  c->mac = mac;
  c->currentProfileId = 0;
  c->manualBlock = false;
  c->lastSeen = millis();
  return c;
}

// ---- DNS parsing ----
static size_t parseQuery(const uint8_t *pkt, int len, char *out, uint16_t *qtype, int *qend)
{
  if (len < 13)
    return 0;
  int i = 12;
  size_t o = 0;
  while (i < len)
  {
    uint8_t l = pkt[i++];
    if (l == 0)
      break;
    if (l & 0xC0)
      return 0;
    if (o + l + 1 >= 250 || i + l > len)
      return 0;
    if (o)
      out[o++] = '.';
    for (uint8_t k = 0; k < l; k++)
      out[o++] = tolower(pkt[i++]);
  }
  out[o] = 0;
  if (i + 4 > len)
    return 0;
  *qtype = (pkt[i] << 8) | pkt[i + 1];
  *qend = i + 4;
  if (o > 4 && strncmp(out, "www.", 4) == 0)
  {
    memmove(out, out + 4, o - 3);
    o -= 4;
  }
  return o;
}

static int buildBlocked(uint8_t *pkt, int qend, uint16_t qtype)
{
  pkt[2] = 0x81;
  pkt[3] = 0x80;
  pkt[6] = 0;
  pkt[7] = (qtype == 1 || qtype == 28) ? 1 : 0;
  pkt[8] = 0;
  pkt[9] = 0;
  pkt[10] = 0;
  pkt[11] = 0;
  if (qtype == 1)
  {
    const uint8_t ans[] = {0xC0, 0x0C, 0, 1, 0, 1, 0, 0, 1, 0x2C, 0, 4, 0, 0, 0, 0};
    memcpy(pkt + qend, ans, sizeof(ans));
    return qend + sizeof(ans);
  }
  if (qtype == 28)
  {
    const uint8_t ans[] = {0xC0, 0x0C, 0, 28, 0, 1, 0, 0, 1, 0x2C, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    memcpy(pkt + qend, ans, sizeof(ans));
    return qend + sizeof(ans);
  }
  return qend;
}

void setupTime() {
  if (timezoneStr.length() == 0) {
    timezoneStr = "UTC0"; // Fallback
  }
  sntp_servermode_dhcp(1); // Enable DHCP provided NTP if available
  configTzTime(timezoneStr.c_str(), "pool.ntp.org", "time.nist.gov");
}

bool isTimeBlocked(uint8_t profileId) {
  if (profileId >= numProfiles) return false;
  
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return false; // Fail open if no time

  int currentMinutes = timeinfo.tm_hour * 60 + timeinfo.tm_min;
  int start = profiles[profileId].startBedtimeMinutes;
  int end = profiles[profileId].endBedtimeMinutes;
  
  return checkTimeWindow(currentMinutes, start, end);
}

// ---- async DNS forwarding ----
WiFiUDP dnsServer;
WiFiUDP upstream;
WiFiUDP tcpUpstream;

struct Pending
{
  uint32_t clientIP;
  uint16_t clientPort;
  uint16_t originalID;
  uint32_t sentMs;
  bool active;
};
Pending pending[MAX_PENDING];
int pendingCount = 0;

static int findFreeSlot()
{
  for (int i = 0; i < MAX_PENDING; i++)
    if (!pending[i].active)
      return i;
  return -1;
}

static void expirePending()
{
  uint32_t now = millis();
  for (int i = 0; i < MAX_PENDING; i++)
    if (pending[i].active && (now - pending[i].sentMs) > UPSTREAM_TIMEOUT_MS)
    {
      pending[i].active = false;
      pendingCount--;
    }
}

static void pollUpstream(uint8_t *buf, int bufSize)
{
  int sz = upstream.parsePacket();
  if (sz <= 0)
    return;
  int rlen = upstream.read(buf, bufSize);
  if (rlen < 2)
    return;
  uint16_t replyID = (buf[0] << 8) | buf[1];
  if (replyID >= MAX_PENDING || !pending[replyID].active)
    return;
  buf[0] = (pending[replyID].originalID >> 8) & 0xFF;
  buf[1] = pending[replyID].originalID & 0xFF;
  dnsServer.beginPacket(pending[replyID].clientIP, pending[replyID].clientPort);
  dnsServer.write(buf, rlen);
  dnsServer.endPacket();
  pending[replyID].active = false;
  pendingCount--;
}

static uint8_t dnsBuf[DNS_BUF_SIZE];

static void handleDns()
{
  int sz = dnsServer.parsePacket();
  if (sz <= 0)
    return;
  lastDnsActivityMs = millis();
  IPAddress cip = dnsServer.remoteIP();
  uint16_t cport = dnsServer.remotePort();
  int qlen = dnsServer.read(dnsBuf, sizeof(dnsBuf));
  if (qlen < 13)
    return;

  char domain[256];
  uint16_t qtype = 0;
  int qend = qlen;
  size_t dl = parseQuery(dnsBuf, qlen, domain, &qtype, &qend);

  Dev *c = getClient((uint32_t)cip);
  uint8_t pid = c ? c->currentProfileId : 0; // Default to restricted if unknown
  if (pid > 2) pid = 0;

  bool blocked = c ? c->manualBlock : false;
  if (!blocked) {
    blocked = isTimeBlocked(pid);
  }

  if (blocked)
  {
    int rlen = buildBlocked(dnsBuf, qend, qtype);
    totalBlocked++;
    dnsServer.beginPacket(cip, cport);
    dnsServer.write(dnsBuf, rlen);
    dnsServer.endPacket();
  }
  else
  {
    IPAddress pDNS = profiles[pid].upstreamDNS;
    if ((uint32_t)pDNS == 0) pDNS = IPAddress(1,1,1,1); // Sanity check fallback

    int slot = findFreeSlot();
    if (slot < 0)
      return;
    uint16_t origID = (dnsBuf[0] << 8) | dnsBuf[1];
    dnsBuf[0] = (slot >> 8) & 0xFF;
    dnsBuf[1] = slot & 0xFF;
    pending[slot].clientIP = (uint32_t)cip;
    pending[slot].clientPort = cport;
    pending[slot].originalID = origID;
    pending[slot].sentMs = millis();
    pending[slot].active = true;
    pendingCount++;
    upstream.beginPacket(pDNS, 53);
    upstream.write(dnsBuf, qlen);
    upstream.endPacket();
    totalAllowed++;
  }
}

// ---- TCP DNS ----
WiFiServer tcpDnsServer(DNS_PORT);
WiFiClient tcpDnsClient;
static uint8_t tcpBuf[DNS_BUF_SIZE];

static int forwardUpstreamSync(uint8_t *pkt, int qlen, IPAddress pDNS)
{
  uint16_t origID = (pkt[0] << 8) | pkt[1];
  pkt[0] = 0xFF;
  pkt[1] = 0xFE;
  tcpUpstream.beginPacket(pDNS, 53);
  tcpUpstream.write(pkt, qlen);
  tcpUpstream.endPacket();
  pkt[0] = (origID >> 8) & 0xFF;
  pkt[1] = origID & 0xFF;
  uint32_t t0 = millis();
  while (millis() - t0 < UPSTREAM_TIMEOUT_MS)
  {
    int sz = tcpUpstream.parsePacket();
    if (sz > 0)
    {
      int n = tcpUpstream.read(pkt, DNS_BUF_SIZE);
      if (n >= 2)
      {
        pkt[0] = (origID >> 8) & 0xFF;
        pkt[1] = origID & 0xFF;
        return n;
      }
      return 0;
    }
    delay(1);
  }
  return 0;
}

static void handleTcpDns()
{
  if (!tcpDnsClient || !tcpDnsClient.connected())
  {
    tcpDnsClient = tcpDnsServer.accept();
    if (!tcpDnsClient)
      return;
  }
  if (!tcpDnsClient.connected() || tcpDnsClient.available() < 2)
    return;

  uint8_t lenBuf[2];
  tcpDnsClient.read(lenBuf, 2);
  uint16_t msgLen = (lenBuf[0] << 8) | lenBuf[1];
  if (msgLen > DNS_BUF_SIZE)
  {
    tcpDnsClient.stop();
    return;
  }

  int total = 0;
  uint32_t t0 = millis();
  while (total < msgLen && tcpDnsClient.connected())
  {
    if (tcpDnsClient.available())
    {
      int n = tcpDnsClient.read(tcpBuf + total, msgLen - total);
      if (n <= 0)
        break;
      total += n;
    }
    else
    {
      if (millis() - t0 > UPSTREAM_TIMEOUT_MS)
        break;
      delay(1);
    }
  }
  if (total < msgLen)
  {
    tcpDnsClient.stop();
    return;
  }

  char domain[256];
  uint16_t qtype = 0;
  int qend = total;
  size_t dl = parseQuery(tcpBuf, total, domain, &qtype, &qend);
  Dev *c = getClient((uint32_t)tcpDnsClient.remoteIP());
  uint8_t pid = c ? c->currentProfileId : 0;
  if (pid > 2) pid = 0;

  bool blocked = c ? c->manualBlock : false;
  if (!blocked) {
    blocked = isTimeBlocked(pid);
  }
  IPAddress pDNS = profiles[pid].upstreamDNS;
  if ((uint32_t)pDNS == 0) pDNS = IPAddress(1,1,1,1); // Sanity check fallback

  int rlen = blocked ? buildBlocked(tcpBuf, qend, qtype) : forwardUpstreamSync(tcpBuf, total, pDNS);
  if (blocked)
    totalBlocked++;
  else
    totalAllowed++;

  if (rlen > 0)
  {
    uint8_t lenOut[2] = {(uint8_t)(rlen >> 8), (uint8_t)(rlen & 0xFF)};
    tcpDnsClient.write(lenOut, 2);
    tcpDnsClient.write(tcpBuf, rlen);
  }
  tcpDnsClient.stop();
}

// ---- DHCP server ----
WiFiUDP dhcpSock;

struct DhcpLease
{
  uint8_t mac[6];
  uint32_t ip;
  uint32_t expires;
  bool active;
};
DhcpLease dhcpLeases[MAX_DHCP_LEASES];

static uint32_t dhcpPoolStart = 0;
static uint32_t dhcpPoolEnd = 0;

static void initDhcpPool()
{
  IPAddress local = WiFi.localIP();
  IPAddress gw = WiFi.gatewayIP();
  uint32_t base = (uint32_t)gw;
  if (base == 0)
    base = (uint32_t)local;
  dhcpPoolStart = htonl(base) + 100;
  dhcpPoolEnd = htonl(base) + 200;
}

static uint32_t findDhcpLease(const uint8_t *mac)
{
  for (int i = 0; i < MAX_DHCP_LEASES; i++)
    if (dhcpLeases[i].active && memcmp(dhcpLeases[i].mac, mac, 6) == 0)
      return dhcpLeases[i].ip;
  return 0;
}

static uint32_t assignDhcpIP(const uint8_t *mac)
{
  uint32_t existing = findDhcpLease(mac);
  if (existing)
    return existing;
  for (uint32_t candidate = dhcpPoolStart; candidate <= dhcpPoolEnd; candidate++)
  {
    bool taken = false;
    for (int i = 0; i < MAX_DHCP_LEASES; i++)
      if (dhcpLeases[i].active && dhcpLeases[i].ip == candidate)
      {
        taken = true;
        break;
      }
    if (!taken)
    {
      for (int i = 0; i < MAX_DHCP_LEASES; i++)
      {
        if (!dhcpLeases[i].active)
        {
          memcpy(dhcpLeases[i].mac, mac, 6);
          dhcpLeases[i].ip = candidate;
          dhcpLeases[i].expires = millis() + 86400000UL;
          dhcpLeases[i].active = true;
          return candidate;
        }
      }
    }
  }
  return 0;
}

static void handleDhcp()
{
  int sz = dhcpSock.parsePacket();
  if (sz <= 0)
    return;
  uint8_t dhcp[548];
  int len = dhcpSock.read(dhcp, sizeof(dhcp));
  if (len < 240 || dhcp[0] != 1)
    return;
  uint32_t xid = (dhcp[4] << 24) | (dhcp[5] << 16) | (dhcp[6] << 8) | dhcp[7];
  uint8_t *mac = dhcp + 28;
  if (dhcp[236] != 0x63 || dhcp[237] != 0x82 || dhcp[238] != 0x53 || dhcp[239] != 0x63)
    return;

  uint8_t msgType = 0;
  int oi = 240;
  while (oi < len && dhcp[oi] != 0xFF)
  {
    uint8_t opt = dhcp[oi++];
    if (opt == 0)
      continue;
    if (oi >= len)
      break;
    uint8_t optLen = dhcp[oi++];
    if (opt == 53 && optLen == 1)
      msgType = dhcp[oi];
    oi += optLen;
  }
  if (msgType != 1 && msgType != 3)
    return;

  uint32_t clientIP = assignDhcpIP(mac);
  if (clientIP == 0)
    return;

  memset(dhcp, 0, 240);
  dhcp[0] = 2;
  dhcp[1] = 1;
  dhcp[2] = 6;
  dhcp[4] = (xid >> 24) & 0xFF;
  dhcp[5] = (xid >> 16) & 0xFF;
  dhcp[6] = (xid >> 8) & 0xFF;
  dhcp[7] = xid & 0xFF;
  dhcp[10] = 0x80;
  dhcp[16] = (clientIP >> 24) & 0xFF;
  dhcp[17] = (clientIP >> 16) & 0xFF;
  dhcp[18] = (clientIP >> 8) & 0xFF;
  dhcp[19] = clientIP & 0xFF;

  IPAddress ourIP = WiFi.localIP();
  dhcp[20] = ourIP[0];
  dhcp[21] = ourIP[1];
  dhcp[22] = ourIP[2];
  dhcp[23] = ourIP[3];
  memcpy(dhcp + 28, mac, 6);
  dhcp[236] = 0x63;
  dhcp[237] = 0x82;
  dhcp[238] = 0x53;
  dhcp[239] = 0x63;

  int o = 240;
  dhcp[o++] = 53;
  dhcp[o++] = 1;
  dhcp[o++] = (msgType == 1) ? 2 : 5;
  dhcp[o++] = 54;
  dhcp[o++] = 4;
  dhcp[o++] = ourIP[0];
  dhcp[o++] = ourIP[1];
  dhcp[o++] = ourIP[2];
  dhcp[o++] = ourIP[3];
  IPAddress mask = WiFi.subnetMask();
  dhcp[o++] = 1;
  dhcp[o++] = 4;
  dhcp[o++] = mask[0];
  dhcp[o++] = mask[1];
  dhcp[o++] = mask[2];
  dhcp[o++] = mask[3];
  IPAddress gw = WiFi.gatewayIP();
  dhcp[o++] = 3;
  dhcp[o++] = 4;
  dhcp[o++] = gw[0];
  dhcp[o++] = gw[1];
  dhcp[o++] = gw[2];
  dhcp[o++] = gw[3];
  dhcp[o++] = 6;
  dhcp[o++] = 4;
  dhcp[o++] = ourIP[0];
  dhcp[o++] = ourIP[1];
  dhcp[o++] = ourIP[2];
  dhcp[o++] = ourIP[3];
  dhcp[o++] = 51;
  dhcp[o++] = 4;
  dhcp[o++] = 0;
  dhcp[o++] = 0;
  dhcp[o++] = 0x51;
  dhcp[o++] = 0x80;
  dhcp[o++] = 0xFF;

  dhcpSock.beginPacket(dhcpSock.remoteIP(), 68);
  dhcpSock.write(dhcp, o);
  dhcpSock.endPacket();
}

// ---- auth ----
String authPassword;
String authToken;

static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static String b64encode(const String &s)
{
  String o;
  const uint8_t *in = (const uint8_t *)s.c_str();
  int len = s.length();
  for (int i = 0; i < len; i += 3)
  {
    uint32_t n = (uint32_t)in[i] << 16;
    if (i + 1 < len)
      n |= (uint32_t)in[i + 1] << 8;
    if (i + 2 < len)
      n |= in[i + 2];
    o += B64[(n >> 18) & 0x3F];
    o += B64[(n >> 12) & 0x3F];
    o += (i + 1 < len) ? B64[(n >> 6) & 0x3F] : '=';
    o += (i + 2 < len) ? B64[n & 0x3F] : '=';
  }
  return o;
}

static void saveAuth(const String &pwd)
{
  authPassword = pwd;
  authToken = String((uint32_t)(esp_random() & 0xFFFFFF), HEX);
  File fo = LittleFS.open("/auth.cfg", "w");
  if (fo)
  {
    fo.println(authPassword);
    fo.println(authToken);
    fo.close();
  }
}

static void loadAuth()
{
  File f = LittleFS.open("/auth.cfg", "r");
  if (f)
  {
    authPassword = f.readStringUntil('\n');
    authPassword.trim();
    authToken = f.readStringUntil('\n');
    authToken.trim();
    f.close();
  }
  if (authPassword.length() == 0)
  {
    saveAuth(DEFAULT_PASS);
  }
}

static bool checkAuth()
{
  String expected = "Basic " + b64encode("admin:" + authPassword);
  return web.header("Authorization") == expected;
}

static bool checkToken()
{
  return web.hasArg("token") && web.arg("token") == authToken;
}

static void requireAuth()
{
  web.sendHeader("WWW-Authenticate", "Basic realm=\"C3 NetGuard\"");
  web.send(401, "text/plain", "auth required");
}

// ---- web server ----
static String macStr(const uint8_t *m)
{
  char s[18];
  snprintf(s, sizeof(s), "%02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]);
  return String(s);
}

static String jesc(const String &s)
{
  String o;
  for (char ch : s)
  {
    if (ch == '"' || ch == '\\')
      o += '\\';
    o += ch;
  }
  return o;
}

static void sendCorsHeaders() {
  web.sendHeader("Access-Control-Allow-Origin", "*");
  web.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  web.sendHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

static void handleRoot()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  if (web.header("If-None-Match") == DASHBOARD_ETAG)
  {
    web.send(304);
    return;
  }
  web.sendHeader("Cache-Control", "max-age=3600");
  web.sendHeader("ETag", DASHBOARD_ETAG);
  web.send_P(200, "text/html", PAGE);
}

static void saveConfig();

static void handleStats()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  uint32_t up = millis() / 1000;
  char ut[24];
  snprintf(ut, sizeof(ut), "%lud %luh %lum", up / 86400, (up % 86400) / 3600, (up % 3600) / 60);

  String j = "{\"ip\":\"" + WiFi.localIP().toString() + "\"" +
             ",\"rssi\":" + WiFi.RSSI() + ",\"temp\":" + String(temperatureRead(), 1) +
             ",\"heap\":" + ESP.getFreeHeap() + ",\"uptime\":\"" + ut + "\"" +
             ",\"dhcp\":" + (dhcpEnabled ? "true" : "false") +
             ",\"defpwd\":" + (authPassword == DEFAULT_PASS ? "true" : "false") +
             ",\"wifi\":\"" + jesc(WiFi.SSID()) + "\"" +
             ",\"token\":\"" + jesc(authToken) + "\"" +
             ",\"timezone\":\"" + jesc(timezoneStr) + "\"" +
             ",\"version\":\"" + jesc(FW_VERSION) + "\"" +
             ",\"profiles\":[";
  for (int i = 0; i < numProfiles; i++)
  {
    j += (i ? "," : "");
    j += "{\"name\":\"" + jesc(profiles[i].name) + "\"" +
         ",\"start\":" + String(profiles[i].startBedtimeMinutes) +
         ",\"end\":" + String(profiles[i].endBedtimeMinutes) +
         ",\"dns\":\"" + profiles[i].upstreamDNS.toString() + "\"}";
  }
  j += "],\"clients\":[";
  for (int i = 0; i < numClients; i++)
  {
    Dev &c = clients[i];
    IPAddress ip(c.ip);
    bool blocked = c.manualBlock || isTimeBlocked(c.currentProfileId);
    j += (i ? "," : "");
    j += "{\"ip\":\"" + ip.toString() + "\",\"mac\":\"" + jesc(c.mac) +
         "\",\"name\":\"" + jesc(c.friendlyName) +
         "\",\"profile\":" + String(c.currentProfileId);
    j += ",\"manualBlock\":" + (c.manualBlock ? String("true") : String("false"));
    j += ",\"blocked\":" + (blocked ? String("true") : String("false")) + "}";
  }
  j += "]}";
  web.send(200, "application/json", j);
}

static void handleSaveProfiles()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  if (!checkToken())
  {
    web.send(403, "text/plain", "bad token");
    return;
  }

  if (!web.hasArg("plain"))
  {
    web.send(400, "text/plain", "missing body");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, web.arg("plain"));
  if (err)
  {
    web.send(400, "text/plain", "invalid json");
    return;
  }

  if (!doc["timezone"].isNull())
  {
    timezoneStr = doc["timezone"].as<String>();
    setupTime();
  }

  if (doc["profiles"].is<JsonArray>())
  {
    JsonArray profArray = doc["profiles"].as<JsonArray>();
    int idx = 0;
    for (JsonObject p : profArray)
    {
      if (idx >= 10)
        break;
      if (!p["name"].isNull())
        profiles[idx].name = p["name"].as<String>();
      if (!p["start"].isNull())
        profiles[idx].startBedtimeMinutes = p["start"].as<int>();
      if (!p["end"].isNull())
        profiles[idx].endBedtimeMinutes = p["end"].as<int>();
      if (!p["dns"].isNull())
      {
        IPAddress ip;
        if (ip.fromString(p["dns"].as<const char *>()))
        {
          profiles[idx].upstreamDNS = ip;
        }
      }
      idx++;
    }
    if (idx > 0)
    {
      numProfiles = idx;
    }
  }

  saveConfig();
  web.send(200, "text/plain", "ok");
}

static void handleAssignProfile()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  if (!checkToken())
  {
    web.send(403, "text/plain", "bad token");
    return;
  }

  if (!web.hasArg("mac") || !web.hasArg("profile"))
  {
    web.send(400, "text/plain", "missing parameters");
    return;
  }

  String mac = web.arg("mac");
  uint8_t pid = web.arg("profile").toInt();
  if (pid >= numProfiles)
    pid = 0;

  bool found = false;
  for (int i = 0; i < numClients; i++)
  {
    if (clients[i].mac.equalsIgnoreCase(mac))
    {
      clients[i].currentProfileId = pid;
      if (web.hasArg("name"))
      {
        clients[i].friendlyName = web.arg("name");
      }
      if (web.hasArg("block"))
      {
        clients[i].manualBlock = (web.arg("block") == "true");
      }
      found = true;
      break;
    }
  }
  if (!found && numClients < MAX_CLIENTS)
  {
    clients[numClients].ip = 0;
    clients[numClients].mac = mac;
    clients[numClients].friendlyName = web.hasArg("name") ? web.arg("name") : "";
    clients[numClients].currentProfileId = pid;
    clients[numClients].manualBlock = web.hasArg("block") ? (web.arg("block") == "true") : false;
    clients[numClients].lastSeen = millis();
    numClients++;
  }

  saveConfig();
  web.send(200, "text/plain", "ok");
}

static void handleSetPass()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  if (!checkToken())
  {
    web.send(403, "text/plain", "bad token");
    return;
  }
  
  if (!web.hasArg("old") || web.arg("old") != authPassword)
  {
    web.send(403, "text/plain", "invalid current password");
    return;
  }

  String newPass = web.arg("p");
  newPass.trim();
  if (newPass.length() < 4)
  {
    web.send(400, "text/plain", "password too short");
    return;
  }
  saveAuth(newPass);
  web.send(200, "text/plain", "ok");
}

static void handleDhcpToggle()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  if (!checkToken())
  {
    web.send(403, "text/plain", "bad token");
    return;
  }
  dhcpEnabled = !dhcpEnabled;
  saveDhcpCfg();
  if (dhcpEnabled)
  {
    initDhcpPool();
    dhcpSock.begin(DHCP_PORT);
    web.send(200, "text/plain", "DHCP enabled — disable your router's DHCP!");
  }
  else
  {
    dhcpSock.stop();
    web.send(200, "text/plain", "DHCP disabled");
  }
}

static void handleSetWifi()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  if (!checkToken())
  {
    web.send(403, "text/plain", "bad token");
    return;
  }
  String ssid = web.arg("ssid");
  String pass = web.arg("pass");
  if (ssid.length() == 0)
  {
    web.send(400, "text/plain", "missing ssid");
    return;
  }
  saveWifiCfg(ssid, pass);
  web.send(200, "text/plain", "saved — rebooting...");
  delay(500);
  ESP.restart();
}

// ---- remote config ----
static void loadUpdateCfg()
{
  File f = LittleFS.open("/update.cfg", "r");
  if (!f)
    return;
  updateUrl = f.readStringUntil('\n');
  updateUrl.trim();
  String iv = f.readStringUntil('\n');
  iv.trim();
  if (iv.length())
    updateIntervalH = iv.toInt();
  f.close();
  if (updateIntervalH < 1)
    updateIntervalH = 1;
}

static void saveUpdateCfg()
{
  File f = LittleFS.open("/update.cfg", "w");
  if (!f)
    return;
  f.println(updateUrl);
  f.println(updateIntervalH);
  f.close();
}

static bool fetchBlocklist(String url)
{
  (void)url;
  updateStatus = "disabled";
  return false;
}

// ---- firmware OTA ----
static void handleFwUpdateDone()
{
  bool ok = !Update.hasError();
  web.send(ok ? 200 : 500, "text/plain", ok ? "ok, rebooting" : "firmware update failed");
  if (ok)
  {
    delay(300);
    ESP.restart();
  }
}

static void handleFwUpload()
{
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  HTTPUpload &u = web.upload();
  if (u.status == UPLOAD_FILE_START)
  {
    LOG("[fw-ota] %s\n", u.filename.c_str());
    if (!Update.begin(UPDATE_SIZE_UNKNOWN))
      Update.printError(Serial);
  }
  else if (u.status == UPLOAD_FILE_WRITE)
  {
    if (Update.write(u.buf, u.currentSize) != u.currentSize)
      Update.printError(Serial);
  }
  else if (u.status == UPLOAD_FILE_END)
  {
    if (Update.end(true))
      LOG("[fw-ota] %u bytes OK\n", u.totalSize);
    else
      Update.printError(Serial);
  }
  else if (u.status == UPLOAD_FILE_ABORTED)
  {
    Update.abort();
    LOGN("[fw-ota] aborted");
  }
}

// ---- WiFi config ----
static bool loadWifiCfg(String &ssid, String &pass)
{
  File f = LittleFS.open("/wifi.cfg", "r");
  if (!f)
    return false;

  ssid = f.readStringUntil('\n');
  pass = f.readStringUntil('\n');
  f.close();

  ssid.trim();
  pass.trim();

  return ssid.length() > 0;
}

static void saveWifiCfg(const String &ssid, const String &pass)
{
  File f = LittleFS.open("/wifi.cfg", "w");
  if (!f)
    return;
  f.println(ssid);
  f.println(pass);
  f.close();
}

static bool connectWiFi()
{
  String ssid, pass;
  bool hasCfg = loadWifiCfg(ssid, pass);

  String trySsid = "";
  String tryPass = "";

  if (hasCfg)
  {
    trySsid = ssid;
    tryPass = pass;
  }
  else if (String(WIFI_SSID) != "YOUR_WIFI_SSID")
  {
    trySsid = WIFI_SSID;
    tryPass = WIFI_PASS;
  }

  if (trySsid.length() == 0)
    return false;

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false);
  delay(100);

  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_11dBm);

  LOG("[WiFi] Connecting to: '%s'\n", trySsid.c_str());

  WiFi.begin(trySsid.c_str(), tryPass.c_str());

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - t0) < 15000)
  {
    delay(500);
    LOG(".");
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    LOGN("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
    return true;
  }

  LOGN("\n[WiFi] Connection Failed. Status code: " + String(WiFi.status()));
  WiFi.disconnect(false);
  return false;
}

// ---- captive portal ----
static WiFiUDP captiveDns;

static void handleCaptiveDns()
{
  int sz = captiveDns.parsePacket();
  if (sz <= 0)
    return;
  IPAddress cip = captiveDns.remoteIP();
  uint16_t cport = captiveDns.remotePort();
  int qlen = captiveDns.read(dnsBuf, sizeof(dnsBuf));
  if (qlen < 13)
    return;

  dnsBuf[2] = 0x81;
  dnsBuf[3] = 0x80;
  dnsBuf[6] = 0;
  dnsBuf[7] = 1;
  dnsBuf[8] = 0;
  dnsBuf[9] = 0;
  dnsBuf[10] = 0;
  dnsBuf[11] = 0;
  char domain[256];
  uint16_t qtype;
  int qend;
  parseQuery(dnsBuf, qlen, domain, &qtype, &qend);
  if (qtype == 1)
  {
    uint8_t ans[] = {0xC0, 0x0C, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 192, 168, 4, 1};
    memcpy(dnsBuf + qend, ans, sizeof(ans));
    captiveDns.beginPacket(cip, cport);
    captiveDns.write(dnsBuf, qend + sizeof(ans));
    captiveDns.endPacket();
  }
}

static void runCaptivePortal()
{
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_11dBm);

  WiFi.softAP("C3NetGuard-Setup");
  LOGN("\n[captive] AP: C3NetGuard-Setup — connect and open http://192.168.4.1");

  captiveDns.begin(53);

  web.on("/", []()
         { web.send(200, "text/html", PORTAL_HTML); });
  web.on("/generate_204", []()
         { web.send(200, "text/html", PORTAL_HTML); });
  web.on("/gen_204", []()
         { web.send(200, "text/html", PORTAL_HTML); });
  web.on("/hotspot-detect.html", []()
         { web.send(200, "text/html", PORTAL_HTML); });
  web.on("/nconnect.txt", []()
         { web.send(200, "text/html", PORTAL_HTML); });

  web.on("/scan-wifi", []()
         {
    int n = WiFi.scanNetworks();
    String json = "[";
    for (int i = 0; i < n; ++i) {
      if (i > 0) json += ",";
      json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) +
              ",\"sec\":" + (WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false") + "}";
    }
    json += "]";
    web.send(200, "application/json", json);
    WiFi.scanDelete(); });

  web.on("/save-wifi", HTTP_POST, []()
         {
    String ssid = web.arg("ssid");
    String pass = web.arg("pass");
    if (ssid.length() == 0) { web.send(400, "text/html", "<h1>Missing SSID</h1>"); return; }
    saveWifiCfg(ssid, pass);
    web.send(200, "text/html", "<h1>Saved! Rebooting...</h1><p>Connect to your WiFi and find the device at c3netguard.local</p>");
    delay(1500);
    ESP.restart(); });

  web.onNotFound([]()
                 {
    web.sendHeader("Location", "http://192.168.4.1/", true);
    web.send(302, "text/plain", ""); });

  web.begin();

  while (true)
  {
    web.handleClient();
    handleCaptiveDns();
    delay(2);
  }
}

// ---- DHCP config persistence ----
static void loadDhcpCfg()
{
  File f = LittleFS.open("/dhcp.cfg", "r");
  if (!f)
    return;
  String v = f.readStringUntil('\n');
  v.trim();
  dhcpEnabled = (v == "1");
  f.close();
}

static void saveDhcpCfg()
{
  File f = LittleFS.open("/dhcp.cfg", "w");
  if (!f)
    return;
  f.println(dhcpEnabled ? "1" : "0");
  f.close();
}

// ---- profile & client config persistence ----
static void initDefaultProfiles()
{
  profiles[0].name = "Default";
  profiles[0].startBedtimeMinutes = -1;
  profiles[0].endBedtimeMinutes = -1;
  profiles[0].upstreamDNS = IPAddress(9, 9, 9, 9);

  profiles[1].name = "Kids";
  profiles[1].startBedtimeMinutes = 1260;
  profiles[1].endBedtimeMinutes = 420;
  profiles[1].upstreamDNS = IPAddress(1, 1, 1, 3);

  profiles[2].name = "Adults";
  profiles[2].startBedtimeMinutes = -1;
  profiles[2].endBedtimeMinutes = -1;
  profiles[2].upstreamDNS = IPAddress(1, 1, 1, 1);

  numProfiles = 3;
  timezoneStr = "UTC0";
}

static void saveConfig()
{
  JsonDocument doc;
  doc["timezone"] = timezoneStr;

  for (int i = 0; i < numProfiles; i++)
  {
    doc["profiles"][i]["name"] = profiles[i].name;
    doc["profiles"][i]["start"] = profiles[i].startBedtimeMinutes;
    doc["profiles"][i]["end"] = profiles[i].endBedtimeMinutes;
    doc["profiles"][i]["dns"] = profiles[i].upstreamDNS.toString();
  }

  for (int i = 0; i < numClients; i++)
  {
    if (clients[i].mac.length() > 0)
    {
      JsonObject ms = doc["macs"][clients[i].mac].to<JsonObject>();
      ms["profile"] = clients[i].currentProfileId;
      ms["name"] = clients[i].friendlyName;
      ms["manual"] = clients[i].manualBlock;
    }
  }

  File f = LittleFS.open("/config.json", "w");
  if (!f)
    return;
  serializeJson(doc, f);
  f.close();
}

static void loadConfig()
{
  initDefaultProfiles();

  File f = LittleFS.open("/config.json", "r");
  if (!f)
  {
    saveConfig();
    return;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, f);
  f.close();

  if (error)
  {
    LOGN("[cfg] Failed to parse /config.json, saving defaults");
    saveConfig();
    return;
  }

  if (!doc["timezone"].isNull())
  {
    timezoneStr = doc["timezone"].as<String>();
  }

  if (doc["profiles"].is<JsonArray>())
  {
    JsonArray profArray = doc["profiles"].as<JsonArray>();
    int idx = 0;
    for (JsonObject p : profArray)
    {
      if (idx >= 10)
        break;
      if (!p["name"].isNull())
        profiles[idx].name = p["name"].as<String>();
      if (!p["start"].isNull())
        profiles[idx].startBedtimeMinutes = p["start"].as<int>();
      if (!p["end"].isNull())
        profiles[idx].endBedtimeMinutes = p["end"].as<int>();
      if (!p["dns"].isNull())
      {
        IPAddress ip;
        if (ip.fromString(p["dns"].as<const char *>()))
        {
          profiles[idx].upstreamDNS = ip;
        }
      }
      idx++;
    }
    if (idx > 0)
    {
      numProfiles = idx;
    }
  }

  if (doc["macs"].is<JsonObject>())
  {
    JsonObject macsObj = doc["macs"].as<JsonObject>();
    for (JsonPair kv : macsObj)
    {
      String mac = kv.key().c_str();
      uint8_t pid = 0;
      String fname = "";
      bool manBlocked = false;
      if (kv.value().is<JsonObject>())
      {
        JsonObject valObj = kv.value().as<JsonObject>();
        if (!valObj["profile"].isNull())
          pid = valObj["profile"].as<uint8_t>();
        if (!valObj["name"].isNull())
          fname = valObj["name"].as<String>();
        if (!valObj["manual"].isNull())
          manBlocked = valObj["manual"].as<bool>();
      }
      else
      {
        pid = kv.value().as<uint8_t>();
      }

      bool found = false;
      for (int i = 0; i < numClients; i++)
      {
        if (clients[i].mac.equalsIgnoreCase(mac))
        {
          clients[i].currentProfileId = pid;
          clients[i].friendlyName = fname;
          clients[i].manualBlock = manBlocked;
          found = true;
          break;
        }
      }
      if (!found && numClients < MAX_CLIENTS)
      {
        clients[numClients].ip = 0;
        clients[numClients].mac = mac;
        clients[numClients].friendlyName = fname;
        clients[numClients].currentProfileId = pid;
        clients[numClients].manualBlock = manBlocked;
        clients[numClients].lastSeen = 0;
        numClients++;
      }
    }
  }
}

// ---- setup / loop ----
void setup()
{
  Serial.begin(115200);
  delay(300);
  LOGN("\n[c3-netguard] booting");

  if (!LittleFS.begin(true))
    LOGN("LittleFS FAILED");

  loadAuth();
  loadCustom();
  loadConfig();
  setupTime();
  loadUpdateCfg();
  loadDhcpCfg();
  // reopenBlocklist();
  LOG("[cfg] custom:%d auth:%s\n", numCustom, authPassword.c_str());
  LOGN("[cfg] dashboard password: " + authPassword);

  if (!connectWiFi())
  {
    runCaptivePortal();
    return;
  }

  if (MDNS.begin("c3netguard"))
  {
    MDNS.addService("http", "tcp", 80);
    LOGN("dashboard: http://c3netguard.local");
  }

  dnsServer.begin(DNS_PORT);
  upstream.begin(0);
  tcpUpstream.begin(0);
  tcpDnsServer.begin();
  web.collectHeaders(COLLECTED_HEADERS, sizeof(COLLECTED_HEADERS) / sizeof(char *));
  web.on("/", HTTP_GET, handleRoot);
  web.on("/stats.json", HTTP_GET, handleStats);
  web.on("/api/profiles", HTTP_POST, handleSaveProfiles);
  web.on("/api/assign", HTTP_POST, handleAssignProfile);
  web.on("/setpass", HTTP_POST, handleSetPass);
  // web.on("/ban", handleBan);
  // web.on("/addblock", handleAddBlock);
  // web.on("/unblock", handleUnblock);
  // web.on("/upload", HTTP_POST, handleUploadDone, handleUpload);
  web.on("/update", HTTP_POST, handleFwUpdateDone, handleFwUpload);
  web.on("/fetchnow", HTTP_POST, []()
         {
    if (!checkAuth()) { requireAuth(); return; }
    if (!checkToken()) { web.send(403, "text/plain", "bad token"); return; }
    fetchBlocklist(updateUrl);
    web.send(200, "text/plain", updateStatus); });
  web.on("/setupdate", HTTP_POST, []()
         {
    if (!checkAuth()) { requireAuth(); return; }
    if (!checkToken()) { web.send(403, "text/plain", "bad token"); return; }
    if (web.hasArg("u")) updateUrl = web.arg("u");
    if (web.hasArg("h")) { updateIntervalH = web.arg("h").toInt(); if (updateIntervalH < 1) updateIntervalH = 1; }
    saveUpdateCfg();
    web.send(200, "text/plain", "ok"); });
  web.on("/dhcp", HTTP_POST, handleDhcpToggle);
  web.on("/setwifi", HTTP_POST, handleSetWifi);

  web.onNotFound([]() {
    if (web.method() == HTTP_OPTIONS) {
      sendCorsHeaders();
      web.send(204);
    } else {
      sendCorsHeaders();
      web.send(404, "text/plain", "Not Found");
    }
  });

  web.begin();

  ArduinoOTA.setHostname("c3netguard");
  ArduinoOTA.begin();

  if (dhcpEnabled)
  {
    initDhcpPool();
    dhcpSock.begin(DHCP_PORT);
    LOGN("DHCP server enabled on :67");
  }

  LOGN("DNS :53 (UDP+TCP) + dashboard :80 + OTA up");
}

void loop()
{
  ArduinoOTA.handle();
  web.handleClient();
  handleDns();
  pollUpstream(dnsBuf, DNS_BUF_SIZE);
  expirePending();
  handleTcpDns();
  if (dhcpEnabled)
    handleDhcp();

  if (pendingCount > 0)
    lastDnsActivityMs = millis();
}