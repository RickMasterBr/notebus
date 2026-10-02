/**
 * IDs do banco (D-086).
 *
 * - Dados criados no aparelho: UUIDv7 (ordenável por tempo, P-03 C1).
 * - Dados oficiais: UUIDv5 de um `official_key` estável, ex.: `mobilis/2026-09-01/L1/ida/pos-2`.
 *   O mesmo `official_key` dá sempre o mesmo ID, em qualquer aparelho e em qualquer importação.
 */

/**
 * Namespace fixo dos IDs oficiais. **Nunca mude este valor**: todos os IDs oficiais já gravados
 * (e os backups que apontam para eles) dependem dele. Sorteado uma vez em 2026-10-02.
 */
export const OFFICIAL_ID_NAMESPACE = "3c25269e-baff-4b19-93b9-fef99a620802";

/** ID de um dado oficial: UUIDv5 do `official_key` no namespace do NoteBus. */
export function officialId(officialKey: string): string {
  if (officialKey.length === 0) throw new Error("official_key vazio");
  return uuidv5(officialKey, OFFICIAL_ID_NAMESPACE);
}

/** SHA-1 em hexadecimal do texto (UTF-8). Serve de `checksum` do arquivo importado, não de segurança. */
export function sha1Hex(text: string): string {
  return Array.from(sha1(utf8(text)), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** UUIDv5 (RFC 9562 §5.5): SHA-1 de namespace + nome. */
export function uuidv5(name: string, namespace: string): string {
  const ns = parseUuid(namespace);
  const nameBytes = utf8(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns, 0);
  input.set(nameBytes, ns.length);
  const bytes = sha1(input).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/**
 * UUIDv7 (RFC 9562 §5.7): 48 bits de epoch ms + 74 bits aleatórios.
 * `fillRandom` é injetável para teste; por padrão usa `crypto.getRandomValues` se existir.
 */
export function uuidv7(nowMs: number = Date.now(), fillRandom: (b: Uint8Array) => void = defaultRandom): string {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  let t = nowMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function defaultRandom(b: Uint8Array): void {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(b);
    return;
  }
  // Sem crypto no ambiente: Math.random basta para IDs de um único aparelho.
  for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
}

function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`UUID inválido: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function formatUuid(b: Uint8Array): string {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** SHA-1 mínimo, só para o UUIDv5 (o domínio é TypeScript puro, sem crypto do Node). */
function sha1(msg: Uint8Array): Uint8Array {
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(Math.ceil((msg.length + 9) / 64) * 64);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20 ? [(b & c) | (~b & d), 0x5a827999]
        : i < 40 ? [b ^ c ^ d, 0x6ed9eba1]
        : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
        : [b ^ c ^ d, 0xca62c1d6];
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}
