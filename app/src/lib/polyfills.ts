// Must be imported first: near-api-js needs secure random bytes and Buffer.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
