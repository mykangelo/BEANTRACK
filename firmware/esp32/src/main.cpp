#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <Preferences.h>
#include <ArduinoOTA.h> 
#include "HX711.h"
#include "wifi_settings.h"

// --- mDNS name ---
const char* MDNS_HOSTNAME = "beantrack"; 

// --- WebSocket server on port 81 ---
WebSocketsServer webSocket = WebSocketsServer(81);
bool wsClientConnected = false;

// --- NEW: OTA State Flag ---
volatile bool isUpdating = false; 

// --- Pin definitions ---
const int LEFT_DT   = 32;   
const int LEFT_SCK  = 33;
const int RIGHT_DT  = 26;   
const int RIGHT_SCK = 27;

const int BUTTON_PIN     = 14;
const int MOTOR_PIN      = 25;
const int POT_PIN        = 34;
const int STATUS_LED_PIN = 4;

// --- ESP32 LEDC PWM ---
const int PWM_CHANNEL = 0;
const int PWM_FREQ    = 5000;
const int PWM_RES     = 8;

HX711 topScaleLeft;
HX711 bottomScaleRight;

// --- Calibration factors (Defaults if nothing saved in NVM) ---
float calFactorTopLeft     = 116.3;
float calFactorBottomRight = 116.3;

// --- EMA filtering and deadband ---
const float FILTER_ALPHA  = 0.15;
const float ZERO_DEADBAND = 2.5;

float filteredTopGrams    = 0.0;
float filteredBottomGrams = 0.0;

long rawZeroTop    = 0;
long rawZeroBottom = 0;
long deltaTop      = 0;
long deltaBottom   = 0;

// --- Per-batch baseline ---
// Telemetry reports how much each deck has collected since the batch started,
// so leftovers from the previous batch do not count towards the new target.
float batchBaseTop    = 0.0;
float batchBaseBottom = 0.0;

// --- Non-blocking tare / calibration job ---
// HX711 reads are ~10 Hz; averaging 30 samples blocks for ~3 s. Taking one
// sample per loop keeps the WebSocket telemetry flowing instead.
enum CalJob { CAL_NONE, CAL_TARE, CAL_FACTOR };
CalJob calJob = CAL_NONE;
int    calStage = 0;              // 0 = top deck, 1 = bottom deck (tare only)
bool   calIsTop = true;
float  calKnownWeight = 0;
long   calSum = 0;
int    calSamples = 0;
unsigned long calSettleUntil = 0;
unsigned long calDeadline = 0;
const int CAL_SAMPLES = 30;
const unsigned long CAL_SETTLE_MS = 400;
const unsigned long CAL_TIMEOUT_MS = 15000;

// --- Load-cell health (reported to the dashboard as a fault) ---
unsigned long lastScaleReadyMs = 0;
bool loadcellFaultReported = false;
const unsigned long SCALE_FAULT_MS = 5000;

// --- Soft start ---
const int RAMP_STEP_PER_LOOP = 2; 
int rampSpeed = 0;

// --- System and operating state ---
bool systemOn = false;
bool forceFullSpeed = false;
bool webSpeedOverride = false;        
int  webTargetSpeedPercent = 40;
String operatingMode = "Automatic";   

unsigned long lastPrintTime = 0;

// Auto-stop: input target, or N seconds with no meaningful weight change
// after beans have started landing on the decks (stuck mesh / debris loss).
const unsigned long WEIGHT_IDLE_MS = 10000;
const float WEIGHT_CHANGE_G        = 5.0;
const float WEIGHT_FLOW_G          = 20.0;

float batchTargetGrams = 0;
bool  watchArmed = false;
bool  haveBaseline = false;
bool  seenWeightFlow = false;
float baselineTotal = 0;
float lastWatchedTotal = 0;
unsigned long lastWeightChangeMs = 0;

// --- Button debounce ---
bool lastButtonState = HIGH;
bool debouncedButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// --- Potentiometer filtering ---
int smoothedPotValue = 0;
int lastPotPercent = 0;
const float POT_ALPHA = 0.2;

