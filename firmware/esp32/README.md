# BeanTrack ESP32 firmware

PlatformIO project for the ESP32 controller: two HX711 load cells, a PWM
vibration motor, the WebSocket telemetry server, Wi-Fi setup, and OTA updates.

## Hardware

- Board: `esp32dev`
- Framework: Arduino
- Load cells: HX711 on GPIO 32/33 (top deck) and 26/27 (bottom deck)
- Motor: GPIO 25, status LED: GPIO 4, button: GPIO 14, potentiometer: GPIO 34
- WebSocket server: port `81`, mDNS name `beantrack.local`
- Serial monitor: `115200`

## Wi-Fi setup

The firmware does not require editing credentials in code. On first boot, or
after **Change Wi-Fi** on the dashboard (which sends `RESET_WIFI`), the board
opens an access point:

- SSID: `BeanTrack-Setup`
- Password: `beantrack123` (change `SETUP_AP_PASS` in `src/wifi_settings.h`)
- Setup page: `http://192.168.4.1`

The dashboard's Wi-Fi dialog walks through joining that network and saving the
target network's credentials. Credentials are stored in NVS and survive
reboots. Keep the board and the laptop on the same 2.4 GHz network.

## Build and upload

From `firmware/esp32`:

```sh
pio run
pio run -t upload
pio device monitor -b 115200
```

The firmware depends on `bogde/HX711` and `links2004/WebSockets`, which
PlatformIO installs from `platformio.ini`.

## OTA updates

`platformio.ini` uses `upload_protocol = espota`. Set `upload_port` to the
board's IP (the value in the repo is an example), then:

```sh
pio run -t upload
```

The OTA password is set in `src/main.cpp` (`ArduinoOTA.setPassword`) and must
match `upload_flags` in `platformio.ini`. Change both before handing a machine
over.

## Behaviour notes

- `TARE` and `CALIBRATE_*` are non-blocking: one HX711 sample is taken per loop,
  so telemetry keeps flowing during the ~3 s per deck averaging window.
- Telemetry weights are **per batch**: they reset at `START`, so leftovers on the
  decks do not count towards the next target.
- A batch stops when the input target is reached, or when the weight has not
  changed for 10 s after beans started arriving. The thresholds are mirrored in
  `src/appConstants.js`; keep them in sync.
- If neither HX711 reports a reading for 5 s during a run, the firmware stops
  the motor and sends `[FAULT] loadcell...` to the dashboard.
- **The operating mode decides who owns the vibration speed.** In `Manual` the
  panel potentiometer is the only control and the firmware ignores `SET_SPEED`;
  in `Automatic` the dashboard commands the speed and the potentiometer is
  ignored. `SET_MODE` is refused while a batch is running, so a run never
  changes hands halfway through.
- Telemetry reports both speeds: `vibration_speed` is the commanded value and
  `motor_speed` is what the motor is actually running at. They differ while the
  soft-start ramp is still climbing.

Do not commit real Wi-Fi passwords, OTA passwords, or generated `.pio` build
output.
