import { KeyPair } from 'near-api-js';
import { signCheckin } from '../src/lib/near.ts';
const kp = KeyPair.fromRandom('ed25519');
const ts = 10_060_000; // ms, inside the test's check-in window
const qr = signCheckin(kp.toString(), '0', 'ada.near', ts);
console.log(JSON.stringify({ pk: kp.getPublicKey().toString(), ts, sig: qr.s }));
