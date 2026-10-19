#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <Preferences.h>
#include "HX711.h"
#include "wifi_settings.h"

// --- mDNS name (the Wi-Fi name and password are stored on the ESP32, not here) ---
const char* MDNS_HOSTNAME = "beantrack";   // reachable at ws://beantrack.local:81

// --- WebSocket server on port 81 ---
WebSocketsServer webSocket = WebSocketsServer(81);
bool wsClientConnected = false;

// --- Pin definitions ---
const int LEFT_DT   = 32;   // Top (large) deck
const int LEFT_SCK  = 33;
const int RIGHT_DT  = 26;   // Bottom (medium) deck
const int RIGHT_SCK = 27;

const int BUTTON_PIN     = 14;
const int MOTOR_PIN      = 25;
const int POT_PIN        = 34;
const int STATUS_LED_PIN = 4;

// --- ESP32 LEDC PWM (Arduino core v2 API, pinned in platformio.ini) ---
const int PWM_CHANNEL = 0;
const int PWM_FREQ    = 5000;
const int PWM_RES     = 8;

HX711 topScaleLeft;
HX711 bottomScaleRight;

// --- Calibration factors ---
float calFactorTopLeft     = 116.3;
float calFactorBottomRight = 116.3;
const float KNOWN_WEIGHT_G = 165.0;

// --- EMA filtering and deadband ---
const float FILTER_ALPHA  = 0.15;
const float ZERO_DEADBAND = 2.5;

float filteredTopGrams    = 0.0;
float filteredBottomGrams = 0.0;

long rawZeroTop    = 0;
long rawZeroBottom = 0;
long deltaTop      = 0;
long deltaBottom   = 0;

// --- Soft start: motor PWM ramps toward the target instead of jumping ---
const int RAMP_STEP_PER_LOOP = 2;   // higher = faster ramp, more inrush
int rampSpeed = 0;

// --- System and operating state ---
bool systemOn = false;
bool forceFullSpeed = false;
bool webSpeedOverride = false;        // true when the web slider sets speed
int  webTargetSpeedPercent = 40;
String operatingMode = "Automatic";   // "Automatic" or "Manual"

unsigned long lastPrintTime = 0;

// --- Button debounce ---
bool lastButtonState = HIGH;
bool debouncedButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// --- Potentiometer filtering ---
int smoothedPotValue = 0;
int lastPotPercent = 0;
const float POT_ALPHA = 0.2;

// ---------------------------------------------------------------
// Logging: USB Serial and, if a dashboard is connected, the web UI
// ---------------------------------------------------------------
void sendLogEvent(String msg) {
  Serial.println(msg);
  if (wsClientConnected) {
    String jsonLog = "{\"type\":\"log\",\"message\":\"" + msg + "\"}";
    webSocket.broadcastTXT(jsonLog);
  }
}

// ---------------------------------------------------------------
// Saved zero offsets: survive reboots so a reset does not lose the zero
// ---------------------------------------------------------------
void saveZeros() {
  Preferences p;
  p.begin("cal", false);
  p.putLong("zeroTop", rawZeroTop);
  p.putLong("zeroBottom", rawZeroBottom);
  p.end();
}

void loadZeros() {
  Preferences p;
  p.begin("cal", true);
  rawZeroTop    = p.getLong("zeroTop", 0);
  rawZeroBottom = p.getLong("zeroBottom", 0);
  p.end();
  topScaleLeft.set_offset(rawZeroTop);
  bottomScaleRight.set_offset(rawZeroBottom);
}

// ---------------------------------------------------------------
// Tare both decks to zero (user action only)
// ---------------------------------------------------------------
void tareBoth() {
  sendLogEvent("[TARE] Zeroing both decks... keep hands off!");
  delay(500);

  if (topScaleLeft.wait_ready_timeout(1000)) {
    rawZeroTop = topScaleLeft.read_average(30);
    topScaleLeft.set_offset(rawZeroTop);
    filteredTopGrams = 0.0;
    deltaTop = 0;
  }

  if (bottomScaleRight.wait_ready_timeout(1000)) {
    rawZeroBottom = bottomScaleRight.read_average(30);
    bottomScaleRight.set_offset(rawZeroBottom);
    filteredBottomGrams = 0.0;
    deltaBottom = 0;
  }

  saveZeros();
  sendLogEvent("[TARE DONE] Decks zeroed to 0.0 g!");
}

