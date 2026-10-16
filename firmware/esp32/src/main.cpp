#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include "HX711.h"

// --- Wi-Fi Credentials (Update with your local Wi-Fi network) ---
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MDNS_HOSTNAME = "beantrack"; // Accessible at ws://beantrack.local:81

// --- WebSocket Server on Port 81 ---
WebSocketsServer webSocket = WebSocketsServer(81);
bool wsClientConnected = false;

// --- Pin Definitions ---
const int LEFT_DT  = 26; // Top Sieve Deck
const int LEFT_SCK = 27;
const int RIGHT_DT = 32; // Bottom Deck
const int RIGHT_SCK = 33;

const int BUTTON_PIN     = 14;
const int MOTOR_PIN      = 25;
const int POT_PIN        = 34;
const int STATUS_LED_PIN = 4;  // Dedicated ON/OFF Indicator LED Pin

// --- ESP32 Native LEDC PWM Channel Settings ---
const int PWM_CHANNEL = 0;
const int PWM_FREQ    = 5000;   // 5 kHz PWM frequency
const int PWM_RES     = 8;      // 8-bit resolution (0 - 255)

HX711 topScaleLeft;
HX711 bottomScaleRight;

// --- Calibration Factors ---
float calFactorTopLeft     = 116.3; 
float calFactorBottomRight = 116.3; 
const float KNOWN_WEIGHT_G = 165.0; 

// --- EMA Filtering & Deadband (Scales) ---
const float FILTER_ALPHA  = 0.15;      
const float ZERO_DEADBAND = 2.5;      

float filteredTopGrams    = 0.0;
float filteredBottomGrams = 0.0;

long rawZeroTop    = 0;
long rawZeroBottom = 0;
long deltaTop      = 0;
long deltaBottom   = 0;

// --- System & Operating State Variables ---
bool systemOn = false;
bool forceFullSpeed = false;
bool webSpeedOverride = false; // True when web slider sets speed; False when physical pot is used
int webTargetSpeedPercent = 40;
String operatingMode = "Automatic"; // "Automatic" or "Manual"

unsigned long lastPrintTime = 0;

// --- Button Noise Debounce Variables ---
bool lastButtonState = HIGH;
bool debouncedButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50; 

// --- Potentiometer Noise-Filtering Variables ---
int smoothedPotValue = 0;
int lastPotPercent = 0;
const float POT_ALPHA = 0.2; // Smooths out motor voltage ripple on ADC

// Helper function to broadcast log events to both USB Serial and Web Dashboard
void sendLogEvent(String msg) {
  Serial.println(msg);
  if (wsClientConnected) {
    String jsonLog = "{\"type\":\"log\",\"message\":\"" + msg + "\"}";
    webSocket.broadcastTXT(jsonLog);
  }
}

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
  
  sendLogEvent("[TARE DONE] Decks zeroed to 0.0 g!");
}

// Single-character commands (compatible with both USB Serial and WebSocket)
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

// Parse incoming WebSocket payloads from the React Dashboard
void handleWebSocketMessage(String payload) {
  payload.trim();

  // Support quick single-character commands ('t', '1', '2', 'f', 's')
  if (payload.length() == 1) {
    handleCommand(payload[0]);
    return;
  }

  // Support structured JSON or string commands from React UI
  if (payload.indexOf("START") >= 0) {
    systemOn = true;
    digitalWrite(STATUS_LED_PIN, HIGH);
    sendLogEvent("[WEB] Batch Started");
  } 
  else if (payload.indexOf("STOP") >= 0) {
    systemOn = false;
    forceFullSpeed = false;
    digitalWrite(STATUS_LED_PIN, LOW);
    sendLogEvent("[WEB] Batch Stopped");
  } 
  else if (payload.indexOf("TARE") >= 0) {
    tareBoth();
  } 
  else if (payload.indexOf("CAL_TOP") >= 0) {
    handleCommand('1');
  } 
  else if (payload.indexOf("CAL_BOT") >= 0) {
    handleCommand('2');
  } 
  else if (payload.indexOf("SET_MODE") >= 0) {
    if (payload.indexOf("Manual") >= 0) {
      operatingMode = "Manual";
    } else {
      operatingMode = "Automatic";
    }
    sendLogEvent("[WEB] Mode set to " + operatingMode);
  } 
  else if (payload.indexOf("SET_SPEED") >= 0) {
    // Expects format like {"command":"SET_SPEED","value":65} or "SET_SPEED:65"
    int colonIdx = payload.lastIndexOf(':');
    if (colonIdx != -1) {
      String valStr = payload.substring(colonIdx + 1);
      valStr.replace("}", "");
      valStr.replace("\"", "");
      valStr.trim();
      int newSpeed = valStr.toInt();
      webTargetSpeedPercent = constrain(newSpeed, 0, 100);
      webSpeedOverride = true;
      forceFullSpeed = false;
      sendLogEvent("[WEB] Vibration speed set to " + String(webTargetSpeedPercent) + "%");
    }
  }
}

