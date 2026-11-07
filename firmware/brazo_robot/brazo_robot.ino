// BrazoRobot — firmware para ESP32 (Arduino core 3.x)
//
// Recibe comandos de texto por Bluetooth Clásico (SPP) desde la app y mueve
// tres servos SG90 y un motor paso a paso 28BYJ-48 con driver ULN2003.
//
// Protocolo (una línea por comando, terminada en '\n'):
//   G+ / G-   garra: abrir / cerrar
//   U+ / U-   brazo vertical: subir / bajar
//   F+ / F-   brazo horizontal: adelante / atrás
//   R+ / R-   base: girar a la derecha / izquierda
//   R         detener la base
//   S         detener todo (servos y base)
//
// Los servos se mueven mientras el botón está presionado: la app manda G+ al
// presionar y S al soltar. Si se pierde la conexión, todo se detiene.
//
// Requiere un ESP32 con Bluetooth Clásico (ESP32 original / WROOM-32).
// Los modelos S2, S3, C3 y C6 solo tienen BLE y no sirven para este firmware.

#include "BluetoothSerial.h"

#if !defined(CONFIG_BT_SPP_ENABLED)
#error "Este ESP32 no tiene Bluetooth Clásico (SPP). Usa un ESP32 WROOM-32."
#endif

// ── Configuración ────────────────────────────────────────────────────────────

const char* BT_NAME = "BrazoRobot";

struct Axis {
  char cmd;        // letra del comando
  uint8_t pin;     // GPIO de la señal del servo
  int minDeg;      // límite inferior (calibrar según el kit)
  int maxDeg;      // límite superior
  int homeDeg;     // posición al encender
  float deg;       // posición actual
  int dir;         // -1, 0, +1
};

Axis axes[] = {
  // cmd  pin  min  max  home
  { 'G',  13,  20,  95,   60, 0, 0 },   // garra (G+ abre → ángulo menor/mayor según montaje)
  { 'U',  14,  40, 150,   90, 0, 0 },   // brazo vertical
  { 'F',  27,  40, 150,   90, 0, 0 },   // brazo horizontal
};
const int AXIS_COUNT = sizeof(axes) / sizeof(axes[0]);

// Si un eje se mueve al revés de lo que indica el botón, cambia su signo aquí.
const int AXIS_SIGN[] = { +1, +1, +1 };

const float SERVO_SPEED_DEG_S = 60.0;   // velocidad de los servos al mantener presionado
const uint32_t SERVO_TICK_MS = 15;

// SG90: pulso de 500 a 2400 µs para 0–180°. Ajusta si el servo zumba en los extremos.
const int SERVO_MIN_US = 500;
const int SERVO_MAX_US = 2400;
const int SERVO_FREQ_HZ = 50;
const int SERVO_RES_BITS = 14;

// 28BYJ-48 por ULN2003: IN1..IN4
const uint8_t STEPPER_PINS[4] = { 26, 25, 33, 32 };
const uint32_t STEP_INTERVAL_US = 1200;  // menor = más rápido (por debajo de ~900 µs pierde pasos)

// Secuencia de medio paso: 4096 medios pasos ≈ una vuelta del eje de salida.
const uint8_t HALF_STEP[8][4] = {
  {1, 0, 0, 0}, {1, 1, 0, 0}, {0, 1, 0, 0}, {0, 1, 1, 0},
  {0, 0, 1, 0}, {0, 0, 1, 1}, {0, 0, 0, 1}, {1, 0, 0, 1},
};

// ── Estado ───────────────────────────────────────────────────────────────────

BluetoothSerial bt;
String line;
int stepperDir = 0;
int stepIndex = 0;
uint32_t lastStepUs = 0;
uint32_t lastServoMs = 0;
bool wasConnected = false;

// ── Servos ───────────────────────────────────────────────────────────────────

void writeServo(const Axis& a) {
  int us = map((int)(a.deg + 0.5f), 0, 180, SERVO_MIN_US, SERVO_MAX_US);
  uint32_t duty = (uint32_t)us * ((1UL << SERVO_RES_BITS) - 1) / (1000000UL / SERVO_FREQ_HZ);
  ledcWrite(a.pin, duty);
}

void updateServos() {
  uint32_t now = millis();
  if (now - lastServoMs < SERVO_TICK_MS) return;
  float stepDeg = SERVO_SPEED_DEG_S * (now - lastServoMs) / 1000.0f;
  lastServoMs = now;

  for (int i = 0; i < AXIS_COUNT; i++) {
    Axis& a = axes[i];
    if (a.dir == 0) continue;
    float next = constrain(a.deg + a.dir * AXIS_SIGN[i] * stepDeg, (float)a.minDeg, (float)a.maxDeg);
    if (next != a.deg) {
      a.deg = next;
      writeServo(a);
    }
  }
}

// ── Motor paso a paso ────────────────────────────────────────────────────────

void stepperRelease() {
  // Sin corriente en las bobinas: el 28BYJ-48 no se calienta estando quieto.
  for (int i = 0; i < 4; i++) digitalWrite(STEPPER_PINS[i], LOW);
}

void updateStepper() {
  if (stepperDir == 0) return;
  uint32_t now = micros();
  if (now - lastStepUs < STEP_INTERVAL_US) return;
  lastStepUs = now;
  stepIndex = (stepIndex + stepperDir + 8) % 8;
  for (int i = 0; i < 4; i++) digitalWrite(STEPPER_PINS[i], HALF_STEP[stepIndex][i]);
}

// ── Comandos ─────────────────────────────────────────────────────────────────

void stopAll() {
  for (int i = 0; i < AXIS_COUNT; i++) axes[i].dir = 0;
  stepperDir = 0;
  stepperRelease();
}

int parseSign(const String& cmd) {
  if (cmd.length() < 2) return 0;
  return cmd[1] == '+' ? 1 : cmd[1] == '-' ? -1 : 0;
}

void handleCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  char letter = cmd[0];
  int sign = parseSign(cmd);

  if (letter == 'S') {
    stopAll();
  } else if (letter == 'R') {
    stepperDir = sign;
    if (sign == 0) stepperRelease();
  } else {
    for (int i = 0; i < AXIS_COUNT; i++) {
      if (axes[i].cmd == letter) axes[i].dir = sign;
    }
  }
  Serial.printf("cmd=%s\n", cmd.c_str());
}

void readBluetooth() {
  while (bt.available()) {
    char c = bt.read();
    if (c == '\n' || c == '\r') {
      handleCommand(line);
      line = "";
    } else if (line.length() < 16) {
      line += c;
    }
  }
}

// ── Arduino ──────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < AXIS_COUNT; i++) {
    axes[i].deg = axes[i].homeDeg;
    ledcAttach(axes[i].pin, SERVO_FREQ_HZ, SERVO_RES_BITS);
    writeServo(axes[i]);
  }
  for (int i = 0; i < 4; i++) pinMode(STEPPER_PINS[i], OUTPUT);
  stepperRelease();

  bt.begin(BT_NAME);
  Serial.printf("Listo. Empareja el teléfono con \"%s\".\n", BT_NAME);
}

void loop() {
  bool connected = bt.hasClient();
  if (wasConnected && !connected) {
    stopAll();
    Serial.println("Conexión perdida: todo detenido.");
  }
  wasConnected = connected;

  readBluetooth();
  updateServos();
  updateStepper();
}
