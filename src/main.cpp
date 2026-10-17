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
#include <Preferences.h>
#include <algorithm>
#include "lwip/etharp.h"
#include "lwip/netif.h"
#include "lwip/tcpip.h"
#include "lwip/dns.h"
#include "secrets.h"
#include "scheduler.h"
#include "blocklist_parse.h"
#include "http_date.h"
#include "dashboard_html.h"

// ---- config ----
static const IPAddress UPSTREAM(9, 9, 9, 9);
static const uint16_t DNS_PORT = 53;
static const uint16_t DHCP_PORT = 67;
static const char *BLOCKLIST_PATH = "/blocklist.bin";
static const int HASH_BYTES = 5;
static const uint64_t HASH_MASK = (1ULL << (HASH_BYTES * 8)) - 1;
static const int DNS_BUF_SIZE = 1232;
static const int MAX_PENDING = 64;
static const int MAX_TCP_DNS = 4;
static const int DNS_BURST = 8;               // packets handled per loop pass
static const uint32_t TCP_DNS_IDLE_MS = 3000;
static const uint32_t MAX_FORWARD_TTL = 300;  // a new block takes effect within 5 min
static const uint32_t RESTRICTED_FORWARD_TTL = 60; // profiles other than Default: within 1 min
static const int MAX_QLOG = 200;
static const int QLOG_DOMAIN_LEN = 52;
static const int MAX_TOP_BLOCKED = 32;
static const int MAX_CLIENTS = 96;
static const int MAX_CUSTOM = 200;
static const int MAX_DHCP_LEASES = 100;
static const uint32_t MAX_UPDATE_INTERVAL_H = 168;
static const int MAX_PROFILE_LIMITS = 96;
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
String updateUrl;
uint32_t updateIntervalH = 24;
static uint32_t lastDnsActivityMs = 0;
bool dhcpEnabled = false;
static void saveDhcpCfg();
static void saveWifiCfg(const String &ssid, const String &pass);

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
    char norm[256];
    size_t n = extractBlocklistDomain(l.c_str(), l.length(), norm, sizeof(norm));
    if (n)
    {
      customDom[numCustom] = String(norm);
      customHash[numCustom] = fnv40(norm, n);
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
  char norm[256];
  size_t n = extractBlocklistDomain(d.c_str(), d.length(), norm, sizeof(norm));
  if (!n || numCustom >= MAX_CUSTOM)
    return false;
  d = String(norm);
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

// ---- blocklist (sorted 40-bit hashes on flash) ----
// File layout: "NGB1" | count:u32 | start[257]:u32 | count x 5-byte LE hashes, ascending.
// start[b] indexes the first hash whose top byte is b, so a lookup is a binary search
// over one bucket (~log2(count/256) flash reads).
static const char BL_MAGIC[4] = {'N', 'G', 'B', '1'};
static const int BL_BUCKETS = 256;
static const uint32_t BL_HEADER_SIZE = 8 + (BL_BUCKETS + 1) * 4;
static const char *BLOCKLIST_NEW = "/blocklist.new";
static const char *BLOCKLIST_RAW = "/blocklist.raw";
static const uint32_t BL_MAX_DOMAINS = 160000;
static const size_t BL_FS_SLACK = 64 * 1024; // keep room for config files
static const uint32_t BL_RETRY_MS = 30UL * 60 * 1000;
static const uint32_t BL_FIRST_FETCH_MS = 60000;

File blocklist;
uint32_t blCount = 0;
static uint32_t blStart[BL_BUCKETS + 1];

static inline uint8_t blBucket(uint64_t h) { return (uint8_t)(h >> 32); }

static bool inBlocklist(uint64_t h)
{
  if (!blocklist || blCount == 0)
    return false;
  uint8_t b = blBucket(h);
  int32_t lo = (int32_t)blStart[b], hi = (int32_t)blStart[b + 1] - 1;
  uint8_t buf[HASH_BYTES];
  while (lo <= hi)
  {
    int32_t mid = (lo + hi) >> 1;
    blocklist.seek(BL_HEADER_SIZE + (uint32_t)mid * HASH_BYTES);
    if (blocklist.read(buf, HASH_BYTES) != HASH_BYTES)
      return false;
    uint64_t v = 0;
    for (int k = 0; k < HASH_BYTES; k++)
      v |= (uint64_t)buf[k] << (8 * k);
    if (v < h)
      lo = mid + 1;
    else if (v > h)
      hi = mid - 1;
    else
      return true;
  }
  return false;
}

// Matches the domain and each parent domain (never a bare TLD) against the custom
// list and, when the profile uses it, the downloaded blocklist.
static bool isListed(const char *domain, size_t dlen, bool useBlocklist)
{
  const char *p = domain;
  size_t remaining = dlen;
  while (remaining > 0)
  {
    uint64_t h = fnv40(p, remaining);
    if (inCustom(h) || (useBlocklist && inBlocklist(h)))
      return true;
    const char *dot = (const char *)memchr(p, '.', remaining);
    if (!dot)
      break;
    remaining -= (size_t)(dot - p) + 1;
    p = dot + 1;
    if (!memchr(p, '.', remaining))
      break;
  }
  return false;
}

static void closeBlocklist()
{
  if (blocklist)
    blocklist.close();
  blCount = 0;
}

static void reopenBlocklist()
{
  closeBlocklist();
  blocklist = LittleFS.open(BLOCKLIST_PATH, "r");
  if (!blocklist)
    return;
  uint8_t hdr[8];
  bool ok = blocklist.read(hdr, 8) == 8 && memcmp(hdr, BL_MAGIC, 4) == 0 &&
            blocklist.read((uint8_t *)blStart, sizeof(blStart)) == sizeof(blStart);
  uint32_t count = hdr[4] | (hdr[5] << 8) | (hdr[6] << 16) | ((uint32_t)hdr[7] << 24);
  ok = ok && blStart[0] == 0 && blStart[BL_BUCKETS] == count &&
       blocklist.size() == BL_HEADER_SIZE + (size_t)count * HASH_BYTES;
  for (int b = 0; ok && b < BL_BUCKETS; b++)
    ok = blStart[b] <= blStart[b + 1];
  if (!ok)
  {
    LOGN("[bl] invalid blocklist file");
    blocklist.close();
    return;
  }
  blCount = count;
  LOG("[bl] %u domains\n", blCount);
}

// ---- blocklist download + build (background task) ----
// Runs in its own task so DNS keeps answering during the download and the sort.
// The main loop owns the open blocklist file; the task only asks it to drop or swap.
static volatile bool blBuildRunning = false;
static volatile bool blBuildReady = false;   // /blocklist.new is complete, swap it in
static volatile bool blDropRequested = false; // task needs the old file's flash space
static volatile bool blBuildFailed = false;
static volatile bool blTruncated = false; // last build hit the flash limit
static char blStatus[96] = "never";
static uint32_t blNextFetchMs = 0;

// Raw hashes are split into parts by their top bits so each part can be deleted as soon
// as it is sorted: peak flash use is about 1.25x the final list instead of 2x.
static const int BL_RAW_PARTS = 4;
static const int BL_BUCKETS_PER_PART = BL_BUCKETS / BL_RAW_PARTS;

static String rawPartPath(int part)
{
  return String(BLOCKLIST_RAW) + part;
}

static void removeRawParts()
{
  for (int p = 0; p < BL_RAW_PARTS; p++)
    LittleFS.remove(rawPartPath(p));
}

// Asks the main loop to close and delete the current list, then waits for it
static void dropCurrentBlocklist()
{
  blDropRequested = true;
  while (blDropRequested)
    vTaskDelay(10);
}

// Receives the HTTP body, splits it into lines and appends each domain's hash to a raw part
class BlocklistSink : public Stream
{
public:
  File raw[BL_RAW_PARTS];
  uint32_t counts[BL_BUCKETS] = {0};
  uint32_t total = 0;
  uint32_t capWithOld = 0; // fits next to the current list
  uint32_t cap = 0;        // fits once the current list is dropped
  bool truncated = false;

  size_t write(uint8_t ch) override
  {
    if (ch == '\n')
    {
      endLine();
      return 1;
    }
    if (lineLen < sizeof(line))
      line[lineLen++] = (char)ch;
    else
      overflow = true;
    return 1;
  }
  size_t write(const uint8_t *buf, size_t n) override
  {
    for (size_t i = 0; i < n; i++)
      write(buf[i]);
    return n;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}

  void endLine()
  {
    if (!overflow && lineLen)
    {
      char dom[256];
      size_t dl = extractBlocklistDomain(line, lineLen, dom, sizeof(dom));
      if (dl)
        add(fnv40(dom, dl));
    }
    lineLen = 0;
    overflow = false;
  }
  void finish()
  {
    endLine();
    flushParts();
  }

private:
  char line[256];
  size_t lineLen = 0;
  bool overflow = false;
  bool droppedOld = false;
  uint8_t out[BL_RAW_PARTS][HASH_BYTES * 40];
  size_t outLen[BL_RAW_PARTS] = {0};

  void flushParts()
  {
    for (int p = 0; p < BL_RAW_PARTS; p++)
      if (outLen[p])
      {
        raw[p].write(out[p], outLen[p]);
        outLen[p] = 0;
      }
  }

  void add(uint64_t h)
  {
    if (total >= capWithOld && !droppedOld && capWithOld < cap)
    {
      flushParts();
      dropCurrentBlocklist(); // DNS runs without the list until the new one is ready
      droppedOld = true;
    }
    if (total >= (droppedOld ? cap : capWithOld))
    {
      truncated = true;
      return;
    }
    int p = blBucket(h) / BL_BUCKETS_PER_PART;
    for (int k = 0; k < HASH_BYTES; k++)
      out[p][outLen[p]++] = (h >> (8 * k)) & 0xFF;
    if (outLen[p] == sizeof(out[p]))
    {
      raw[p].write(out[p], outLen[p]);
      outLen[p] = 0;
    }
    counts[blBucket(h)]++;
    total++;
  }
};

static bool downloadList(const String &url, BlocklistSink &sink)
{
  WiFiClientSecure cs;
  WiFiClient cl;
  HTTPClient http;
  http.setTimeout(20000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.useHTTP10(true); // plain body, no chunk framing
  bool https = url.startsWith("https");
  if (https)
    cs.setInsecure(); // list integrity isn't security critical; no CA bundle on board
  if (!(https ? http.begin(cs, url) : http.begin(cl, url)))
  {
    snprintf(blStatus, sizeof(blStatus), "bad url");
    return false;
  }
  int code = http.GET();
  if (code != HTTP_CODE_OK)
  {
    http.end();
    snprintf(blStatus, sizeof(blStatus), "HTTP %d", code);
    return false;
  }
  int r = http.writeToStream(&sink);
  http.end();
  sink.endLine();
  if (r < 0)
  {
    snprintf(blStatus, sizeof(blStatus), "download error %d", r);
    return false;
  }
  return true;
}

// Sorts the raw parts into the final file. Within a part, buckets are grouped so each
// group fits a RAM buffer; every group costs one sequential pass over that part.
static bool sortBlocklist(const uint32_t *counts)
{
  size_t bufCap = 12000;
  uint64_t *buf = nullptr;
  while (bufCap >= 1000 && !(buf = (uint64_t *)malloc(bufCap * sizeof(uint64_t))))
    bufCap /= 2;
  if (!buf)
  {
    snprintf(blStatus, sizeof(blStatus), "out of memory");
    return false;
  }
  for (int b = 0; b < BL_BUCKETS; b++)
    if (counts[b] > bufCap)
    {
      free(buf);
      snprintf(blStatus, sizeof(blStatus), "bucket too large");
      return false;
    }

  File out = LittleFS.open(BLOCKLIST_NEW, "w");
  if (!out)
  {
    free(buf);
    snprintf(blStatus, sizeof(blStatus), "fs open failed");
    return false;
  }
  uint8_t zero[64] = {0};
  for (uint32_t w = 0; w < BL_HEADER_SIZE; w += sizeof(zero))
    out.write(zero, min((uint32_t)sizeof(zero), BL_HEADER_SIZE - w));

  static uint32_t starts[BL_BUCKETS + 1];
  uint32_t written = 0;
  uint8_t io[HASH_BYTES * 100];
  size_t ioLen = 0;
  bool ok = true;
  for (int part = 0; part < BL_RAW_PARTS && ok; part++)
  {
    File raw = LittleFS.open(rawPartPath(part), "r");
    int pEnd = (part + 1) * BL_BUCKETS_PER_PART;
    int b0 = part * BL_BUCKETS_PER_PART;
    while (b0 < pEnd)
    {
      int b1 = b0;
      size_t sum = 0;
      while (b1 < pEnd && sum + counts[b1] <= bufCap)
        sum += counts[b1++];

      size_t n = 0;
      if (raw)
      {
        raw.seek(0);
        int got;
        while ((got = raw.read(io, sizeof(io))) > 0)
        {
          for (int i = 0; i + HASH_BYTES <= got; i += HASH_BYTES)
          {
            uint64_t h = 0;
            for (int k = 0; k < HASH_BYTES; k++)
              h |= (uint64_t)io[i + k] << (8 * k);
            int bk = blBucket(h);
            if (bk >= b0 && bk < b1 && n < bufCap)
              buf[n++] = h;
          }
          vTaskDelay(1); // let the DNS loop run
        }
      }
      std::sort(buf, buf + n);

      size_t idx = 0;
      for (int b = b0; b < b1; b++)
      {
        starts[b] = written;
        while (idx < n && blBucket(buf[idx]) == b)
        {
          if (idx == 0 || buf[idx] != buf[idx - 1])
          {
            for (int k = 0; k < HASH_BYTES; k++)
              io[ioLen++] = (buf[idx] >> (8 * k)) & 0xFF;
            if (ioLen == sizeof(io))
            {
              ok = ok && out.write(io, ioLen) == ioLen;
              ioLen = 0;
            }
            written++;
          }
          idx++;
        }
      }
      b0 = b1;
    }
    if (raw)
      raw.close();
    LittleFS.remove(rawPartPath(part));
  }
  if (ioLen)
    ok = ok && out.write(io, ioLen) == ioLen;
  starts[BL_BUCKETS] = written;
  out.close();
  free(buf);
  if (!ok)
  {
    snprintf(blStatus, sizeof(blStatus), "flash full while sorting");
    return false;
  }

  File hdr = LittleFS.open(BLOCKLIST_NEW, "r+");
  if (!hdr)
  {
    snprintf(blStatus, sizeof(blStatus), "fs open failed");
    return false;
  }
  uint8_t head[8];
  memcpy(head, BL_MAGIC, 4);
  head[4] = written & 0xFF;
  head[5] = (written >> 8) & 0xFF;
  head[6] = (written >> 16) & 0xFF;
  head[7] = (written >> 24) & 0xFF;
  hdr.seek(0);
  ok = hdr.write(head, 8) == 8 && hdr.write((const uint8_t *)starts, sizeof(starts)) == sizeof(starts);
  hdr.close();
  if (!ok)
    snprintf(blStatus, sizeof(blStatus), "fs write failed");
  return ok;
}

static bool buildBlocklist(const String &urls)
{
  removeRawParts();
  LittleFS.remove(BLOCKLIST_NEW);

  size_t freeBytes = LittleFS.totalBytes() - LittleFS.usedBytes();
  File cur = LittleFS.open(BLOCKLIST_PATH, "r");
  size_t curBytes = cur ? cur.size() : 0;
  if (cur)
    cur.close();
  size_t reserve = BL_FS_SLACK + BL_HEADER_SIZE;
  size_t withOld = freeBytes > reserve ? freeBytes - reserve : 0;
  size_t withoutOld = freeBytes + curBytes > reserve ? freeBytes + curBytes - reserve : 0;

  BlocklistSink *sink = new BlocklistSink();
  // Downloading needs 1x the raw size; sorting peaks near 1.25x (+ part imbalance)
  sink->cap = min((uint32_t)(withoutOld * 10 / (13 * HASH_BYTES)), BL_MAX_DOMAINS);
  sink->capWithOld = min((uint32_t)(withOld / HASH_BYTES), sink->cap);
  bool opened = true;
  for (int p = 0; p < BL_RAW_PARTS; p++)
  {
    sink->raw[p] = LittleFS.open(rawPartPath(p), "w");
    opened = opened && sink->raw[p];
  }
  if (!opened || sink->cap == 0)
  {
    snprintf(blStatus, sizeof(blStatus), sink->cap ? "fs open failed" : "flash full");
    for (int p = 0; p < BL_RAW_PARTS; p++)
      if (sink->raw[p])
        sink->raw[p].close();
    delete sink;
    removeRawParts();
    return false;
  }

  // Several lists may be given, separated by spaces, commas or newlines
  bool anyOk = false;
  int pos = 0;
  while (pos < (int)urls.length())
  {
    int end = pos;
    while (end < (int)urls.length() && urls[end] != ' ' && urls[end] != ',' && urls[end] != '\n' && urls[end] != '\r')
      end++;
    String url = urls.substring(pos, end);
    pos = end + 1;
    if (!url.length())
      continue;
    snprintf(blStatus, sizeof(blStatus), "downloading (%u so far)", sink->total);
    LOG("[bl] GET %s\n", url.c_str());
    if (downloadList(url, *sink))
      anyOk = true;
    else if (!anyOk)
      break; // keep the old list instead of a partial one
  }
  sink->finish();
  for (int p = 0; p < BL_RAW_PARTS; p++)
    sink->raw[p].close();
  uint32_t total = sink->total;
  blTruncated = sink->truncated;
  uint32_t counts[BL_BUCKETS];
  memcpy(counts, sink->counts, sizeof(counts));
  delete sink;

  if (!anyOk || total == 0)
  {
    if (anyOk)
      snprintf(blStatus, sizeof(blStatus), "no domains found");
    removeRawParts();
    return false;
  }

  // Sorting adds the final file next to the raw parts; make room if needed
  size_t need = BL_HEADER_SIZE + (size_t)total * HASH_BYTES / 4 + BL_FS_SLACK;
  if (LittleFS.totalBytes() - LittleFS.usedBytes() < need)
    dropCurrentBlocklist();

  snprintf(blStatus, sizeof(blStatus), "sorting %u domains", total);
  if (!sortBlocklist(counts))
  {
    removeRawParts();
    LittleFS.remove(BLOCKLIST_NEW);
    return false;
  }
  return true;
}

static void blocklistTask(void *arg)
{
  String *urls = (String *)arg;
  bool ok = buildBlocklist(*urls);
  delete urls;
  if (ok)
    blBuildReady = true; // loop swaps it in and writes the final status
  else
    blBuildFailed = true; // loop schedules a retry
  blBuildRunning = false;
  vTaskDelete(nullptr);
}

static bool startBlocklistUpdate()
{
  if (blBuildRunning || blBuildReady)
    return false;
  if (!updateUrl.length())
  {
    snprintf(blStatus, sizeof(blStatus), "no url set");
    return false;
  }
  blBuildRunning = true;
  snprintf(blStatus, sizeof(blStatus), "starting");
  String *arg = new String(updateUrl);
  if (xTaskCreate(blocklistTask, "blfetch", 16384, arg, 1, nullptr) != pdPASS)
  {
    delete arg;
    blBuildRunning = false;
    snprintf(blStatus, sizeof(blStatus), "task start failed");
    return false;
  }
  return true;
}

// Main-loop side: file swaps and the update schedule
static void serviceBlocklist()
{
  if (blDropRequested)
  {
    closeBlocklist();
    LittleFS.remove(BLOCKLIST_PATH);
    blDropRequested = false;
  }
  if (blBuildReady)
  {
    closeBlocklist();
    LittleFS.remove(BLOCKLIST_PATH);
    LittleFS.rename(BLOCKLIST_NEW, BLOCKLIST_PATH);
    reopenBlocklist();
    blBuildReady = false;
    snprintf(blStatus, sizeof(blStatus), blTruncated ? "ok: %u domains (truncated, flash full)" : "ok: %u domains", blCount);
  }

  if (!updateUrl.length() || blBuildRunning)
    return;
  uint32_t now = millis();
  if (blBuildFailed)
  {
    blBuildFailed = false;
    blNextFetchMs = now + BL_RETRY_MS;
  }
  if (blNextFetchMs == 0)
  {
    blNextFetchMs = now + (blCount ? updateIntervalH * 3600000UL : BL_FIRST_FETCH_MS);
    return;
  }
  if ((int32_t)(now - blNextFetchMs) >= 0 && (now - lastDnsActivityMs) >= REMOTE_FETCH_IDLE_MS)
  {
    startBlocklistUpdate();
    blNextFetchMs = now + updateIntervalH * 3600000UL;
  }
}

static String customJson()
{
  String j;
  for (int i = 0; i < numCustom; i++)
  {
    if (i)
      j += ",";
    j += "\"" + customDom[i] + "\"";
  }
  return j;
}

// ---- profiles & clients ----
struct Profile
{
  String name;
  int startBedtimeMinutes; // Minutes since midnight (e.g. 1260 for 21:00)
  int endBedtimeMinutes;   // (e.g. 420 for 07:00)
  IPAddress upstreamDNS;
  int bedtimeMode; // 0 = Hard Blackout, 1 = Soft/App Limits
  bool useBlocklist = true; // apply the downloaded blocklist (custom domains always apply)
  bool blockDoh = false;    // refuse to resolve known DNS-over-HTTPS/TLS servers
};

Profile profiles[10]; // dynamic up to 10 profiles
String profileAppLimitsStr[10][MAX_PROFILE_LIMITS];
uint64_t profileAppLimitsHash[10][MAX_PROFILE_LIMITS];
int numProfileAppLimits[10] = {0};
int numProfiles = 3;
String timezoneStr = "UTC0";
const String FW_VERSION = "v1.0.9";

struct Dev
{
  uint32_t ip;
  String mac;
  String friendlyName;
  uint8_t currentProfileId; // Profile index
  bool manualBlock;
  uint32_t lastSeen;
  uint32_t queries;
  uint32_t blocked;
};
Dev clients[MAX_CLIENTS];
int numClients = 0;
uint32_t totalBlocked = 0, totalAllowed = 0;

// ---- query log & top blocked (RAM only, cleared on reboot) ----
enum QReason : uint8_t
{
  Q_ALLOWED = 0,
  Q_LISTED = 1,   // blocklist or custom domain
  Q_MANUAL = 2,   // device blocked by hand
  Q_BEDTIME = 3,  // hard bedtime
  Q_APPLIMIT = 4, // soft bedtime app limit
  Q_DOH = 5,      // encrypted DNS server
};

struct QLog
{
  uint32_t t; // epoch seconds (seconds since boot while the clock is unset)
  uint32_t ip;
  uint8_t mac[6];
  uint8_t reason;
  uint8_t pid;
  char d[QLOG_DOMAIN_LEN];
};
static QLog qlog[MAX_QLOG];
static int qlogHead = 0; // next slot to write
static int qlogCount = 0;

struct TopEntry
{
  char d[QLOG_DOMAIN_LEN];
  uint32_t n;
};
static TopEntry topBlocked[MAX_TOP_BLOCKED];
static int numTopBlocked = 0;

// Space-saving counter: a new domain replaces the least counted one and inherits its
// count, so heavy hitters stay in the table with bounded memory.
static void countTopBlocked(const char *d)
{
  int minIdx = 0;
  for (int i = 0; i < numTopBlocked; i++)
  {
    if (strcmp(topBlocked[i].d, d) == 0)
    {
      topBlocked[i].n++;
      return;
    }
    if (topBlocked[i].n < topBlocked[minIdx].n)
      minIdx = i;
  }
  if (numTopBlocked < MAX_TOP_BLOCKED)
  {
    strlcpy(topBlocked[numTopBlocked].d, d, QLOG_DOMAIN_LEN);
    topBlocked[numTopBlocked++].n = 1;
    return;
  }
  strlcpy(topBlocked[minIdx].d, d, QLOG_DOMAIN_LEN);
  topBlocked[minIdx].n++;
}

static void parseMac(const String &s, uint8_t *mac)
{
  unsigned int b[6] = {0};
  sscanf(s.c_str(), "%x:%x:%x:%x:%x:%x", &b[0], &b[1], &b[2], &b[3], &b[4], &b[5]);
  for (int i = 0; i < 6; i++)
    mac[i] = (uint8_t)b[i];
}

static void logQuery(Dev *c, uint32_t ip, uint8_t pid, const char *domain, uint8_t reason)
{
  if (!domain[0])
    return;
  uint32_t t = (uint32_t)time(nullptr);
  if (c)
  {
    c->queries++;
    if (reason != Q_ALLOWED)
      c->blocked++;
  }
  if (reason == Q_LISTED || reason == Q_APPLIMIT || reason == Q_DOH)
    countTopBlocked(domain);

  // Stub resolvers retry and ask for A + AAAA: collapse repeats from the same device
  if (qlogCount)
  {
    QLog &last = qlog[(qlogHead + MAX_QLOG - 1) % MAX_QLOG];
    if (last.ip == ip && last.reason == reason && t - last.t < 3 && strncmp(last.d, domain, QLOG_DOMAIN_LEN - 1) == 0)
      return;
  }
  QLog &e = qlog[qlogHead];
  e.t = t;
  e.ip = ip;
  if (c)
    parseMac(c->mac, e.mac);
  else
    memset(e.mac, 0, 6);
  e.reason = reason;
  e.pid = pid;
  strlcpy(e.d, domain, QLOG_DOMAIN_LEN);
  for (char *p = e.d; *p; p++)
    if (*p < 0x21 || *p > 0x7e)
      *p = '?'; // query names are raw bytes; keep the JSON valid
  qlogHead = (qlogHead + 1) % MAX_QLOG;
  if (qlogCount < MAX_QLOG)
    qlogCount++;
}

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

// ---- ARP warm-up ----
// A device that just booted (or every device after the C3 reboots) has no ARP entry yet,
// so its MAC is unknown and it would land on the unrestricted default profile. Drop its
// first queries while an ARP request resolves the MAC; stub resolvers retry within ~1s.
static const uint32_t ARP_WAIT_MS = 3000;
static const uint32_t ARP_REPROBE_MS = 60000;
static const int MAX_ARP_PROBES = 8;
struct ArpProbe
{
  uint32_t ip;
  uint32_t sentMs;
};
static ArpProbe arpProbes[MAX_ARP_PROBES];

static void arpRequestCb(void *arg)
{
  ip4_addr_t ipa;
  ipa.addr = (uint32_t)(uintptr_t)arg;
  if (netif_default)
    etharp_request(netif_default, &ipa);
}

static bool awaitingArp(uint32_t ip)
{
  static const uint8_t zero[6] = {0};
  uint8_t mac[6];
  getMac(ip, mac);
  if (memcmp(mac, zero, 6) != 0)
    return false;
  // IP already bound to a known device: the IP fallback in getClient handles it
  for (int i = 0; i < numClients; i++)
    if (clients[i].ip == ip && clients[i].mac != "00:00:00:00:00:00")
      return false;

  uint32_t now = millis();
  int slot = 0;
  for (int i = 0; i < MAX_ARP_PROBES; i++)
  {
    if (arpProbes[i].ip == ip)
    {
      uint32_t age = now - arpProbes[i].sentMs;
      if (age < ARP_WAIT_MS)
        return true;
      if (age < ARP_REPROBE_MS)
        return false; // ARP never answered: give up and serve it as unknown
      slot = i;
      break;
    }
    if (now - arpProbes[i].sentMs > now - arpProbes[slot].sentMs)
      slot = i;
  }
  arpProbes[slot].ip = ip;
  arpProbes[slot].sentMs = now;
  tcpip_callback(arpRequestCb, (void *)(uintptr_t)ip);
  return true;
}

static Dev *getClient(uint32_t ip)
{
  uint8_t mbuf[6];
  getMac(ip, mbuf);
  char macBuf[18];
  snprintf(macBuf, sizeof(macBuf), "%02x:%02x:%02x:%02x:%02x:%02x", mbuf[0], mbuf[1], mbuf[2], mbuf[3], mbuf[4], mbuf[5]);
  String currentMac = String(macBuf);

  // 1. Opportunistic MAC-first binding (Self-Healing)
  if (currentMac != "00:00:00:00:00:00")
  {
    for (int i = 0; i < numClients; i++)
    {
      if (clients[i].mac.equalsIgnoreCase(currentMac))
      {
        clients[i].ip = ip;
        clients[i].lastSeen = millis();
        // Clean up any IP duplicates/ghosts mapped to this IP
        for (int j = 0; j < numClients; j++)
        {
          if (i != j && clients[j].ip == ip)
          {
            clients[j].ip = 0;
          }
        }
        return &clients[i];
      }
    }
  }

  // 2. IP-first fallback (For ghost entries that don't have ARP yet)
  for (int i = 0; i < numClients; i++)
  {
    if (clients[i].ip == ip)
    {
      clients[i].lastSeen = millis();
      // If we found the true MAC dynamically, write it to the ghost to heal it
      if (currentMac != "00:00:00:00:00:00" && clients[i].mac == "00:00:00:00:00:00")
      {
        clients[i].mac = currentMac;
      }
      return &clients[i];
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
  c->mac = currentMac;
  c->friendlyName = "";
  c->currentProfileId = 0;
  c->manualBlock = false;
  c->lastSeen = millis();
  c->queries = 0;
  c->blocked = 0;
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
    const uint8_t ans[] = {0xC0, 0x0C, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 0, 0, 0, 0};
    memcpy(pkt + qend, ans, sizeof(ans));
    return qend + sizeof(ans);
  }
  if (qtype == 28)
  {
    const uint8_t ans[] = {0xC0, 0x0C, 0, 28, 0, 1, 0, 0, 0, 60, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    memcpy(pkt + qend, ans, sizeof(ans));
    return qend + sizeof(ans);
  }
  return qend;
}

// Canary domains: NXDOMAIN tells Firefox to disable DoH and Safari/iOS to disable
// iCloud Private Relay, so those clients keep using this resolver.
static const char *CANARY_DOMAINS[] = {"use-application-dns.net", "mask.icloud.com", "mask-h2.icloud.com"};

static bool isCanary(const char *domain)
{
  for (const char *d : CANARY_DOMAINS)
    if (strcmp(domain, d) == 0)
      return true;
  return false;
}

// Encrypted DNS (DoH/DoT) servers. Refusing to resolve them makes browsers, Android
// Private DNS ("automatic") and most apps fall back to plain DNS through this resolver.
// Each entry also matches its subdomains (mozilla.cloudflare-dns.com, ...).
static const char *DOH_DOMAINS[] = {
    "dns.google", "dns.google.com", "8888.google", "cloudflare-dns.com", "one.one.one.one",
    "dns.quad9.net", "dns9.quad9.net", "dns10.quad9.net", "dns11.quad9.net", "dns12.quad9.net",
    "dns.adguard.com", "dns.adguard-dns.com", "dns-unfiltered.adguard.com", "dns-family.adguard.com",
    "dns.nextdns.io", "dns.cleanbrowsing.org", "dns.alidns.com", "dns.twnic.tw", "dns.mullvad.net",
    "dns.controld.com", "freedns.controld.com", "dns.umbrella.com", "dns.sb", "dns0.eu",
    "dns.switch.ch", "dns.digitale-gesellschaft.ch", "dns.njal.la", "dnsforge.de", "ordns.he.net",
    "odvr.nic.cz", "dns.aa.net.uk", "dns.brahma.world", "dns.decloudus.com", "dns.rubyfish.cn",
    "dns.pub", "dns.oszx.co", "dns.comss.one"};

static bool endsWithDomain(const char *domain, size_t dlen, const char *entry)
{
  size_t elen = strlen(entry);
  if (dlen < elen || strcmp(domain + dlen - elen, entry) != 0)
    return false;
  return dlen == elen || domain[dlen - elen - 1] == '.';
}

static bool isDohServer(const char *domain, size_t dlen)
{
  // doh.opendns.com, doh.cleanbrowsing.org, doh.mullvad.net, doh.pub, ...
  if (dlen > 4 && strncmp(domain, "doh.", 4) == 0)
    return true;
  for (const char *d : DOH_DOMAINS)
    if (endsWithDomain(domain, dlen, d))
      return true;
  return false;
}

static int buildNxdomain(uint8_t *pkt, int qend)
{
  pkt[2] = 0x81;
  pkt[3] = 0x83;
  for (int i = 6; i < 12; i++)
    pkt[i] = 0;
  return qend;
}

// ---- clock persistence ----
// Bedtime needs wall-clock time. After a power cut the C3 can boot before NTP is
// reachable, so restore the last saved time instead of failing open. A restored clock
// runs behind by the length of the outage until NTP corrects it.
static const time_t MIN_VALID_EPOCH = 1700000000;
static const uint32_t CLOCK_SAVE_MS = 15UL * 60 * 1000;
static Preferences clockPrefs;
static volatile bool ntpSynced = false;
static bool clockRestored = false;
static bool savedAfterSync = false;
static uint32_t lastClockSaveMs = 0;

static void onNtpSync(struct timeval *tv)
{
  (void)tv;
  ntpSynced = true;
}

static void restoreClock()
{
  clockPrefs.begin("clock", false);
  uint32_t saved = clockPrefs.getUInt("epoch", 0);
  if (saved > MIN_VALID_EPOCH && time(nullptr) < MIN_VALID_EPOCH)
  {
    struct timeval tv = {(time_t)saved, 0};
    settimeofday(&tv, nullptr);
    clockRestored = true;
    LOG("[clock] restored %u (not yet NTP synced)\n", saved);
  }
}

static void serviceClock()
{
  uint32_t now = millis();
  bool firstSync = ntpSynced && !savedAfterSync;
  if (!firstSync && now - lastClockSaveMs < CLOCK_SAVE_MS)
    return;
  time_t t = time(nullptr);
  if (t < MIN_VALID_EPOCH)
    return;
  clockPrefs.putUInt("epoch", (uint32_t)t);
  lastClockSaveMs = now;
  if (ntpSynced)
    savedAfterSync = true;
}

// ---- HTTP Date fallback ----
// NTP (UDP 123) can be slow or filtered right after a power cut. Until it syncs, take the
// time from the Date header of a plain HTTP request: the internet first, then the router's
// own web page. Only a time later than the one we have is accepted, so a router with a
// stale clock can't move bedtime backwards.
static const uint32_t HTTP_TIME_RETRY_MS = 60000;
static const uint32_t HTTP_TIME_FIRST_MS = 10000;
static volatile bool httpTimeSet = false;
static volatile bool httpTimeRunning = false;
static uint32_t lastHttpTimeTryMs = 0;
static char gatewayHost[16] = "";
static uint32_t httpTimeFloor = 0; // last saved epoch, read before the task starts

static int64_t httpDateFrom(const String &url)
{
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(2000);
  http.setTimeout(2000);
  if (!http.begin(client, url))
    return 0;
  const char *keys[] = {"Date"};
  http.collectHeaders(keys, 1);
  int code = http.sendRequest("HEAD");
  int64_t t = code > 0 ? parseHttpDate(http.header("Date").c_str()) : 0;
  http.end();
  return t;
}

static void httpTimeTask(void *arg)
{
  (void)arg;
  const String urls[] = {"http://connectivitycheck.gstatic.com/generate_204", String("http://") + gatewayHost + "/"};
  for (const String &u : urls)
  {
    if (ntpSynced || u == "http:///")
      continue;
    int64_t t = httpDateFrom(u);
    time_t floor = time(nullptr);
    if ((time_t)httpTimeFloor > floor)
      floor = httpTimeFloor;
    if (floor < MIN_VALID_EPOCH)
      floor = MIN_VALID_EPOCH;
    if (t > floor && !ntpSynced)
    {
      struct timeval tv = {(time_t)t, 0};
      settimeofday(&tv, nullptr);
      httpTimeSet = true;
      LOG("[clock] set from HTTP Date of %s\n", u.c_str());
      break;
    }
  }
  httpTimeRunning = false;
  vTaskDelete(nullptr);
}

static void serviceHttpTime()
{
  uint32_t now = millis();
  if (ntpSynced || httpTimeSet || httpTimeRunning || now < HTTP_TIME_FIRST_MS || WiFi.status() != WL_CONNECTED)
    return;
  if (lastHttpTimeTryMs && now - lastHttpTimeTryMs < HTTP_TIME_RETRY_MS)
    return;
  lastHttpTimeTryMs = now;
  strlcpy(gatewayHost, WiFi.gatewayIP().toString().c_str(), sizeof(gatewayHost));
  if (strcmp(gatewayHost, "0.0.0.0") == 0)
    gatewayHost[0] = 0;
  httpTimeFloor = clockPrefs.getUInt("epoch", 0);
  httpTimeRunning = true;
  if (xTaskCreate(httpTimeTask, "httptime", 8192, nullptr, 1, nullptr) != pdPASS)
    httpTimeRunning = false;
}

static const char *clockState()
{
  if (ntpSynced)
    return "ntp";
  if (httpTimeSet)
    return "http";
  if (time(nullptr) >= MIN_VALID_EPOCH)
    return clockRestored ? "restored" : "set";
  return "unset";
}

void setupTime()
{
  if (timezoneStr.length() == 0)
  {
    timezoneStr = "UTC0"; // Fallback
  }
  // Many routers answer NTP themselves: use the gateway as the third server. lwIP keeps
  // the pointer, so the name lives in a static buffer.
  static char gwNtp[16] = "";
  IPAddress gw = WiFi.gatewayIP();
  if ((uint32_t)gw != 0)
    strlcpy(gwNtp, gw.toString().c_str(), sizeof(gwNtp));
  sntp_set_time_sync_notification_cb(onNtpSync);
  sntp_servermode_dhcp(1); // Enable DHCP provided NTP if available
  configTzTime(timezoneStr.c_str(), "pool.ntp.org", "time.nist.gov", gwNtp[0] ? gwNtp : nullptr);
}

bool isTimerActive(uint8_t profileId)
{
  if (profileId >= numProfiles)
    return false;

  int start = profiles[profileId].startBedtimeMinutes;
  int end = profiles[profileId].endBedtimeMinutes;

  if (start == -1 || end == -1)
  {
    return false;
  }

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10))
    return false; // Fail open if no time

  int currentMinutes = timeinfo.tm_hour * 60 + timeinfo.tm_min;
  return checkTimeWindow(currentMinutes, start, end);
}

bool inSoftBlockList(uint8_t pid, const char *domain, size_t len)
{
  if (len == 0 || pid >= numProfiles)
    return false;

  // Hash full domain first
  uint64_t h = fnv40(domain, len);
  for (int i = 0; i < numProfileAppLimits[pid]; i++)
  {
    if (profileAppLimitsHash[pid][i] == h)
      return true;
  }

  // Check subdomains
  int i = 0;
  while (i < len)
  {
    if (domain[i] == '.')
    {
      const char *sub = domain + i + 1;
      size_t subLen = len - i - 1;
      h = fnv40(sub, subLen);
      for (int k = 0; k < numProfileAppLimits[pid]; k++)
      {
        if (profileAppLimitsHash[pid][k] == h)
          return true;
      }
    }
    i++;
  }
  return false;
}

// ---- async DNS forwarding ----
// UDP and TCP queries share one upstream UDP socket and the pending table, so a slow
// upstream never stalls the main loop.
WiFiUDP dnsServer;
WiFiUDP upstream;

struct Pending
{
  uint32_t clientIP;
  uint16_t clientPort;
  uint16_t originalID;
  uint16_t upstreamID; // low bits = slot, high bits random (stale replies can't hit a reused slot)
  uint32_t upstreamIP;
  uint32_t sentMs;
  int8_t tcpConn; // index into tcpConns, or -1 for UDP
  uint8_t profileId;
  bool active;
};
static_assert((MAX_PENDING & (MAX_PENDING - 1)) == 0, "MAX_PENDING must be a power of two");
Pending pending[MAX_PENDING];
int pendingCount = 0;

// ---- TCP DNS connections ----
WiFiServer tcpDnsServer(DNS_PORT, MAX_TCP_DNS);

struct TcpDnsConn
{
  WiFiClient client;
  uint8_t buf[DNS_BUF_SIZE];
  uint8_t lenBuf[2];
  uint8_t lenHave;
  uint16_t need;
  uint16_t have;
  uint32_t lastMs;
  bool waiting; // query forwarded, reply pending
  bool active;
};
static TcpDnsConn tcpConns[MAX_TCP_DNS];

static void tcpClose(int i)
{
  TcpDnsConn &t = tcpConns[i];
  t.client.stop();
  t.active = false;
  t.waiting = false;
  // Forget queries still in flight for this connection so its slot can be reused safely
  for (int p = 0; p < MAX_PENDING; p++)
    if (pending[p].active && pending[p].tcpConn == i)
    {
      pending[p].active = false;
      pendingCount--;
    }
}

static void tcpReply(int i, const uint8_t *pkt, int len)
{
  TcpDnsConn &t = tcpConns[i];
  if (t.active && t.client.connected())
  {
    uint8_t lenOut[2] = {(uint8_t)(len >> 8), (uint8_t)(len & 0xFF)};
    t.client.write(lenOut, 2);
    t.client.write(pkt, len);
  }
  tcpClose(i);
}

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
      int8_t conn = pending[i].tcpConn;
      pending[i].active = false;
      pendingCount--;
      if (conn >= 0)
        tcpClose(conn);
    }
}

