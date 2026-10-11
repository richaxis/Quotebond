// Pure helpers (no dependencies) so they can be unit-tested.
export function toWei(text) {
  const [whole, frac = ""] = String(text).trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) throw new Error("Enter a number like 5 or 0.5");
  const wei = BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
  if (wei <= 0n) throw new Error("Amount must be greater than 0");
  return wei;
}

export function fromWei(value, digits = 4) {
  const v = BigInt(value ?? 0);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// genlayer-js can return dicts as Map objects; turn them into plain objects.
export function plain(x) {
  if (x instanceof Map) return Object.fromEntries([...x].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(x)) return x.map(plain);
  return x;
}

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
