#pragma once
// Wi-Fi settings stored on the ESP32. Changing networks needs no code edits.

#include <WiFi.h>
#include <Preferences.h>
#include <WebServer.h>

namespace WifiSettings {

const char* SETUP_AP_SSID = "BeanTrack-Setup";
const char* SETUP_AP_PASS = "beantrack123";     // change this before handing the machine over
const unsigned long CONNECT_TIMEOUT_MS = 20000;

Preferences wifiPrefs;
WebServer setupServer(80);
bool setupMode = false;

bool isValidSsid(const String& s) { return s.length() >= 1 && s.length() <= 32; }
bool isValidPass(const String& p) { return p.length() == 0 || (p.length() >= 8 && p.length() <= 63); }
bool hasBadChars(const String& s) { return s.indexOf('"') >= 0 || s.indexOf('\\') >= 0; }

// Validate and save the credentials. Returns false if they are not acceptable.
bool validateAndSave(String ssid, String pass) {
  ssid.trim();
  if (!isValidSsid(ssid) || !isValidPass(pass)) return false;
  if (hasBadChars(ssid) || hasBadChars(pass)) return false;

  wifiPrefs.begin("wifi", false);
  wifiPrefs.putString("ssid", ssid);
  wifiPrefs.putString("pass", pass);
  wifiPrefs.end();
  return true;
}

// Try the saved network. Returns true if connected within the timeout.
bool connectStored() {
  wifiPrefs.begin("wifi", true);
  String ssid = wifiPrefs.getString("ssid", "");
  String pass = wifiPrefs.getString("pass", "");
  wifiPrefs.end();

  if (ssid.length() == 0) return false;

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.length() ? pass.c_str() : nullptr);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECT_TIMEOUT_MS) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

// ---------------------------------------------------------------
// CORS: lets the dashboard (localhost:5173) call the setup API
// ---------------------------------------------------------------
void addCorsHeaders() {
  setupServer.sendHeader("Access-Control-Allow-Origin", "*");
  setupServer.sendHeader("Access-Control-Allow-Private-Network", "true");
  setupServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  setupServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Browser preflight requests
void handleOptions() {
  addCorsHeaders();
  setupServer.send(204);
}

// ---------------------------------------------------------------
// Manual setup page, reachable at http://192.168.4.1
// ---------------------------------------------------------------
void handleRoot() {
  String page =
    "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>BeanTrack Wi-Fi</title></head>"
    "<body style='font-family:sans-serif;padding:20px;max-width:420px'>"
    "<h2>BeanTrack Wi-Fi setup</h2>"
    "<form method='POST' action='/save'>"
    "Network name (SSID)<br><input name='ssid' maxlength='32' required style='width:100%'><br><br>"
    "Password (leave empty for an open network)<br>"
    "<input name='pass' type='password' maxlength='63' style='width:100%'><br><br>"
    "<button type='submit'>Save and restart</button></form></body></html>";
  setupServer.send(200, "text/html", page);
}

void handleSave() {
  String ssid = setupServer.arg("ssid");
  String pass = setupServer.arg("pass");

  if (!validateAndSave(ssid, pass)) {
    setupServer.send(400, "text/plain",
      "Not saved. Name: 1-32 characters. Password: 8-63 characters or empty. "
      "Neither may contain quotes or backslashes. Go back and try again.");
    return;
  }
  setupServer.send(200, "text/plain", "Saved. The ESP32 is restarting and will try to join the network.");
  delay(1000);
  ESP.restart();
}

// ---------------------------------------------------------------
// Setup API used by the dashboard modal
// ---------------------------------------------------------------

// GET /api/status: confirms this is a BeanTrack board in setup mode
void handleStatus() {
  addCorsHeaders();
  setupServer.send(200, "application/json", "{\"setup\":true,\"device\":\"BeanTrack\"}");
}

// Escape a string for a JSON value
String jsonEscape(String s) {
  s.replace("\\", "\\\\");
  s.replace("\"", "\\\"");
  return s;
}

// GET /api/scan: nearby networks, as a JSON array of names
void handleScan() {
  int n = WiFi.scanNetworks();
  String json = "[";
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;   // skip hidden networks
    if (json.length() > 1) json += ",";
    json += "\"" + jsonEscape(ssid) + "\"";
  }
  json += "]";
  addCorsHeaders();
  setupServer.send(200, "application/json", json);
}

// POST /api/save: form-encoded body (ssid, password). Form encoding avoids a preflight.
void handleApiSave() {
  String ssid = setupServer.arg("ssid");
  String pass = setupServer.arg("password");
  addCorsHeaders();

  if (!validateAndSave(ssid, pass)) {
    setupServer.send(400, "application/json",
      "{\"ok\":false,\"error\":\"Check the network name and password\"}");
    return;
  }
  setupServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

// Opens the BeanTrack-Setup network and registers all setup routes
void startSetupAP() {
  setupMode = true;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASS);

  setupServer.on("/", HTTP_GET, handleRoot);
  setupServer.on("/save", HTTP_POST, handleSave);
  setupServer.on("/api/status", HTTP_GET, handleStatus);
  setupServer.on("/api/status", HTTP_OPTIONS, handleOptions);
  setupServer.on("/api/scan", HTTP_GET, handleScan);
  setupServer.on("/api/scan", HTTP_OPTIONS, handleOptions);
  setupServer.on("/api/save", HTTP_POST, handleApiSave);
  setupServer.on("/api/save", HTTP_OPTIONS, handleOptions);
  setupServer.begin();

  Serial.println("[SETUP] Join Wi-Fi 'BeanTrack-Setup' (password beantrack123), then open http://192.168.4.1");
}

// Erase the saved Wi-Fi name and password. The next boot opens BeanTrack-Setup.
void clearSaved() {
  wifiPrefs.begin("wifi", false);
  wifiPrefs.clear();
  wifiPrefs.end();
}

void handleClient() { setupServer.handleClient(); }

}  // namespace WifiSettings