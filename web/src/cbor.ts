export type CborValue = null | boolean | number | string | Uint8Array | CborValue[] | Map<string | number, CborValue>;

export function decodeCbor(bytes: Uint8Array, check: () => void): CborValue {
  let offset = 0, nodes = 0;
  const fail = (): never => { throw new Error('Desteklenmeyen veya bozuk CBOR'); };
  const take = (count: number) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > bytes.length - offset) fail();
    const start = offset; offset += count; return start;
  };
  const integer = (info: number): number => {
    if (info < 24) return info;
    const length = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!length) return fail();
    const start = take(length);
    let value = 0;
    for (let i = start; i < offset; i++) value = value * 256 + bytes[i];
    if (!Number.isSafeInteger(value)) fail();
    return value;
  };
  const item = (depth: number): CborValue => {
    check();
    if (depth > 20 || ++nodes > 20000) throw new Error('CBOR derinlik/öğe sınırı');
    const initial = bytes[take(1)], major = initial >> 5, info = initial & 31;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      return fail();
    }
    const length = integer(info);
    if (major === 0) return length;
    if (major === 1) {
      if (length >= Number.MAX_SAFE_INTEGER) fail();
      return -1 - length;
    }
    if (major === 2 || major === 3) {
      if (length > 262144) throw new Error('CBOR metin/bayt sınırı');
      const start = take(length), value = bytes.subarray(start, offset);
      return major === 2 ? value : new TextDecoder('utf-8', { fatal: true }).decode(value);
    }
    if (major === 4) {
      if (length > 4096) fail();
      return Array.from({ length }, () => item(depth + 1));
    }
    if (major === 5) {
      if (length > 4096) fail();
      const map = new Map<string | number, CborValue>();
      for (let i = 0; i < length; i++) {
        const key = item(depth + 1);
        if ((typeof key !== 'string' && typeof key !== 'number') || map.has(key)) fail();
        map.set(key as string | number, item(depth + 1));
      }
      return map;
    }
    return fail();
  };
  const result = item(0);
  if (offset !== bytes.length) fail();
  return result;
}
