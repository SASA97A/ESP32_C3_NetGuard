#pragma once
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// Parses an RFC 7231 IMF-fixdate ("Sun, 06 Nov 1994 08:49:37 GMT") into Unix seconds.
// Returns 0 when the string isn't a valid date.
inline int64_t parseHttpDate(const char *s)
{
    static const char *MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";
    int day, year, hh, mm, ss;
    char mon[4] = {0};
    if (!s || sscanf(s, "%*3s, %d %3s %d %d:%d:%d", &day, mon, &year, &hh, &mm, &ss) != 6)
        return 0;
    const char *m = strstr(MONTHS, mon);
    if (strlen(mon) != 3 || !m || (m - MONTHS) % 3 != 0)
        return 0;
    int month = (int)(m - MONTHS) / 3 + 1;
    if (year < 1970 || day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 60)
        return 0;

    // Days from civil (Howard Hinnant)
    int y = year - (month <= 2);
    int era = y / 400;
    int yoe = y - era * 400;
    int doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
    int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    int64_t days = (int64_t)era * 146097 + doe - 719468;
    return days * 86400 + hh * 3600 + mm * 60 + ss;
}
