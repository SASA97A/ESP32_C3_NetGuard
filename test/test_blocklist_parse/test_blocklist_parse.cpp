#include <unity.h>
#include <string.h>
#include "blocklist_parse.h"

static char out[256];

static const char *parse(const char *line)
{
    size_t n = extractBlocklistDomain(line, strlen(line), out, sizeof(out));
    return n ? out : "";
}

void setUp(void) {}
void tearDown(void) {}

void test_plain_domains(void) {
    TEST_ASSERT_EQUAL_STRING("example.com", parse("example.com"));
    TEST_ASSERT_EQUAL_STRING("example.com", parse("  Example.COM \r"));
    TEST_ASSERT_EQUAL_STRING("example.com", parse("www.example.com"));
    TEST_ASSERT_EQUAL_STRING("cafe.be", parse("cafe.be"));
    TEST_ASSERT_EQUAL_STRING("ads.example.com", parse("ads.example.com # trailing comment"));
}

void test_hosts_format(void) {
    TEST_ASSERT_EQUAL_STRING("ads.example.com", parse("0.0.0.0 ads.example.com"));
    TEST_ASSERT_EQUAL_STRING("ads.example.com", parse("127.0.0.1\tads.example.com"));
    TEST_ASSERT_EQUAL_STRING("ads.example.com", parse(":: ads.example.com"));
    TEST_ASSERT_EQUAL_STRING("", parse("0.0.0.0"));
    TEST_ASSERT_EQUAL_STRING("", parse("127.0.0.1 localhost"));
    TEST_ASSERT_EQUAL_STRING("", parse("127.0.0.1 localhost.localdomain"));
}

void test_adblock_and_wildcards(void) {
    TEST_ASSERT_EQUAL_STRING("tracker.net", parse("||tracker.net^"));
    TEST_ASSERT_EQUAL_STRING("tracker.net", parse("||tracker.net^$third-party"));
    TEST_ASSERT_EQUAL_STRING("tracker.net", parse("*.tracker.net"));
    TEST_ASSERT_EQUAL_STRING("tracker.net", parse(".tracker.net"));
    TEST_ASSERT_EQUAL_STRING("", parse("@@||allowed.com^"));
}

void test_skipped_lines(void) {
    TEST_ASSERT_EQUAL_STRING("", parse(""));
    TEST_ASSERT_EQUAL_STRING("", parse("# comment"));
    TEST_ASSERT_EQUAL_STRING("", parse("! adblock comment"));
    TEST_ASSERT_EQUAL_STRING("", parse("[Adblock Plus 2.0]"));
    TEST_ASSERT_EQUAL_STRING("", parse("localhost"));
    TEST_ASSERT_EQUAL_STRING("", parse("1.2.3.4"));
    TEST_ASSERT_EQUAL_STRING("", parse("bad domain!.com"));
    TEST_ASSERT_EQUAL_STRING("", parse("##.ad-banner"));
}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_plain_domains);
    RUN_TEST(test_hosts_format);
    RUN_TEST(test_adblock_and_wildcards);
    RUN_TEST(test_skipped_lines);
    return UNITY_END();
}
