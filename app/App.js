import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert,
  StatusBar, SafeAreaView,
} from 'react-native';
import * as bt from './src/bluetooth';

// ── Paleta de colores ─────────────────────────────────────────
const C = {
  bg:       '#0D0F14',
  surface:  '#161A23',
  card:     '#1E2330',
  accent:   '#00E5FF',
  accent2:  '#FF6B35',
  success:  '#00C896',
  danger:   '#FF3B5C',
  text:     '#E8EAED',
  textMid:  '#8B90A0',
  textDim:  '#454A5C',
  border:   '#2A3040',
};

// ── Pantalla: Escáner de dispositivos ─────────────────────────
function ScanScreen({ onConnect }) {
  const [devices, setDevices]     = useState([]);
  const [scanning, setScanning]   = useState(false);
  const [connecting, setConnecting] = useState(null);

  const scanDevices = async () => {
    try {
      const permsOk = await bt.requestPermissions();
      if (!permsOk) { Alert.alert('Permisos requeridos', 'Activa los permisos de Bluetooth en ajustes.'); return; }
      const granted = await bt.requestEnabled();
      if (!granted) { Alert.alert('Bluetooth desactivado'); return; }

      setScanning(true);
      // Mostrar dispositivos ya emparejados
      const paired = await bt.getPairedDevices();
      setDevices(paired);
      setScanning(false);
    } catch (e) {
      setScanning(false);
      Alert.alert('Error', e.message);
    }
  };

  const connect = async (device) => {
    try {
      setConnecting(device.address);
      const conn = await bt.connect(device.address);
      onConnect(conn);
    } catch (e) {
      setConnecting(null);
      Alert.alert('No se pudo conectar', e.message);
    }
  };

  useEffect(() => { scanDevices(); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.header}>
        <Text style={s.headerTitle}>BRAZO ROBOT</Text>
        <Text style={s.headerSub}>Selecciona tu dispositivo</Text>
      </View>

      <TouchableOpacity style={s.scanBtn} onPress={scanDevices} disabled={scanning}>
        {scanning
          ? <ActivityIndicator color={C.accent} />
          : <Text style={s.scanBtnText}>↺  Buscar dispositivos</Text>
        }
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={d => d.address}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          !scanning && (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>📡</Text>
              <Text style={s.emptyText}>
                No hay dispositivos emparejados.{'\n'}
                Empareja "BrazoRobot" en ajustes Bluetooth primero.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.deviceCard, item.name === 'BrazoRobot' && s.deviceCardHighlight]}
            onPress={() => connect(item)}
            disabled={!!connecting}
          >
            <View style={s.deviceIcon}>
              <Text style={{ fontSize: 18 }}>🤖</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.deviceName}>{item.name || 'Sin nombre'}</Text>
              <Text style={s.deviceAddr}>{item.address}</Text>
            </View>
            {connecting === item.address
              ? <ActivityIndicator color={C.accent} size="small" />
              : <Text style={s.chevron}>›</Text>
            }
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

// ── Botón de control con presión continua ─────────────────────
function HoldButton({ label, sublabel, onPressIn, onPressOut, color = C.accent, style }) {
  const [pressed, setPressed] = useState(false);
  return (
    <TouchableOpacity
      style={[s.holdBtn, { borderColor: pressed ? color : C.border }, style]}
      onPressIn={() => { setPressed(true); onPressIn(); }}
      onPressOut={() => { setPressed(false); onPressOut(); }}
      activeOpacity={1}
    >
      <View style={[s.holdBtnGlow, pressed && { backgroundColor: color + '22' }]} />
      <Text style={[s.holdBtnLabel, { color: pressed ? color : C.text }]}>{label}</Text>
      {sublabel && <Text style={s.holdBtnSub}>{sublabel}</Text>}
    </TouchableOpacity>
  );
}

