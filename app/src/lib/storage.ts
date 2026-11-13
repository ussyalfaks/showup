import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Keys live in the device's secure enclave/keystore. On web (demo only) they fall back to localStorage.
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}