static int32_t getSecondsUntilBedtime(uint8_t profileId) {
  if (profileId >= numProfiles) return -1;
  int startMins = profiles[profileId].startBedtimeMinutes;
  if (startMins == -1) return -1; // No bedtime set

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return -1;

  int currentMins = timeinfo.tm_hour * 60 + timeinfo.tm_min;

  if (checkTimeWindow(currentMins, startMins, profiles[profileId].endBedtimeMinutes)) {
      return -1;
  }

  int minsUntil = startMins - currentMins;
  if (minsUntil < 0) minsUntil += 1440;

  int secsUntil = (minsUntil * 60) - timeinfo.tm_sec;
  return secsUntil;
}

static void overrideDnsTTL(uint8_t *pkt, int len, uint32_t max_ttl) {
  if (len < 12) return;

  uint16_t qdcount = (pkt[4] << 8) | pkt[5];
  uint16_t ancount = (pkt[6] << 8) | pkt[7];

  if (ancount == 0) return;

  int offset = 12;

  for (int i = 0; i < qdcount; i++) {
      while (offset < len && pkt[offset] != 0) {
          if ((pkt[offset] & 0xC0) == 0xC0) {
              offset += 2;
              break;
          } else {
              offset += pkt[offset] + 1;
          }
      }
      if (offset < len && pkt[offset] == 0) offset++;
      offset += 4;
  }

  for (int i = 0; i < ancount; i++) {
      if (offset >= len) break;

      if ((pkt[offset] & 0xC0) == 0xC0) {
          offset += 2;
      } else {
          while (offset < len && pkt[offset] != 0) {
              if ((pkt[offset] & 0xC0) == 0xC0) { offset += 2; break; }
              offset += pkt[offset] + 1;
          }
          if (offset < len && pkt[offset] == 0) offset++;
      }

      offset += 4;
      if (offset + 4 > len) break;

      uint32_t current_ttl = (pkt[offset] << 24) | (pkt[offset+1] << 16) | (pkt[offset+2] << 8) | pkt[offset+3];

      if (current_ttl > max_ttl) {
          pkt[offset]   = (max_ttl >> 24) & 0xFF;
          pkt[offset+1] = (max_ttl >> 16) & 0xFF;
          pkt[offset+2] = (max_ttl >> 8)  & 0xFF;
          pkt[offset+3] =  max_ttl        & 0xFF;
      }

      offset += 4;
      if (offset + 2 > len) break;

      uint16_t rdlength = (pkt[offset] << 8) | pkt[offset+1];
      offset += 2 + rdlength;
  }
}