// ---------------------------------------------------------------
// Single-character commands (USB Serial and WebSocket)
// ---------------------------------------------------------------
void handleCommand(char cmd) {
  if (cmd == 't' || cmd == 'T') {
    tareBoth();
  }
  else if (cmd == '1') {
    sendLogEvent("[CAL TOP] Calibrating Top Deck (Left)...");
    long measuredDelta = topScaleLeft.read_average(30) - rawZeroTop;
    calFactorTopLeft = (float)measuredDelta / KNOWN_WEIGHT_G;
    topScaleLeft.set_scale(calFactorTopLeft);
    sendLogEvent(">>> NEW calFactorTopLeft = " + String(calFactorTopLeft, 2));
  }
  else if (cmd == '2') {
    sendLogEvent("[CAL BOT] Calibrating Bottom Deck (Right)...");
    long measuredDelta = bottomScaleRight.read_average(30) - rawZeroBottom;
    calFactorBottomRight = (float)measuredDelta / KNOWN_WEIGHT_G;
    bottomScaleRight.set_scale(calFactorBottomRight);
    sendLogEvent(">>> NEW calFactorBottomRight = " + String(calFactorBottomRight, 2));
  }
  else if (cmd == 'f' || cmd == 'F') {
    forceFullSpeed = !forceFullSpeed;
    webSpeedOverride = false;
    systemOn = true;
    digitalWrite(STATUS_LED_PIN, HIGH);
    sendLogEvent(forceFullSpeed ? "[MOTOR] Forced 100% PWM" : "[MOTOR] Potentiometer Control");
  }
  else if (cmd == 's' || cmd == 'S') {
    systemOn = !systemOn;
    if (!systemOn) forceFullSpeed = false;
    digitalWrite(STATUS_LED_PIN, systemOn ? HIGH : LOW);
    sendLogEvent(systemOn ? "[CMD] System ON" : "[CMD] System OFF");
  }
}

// ---------------------------------------------------------------
// Read a value from a flat JSON object, e.g. jsonField(s, "value") on {"value":40}
// ---------------------------------------------------------------
String jsonField(const String& json, const String& key) {
  String needle = "\"" + key + "\":";
  int start = json.indexOf(needle);
  if (start < 0) return "";

  start += needle.length();
  while (start < (int)json.length() && json[start] == ' ') start++;
  if (start >= (int)json.length()) return "";

  if (json[start] == '"') {                       // quoted string value
    int end = json.indexOf('"', start + 1);
    return end < 0 ? "" : json.substring(start + 1, end);
  }

  int end = start;                                // number or bare word
  while (end < (int)json.length() && json[end] != ',' && json[end] != '}') end++;
  String v = json.substring(start, end);
  v.trim();
  return v;
}

// ---------------------------------------------------------------
// Commands from the React dashboard.
// JSON, e.g. {"command":"SET_SPEED","value":40}, or plain text, e.g. "TARE".
// ---------------------------------------------------------------
void handleWebSocketMessage(String payload) {
  payload.trim();

  if (payload.length() == 1) {
    handleCommand(payload[0]);
    return;
  }

  String cmd = payload;
  if (payload.startsWith("{")) {
    cmd = jsonField(payload, "command");
  }
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "START") {
    systemOn = true;
    digitalWrite(STATUS_LED_PIN, HIGH);
    sendLogEvent("[WEB] Batch Started");
  }
  else if (cmd == "STOP") {
    systemOn = false;
    forceFullSpeed = false;
    digitalWrite(STATUS_LED_PIN, LOW);
    sendLogEvent("[WEB] Batch Stopped");
  }
  else if (cmd == "TARE") {
    tareBoth();
  }
  else if (cmd == "CAL_TOP") {
    handleCommand('1');
  }
  else if (cmd == "CAL_BOT") {
    handleCommand('2');
  }
  else if (cmd == "SET_MODE") {
    String mode = jsonField(payload, "mode");
    operatingMode = (mode == "Manual") ? "Manual" : "Automatic";
    sendLogEvent("[WEB] Mode set to " + operatingMode);
  }
  else if (cmd == "SET_SPEED") {
    int newSpeed = jsonField(payload, "value").toInt();
    webTargetSpeedPercent = constrain(newSpeed, 0, 100);
    webSpeedOverride = true;
    forceFullSpeed = false;
    sendLogEvent("[WEB] Vibration speed set to " + String(webTargetSpeedPercent) + "%");
  }
  else if (cmd == "SET_WIFI") {
    String ssid = jsonField(payload, "ssid");
    String pass = jsonField(payload, "password");
    if (!WifiSettings::validateAndSave(ssid, pass)) {
      sendLogEvent("[WIFI] Not saved: check the network name and password");
      return;
    }
    sendLogEvent("[WIFI] Saved " + ssid + ". Restarting to join it.");
    delay(800);
    ESP.restart();
  }
  else if (cmd == "RESET_WIFI") {
    WifiSettings::clearSaved();
    sendLogEvent("[WIFI] Saved network cleared. Restarting into setup mode.");
    delay(800);
    ESP.restart();
  }
}