String jsonEscape(String s) {
  s.replace("\\", "\\\\");
  s.replace("\"", "\\\"");
  s.replace("\r", "\\r");
  s.replace("\n", "\\n");
  s.replace("\t", "\\t");
  return s;
}

void sendLogEvent(String msg) {
  Serial.println(msg);
  if (wsClientConnected) {
    String jsonLog = "{\"type\":\"log\",\"message\":\"" + jsonEscape(msg) + "\"}";
    webSocket.broadcastTXT(jsonLog);
  }
}

void armBatchWatch() {
  watchArmed = true;
  haveBaseline = false;
  seenWeightFlow = false;
  lastWeightChangeMs = millis();
}

float displayGrams(float filtered) {
  return (abs(filtered) < ZERO_DEADBAND) ? 0.0 : filtered;
}

void setSystemOff(const String& reason) {
  systemOn = false;
  forceFullSpeed = false;
  watchArmed = false;
  digitalWrite(STATUS_LED_PIN, LOW);
  ledcWrite(PWM_CHANNEL, 0);
  sendLogEvent(reason);
}

void setSystemOn(const String& reason) {
  systemOn = true;
  loadcellFaultReported = false;
  lastScaleReadyMs = millis();

  // The batch measures what lands from now on, not what is already on the decks.
  batchBaseTop = displayGrams(filteredTopGrams);
  batchBaseBottom = displayGrams(filteredBottomGrams);

  digitalWrite(STATUS_LED_PIN, HIGH);
  armBatchWatch();
  sendLogEvent(reason);
}

void maybeAutoStop(float totalGrams) {
  if (!systemOn || !watchArmed) return;

  unsigned long now = millis();
  if (!haveBaseline) {
    baselineTotal = totalGrams;
    lastWatchedTotal = totalGrams;
    lastWeightChangeMs = now;
    haveBaseline = true;
    return;
  }

  float delta = totalGrams - lastWatchedTotal;
  if (delta < 0) delta = -delta;
  if (delta >= WEIGHT_CHANGE_G) {
    lastWatchedTotal = totalGrams;
    lastWeightChangeMs = now;
    if (totalGrams >= baselineTotal + WEIGHT_FLOW_G) seenWeightFlow = true;
  }

  if (batchTargetGrams > 0 && totalGrams >= batchTargetGrams) {
    setSystemOff("[AUTO] Input weight reached");
    return;
  }

  if (seenWeightFlow && (now - lastWeightChangeMs >= WEIGHT_IDLE_MS)) {
    setSystemOff("[AUTO] Weight unchanged, batch complete");
  }
}

// If neither HX711 delivers a reading for a while during a run, stop and tell
// the dashboard. Both channels idle means the modules are unplugged or dead.
void checkLoadCellHealth() {
  if (!systemOn || loadcellFaultReported) return;

  if (topScaleLeft.is_ready() || bottomScaleRight.is_ready()) {
    lastScaleReadyMs = millis();
    return;
  }

  if (millis() - lastScaleReadyMs >= SCALE_FAULT_MS) {
    loadcellFaultReported = true;
    setSystemOff("[FAULT] loadcell: no readings from either HX711 for 5 s");
  }
}

// ---------------------------------------------------------------
// NVM: Save and Load BOTH Zeros and Calibration Factors
// ---------------------------------------------------------------
void saveSettings() {
  Preferences p;
  p.begin("cal", false);
  p.putLong("zeroTop", rawZeroTop);
  p.putLong("zeroBottom", rawZeroBottom);
  p.putFloat("calTop", calFactorTopLeft);
  p.putFloat("calBottom", calFactorBottomRight);
  p.end();
}