// Decides how to answer a query. Returns the reply length when the answer was built in
// place (blocked / NXDOMAIN), 0 when it should be forwarded upstream, -1 to drop it.
static int judgeQuery(uint32_t ip, uint8_t *pkt, int len, uint8_t *pidOut)
{
  char domain[256];
  uint16_t qtype = 0;
  int qend = len;
  size_t dl = parseQuery(pkt, len, domain, &qtype, &qend);
  if (dl == 0)
    domain[0] = 0;

  if (dl && isCanary(domain))
    return buildNxdomain(pkt, qend);

  if (awaitingArp(ip))
    return -1; // dropped on purpose: the retry arrives once the MAC (and profile) is known

  Dev *c = getClient(ip);
  uint8_t pid = c ? c->currentProfileId : 0;
  if (pid >= numProfiles)
    pid = 0;
  *pidOut = pid;

  uint8_t reason = Q_ALLOWED;
  if (c && c->manualBlock)
    reason = Q_MANUAL;
  else if (isTimerActive(pid))
  {
    if (profiles[pid].bedtimeMode == 0)
      reason = Q_BEDTIME;
    else if (inSoftBlockList(pid, domain, dl))
      reason = Q_APPLIMIT;
  }
  if (reason == Q_ALLOWED && dl && profiles[pid].blockDoh && isDohServer(domain, dl))
    reason = Q_DOH;
  if (reason == Q_ALLOWED && dl && isListed(domain, dl, profiles[pid].useBlocklist))
    reason = Q_LISTED;

  logQuery(c, ip, pid, domain, reason);
  if (reason == Q_ALLOWED)
    return 0;
  totalBlocked++;
  if (reason == Q_DOH)
    return buildNxdomain(pkt, qend); // NXDOMAIN makes clients fall back instead of retrying
  return buildBlocked(pkt, qend, qtype);
}

