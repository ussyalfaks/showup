export function toUnits(amount: string, decimals: number): string {
  const a = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(a)) throw new Error(`"${amount}" is not a valid amount`);
  const [whole, frac = ''] = a.split('.');
  if (frac.length > decimals) throw new Error(`"${amount}" has too many decimals`);
  return (whole + frac.padEnd(decimals, '0')).replace(/^0+(?=\d)/, '');
}

export function fromUnits(units: string | bigint, decimals: number, maxFrac = 4): string {
  const s = units.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).slice(0, maxFrac).replace(/0+$/, '');
  return `${BigInt(whole).toString()}${frac ? '.' + frac : ''}`;
}

export const decimalsFor = (asset: string) => (asset === 'near' ? 24 : 6);
export const symbolFor = (asset: string) => (asset === 'near' ? 'NEAR' : 'USDC');
export const fmt = (units: string | bigint, asset: string) => `${fromUnits(units, decimalsFor(asset))} ${symbolFor(asset)}`;
export const nsToDate = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n));
export const shortId = (a: string) => (a.length > 20 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