void loadSettings() {
  Preferences p;
  p.begin("cal", true);
  rawZeroTop    = p.getLong("zeroTop", 0);
  rawZeroBottom = p.getLong("zeroBottom", 0);
  calFactorTopLeft = p.getFloat("calTop", 116.3);
  calFactorBottomRight = p.getFloat("calBottom", 116.3);
  p.end();
  
  topScaleLeft.set_offset(rawZeroTop);
  bottomScaleRight.set_offset(rawZeroBottom);
  topScaleLeft.set_scale(calFactorTopLeft);
  bottomScaleRight.set_scale(calFactorBottomRight);
  
  Serial.println("[NVM] Loaded Calibrations. Top: " + String(calFactorTopLeft) + " | Bot: " + String(calFactorBottomRight));
}

// ---------------------------------------------------------------
// Tare both decks to zero
// ---------------------------------------------------------------
void tareBoth() {
  if (calJob != CAL_NONE) {
    sendLogEvent("[CAL] Busy. Wait for the current tare/calibration to finish.");
    return;
  }

  sendLogEvent("[TARE] Zeroing both decks... keep hands off!");
  calJob = CAL_TARE;
  calStage = 0;
  calSamples = 0;
  calSum = 0;
  calSettleUntil = millis() + CAL_SETTLE_MS;
  calDeadline = millis() + CAL_TIMEOUT_MS;
}

// ---------------------------------------------------------------
// Dynamic Calibration Logic
// ---------------------------------------------------------------
void calibrateDeck(bool isTop, float knownWeight) {
  if (knownWeight <= 0) {
    sendLogEvent("[CAL] Error: Known weight must be > 0.");
    return;
  }
  if (calJob != CAL_NONE) {
    sendLogEvent("[CAL] Busy. Wait for the current tare/calibration to finish.");
    return;
  }

  sendLogEvent(String("[CAL ") + (isTop ? "TOP" : "BOT") + "] Calibrating with " + String(knownWeight) + "g...");
  calJob = CAL_FACTOR;
  calIsTop = isTop;
  calKnownWeight = knownWeight;
  calSamples = 0;
  calSum = 0;
  calSettleUntil = millis() + CAL_SETTLE_MS;
  calDeadline = millis() + CAL_TIMEOUT_MS;
}

// Called from finishCalibration() once CAL_SAMPLES readings are collected.
void finishCalibration() {
  long average = calSum / calSamples;
  calSum = 0;
  calSamples = 0;

  if (calJob == CAL_TARE) {
    if (calStage == 0) {
      rawZeroTop = average;
      topScaleLeft.set_offset(rawZeroTop);
      filteredTopGrams = 0.0;
      deltaTop = 0;
      calStage = 1;
      return;
    }

    rawZeroBottom = average;
    bottomScaleRight.set_offset(rawZeroBottom);
    filteredBottomGrams = 0.0;
    deltaBottom = 0;
    saveSettings();
    calJob = CAL_NONE;
    sendLogEvent("[TARE DONE] Decks zeroed to 0.0 g!");
    return;
  }

  long measuredDelta = average - (calIsTop ? rawZeroTop : rawZeroBottom);
  if (measuredDelta == 0) {
    calJob = CAL_NONE;
    sendLogEvent("[CAL] Error: No weight detected.");
    return;
  }

  float factor = abs((float)measuredDelta / calKnownWeight);
  if (calIsTop) {
    calFactorTopLeft = factor;
    topScaleLeft.set_scale(calFactorTopLeft);
    filteredTopGrams = calKnownWeight;
  } else {
    calFactorBottomRight = factor;
    bottomScaleRight.set_scale(calFactorBottomRight);
    filteredBottomGrams = calKnownWeight;
  }

  saveSettings();
  calJob = CAL_NONE;
  sendLogEvent(String("[CAL ") + (calIsTop ? "TOP" : "BOT") + "] Success! New factor: " + String(factor, 2));
}