static bool forwardQuery(uint8_t *pkt, int len, uint8_t pid, uint32_t cip, uint16_t cport, int8_t tcpConn)
{
  int slot = findFreeSlot();
  if (slot < 0)
    return false;
  IPAddress pDNS = profiles[pid].upstreamDNS;
  if ((uint32_t)pDNS == 0)
    pDNS = IPAddress(1, 1, 1, 1); // Sanity check fallback

  uint16_t origID = (pkt[0] << 8) | pkt[1];
  uint16_t upID = (uint16_t)((esp_random() & ~(uint32_t)(MAX_PENDING - 1)) | slot);
  pkt[0] = (upID >> 8) & 0xFF;
  pkt[1] = upID & 0xFF;
  Pending &p = pending[slot];
  p.clientIP = cip;
  p.clientPort = cport;
  p.originalID = origID;
  p.upstreamID = upID;
  p.upstreamIP = (uint32_t)pDNS;
  p.sentMs = millis();
  p.tcpConn = tcpConn;
  p.profileId = pid;
  p.active = true;
  pendingCount++;
  upstream.beginPacket(pDNS, 53);
  upstream.write(pkt, len);
  upstream.endPacket();
  totalAllowed++;
  return true;
}

static uint8_t dnsBuf[DNS_BUF_SIZE];

