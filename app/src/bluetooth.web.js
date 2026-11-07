// Brazo simulado para probar la interfaz en el navegador (npm run web).
// Expone la misma API que bluetooth.native.js; los comandos se registran en
// la consola y se guardan en `device.log`.

export const isSimulated = true;

const DEMO_DEVICE = { name: 'BrazoRobot (simulado)', address: '00:00:00:00:00:00' };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const requestPermissions = async () => true;
export const requestEnabled = async () => true;
export const getPairedDevices = async () => [DEMO_DEVICE];

export async function connect() {
  await wait(400);
  let connected = true;
  const device = {
    ...DEMO_DEVICE,
    log: [],
    async write(cmd) {
      if (!connected) throw new Error('Desconectado');
      device.log.push(cmd.trim() || 'S');
      console.log('[brazo simulado] ←', JSON.stringify(cmd));
    },
    isConnected: async () => connected,
    async disconnect() {
      connected = false;
    },
  };
  return device;
}
