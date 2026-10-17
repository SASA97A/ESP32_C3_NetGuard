#pragma once
#include <stddef.h>
#include <string.h>

// Pulls the domain out of one blocklist line. Accepts plain domain lists, hosts files
// ("0.0.0.0 example.com"), adblock rules ("||example.com^") and wildcards ("*.example.com").
// Writes the lowercase domain without a leading "www." to out and returns its length,
// or returns 0 when the line holds no blockable domain (comments, exceptions, IPs, junk).
inline size_t extractBlocklistDomain(const char *line, size_t len, char *out, size_t outSize)
{
  size_t i = 0;
  while (i < len && (line[i] == ' ' || line[i] == '\t'))
    i++;
  if (i >= len || line[i] == '#' || line[i] == '!' || line[i] == '[' || line[i] == '@')
    return 0;

  // First token; hosts files put an address in front of the domain
  size_t tokStart = i;
  while (i < len && line[i] != ' ' && line[i] != '\t' && line[i] != '#' && line[i] != '\r' && line[i] != '\n')
    i++;
  size_t tokEnd = i;
  // IPv4 = digits and dots only; IPv6 = hex digits with at least one ':'
  bool ipv4 = tokEnd > tokStart, ipv6 = tokEnd > tokStart, hasColon = false;
  for (size_t k = tokStart; k < tokEnd; k++)
  {
    char ch = line[k];
    bool digit = ch >= '0' && ch <= '9';
    bool hex = digit || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    if (ch == ':')
      hasColon = true;
    if (!(digit || ch == '.'))
      ipv4 = false;
    if (!(hex || ch == ':' || ch == '.'))
      ipv6 = false;
  }
  if (ipv4 || (ipv6 && hasColon))
  {
    while (i < len && (line[i] == ' ' || line[i] == '\t'))
      i++;
    tokStart = i;
    while (i < len && line[i] != ' ' && line[i] != '\t' && line[i] != '#' && line[i] != '\r' && line[i] != '\n')
      i++;
    tokEnd = i;
  }

  const char *p = line + tokStart;
  size_t n = tokEnd - tokStart;
  if (n >= 2 && p[0] == '|' && p[1] == '|')
  {
    p += 2;
    n -= 2;
  }
  if (n >= 2 && p[0] == '*' && p[1] == '.')
  {
    p += 2;
    n -= 2;
  }
  while (n && p[0] == '.')
  {
    p++;
    n--;
  }
  // Adblock modifiers / paths end the domain part
  for (size_t k = 0; k < n; k++)
    if (p[k] == '^' || p[k] == '$' || p[k] == '/')
    {
      n = k;
      break;
    }
  while (n && p[n - 1] == '.')
    n--;
  if (n >= 4 && (p[0] == 'w' || p[0] == 'W') && (p[1] == 'w' || p[1] == 'W') && (p[2] == 'w' || p[2] == 'W') && p[3] == '.')
  {
    p += 4;
    n -= 4;
  }
  if (n == 0 || n > 253 || n >= outSize)
    return 0;

  bool hasDot = false, allNumeric = true;
  for (size_t k = 0; k < n; k++)
  {
    char ch = p[k];
    if (ch >= 'A' && ch <= 'Z')
      ch = (char)(ch - 'A' + 'a');
    bool ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.';
    if (!ok)
      return 0;
    if (ch == '.')
      hasDot = true;
    else if (!(ch >= '0' && ch <= '9'))
      allNumeric = false;
    out[k] = ch;
  }
  out[n] = 0;
  if (!hasDot || allNumeric)
    return 0;
  if (strcmp(out, "localhost.localdomain") == 0)
    return 0;
  return n;
}