// Take at most one sample per loop so WebSocket telemetry keeps flowing.
void serviceCalibration() {
  if (calJob == CAL_NONE) return;

  if ((long)(millis() - calDeadline) >= 0) {
    calJob = CAL_NONE;
    calSamples = 0;
    calSum = 0;
    sendLogEvent("[CAL] Error: Timeout waiting for load cell readings.");
    return;
  }

  if ((long)(millis() - calSettleUntil) < 0) return;

  bool useTop = (calJob == CAL_TARE) ? (calStage == 0) : calIsTop;
  HX711 &scale = useTop ? topScaleLeft : bottomScaleRight;
  if (!scale.is_ready()) return;

  calSum += scale.read();
  calSamples++;
  if (calSamples >= CAL_SAMPLES) finishCalibration();
}

void handleCommand(char cmd) {
  if (cmd == 't' || cmd == 'T') {
    tareBoth();
  } else if (cmd == '1') {
    calibrateDeck(true, 100.0); 
  } else if (cmd == '2') {
    calibrateDeck(false, 100.0);
  } else if (cmd == 'f' || cmd == 'F') {
    forceFullSpeed = !forceFullSpeed;
    webSpeedOverride = false;
    systemOn = true;
    digitalWrite(STATUS_LED_PIN, HIGH);
    sendLogEvent(forceFullSpeed ? "[MOTOR] Forced 100% PWM" : "[MOTOR] Potentiometer Control");
  } else if (cmd == 's' || cmd == 'S') {
    if (systemOn) setSystemOff("[CMD] System OFF");
    else setSystemOn("[CMD] System ON");
  }
}

String jsonField(const String& json, const String& key) {
  String needle = "\"" + key + "\":";
  int start = json.indexOf(needle);
  if (start < 0) return "";
  start += needle.length();
  while (start < (int)json.length() && json[start] == ' ') start++;
  if (start >= (int)json.length()) return "";

  if (json[start] == '"') {
    int end = json.indexOf('"', start + 1);
    return end < 0 ? "" : json.substring(start + 1, end);
  }
  int end = start;
  while (end < (int)json.length() && json[end] != ',' && json[end] != '}') end++;
  String v = json.substring(start, end);
  v.trim();
  return v;
}

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
    batchTargetGrams = jsonField(payload, "input_weight").toFloat();
    if (batchTargetGrams < 0) batchTargetGrams = 0;
    setSystemOn("[WEB] Batch Started");
  }
  else if (cmd == "STOP") {
    batchTargetGrams = 0;
    setSystemOff("[WEB] Batch Stopped");
  }
  else if (cmd == "TARE") {
    tareBoth();
  }
  else if (cmd == "CALIBRATE_TOP") {
    float weight = jsonField(payload, "weight").toFloat();
    calibrateDeck(true, weight);
  }
  else if (cmd == "CALIBRATE_BOT") {
    float weight = jsonField(payload, "weight").toFloat();
    calibrateDeck(false, weight);
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

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      if (webSocket.connectedClients() == 0) wsClientConnected = false;
      break;
    case WStype_CONNECTED: {
      wsClientConnected = true;
      sendLogEvent("[ESP32] Linked to BeanTrack Web Dashboard");
      break;
    }
    case WStype_TEXT: {
      String message = String((char*)payload, length);
      handleWebSocketMessage(message);
      break;
    }
    default: break;
  }
}