// WebSocket Event Callback
void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u disconnected.\n", num);
      if (webSocket.connectedClients() == 0) {
        wsClientConnected = false;
      }
      break;

    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] Client #%u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      wsClientConnected = true;
      sendLogEvent("[ESP32] Linked to BeanTrack Web Dashboard");
      break;
    }

    case WStype_TEXT: {
      String message = String((char*)payload);
      handleWebSocketMessage(message);
      break;
    }

    default:
      break;
  }
}

void setupWiFi() {
  Serial.println();
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());

    if (MDNS.begin(MDNS_HOSTNAME)) {
      Serial.println("[mDNS] Responder started: ws://beantrack.local:81");
    }

    webSocket.begin();
    webSocket.onEvent(onWebSocketEvent);
    Serial.println("[WS] WebSocket server started on port 81");
  } else {
    Serial.println("\n[WiFi] Connection failed! Continuing in offline/Serial mode.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Configure ESP32 Native LEDC PWM for Motor Control on GPIO 25
  // Note: If using ESP32 Arduino Core v3.0+, replace ledcSetup/ledcAttachPin with: ledcAttach(MOTOR_PIN, PWM_FREQ, PWM_RES);
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RES);
  ledcAttachPin(MOTOR_PIN, PWM_CHANNEL);
  ledcWrite(PWM_CHANNEL, 0);

  // Initialize HX711 Load Cells
  topScaleLeft.begin(LEFT_DT, LEFT_SCK);
  bottomScaleRight.begin(RIGHT_DT, RIGHT_SCK);
  pinMode(LEFT_DT, INPUT_PULLUP);
  pinMode(RIGHT_DT, INPUT_PULLUP);

  topScaleLeft.set_scale(calFactorTopLeft);
  bottomScaleRight.set_scale(calFactorBottomRight);

  // Initialize Wi-Fi & WebSocket Server
  setupWiFi();

  // Zero scales on startup
  tareBoth();
}

void loop() {
  // 1. Handle WebSocket clients & USB Serial commands
  webSocket.loop();

  if (Serial.available() > 0) {
    handleCommand(Serial.read());
  }

  // 2. Noise-Resistant Button Debounce Logic
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

  // 3. Filtered Potentiometer Reading & Native PWM Drive
  int rawPot = analogRead(POT_PIN);
  smoothedPotValue = (int)((POT_ALPHA * rawPot) + ((1.0 - POT_ALPHA) * smoothedPotValue));
  int currentPotPercent = map(smoothedPotValue, 0, 4095, 0, 100);

  // If user physically turns the knob by more than 3%, return control to physical potentiometer
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
    
    // Friction Kickstart: Ensure minimum pulse to prevent stiction stall at low speeds
    if (motorSpeed > 0 && motorSpeed < 50 && !forceFullSpeed) {
      motorSpeed = max(motorSpeed, 90); 
    }
  }
  
  ledcWrite(PWM_CHANNEL, motorSpeed);

  // 4. Sample & Filter Load Cells
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

  // 5. Broadcast Live Telemetry Every 300ms to Web Dashboard & USB Serial
  if (millis() - lastPrintTime >= 300) {
    lastPrintTime = millis();

    float displayTop = (abs(filteredTopGrams) < ZERO_DEADBAND) ? 0.0 : filteredTopGrams;
    float displayBot = (abs(filteredBottomGrams) < ZERO_DEADBAND) ? 0.0 : filteredBottomGrams;

    // Determine which deck is actively gaining weight
    String activeBin = "None";
    if (systemOn) {
      if (displayTop > displayBot && displayTop > 0) activeBin = "Top Deck (Large)";
      else if (displayBot > 0) activeBin = "Bottom Deck (Medium/Fine)";
      else activeBin = "Sorting";
    }

    // Print human-readable status to Serial Monitor
    String statusLine = String(systemOn ? "[ON " : "[OFF ") + String(speedPercent) + "%] " +
                        "TOP: " + String(displayTop, 1) + "g | " +
                        "BOT: " + String(displayBot, 1) + "g";
    Serial.println(statusLine);

    // Broadcast JSON Telemetry to React Frontend over WebSocket
    if (wsClientConnected) {
      String jsonTelemetry = "{";
      jsonTelemetry += "\"type\":\"telemetry\",";
      jsonTelemetry += "\"systemOn\":" + String(systemOn ? "true" : "false") + ",";
      jsonTelemetry += "\"status\":\"" + String(systemOn ? "Sorting" : "Idle") + "\",";
      jsonTelemetry += "\"mode\":\"" + operatingMode + "\",";
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