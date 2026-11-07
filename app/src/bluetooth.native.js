// Bluetooth Clásico (SPP) real, solo Android.
import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

export const isSimulated = false;

export async function requestPermissions() {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

export const requestEnabled = () => RNBluetoothClassic.requestBluetoothEnabled();
export const getPairedDevices = () => RNBluetoothClassic.getBondedDevices();
export const connect = (address) => RNBluetoothClassic.connectToDevice(address);
