import { decodeCbor, type CborValue } from './cbor.ts';
import type { C2paManifest, C2paReport } from './c2pa-types';

const MAX = 4 * 1024 * 1024;
const suffix = '00110010800000aa00389b71';
const uuid = (prefix: string) => prefix + suffix;
function fail(message: string): never { throw new Error(message); }
const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const four = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
const u32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
const string = (value: CborValue | undefined) => typeof value === 'string' && value.length <= 4096 ? value : undefined;
const map = (value: CborValue | undefined) => value instanceof Map ? value : undefined;
type Box = { type: string; data: Uint8Array; children: Box[]; uuid?: string; label?: string };

export function readC2pa(data: Uint8Array, format: string, detected: boolean, now: () => number = () => performance.now()): C2paReport {
  const report = (status: C2paReport['status'], reason: string, manifests: C2paManifest[] = []): C2paReport => ({ status, reason, manifests, signatureVerification: 'not-performed' });
  if (format !== 'JPEG') return report(detected ? 'unsupported' : 'absent', detected ? 'Bu kapsayıcı için C2PA okuma desteklenmiyor.' : 'Desteklenen C2PA kaydı algılanmadı; yokluk garantisi değildir.');
  const deadline = now() + 250;
  let operations = 0, boxes = 0;
  const check = () => { if (++operations > 100000 || now() > deadline) fail('C2PA işlem/süre sınırı'); };
  try {
    if (data.length > 128 * 1024 * 1024 || data[0] !== 255 || data[1] !== 216) fail('JPEG sınırı/başlığı');
    let offset = 2, group: { instance: number; size: number; header: Uint8Array; parts: Uint8Array[]; bytes: number; sequence: number } | undefined;
    let groupEnded = false;
    while (offset < data.length) {
      check();
      if (data[offset++] !== 255) fail('JPEG marker sınırı');
      while (data[offset] === 255) { offset++; check(); }
      const marker = data[offset++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 2 > data.length) fail('JPEG eksik uzunluk');
      const length = (data[offset] << 8) | data[offset + 1];
      if (length < 2 || offset + length > data.length) fail('JPEG uzunluğu');
      const payload = data.subarray(offset + 2, offset + length); offset += length;
      if (marker !== 235) { if (group) groupEnded = true; continue; }
      if (groupEnded) fail('APP11 parçaları bitişik değil');
      if (payload.length < 16 || payload[0] !== 74 || payload[1] !== 80) fail('Desteklenmeyen APP11 başlığı');
      const instance = (payload[2] << 8) | payload[3], sequence = u32(payload, 4), size = u32(payload, 8);
      if (four(payload, 12) !== 'jumb' || size < 8 || size > MAX) fail('APP11 JUMBF boyutu/türü desteklenmiyor');
      if (!group) {
        if (sequence !== 1) fail('APP11 ilk sıra numarası');
        group = { instance, size, header: payload.subarray(8, 16), parts: [], bytes: 8, sequence: 0 };
      }
      if (group.instance !== instance || sequence !== group.sequence + 1 || size !== group.size || group.header.some((value, i) => value !== payload[8 + i])) fail('APP11 parçaları eksik, tekrarlı veya tutarsız');
      if (group.parts.length >= 128 || group.bytes + payload.length - 16 > size || payload.length === 16) fail('APP11 parça sınırı/uzunluğu');
      group.parts.push(payload.subarray(16)); group.bytes += payload.length - 16; group.sequence = sequence;
    }
    if (!group) return report(detected ? 'unreadable' : 'absent', detected ? 'C2PA / provenance çözümlenemedi.' : 'C2PA APP11 bulunamadı; yokluk garantisi değildir.');
    if (group.bytes !== group.size) fail('APP11 eksik toplam uzunluk');
    const joined = new Uint8Array(group.size); joined.set(group.header); let position = 8;
    for (const part of group.parts) { check(); joined.set(part, position); position += part.length; }
    const parse = (bytes: Uint8Array, depth: number): Box[] => {
      if (depth > 12) fail('JUMBF derinlik sınırı');
      const result: Box[] = []; let pos = 0;
      while (pos < bytes.length) {
        check();
        if (++boxes > 1024 || pos + 8 > bytes.length) fail('JUMBF kutu sınırı');
        const size = u32(bytes, pos), type = four(bytes, pos + 4);
        if (size < 8 || size > bytes.length - pos) fail('JUMBF uzunluğu');
        const box: Box = { type, data: bytes.subarray(pos + 8, pos + size), children: [] }; pos += size;
        if (type === 'jumb') {
          box.children = parse(box.data, depth + 1);
          const description = box.children[0];
          if (description?.type !== 'jumd' || description.data.length < 18) fail('JUMD açıklaması');
          const desc = description.data, flags = desc[16];
          if (flags !== 3 && flags !== 19) fail('Desteklenmeyen JUMD bayrakları');
          const end = desc.indexOf(0, 17);
          if (end < 18 || end - 17 > 512) fail('JUMD etiket sınırı');
          box.label = text(desc.subarray(17, end));
          box.uuid = Array.from(desc.subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
          if (flags === 3 && end + 1 !== desc.length) fail('JUMD ek veri');
          if (flags === 19) {
            const salt = desc.subarray(end + 1);
            if (salt.length < 24 || u32(salt, 0) !== salt.length || four(salt, 4) !== 'c2sh') fail('JUMD salt yapısı');
          }
          if (box.children.slice(1).some(child => child.type === 'jumd')) fail('Yinelenen JUMD');
        }
        result.push(box);
      }
      return result;
    };
    const roots = parse(joined, 0), store = roots[0];
    if (roots.length !== 1 || store.type !== 'jumb' || store.uuid !== uuid('63327061') || store.label !== 'c2pa') fail('Desteklenmeyen C2PA store');
    const manifestBoxes = store.children.slice(1);
    if (!manifestBoxes.length || manifestBoxes.length > 16) fail('Manifest sayısı sınırı');
    const manifests: C2paManifest[] = [];
    const decode = (box: Box) => {
      const children = box.children.slice(1);
      if (children.length !== 1 || children[0].type !== 'cbor') fail('Desteklenmeyen CBOR kutusu');
      const value = decodeCbor(children[0].data, check);
      return map(value) ?? fail('CBOR map bekleniyor');
    };
    for (const mb of manifestBoxes) {
      check();
      if (mb.uuid !== uuid('63326d61') || !mb.label) fail('Sıkıştırılmış/update/bilinmeyen manifest desteklenmiyor');
      if (manifests.some(manifest => manifest.label === mb.label)) fail('Yinelenen manifest etiketi');
      const manifest: C2paManifest = { label: mb.label, claimGenerator: [], assertions: [], actions: [], signature: 'unreadable', aiSources: [] };
      const claims = mb.children.filter(child => child.uuid === uuid('6332636c'));
      if (claims.length !== 1 || !['c2pa.claim', 'c2pa.claim.v2'].includes(claims[0].label ?? '')) fail('Claim yapısı/sürümü desteklenmiyor');
      const claim = decode(claims[0]);
      const generator = string(claim.get('claim_generator'));
      if (generator) manifest.claimGenerator.push(generator);
      const info = claim.get('claim_generator_info');
      for (const entry of Array.isArray(info) ? info : info instanceof Map ? [info] : []) {
        const name = string(map(entry)?.get('name'));
        if (name && !manifest.claimGenerator.includes(name)) manifest.claimGenerator.push(name);
      }
      const signatures = mb.children.filter(child => child.uuid === uuid('63326373') && child.label === 'c2pa.signature');
      if (signatures.length > 1) fail('Yinelenen signature');
      if (signatures.length && signatures[0].children.some(child => child.type === 'cbor' && child.data.length > 0)) manifest.signature = 'present-unverified';
      const stores = mb.children.filter(child => child.uuid === uuid('63326173'));
      if (stores.length !== 1 || stores[0].label !== 'c2pa.assertions') fail('Assertion store yapısı');
      for (const assertion of stores[0].children.slice(1)) {
        check();
        if (!assertion.label || manifest.assertions.includes(assertion.label)) fail('Assertion etiketi eksik/tekrarlı');
        manifest.assertions.push(assertion.label);
        if (!/^c2pa\.actions(?:\.v2)?(?:__\d+)?$/.test(assertion.label)) continue;
        if (assertion.uuid !== uuid('63626f72')) fail('Actions CBOR UUID');
        const actions = decode(assertion).get('actions');
        if (!Array.isArray(actions) || actions.length > 128) fail('Actions listesi sınırı/yapısı');
        for (const entry of actions) {
          const action = map(entry), name = string(action?.get('action'));
          if (!action || !name) fail('Action yapısı');
          const sourceType = string(action.get('digitalSourceType'));
          const softwareValue = action.get('softwareAgent');
          const software = string(softwareValue) ?? string(map(softwareValue)?.get('name'));
          const description = string(action.get('description'));
          const source = `${manifest.label} / ${assertion.label}`;
          manifest.actions.push({ action: name, sourceType, software, description, source });
          if (sourceType === 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia') {
            if (!manifest.aiSources.includes(source)) manifest.aiSources.push(source);
          }
        }
      }
      manifests.push(manifest);
    }
    return report('readable-unverified', 'Desteklenen JPEG C2PA alanları okundu. İmza, assertion bağlantıları, trust ve içerik hash doğrulanmadı; bunlar doğrulanmamış kaynak beyanlarıdır.', manifests);
  } catch (error) {
    return report('unreadable', error instanceof Error ? error.message : 'C2PA çözümlenemedi');
  }
}