static void pollUpstream()
{
  for (int n = 0; n < DNS_BURST; n++)
  {
    int sz = upstream.parsePacket();
    if (sz <= 0)
      return;
    int rlen = upstream.read(dnsBuf, sizeof(dnsBuf));
    if (rlen < 12)
      continue;
    uint16_t upID = (dnsBuf[0] << 8) | dnsBuf[1];
    uint16_t slot = upID & (MAX_PENDING - 1);
    Pending &p = pending[slot];
    if (!p.active || p.upstreamID != upID || (uint32_t)upstream.remoteIP() != p.upstreamIP)
      continue;
    dnsBuf[0] = (p.originalID >> 8) & 0xFF;
    dnsBuf[1] = p.originalID & 0xFF;

    // Short TTLs make a new block (or the start of bedtime) take effect quickly
    uint32_t maxTtl = p.profileId == 0 ? MAX_FORWARD_TTL : RESTRICTED_FORWARD_TTL;
    int32_t secsUntil = getSecondsUntilBedtime(p.profileId);
    if (secsUntil > 0 && (uint32_t)secsUntil < maxTtl)
      maxTtl = (secsUntil < 15) ? 15 : (uint32_t)secsUntil;
    overrideDnsTTL(dnsBuf, rlen, maxTtl);

    int8_t conn = p.tcpConn;
    if (conn < 0)
    {
      dnsServer.beginPacket(IPAddress(p.clientIP), p.clientPort);
      dnsServer.write(dnsBuf, rlen);
      dnsServer.endPacket();
    }
    p.active = false;
    pendingCount--;
    if (conn >= 0)
      tcpReply(conn, dnsBuf, rlen);
  }
}

