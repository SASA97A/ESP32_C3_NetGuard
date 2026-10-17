#include <unity.h>
#include "http_date.h"

void setUp(void) {}
void tearDown(void) {}

void test_valid_dates(void) {
    TEST_ASSERT_EQUAL_INT64(784111777LL, parseHttpDate("Sun, 06 Nov 1994 08:49:37 GMT"));
    TEST_ASSERT_EQUAL_INT64(0LL, parseHttpDate("Thu, 01 Jan 1970 00:00:00 GMT"));
    TEST_ASSERT_EQUAL_INT64(1709210096LL, parseHttpDate("Thu, 29 Feb 2024 12:34:56 GMT"));
    TEST_ASSERT_EQUAL_INT64(1798761599LL, parseHttpDate("Thu, 31 Dec 2026 23:59:59 GMT"));
}

void test_invalid_dates(void) {
    TEST_ASSERT_EQUAL_INT64(0LL, parseHttpDate(""));
    TEST_ASSERT_EQUAL_INT64(0LL, parseHttpDate("garbage"));
    TEST_ASSERT_EQUAL_INT64(0LL, parseHttpDate("Sun, 06 Foo 1994 08:49:37 GMT"));
    TEST_ASSERT_EQUAL_INT64(0LL, parseHttpDate("Sun, 06 eb 1994 08:49:37 GMT"));
    TEST_ASSERT_EQUAL_INT64(0LL, parseHttpDate("Sun, 06 Nov 1994 25:49:37 GMT"));
}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_valid_dates);
    RUN_TEST(test_invalid_dates);
    return UNITY_END();
}