void startNetworkServices() {
  if (MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("[mDNS] Responder started: ws://beantrack.local:81");
  }
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.println("[WS] WebSocket server started on port 81");

  // --- OTA SETUP ---
  ArduinoOTA.setHostname(MDNS_HOSTNAME); 
  ArduinoOTA.setPassword("beantrack123");

  ArduinoOTA.onStart([]() {
    isUpdating = true; 
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
    Serial.println("[OTA] Start updating " + type);
    
    // Safety: Turn off motor
    systemOn = false;
    ledcWrite(PWM_CHANNEL, 0);

    // CRITICAL FIX: Kill the WebSocket server to free up TCP ports and memory
    webSocket.disconnect(); 
    webSocket.close();      
    wsClientConnected = false;
  });
  
  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Update Complete. Rebooting...");
  });
  
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
  });
  
  ArduinoOTA.onError([](ota_error_t error) {
    isUpdating = false; // <-- RESUME MAIN LOOP IF IT FAILS
    Serial.printf("[OTA] Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
  });

  ArduinoOTA.begin();
  Serial.println("[OTA] OTA Ready. IP: " + WiFi.localIP().toString());
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RES);
  ledcAttachPin(MOTOR_PIN, PWM_CHANNEL);
  ledcWrite(PWM_CHANNEL, 0);

  topScaleLeft.begin(LEFT_DT, LEFT_SCK);
  bottomScaleRight.begin(RIGHT_DT, RIGHT_SCK);
  pinMode(LEFT_DT, INPUT_PULLUP);
  pinMode(RIGHT_DT, INPUT_PULLUP);

  loadSettings(); 

  lastScaleReadyMs = millis();

  if (WifiSettings::connectStored()) {
    startNetworkServices();
  } else {
    WifiSettings::startSetupAP();
  }

  sendLogEvent("[BOOT] System Ready. Calibration loaded from NVM.");
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

  // --- OTA UPDATE IN PROGRESS ---
  // If an update is running, bypass all WebSocket, Motor, and Sensor logic.
  // Dedicate the entire CPU and Wi-Fi stack to downloading the file.
  if (isUpdating) {
    ArduinoOTA.handle();
    delay(1); // Yield to the Wi-Fi task
    return; 
  }
  // ------------------------------

  ArduinoOTA.handle(); 

  // 1. WebSocket clients and USB Serial commands
  webSocket.loop();

  if (Serial.available() > 0) {
    handleCommand(Serial.read());
  }

  // Non-blocking tare/calibration. Takes over the HX711 reads while active.
  serviceCalibration();

  // 2. Button debounce: toggles system on/off
  int rawButtonReading = digitalRead(BUTTON_PIN);
  if (rawButtonReading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (rawButtonReading != debouncedButtonState) {
      debouncedButtonState = rawButtonReading;
      if (debouncedButtonState == LOW) {
        if (systemOn) setSystemOff("[BTN] System OFF");
        else setSystemOn("[BTN] System ON");
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

    if (motorSpeed > 0 && motorSpeed < 50 && !forceFullSpeed) {
      motorSpeed = max(motorSpeed, 90);
    }
  }

  if (rampSpeed < motorSpeed) rampSpeed = min(motorSpeed, rampSpeed + RAMP_STEP_PER_LOOP);
  else                        rampSpeed = motorSpeed;
  ledcWrite(PWM_CHANNEL, rampSpeed);

  // 4. Sample and filter load cells (the calibration job owns the reads while active)
  if (calJob == CAL_NONE) {
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
  }

  checkLoadCellHealth();

  // 5. Telemetry every 300 ms
  if (millis() - lastPrintTime >= 300) {
    lastPrintTime = millis();

    // Batch-relative readings: what each deck collected since START.
    float displayTop = displayGrams(filteredTopGrams) - batchBaseTop;
    float displayBot = displayGrams(filteredBottomGrams) - batchBaseBottom;
    if (displayTop < 0) displayTop = 0;
    if (displayBot < 0) displayBot = 0;

    maybeAutoStop(displayTop + displayBot);

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
      jsonTelemetry += "\"mode\":\"" + jsonEscape(operatingMode) + "\",";
      jsonTelemetry += "\"wifi\":\"" + jsonEscape(WiFi.SSID()) + "\",";
      jsonTelemetry += "\"vibration_speed\":" + String(speedPercent) + ",";
      jsonTelemetry += "\"active_bin\":\"" + jsonEscape(activeBin) + "\",";
      jsonTelemetry += "\"top_grams\":" + String(displayTop, 1) + ",";
      jsonTelemetry += "\"bottom_grams\":" + String(displayBot, 1) + ",";
      jsonTelemetry += "\"total_grams\":" + String(displayTop + displayBot, 1);
      jsonTelemetry += "}";

      webSocket.broadcastTXT(jsonTelemetry);
    }
  }
}