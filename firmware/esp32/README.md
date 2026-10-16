# BeanTrack ESP32 Firmware

This PlatformIO project contains the ESP32 Wi-Fi, WebSocket, HX711, and motor-control firmware.

## Hardware

- Board: `esp32dev`
- Framework: Arduino
- Serial monitor: `115200`
- WebSocket server: port `81`

## Configure Wi-Fi

Edit `src/main.cpp` and replace the placeholder SSID and password. Use a 2.4 GHz Wi-Fi network.

## Build and upload

From `firmware/esp32`:

```sh
pio run
pio run -t upload
pio device monitor -b 115200
```

The firmware depends on `bogde/HX711` and `links2004/WebSockets`, which PlatformIO installs from `platformio.ini`.

Do not commit real Wi-Fi passwords or generated `.pio` build output.
