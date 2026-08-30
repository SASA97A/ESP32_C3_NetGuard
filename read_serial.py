import serial
import time
import sys

try:
    ser = serial.Serial('COM5', 115200, timeout=2)
    sio = serial.io.TextIOWrapper(serial.io.BufferedRWPair(ser, ser), newline='\n', line_buffering=True)
    
    # reset the board by toggling DTR/RTS
    ser.setDTR(False)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.setDTR(False)
    ser.setRTS(False)
    
    start_time = time.time()
    print("Listening to COM5...")
    while time.time() - start_time < 15:
        line = sio.readline()
        if line:
            print(line.strip())
            if "IP:" in line or "dashboard:" in line:
                break
    
    ser.close()
except Exception as e:
    print(f"Error: {e}")