// ---------------------------------------------------------------
// WebSocket event callback
// ---------------------------------------------------------------
void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u disconnected.\n", num);
      if (webSocket.connectedClients() == 0) {
        wsClientConnected = false;
      }
      break;

    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] Client #%u connected from %d.%d.%d.%d\n",
                    num, ip[0], ip[1], ip[2], ip[3]);
      wsClientConnected = true;
      sendLogEvent("[ESP32] Linked to BeanTrack Web Dashboard");
      break;
    }

    case WStype_TEXT: {
      String message = String((char*)payload, length);
      handleWebSocketMessage(message);
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------
// Runs after Wi-Fi is connected: mDNS name and WebSocket server
// ---------------------------------------------------------------
void startNetworkServices() {
  if (MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("[mDNS] Responder started: ws://beantrack.local:81");
  }
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.print("[WiFi] Connected to ");
  Serial.print(WiFi.SSID());
  Serial.print(", IP ");
  Serial.println(WiFi.localIP());
  Serial.println("[WS] WebSocket server started on port 81");
}

// ---------------------------------------------------------------
// Setup
// ---------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Reset reason: 9 = brownout. Shows whether a reboot was a power dip.
  Serial.printf("[BOOT] Reset reason: %d\n", (int)esp_reset_reason());

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Motor PWM on GPIO 25 (core v2 API)
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RES);
  ledcAttachPin(MOTOR_PIN, PWM_CHANNEL);
  ledcWrite(PWM_CHANNEL, 0);

  // Load cells
  topScaleLeft.begin(LEFT_DT, LEFT_SCK);
  bottomScaleRight.begin(RIGHT_DT, RIGHT_SCK);
  pinMode(LEFT_DT, INPUT_PULLUP);
  pinMode(RIGHT_DT, INPUT_PULLUP);

  topScaleLeft.set_scale(calFactorTopLeft);
  bottomScaleRight.set_scale(calFactorBottomRight);

  // Wi-Fi: use the saved network, or open the BeanTrack-Setup network if none works
  if (WifiSettings::connectStored()) {
    startNetworkServices();
  } else {
    WifiSettings::startSetupAP();
  }

  // Restore the last zero instead of re-taring on every boot.
  // A tare happens only when the user presses Tare.
  loadZeros();
  sendLogEvent("[BOOT] Restored last zero. Press Tare if the decks were changed.");
}

