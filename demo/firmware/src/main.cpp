#include <Arduino.h>
#include <DHT.h>
#include "config.h"

DHT dht(DHT_PIN, DHT22);

void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_PIN, OUTPUT);
  dht.begin();
}

void loop() {
  static uint32_t lastLog = 0;
  float t = dht.readTemperature();
  analogWrite(MOTOR_PIN, t > 25.0 ? 200 : 90);
  if (millis() - lastLog > LOG_INTERVAL_MS) {
    Serial.printf("temp=%.1f\n", t);
    lastLog = millis();
  }
}