static void handleDns()
{
  for (int n = 0; n < DNS_BURST; n++)
  {
    int sz = dnsServer.parsePacket();
    if (sz <= 0)
      return;
    lastDnsActivityMs = millis();
    IPAddress cip = dnsServer.remoteIP();
    uint16_t cport = dnsServer.remotePort();
    int qlen = dnsServer.read(dnsBuf, sizeof(dnsBuf));
    if (qlen < 13)
      continue;

    uint8_t pid = 0;
    int rlen = judgeQuery((uint32_t)cip, dnsBuf, qlen, &pid);
    if (rlen > 0)
    {
      dnsServer.beginPacket(cip, cport);
      dnsServer.write(dnsBuf, rlen);
      dnsServer.endPacket();
    }
    else if (rlen == 0)
    {
      forwardQuery(dnsBuf, qlen, pid, (uint32_t)cip, cport, -1);
    }
  }
}

// Reads whatever has arrived on one TCP connection; acts once a full query is in.
static void serviceTcpConn(int i, uint32_t now)
{
  TcpDnsConn &t = tcpConns[i];
  if (t.waiting)
    return;
  if (!t.client.connected() && !t.client.available())
  {
    tcpClose(i);
    return;
  }
  while (t.client.available())
  {
    if (t.lenHave < 2)
    {
      int b = t.client.read();
      if (b < 0)
        break;
      t.lenBuf[t.lenHave++] = (uint8_t)b;
      if (t.lenHave == 2)
      {
        t.need = (t.lenBuf[0] << 8) | t.lenBuf[1];
        if (t.need < 13 || t.need > DNS_BUF_SIZE)
        {
          tcpClose(i);
          return;
        }
      }
      t.lastMs = now;
      continue;
    }
    int n = t.client.read(t.buf + t.have, t.need - t.have);
    if (n <= 0)
      break;
    t.have += n;
    t.lastMs = now;
    if (t.have == t.need)
      break;
  }

  if (t.lenHave == 2 && t.have == t.need)
  {
    lastDnsActivityMs = now;
    uint8_t pid = 0;
    int rlen = judgeQuery((uint32_t)t.client.remoteIP(), t.buf, t.have, &pid);
    if (rlen > 0)
      tcpReply(i, t.buf, rlen);
    else if (rlen < 0 || !forwardQuery(t.buf, t.have, pid, 0, 0, (int8_t)i))
      tcpClose(i);
    else
      t.waiting = true;
  }
  else if (now - t.lastMs > TCP_DNS_IDLE_MS)
  {
    tcpClose(i);
  }
}

static void handleTcpDns()
{
  uint32_t now = millis();
  for (int i = 0; i < MAX_TCP_DNS; i++)
  {
    if (tcpConns[i].active)
      continue;
    WiFiClient c = tcpDnsServer.accept();
    if (!c)
      break;
    TcpDnsConn &t = tcpConns[i];
    t.client = c;
    t.lenHave = 0;
    t.need = 0;
    t.have = 0;
    t.lastMs = now;
    t.waiting = false;
    t.active = true;
  }
  for (int i = 0; i < MAX_TCP_DNS; i++)
    if (tcpConns[i].active)
      serviceTcpConn(i, now);
}

// ---- DHCP server ----
// Addresses are kept in host byte order. Bound leases are saved to flash so devices keep
// their address (and INIT-REBOOT requests get ACKed) across C3 reboots.
static const uint32_t DHCP_LEASE_SECS = 43200;
static const uint32_t DHCP_OFFER_HOLD_MS = 60000;
static const uint32_t DHCP_DECLINE_HOLD_MS = 600000;
static const char *DHCP_LEASES_PATH = "/dhcp_leases.bin";
WiFiUDP dhcpSock;

struct DhcpLease
{
  uint8_t mac[6];
  uint32_t ip;
  uint32_t expiresMs;
  bool active;
  bool bound; // ACKed (vs. only offered, or held after a DECLINE)
};
DhcpLease dhcpLeases[MAX_DHCP_LEASES];

static uint32_t dhcpPoolStart = 0;
static uint32_t dhcpPoolEnd = 0;

static inline uint32_t hostIP(const IPAddress &a) { return ((uint32_t)a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]; }
static inline IPAddress toIPAddress(uint32_t h) { return IPAddress(h >> 24, (h >> 16) & 0xFF, (h >> 8) & 0xFF, h & 0xFF); }
static inline void put32(uint8_t *p, uint32_t v)
{
  p[0] = v >> 24;
  p[1] = (v >> 16) & 0xFF;
  p[2] = (v >> 8) & 0xFF;
  p[3] = v & 0xFF;
}

static void initDhcpPool()
{
  uint32_t ip = hostIP(WiFi.localIP());
  uint32_t mask = hostIP(WiFi.subnetMask());
  uint32_t net = ip & mask;
  uint32_t bcast = net | ~mask;
  dhcpPoolStart = net + 100;
  dhcpPoolEnd = net + 199;
  if (dhcpPoolEnd >= bcast)
    dhcpPoolEnd = bcast - 1;
  if (dhcpPoolStart > dhcpPoolEnd) // tiny subnet: use all of it
  {
    dhcpPoolStart = net + 1;
    dhcpPoolEnd = bcast - 1;
  }
}

static bool ipInPool(uint32_t ip)
{
  return ip >= dhcpPoolStart && ip <= dhcpPoolEnd &&
         ip != hostIP(WiFi.localIP()) && ip != hostIP(WiFi.gatewayIP());
}

static bool leaseLive(const DhcpLease &l, uint32_t now)
{
  return l.active && (int32_t)(l.expiresMs - now) > 0;
}

static DhcpLease *findLeaseByMac(const uint8_t *mac, uint32_t now)
{
  for (int i = 0; i < MAX_DHCP_LEASES; i++)
    if (leaseLive(dhcpLeases[i], now) && memcmp(dhcpLeases[i].mac, mac, 6) == 0)
      return &dhcpLeases[i];
  return nullptr;
}

static DhcpLease *findLeaseByIp(uint32_t ip, uint32_t now)
{
  for (int i = 0; i < MAX_DHCP_LEASES; i++)
    if (leaseLive(dhcpLeases[i], now) && dhcpLeases[i].ip == ip)
      return &dhcpLeases[i];
  return nullptr;
}

static uint32_t pickFreeIp(uint32_t requested, uint32_t now)
{
  if (ipInPool(requested) && !findLeaseByIp(requested, now))
    return requested;
  for (uint32_t c = dhcpPoolStart; c <= dhcpPoolEnd; c++)
    if (ipInPool(c) && !findLeaseByIp(c, now))
      return c;
  return 0;
}

static DhcpLease *allocLease(const uint8_t *mac, uint32_t ip, uint32_t now, uint32_t holdMs)
{
  for (int i = 0; i < MAX_DHCP_LEASES; i++)
    if (!leaseLive(dhcpLeases[i], now))
    {
      DhcpLease &l = dhcpLeases[i];
      memcpy(l.mac, mac, 6);
      l.ip = ip;
      l.expiresMs = now + holdMs;
      l.active = true;
      l.bound = false;
      return &l;
    }
  return nullptr;
}

static void saveDhcpLeases()
{
  File f = LittleFS.open(DHCP_LEASES_PATH, "w");
  if (!f)
    return;
  uint32_t now = millis();
  for (int i = 0; i < MAX_DHCP_LEASES; i++)
    if (leaseLive(dhcpLeases[i], now) && dhcpLeases[i].bound)
    {
      uint8_t rec[10];
      memcpy(rec, dhcpLeases[i].mac, 6);
      put32(rec + 6, dhcpLeases[i].ip);
      f.write(rec, sizeof(rec));
    }
  f.close();
}

static void loadDhcpLeases()
{
  memset(dhcpLeases, 0, sizeof(dhcpLeases));
  File f = LittleFS.open(DHCP_LEASES_PATH, "r");
  if (!f)
    return;
  uint32_t now = millis();
  uint8_t rec[10];
  while (f.read(rec, sizeof(rec)) == sizeof(rec))
  {
    uint32_t ip = ((uint32_t)rec[6] << 24) | (rec[7] << 16) | (rec[8] << 8) | rec[9];
    if (!ipInPool(ip) || findLeaseByIp(ip, now))
      continue; // pool moved (different network) or duplicate
    DhcpLease *l = allocLease(rec, ip, now, DHCP_LEASE_SECS * 1000UL);
    if (!l)
      break;
    l->bound = true;
  }
  f.close();
}

