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

// Setup page served by the ESP32 itself, reachable at http://192.168.4.1
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

// Opens the BeanTrack-Setup network and the setup page
void startSetupAP() {
  setupMode = true;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASS);

  setupServer.on("/", HTTP_GET, handleRoot);
  setupServer.on("/save", HTTP_POST, handleSave);
  setupServer.begin();

  Serial.println("[SETUP] Join Wi-Fi 'BeanTrack-Setup' (password beantrack123), then open http://192.168.4.1");
}

void handleClient() { setupServer.handleClient(); }

}  // namespace WifiSettings