#pragma once

// Returns true if currentMinutes is within the window from startWindow to endWindow
inline bool checkTimeWindow(int currentMinutes, int startWindow, int endWindow) {
    if (startWindow == -1 || endWindow == -1) {
        return false; // Disabled
    }

    if (startWindow > endWindow) {
        // Crosses midnight (e.g. 21:00 to 07:00)
        return (currentMinutes >= startWindow || currentMinutes < endWindow);
    } else {
        // Standard daytime window block
        return (currentMinutes >= startWindow && currentMinutes < endWindow);
    }
}