// ---------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------
void loop() {
  // Setup mode: only the setup web page runs, and the motor stays off
  if (WifiSettings::setupMode) {
    WifiSettings::handleClient();
    ledcWrite(PWM_CHANNEL, 0);
    delay(5);
    return;
  }

  // 1. WebSocket clients and USB Serial commands
  webSocket.loop();

  if (Serial.available() > 0) {
    handleCommand(Serial.read());
  }

  // 2. Button debounce: toggles system on/off
  int rawButtonReading = digitalRead(BUTTON_PIN);
  if (rawButtonReading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (rawButtonReading != debouncedButtonState) {
      debouncedButtonState = rawButtonReading;
      if (debouncedButtonState == LOW) {
        systemOn = !systemOn;
        if (!systemOn) forceFullSpeed = false;

        digitalWrite(STATUS_LED_PIN, systemOn ? HIGH : LOW);
        sendLogEvent(systemOn ? "[BTN] System ON" : "[BTN] System OFF");
      }
    }
  }
  lastButtonState = rawButtonReading;

  // 3. Filtered potentiometer and motor PWM
  int rawPot = analogRead(POT_PIN);
  smoothedPotValue = (int)((POT_ALPHA * rawPot) + ((1.0 - POT_ALPHA) * smoothedPotValue));
  int currentPotPercent = map(smoothedPotValue, 0, 4095, 0, 100);

  if (abs(currentPotPercent - lastPotPercent) > 3) {
    webSpeedOverride = false;
    lastPotPercent = currentPotPercent;
  }

  int motorSpeed = 0;
  int speedPercent = 0;

  if (systemOn) {
    if (forceFullSpeed) {
      speedPercent = 100;
      motorSpeed = 255;
    } else if (webSpeedOverride) {
      speedPercent = webTargetSpeedPercent;
      motorSpeed = map(speedPercent, 0, 100, 0, 255);
    } else {
      speedPercent = currentPotPercent;
      motorSpeed = map(smoothedPotValue, 0, 4095, 0, 255);
    }

    // Friction kickstart: minimum pulse to prevent stall at low speeds
    if (motorSpeed > 0 && motorSpeed < 50 && !forceFullSpeed) {
      motorSpeed = max(motorSpeed, 90);
    }
  }

  // Soft start: ramp up gradually to limit inrush; drop immediately on stop
  if (rampSpeed < motorSpeed) rampSpeed = min(motorSpeed, rampSpeed + RAMP_STEP_PER_LOOP);
  else                        rampSpeed = motorSpeed;
  ledcWrite(PWM_CHANNEL, rampSpeed);

  // 4. Sample and filter load cells
  if (topScaleLeft.is_ready()) {
    long rawLeft = topScaleLeft.read();
    deltaTop = rawLeft - rawZeroTop;
    float gramsTop = (float)deltaTop / calFactorTopLeft;
    filteredTopGrams = (FILTER_ALPHA * gramsTop) + ((1.0 - FILTER_ALPHA) * filteredTopGrams);
  }

  if (bottomScaleRight.is_ready()) {
    long rawRight = bottomScaleRight.read();
    deltaBottom = rawRight - rawZeroBottom;
    float gramsBottom = (float)deltaBottom / calFactorBottomRight;
    filteredBottomGrams = (FILTER_ALPHA * gramsBottom) + ((1.0 - FILTER_ALPHA) * filteredBottomGrams);
  }

  // 5. Telemetry every 300 ms
  if (millis() - lastPrintTime >= 300) {
    lastPrintTime = millis();

    float displayTop = (abs(filteredTopGrams) < ZERO_DEADBAND) ? 0.0 : filteredTopGrams;
    float displayBot = (abs(filteredBottomGrams) < ZERO_DEADBAND) ? 0.0 : filteredBottomGrams;

    String activeBin = "None";
    if (systemOn) {
      if (displayTop > displayBot && displayTop > 0) activeBin = "Top Deck (Large)";
      else if (displayBot > 0) activeBin = "Bottom Deck (Medium/Fine)";
      else activeBin = "Sorting";
    }

    String statusLine = String(systemOn ? "[ON " : "[OFF ") + String(speedPercent) + "%] " +
                        "TOP: " + String(displayTop, 1) + "g | " +
                        "BOT: " + String(displayBot, 1) + "g";
    Serial.println(statusLine);

    if (wsClientConnected) {
      String jsonTelemetry = "{";
      jsonTelemetry += "\"type\":\"telemetry\",";
      jsonTelemetry += "\"systemOn\":" + String(systemOn ? "true" : "false") + ",";
      jsonTelemetry += "\"status\":\"" + String(systemOn ? "Sorting" : "Idle") + "\",";
      jsonTelemetry += "\"mode\":\"" + operatingMode + "\",";
      jsonTelemetry += "\"wifi\":\"" + WiFi.SSID() + "\",";
      jsonTelemetry += "\"vibration_speed\":" + String(speedPercent) + ",";
      jsonTelemetry += "\"active_bin\":\"" + activeBin + "\",";
      jsonTelemetry += "\"top_grams\":" + String(displayTop, 1) + ",";
      jsonTelemetry += "\"bottom_grams\":" + String(displayBot, 1) + ",";
      jsonTelemetry += "\"total_grams\":" + String(displayTop + displayBot, 1);
      jsonTelemetry += "}";

      webSocket.broadcastTXT(jsonTelemetry);
    }
  }
}