static void sendDhcpReply(const uint8_t *req, uint8_t type, uint32_t yiaddr, uint32_t ciaddr)
{
  uint8_t r[300];
  memset(r, 0, sizeof(r));
  r[0] = 2;
  r[1] = 1;
  r[2] = 6;
  memcpy(r + 4, req + 4, 4);   // xid
  memcpy(r + 10, req + 10, 2); // flags
  put32(r + 16, yiaddr);
  memcpy(r + 24, req + 24, 4);  // giaddr
  memcpy(r + 28, req + 28, 16); // chaddr
  r[236] = 0x63;
  r[237] = 0x82;
  r[238] = 0x53;
  r[239] = 0x63;

  uint32_t own = hostIP(WiFi.localIP());
  int o = 240;
  r[o++] = 53;
  r[o++] = 1;
  r[o++] = type;
  r[o++] = 54;
  r[o++] = 4;
  put32(r + o, own);
  o += 4;
  if (type != 6) // everything except NAK carries the configuration
  {
    put32(r + 20, own); // siaddr
    r[o++] = 1;
    r[o++] = 4;
    put32(r + o, hostIP(WiFi.subnetMask()));
    o += 4;
    r[o++] = 3;
    r[o++] = 4;
    put32(r + o, hostIP(WiFi.gatewayIP()));
    o += 4;
    r[o++] = 6; // DNS: only us, so there is no fallback resolver to escape to
    r[o++] = 4;
    put32(r + o, own);
    o += 4;
    r[o++] = 51;
    r[o++] = 4;
    put32(r + o, DHCP_LEASE_SECS);
    o += 4;
    r[o++] = 58;
    r[o++] = 4;
    put32(r + o, DHCP_LEASE_SECS / 2);
    o += 4;
    r[o++] = 59;
    r[o++] = 4;
    put32(r + o, DHCP_LEASE_SECS / 8 * 7);
    o += 4;
  }
  r[o++] = 0xFF;

  // A client without an address can't receive unicast yet: broadcast (RFC 2131 4.1)
  bool unicast = ciaddr != 0 && type != 6;
  dhcpSock.beginPacket(unicast ? toIPAddress(ciaddr) : IPAddress(255, 255, 255, 255), 68);
  dhcpSock.write(r, sizeof(r)); // padded to the 300-byte BOOTP minimum
  dhcpSock.endPacket();
}

static void handleDhcp()
{
  int sz = dhcpSock.parsePacket();
  if (sz <= 0)
    return;
  uint8_t req[548];
  int len = dhcpSock.read(req, sizeof(req));
  if (len < 240 || req[0] != 1 || req[1] != 1 || req[2] != 6)
    return;
  if (req[236] != 0x63 || req[237] != 0x82 || req[238] != 0x53 || req[239] != 0x63)
    return;

  uint8_t msgType = 0;
  uint32_t reqIP = 0, serverId = 0;
  int oi = 240;
  while (oi < len && req[oi] != 0xFF)
  {
    uint8_t opt = req[oi++];
    if (opt == 0)
      continue;
    if (oi >= len)
      break;
    uint8_t optLen = req[oi++];
    if (oi + optLen > len)
      break;
    if (opt == 53 && optLen == 1)
      msgType = req[oi];
    if (opt == 50 && optLen == 4)
      reqIP = ((uint32_t)req[oi] << 24) | (req[oi + 1] << 16) | (req[oi + 2] << 8) | req[oi + 3];
    if (opt == 54 && optLen == 4)
      serverId = ((uint32_t)req[oi] << 24) | (req[oi + 1] << 16) | (req[oi + 2] << 8) | req[oi + 3];
    oi += optLen;
  }

  const uint8_t *mac = req + 28;
  uint32_t ciaddr = ((uint32_t)req[12] << 24) | (req[13] << 16) | (req[14] << 8) | req[15];
  uint32_t now = millis();
  bool forUs = serverId == 0 || serverId == hostIP(WiFi.localIP());

  switch (msgType)
  {
  case 1: // DISCOVER
  {
    DhcpLease *l = findLeaseByMac(mac, now);
    if (!l)
    {
      uint32_t ip = pickFreeIp(reqIP, now);
      if (!ip)
        return; // pool exhausted
      l = allocLease(mac, ip, now, DHCP_OFFER_HOLD_MS);
      if (!l)
        return;
    }
    sendDhcpReply(req, 2, l->ip, 0);
    return;
  }
  case 3: // REQUEST
  {
    DhcpLease *l = findLeaseByMac(mac, now);
    if (!forUs)
    {
      if (l && !l->bound)
        l->active = false; // client took another server's offer
      return;
    }
    uint32_t want = reqIP ? reqIP : ciaddr;
    if (!l && ipInPool(want) && !findLeaseByIp(want, now))
      l = allocLease(mac, want, now, DHCP_OFFER_HOLD_MS);
    if (!l || l->ip != want)
    {
      // We are meant to be the only DHCP server: NAK so the client restarts discovery
      // instead of hanging on to a lease (and DNS) from the router.
      sendDhcpReply(req, 6, 0, 0);
      return;
    }
    bool isNew = !l->bound;
    l->bound = true;
    l->expiresMs = now + DHCP_LEASE_SECS * 1000UL;
    sendDhcpReply(req, 5, l->ip, ciaddr);
    if (isNew)
      saveDhcpLeases();
    return;
  }
  case 4: // DECLINE: the address is in use by someone else, park it for a while
  {
    DhcpLease *l = findLeaseByMac(mac, now);
    if (!forUs || !l)
      return;
    bool wasBound = l->bound;
    memset(l->mac, 0, 6);
    l->bound = false;
    l->expiresMs = now + DHCP_DECLINE_HOLD_MS;
    if (wasBound)
      saveDhcpLeases();
    return;
  }
  case 7: // RELEASE
  {
    DhcpLease *l = findLeaseByMac(mac, now);
    if (!forUs || !l)
      return;
    bool wasBound = l->bound;
    l->active = false;
    if (wasBound)
      saveDhcpLeases();
    return;
  }
  }
}

