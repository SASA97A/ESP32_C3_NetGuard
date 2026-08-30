#include <unity.h>
#include "scheduler.h"

void setUp(void) {
    // set stuff up here
}

void tearDown(void) {
    // clean stuff up here
}

void test_standard_bedtime(void) {
    // Bedtime 21:00 (1260) to 07:00 (420)
    // 22:00 (1320) should be blocked
    TEST_ASSERT_TRUE(checkTimeWindow(1320, 1260, 420));
    // 06:00 (360) should be blocked
    TEST_ASSERT_TRUE(checkTimeWindow(360, 1260, 420));
    // 15:00 (900) should be allowed (not blocked)
    TEST_ASSERT_FALSE(checkTimeWindow(900, 1260, 420));
}

void test_disabled_bedtime(void) {
    // -1 disables bedtime
    TEST_ASSERT_FALSE(checkTimeWindow(900, -1, -1));
    TEST_ASSERT_FALSE(checkTimeWindow(1320, -1, -1));
}

void test_inverted_bedtime(void) {
    // Block from 13:00 (780) to 15:00 (900) - does not cross midnight
    // 14:00 (840) should be blocked
    TEST_ASSERT_TRUE(checkTimeWindow(840, 780, 900));
    // 22:00 (1320) should be allowed
    TEST_ASSERT_FALSE(checkTimeWindow(1320, 780, 900));
}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_standard_bedtime);
    RUN_TEST(test_disabled_bedtime);
    RUN_TEST(test_inverted_bedtime);
    return UNITY_END();
}