// ── Control de motor: botón con indicador de dirección ────────
function MotorControl({ onPressIn, onPressOut, direction, active }) {
  return (
    <TouchableOpacity
      style={[s.motorBtn, active && s.motorBtnActive]}
      onPressIn={() => { onPressIn(direction); }}
      onPressOut={onPressOut}
      activeOpacity={1}
    >
      <Text style={[s.motorBtnIcon, active && { color: C.accent2 }]}>
        {direction === '+' ? '↻' : '↺'}
      </Text>
      <Text style={s.motorBtnLabel}>
        {direction === '+' ? 'Derecha' : 'Izquierda'}
      </Text>
    </TouchableOpacity>
  );
}

// ── Pantalla principal de control ─────────────────────────────
function ControlScreen({ device, onDisconnect }) {
  const [motorDir, setMotorDir] = useState(null); // '+' | '-' | null
  const sendRef   = useRef(null);
  const lostRef   = useRef(false);

  // Monitor de desconexión inesperada
  useEffect(() => {
    const sub = device.onDataReceived?.(() => {}); // mantiene socket vivo si la lib lo soporta
    const check = setInterval(async () => {
      try {
        const ok = await device.isConnected();
        if (!ok && !lostRef.current) {
          lostRef.current = true;
          clearInterval(check);
          Alert.alert('Desconectado', 'Se perdió la conexión con el brazo.');
          onDisconnect();
        }
      } catch (_) {}
    }, 2000);
    return () => { clearInterval(check); sub?.remove?.(); };
  }, [device]);

  const [lastCmd, setLastCmd] = useState(null);

  const send = useCallback(async (cmd) => {
    if (lostRef.current) return;
    try {
      await device.write(cmd);
      if (bt.isSimulated) setLastCmd(cmd.trim() || 'S');
    } catch (e) {
      // No desconectar por un solo error de escritura — el monitor lo detectará
    }
  }, [device]);

  sendRef.current = send;

  const disconnect = async () => {
    lostRef.current = true;
    try { await device.write('S \n'); } catch (_) {}
    try { await device.disconnect(); } catch (_) {}
    onDisconnect();
  };

  // Handlers servo (presión continua → mueve; soltar → para)
  const makeHandlers = (cmd) => ({
    onPressIn:  () => send(cmd[0] + '\n'),
    onPressOut: () => send('S \n'),
  });

  // Handlers motor
  const motorPressIn = (dir) => {
    setMotorDir(dir);
    send(`R${dir}\n`);
  };
  const motorPressOut = () => {
    setMotorDir(null);
    send('R \n');
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>CONTROL</Text>
          <Text style={[s.headerSub, { color: C.success }]}>
            ● Conectado · {device.name}
          </Text>
          {bt.isSimulated && (
            <Text style={s.headerSub}>Último comando: {lastCmd ?? '—'}</Text>
          )}
        </View>
        <TouchableOpacity style={s.disconnectBtn} onPress={disconnect}>
          <Text style={s.disconnectText}>Desconectar</Text>
        </TouchableOpacity>
      </View>

      <View style={s.controlsWrap}>

        {/* ── Garra ─────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>GARRA</Text>
          <View style={s.row}>
            <HoldButton
              label="✊" sublabel="Cerrar"
              color={C.danger}
              {...makeHandlers(['G-', 'S '])}
              style={{ flex: 1 }}
            />
            <View style={s.axisDot} />
            <HoldButton
              label="🖐" sublabel="Abrir"
              color={C.success}
              {...makeHandlers(['G+', 'S '])}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {/* ── Brazo vertical ────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>BRAZO — VERTICAL</Text>
          <View style={s.col}>
            <HoldButton
              label="▲" sublabel="Subir"
              color={C.accent}
              {...makeHandlers(['U+', 'S '])}
              style={s.wideBtn}
            />
            <HoldButton
              label="▼" sublabel="Bajar"
              color={C.accent}
              {...makeHandlers(['U-', 'S '])}
              style={s.wideBtn}
            />
          </View>
        </View>

        {/* ── Brazo horizontal ──────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>BRAZO — HORIZONTAL</Text>
          <View style={s.row}>
            <HoldButton
              label="◀" sublabel="Atrás"
              color={C.accent}
              {...makeHandlers(['F-', 'S '])}
              style={{ flex: 1 }}
            />
            <View style={s.axisDot} />
            <HoldButton
              label="▶" sublabel="Adelante"
              color={C.accent}
              {...makeHandlers(['F+', 'S '])}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {/* ── Motor paso a paso ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ROTACIÓN BASE</Text>
          <View style={s.row}>
            <MotorControl
              onPressIn={motorPressIn}
              onPressOut={motorPressOut}
              direction="-"
              active={motorDir === '-'}
            />
            <View style={s.motorCenter}>
              <View style={[s.motorIndicator, motorDir && s.motorIndicatorActive]} />
              <Text style={s.motorStatus}>
                {motorDir === '+' ? 'Girando →' : motorDir === '-' ? '← Girando' : 'Detenido'}
              </Text>
            </View>
            <MotorControl
              onPressIn={motorPressIn}
              onPressOut={motorPressOut}
              direction="+"
              active={motorDir === '+'}
            />
          </View>
        </View>

        {/* ── Parada de emergencia ──────────────────────────── */}
        <TouchableOpacity style={s.stopBtn} onPress={() => send('S \n')}>
          <Text style={s.stopBtnText}>⬛  PARADA TOTAL</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

// ── App raíz ──────────────────────────────────────────────────
export default function App() {
  const [device, setDevice] = useState(null);
  return device
    ? <ControlScreen device={device} onDisconnect={() => setDevice(null)} />
    : <ScanScreen onConnect={setDevice} />;
}

// ── Estilos ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.accent, letterSpacing: 3 },
  headerSub:   { fontSize: 12, color: C.textMid, marginTop: 2 },

  // Scan
  scanBtn: {
    margin: 16, padding: 14, borderRadius: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent,
    alignItems: 'center',
  },
  scanBtnText: { color: C.accent, fontWeight: '700', fontSize: 15 },

  emptyBox: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: C.textMid, textAlign: 'center', lineHeight: 22, fontSize: 14 },

  deviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  deviceCardHighlight: { borderColor: C.accent + '80' },
  deviceIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
  deviceName: { color: C.text, fontWeight: '600', fontSize: 15 },
  deviceAddr: { color: C.textMid, fontSize: 12, marginTop: 2 },
  chevron:    { color: C.textDim, fontSize: 24 },

  // Control screen
  disconnectBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.danger + '22', borderWidth: 1, borderColor: C.danger + '60',
  },
  disconnectText: { color: C.danger, fontWeight: '600', fontSize: 13 },

  controlsWrap: { flex: 1, padding: 16, gap: 14 },

  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: C.textDim, letterSpacing: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  col: { gap: 8 },

  axisDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.textDim,
  },

  holdBtn: {
    height: 70, borderRadius: 14, borderWidth: 1.5,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  holdBtnGlow: {
    ...StyleSheet.absoluteFillObject, borderRadius: 14,
  },
  holdBtnLabel: { fontSize: 22, fontWeight: '700', zIndex: 1 },
  holdBtnSub:   { fontSize: 11, color: C.textMid, marginTop: 2, zIndex: 1 },

  wideBtn: { height: 60 },

  // Motor
  motorBtn: {
    flex: 1, height: 80, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  motorBtnActive: { borderColor: C.accent2, backgroundColor: C.accent2 + '15' },
  motorBtnIcon:   { fontSize: 26, color: C.textMid },
  motorBtnLabel:  { fontSize: 12, color: C.textMid },

  motorCenter: { alignItems: 'center', gap: 6 },
  motorIndicator: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: C.textDim,
  },
  motorIndicatorActive: { backgroundColor: C.accent2 },
  motorStatus: { fontSize: 11, color: C.textMid, textAlign: 'center' },

  // Stop
  stopBtn: {
    marginTop: 4, padding: 16, borderRadius: 14,
    backgroundColor: C.danger + '18', borderWidth: 2, borderColor: C.danger,
    alignItems: 'center',
  },
  stopBtnText: { color: C.danger, fontWeight: '800', fontSize: 16, letterSpacing: 1 },
});