static void startDhcpServer()
{
  initDhcpPool();
  loadDhcpLeases();
  dhcpSock.begin(DHCP_PORT);
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

static void sendCorsHeaders()
{
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
             ",\"clock\":\"" + clockState() + "\"" +
             ",\"blocked\":" + totalBlocked + ",\"allowed\":" + totalAllowed +
             ",\"blocklist\":{\"url\":\"" + jesc(updateUrl) + "\",\"interval\":" + updateIntervalH +
             ",\"count\":" + blCount + ",\"status\":\"" + jesc(String(blStatus)) + "\"" +
             ",\"running\":" + (blBuildRunning ? "true" : "false") + "}" +
             ",\"custom\":[" + customJson() + "]" +
             ",\"profiles\":[";
  for (int i = 0; i < numProfiles; i++)
  {
    j += (i ? "," : "");
    j += "{\"name\":\"" + jesc(profiles[i].name) + "\"" +
         ",\"start\":" + String(profiles[i].startBedtimeMinutes) +
         ",\"end\":" + String(profiles[i].endBedtimeMinutes) +
         ",\"mode\":" + String(profiles[i].bedtimeMode) +
         ",\"dns\":\"" + profiles[i].upstreamDNS.toString() + "\"" +
         ",\"bl\":" + (profiles[i].useBlocklist ? "true" : "false") +
         ",\"doh\":" + (profiles[i].blockDoh ? "true" : "false") +
         ",\"limits\":[";
    for (int k = 0; k < numProfileAppLimits[i]; k++)
    {
      j += (k ? "," : "");
      j += "\"" + jesc(profileAppLimitsStr[i][k]) + "\"";
    }
    j += "]}";
  }
  j += "],\"clients\":[";
  for (int i = 0; i < numClients; i++)
  {
    Dev &c = clients[i];
    IPAddress ip(c.ip);
    bool blocked = c.manualBlock || isTimerActive(c.currentProfileId);
    j += (i ? "," : "");
    j += "{\"ip\":\"" + ip.toString() + "\",\"mac\":\"" + jesc(c.mac) +
         "\",\"name\":\"" + jesc(c.friendlyName) +
         "\",\"profile\":" + String(c.currentProfileId);
    j += ",\"manualBlock\":" + (c.manualBlock ? String("true") : String("false"));
    j += ",\"blocked\":" + (blocked ? String("true") : String("false"));
    j += ",\"q\":" + String(c.queries) + ",\"b\":" + String(c.blocked) + "}";
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
      if (!p["mode"].isNull())
        profiles[idx].bedtimeMode = p["mode"].as<int>();
      else
        profiles[idx].bedtimeMode = 0; // Default hard

      numProfileAppLimits[idx] = 0;
      if (p["limits"].is<JsonArray>())
      {
        for (String s : p["limits"].as<JsonArray>())
        {
          if (numProfileAppLimits[idx] >= MAX_PROFILE_LIMITS)
            break;
          profileAppLimitsStr[idx][numProfileAppLimits[idx]] = s;
          profileAppLimitsHash[idx][numProfileAppLimits[idx]] = fnv40(s.c_str(), s.length());
          numProfileAppLimits[idx]++;
        }
      }

      if (!p["dns"].isNull())
      {
        IPAddress ip;
        if (ip.fromString(p["dns"].as<const char *>()))
        {
          profiles[idx].upstreamDNS = ip;
        }
      }
      if (!p["bl"].isNull())
        profiles[idx].useBlocklist = p["bl"].as<bool>();
      if (!p["doh"].isNull())
        profiles[idx].blockDoh = p["doh"].as<bool>();
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

  if (!web.hasArg("mac"))
  {
    web.send(400, "text/plain", "missing mac parameter");
    return;
  }

  String mac = web.arg("mac");

  if (web.hasArg("forget") && web.arg("forget") == "true")
  {
    for (int i = 0; i < numClients; i++)
    {
      if (clients[i].mac.equalsIgnoreCase(mac))
      {
        clients[i].mac = "00:00:00:00:00:00";
        clients[i].ip = 0;
        clients[i].friendlyName = "";
        clients[i].currentProfileId = 0;
        clients[i].manualBlock = false;
        break;
      }
    }
    saveConfig();
    web.send(200, "text/plain", "ok");
    return;
  }

  if (!web.hasArg("profile"))
  {
    web.send(400, "text/plain", "missing profile parameter");
    return;
  }

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
    startDhcpServer();
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

static void handleCustom()
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
  if (web.hasArg("add"))
  {
    if (!addCustom(web.arg("add")))
    {
      web.send(400, "text/plain", numCustom >= MAX_CUSTOM ? "custom list full" : "invalid or duplicate domain");
      return;
    }
  }
  else if (web.hasArg("remove"))
  {
    removeCustom(web.arg("remove"));
  }
  web.send(200, "application/json", "[" + customJson() + "]");
}

// GET /api/log[?mac=aa:bb:..][&blocked=1]: newest first, plus the top blocked domains
static void handleQueryLog()
{
  sendCorsHeaders();
  if (!checkAuth())
  {
    requireAuth();
    return;
  }
  uint8_t want[6] = {0};
  bool byMac = web.hasArg("mac") && web.arg("mac").length() > 0;
  if (byMac)
    parseMac(web.arg("mac"), want);
  bool onlyBlocked = web.arg("blocked") == "1";

  web.setContentLength(CONTENT_LENGTH_UNKNOWN);
  web.send(200, "application/json", "");
  String j = "{\"now\":" + String((uint32_t)time(nullptr)) + ",\"log\":[";
  bool first = true;
  for (int n = 0; n < qlogCount; n++)
  {
    const QLog &e = qlog[(qlogHead + MAX_QLOG - 1 - n) % MAX_QLOG];
    if (byMac && memcmp(e.mac, want, 6) != 0)
      continue;
    if (onlyBlocked && e.reason == Q_ALLOWED)
      continue;
    j += first ? "" : ",";
    first = false;
    j += "{\"t\":" + String(e.t) + ",\"ip\":\"" + IPAddress(e.ip).toString() + "\",\"mac\":\"" + macStr(e.mac) +
         "\",\"d\":\"" + jesc(String(e.d)) + "\",\"r\":" + String(e.reason) + ",\"p\":" + String(e.pid) + "}";
    if (j.length() > 1024)
    {
      web.sendContent(j);
      j = "";
    }
  }
  j += "],\"top\":[";

  // Sort indexes by count; the table is small
  int order[MAX_TOP_BLOCKED];
  for (int i = 0; i < numTopBlocked; i++)
    order[i] = i;
  std::sort(order, order + numTopBlocked, [](int a, int b)
            { return topBlocked[a].n > topBlocked[b].n; });
  for (int i = 0; i < numTopBlocked; i++)
  {
    const TopEntry &t = topBlocked[order[i]];
    j += (i ? "," : "");
    j += "{\"d\":\"" + jesc(String(t.d)) + "\",\"n\":" + String(t.n) + "}";
  }
  j += "]}";
  web.sendContent(j);
  web.sendContent("");
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
  if (updateIntervalH > MAX_UPDATE_INTERVAL_H)
    updateIntervalH = MAX_UPDATE_INTERVAL_H;
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


// ---- firmware OTA ----
static bool fwUploadAuthorized = false;

static void handleFwUpdateDone()
{
  sendCorsHeaders();
  if (!fwUploadAuthorized)
  {
    requireAuth();
    return;
  }
  fwUploadAuthorized = false;
  bool ok = !Update.hasError();
  web.send(ok ? 200 : 500, "text/plain", ok ? "ok, rebooting" : "firmware update failed");
  if (ok)
  {
    web.client().stop();
    delay(1500);
    ESP.restart();
  }
}

static void handleFwUpload()
{
  HTTPUpload &u = web.upload();
  if (u.status == UPLOAD_FILE_START)
    fwUploadAuthorized = checkAuth() && checkToken();
  // Response is sent once by handleFwUpdateDone; never flash unauthenticated data
  if (!fwUploadAuthorized)
    return;
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

static const uint32_t RESOLVER_CHECK_MS = 60000;
static uint32_t lastResolverCheckMs = 0;

static void pinResolverCb(void *arg)
{
  (void)arg;
  ip_addr_t d;
  IPAddress p = profiles[0].upstreamDNS;
  if ((uint32_t)p == 0)
    p = UPSTREAM;
  IP_ADDR4(&d, p[0], p[1], p[2], p[3]);
  dns_setserver(0, &d);
  IP_ADDR4(&d, 1, 1, 1, 1);
  dns_setserver(1, &d);
}

static void pinOwnResolver()
{
  tcpip_callback(pinResolverCb, nullptr);
}

// DHCP renewals overwrite the resolver, so re-pin it periodically
static void serviceOwnResolver()
{
  if (millis() - lastResolverCheckMs < RESOLVER_CHECK_MS)
    return;
  lastResolverCheckMs = millis();
  pinOwnResolver();
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

  WiFi.setHostname("C3-NetGuard");

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

  // Profiles other than Default are restricted: they can't switch to encrypted DNS
  for (int i = 0; i < 10; i++)
    profiles[i].blockDoh = i != 0;

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
    doc["profiles"][i]["mode"] = profiles[i].bedtimeMode;
    doc["profiles"][i]["dns"] = profiles[i].upstreamDNS.toString();
    doc["profiles"][i]["bl"] = profiles[i].useBlocklist;
    doc["profiles"][i]["doh"] = profiles[i].blockDoh;
    JsonArray limits = doc["profiles"][i]["limits"].to<JsonArray>();
    for (int j = 0; j < numProfileAppLimits[i]; j++)
    {
      limits.add(profileAppLimitsStr[i][j]);
    }
  }

  for (int i = 0; i < numClients; i++)
  {
    if (clients[i].mac.length() > 0 && clients[i].mac != "00:00:00:00:00:00")
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
      if (!p["mode"].isNull())
        profiles[idx].bedtimeMode = p["mode"].as<int>();
      else
        profiles[idx].bedtimeMode = 0; // Default hard

      numProfileAppLimits[idx] = 0;
      if (p["limits"].is<JsonArray>())
      {
        for (String s : p["limits"].as<JsonArray>())
        {
          if (numProfileAppLimits[idx] >= MAX_PROFILE_LIMITS)
            break;
          profileAppLimitsStr[idx][numProfileAppLimits[idx]] = s;
          profileAppLimitsHash[idx][numProfileAppLimits[idx]] = fnv40(s.c_str(), s.length());
          numProfileAppLimits[idx]++;
        }
      }

      if (!p["dns"].isNull())
      {
        IPAddress ip;
        if (ip.fromString(p["dns"].as<const char *>()))
        {
          profiles[idx].upstreamDNS = ip;
        }
      }
      if (!p["bl"].isNull())
        profiles[idx].useBlocklist = p["bl"].as<bool>();
      if (!p["doh"].isNull())
        profiles[idx].blockDoh = p["doh"].as<bool>();
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
  restoreClock();
  setupTime();
  loadUpdateCfg();
  loadDhcpCfg();
  reopenBlocklist();
  LOG("[cfg] custom:%d blocklist:%u\n", numCustom, blCount);

  if (!connectWiFi())
  {
    runCaptivePortal();
    return;
  }
  setupTime(); // again, now that the gateway (a likely NTP server) is known

  if (MDNS.begin("c3netguard"))
  {
    MDNS.addService("http", "tcp", 80);
    LOGN("dashboard: http://c3netguard.local");
  }

  dnsServer.begin(DNS_PORT);
  upstream.begin(0);
  tcpDnsServer.begin();
  pinOwnResolver();
  web.collectHeaders(COLLECTED_HEADERS, sizeof(COLLECTED_HEADERS) / sizeof(char *));
  web.on("/", HTTP_GET, handleRoot);
  web.on("/stats.json", HTTP_GET, handleStats);
  web.on("/api/profiles", HTTP_POST, handleSaveProfiles);
  web.on("/api/assign", HTTP_POST, handleAssignProfile);
  web.on("/setpass", HTTP_POST, handleSetPass);
  web.on("/api/custom", HTTP_POST, handleCustom);
  web.on("/api/log", HTTP_GET, handleQueryLog);
  web.on("/update", HTTP_POST, handleFwUpdateDone, handleFwUpload);
  web.on("/fetchnow", HTTP_POST, []()
         {
    sendCorsHeaders();
    if (!checkAuth()) { requireAuth(); return; }
    if (!checkToken()) { web.send(403, "text/plain", "bad token"); return; }
    if (startBlocklistUpdate())
      web.send(200, "text/plain", "started");
    else
      web.send(blBuildRunning || blBuildReady ? 409 : 400, "text/plain", blBuildRunning || blBuildReady ? "already running" : blStatus); });
  web.on("/setupdate", HTTP_POST, []()
         {
    sendCorsHeaders();
    if (!checkAuth()) { requireAuth(); return; }
    if (!checkToken()) { web.send(403, "text/plain", "bad token"); return; }
    if (web.hasArg("u")) { updateUrl = web.arg("u"); updateUrl.trim(); }
    if (web.hasArg("h")) { updateIntervalH = constrain(web.arg("h").toInt(), 1, (long)MAX_UPDATE_INTERVAL_H); }
    saveUpdateCfg();
    blNextFetchMs = 0; // reschedule with the new settings
    web.send(200, "text/plain", "ok"); });
  web.on("/dhcp", HTTP_POST, handleDhcpToggle);
  web.on("/setwifi", HTTP_POST, handleSetWifi);

  web.onNotFound([]()
                 {
    if (web.method() == HTTP_OPTIONS) {
      sendCorsHeaders();
      web.send(204);
    } else {
      sendCorsHeaders();
      web.send(404, "text/plain", "Not Found");
    } });

  web.begin();

  ArduinoOTA.setHostname("c3netguard");
  ArduinoOTA.begin();

  if (dhcpEnabled)
  {
    startDhcpServer();
    LOGN("DHCP server enabled on :67");
  }

  LOGN("DNS :53 (UDP+TCP) + dashboard :80 + OTA up");
}

void loop()
{
  ArduinoOTA.handle();
  web.handleClient();
  handleDns();
  pollUpstream();
  expirePending();
  handleTcpDns();
  if (dhcpEnabled)
    handleDhcp();
  serviceBlocklist();
  serviceClock();
  serviceHttpTime();
  serviceOwnResolver();

  if (pendingCount > 0)
    lastDnsActivityMs = millis();
}