// Structural support is independent of best-effort CBOR display and signature trust.
const MAX_STORE = 4 * 1024 * 1024;
const C2PA_UUID = '6332706100110010800000aa00389b71';
const CLAIM_UUID = '6332636c00110010800000aa00389b71';
export type C2paStoreIndex = { targets: string[] };
const isClaimLabel = (label: string) => label === 'c2pa.claim' || label === 'c2pa.claim.v2';
const isPathLabel = (label: string) =>
  label.length > 0 && label !== '.' && !/[/\\%?#\s\u0000-\u001f\u007f]/u.test(label) && !label.includes('..');

export function resolveLocalC2paReference(value: string, index: C2paStoreIndex): boolean {
  const prefix = 'self#jumbf=';
  if (!value.startsWith(prefix)) return false;
  const reference = value.slice(prefix.length);
  const path = reference.startsWith('/') ? reference : '/' + reference;
  const parts = path.split('/');
  if (
    (parts.length !== 3 && parts.length !== 4) ||
    parts[0] !== '' ||
    parts[1] !== 'c2pa' ||
    !isPathLabel(parts[2]) ||
    (parts.length === 4 && !isClaimLabel(parts[3]))
  )
    return false;
  return index.targets.includes(path);
}

export function validateC2paStore(data: Uint8Array): C2paStoreIndex {
  if (data.length > MAX_STORE) throw new Error('C2PA store size limit');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const four = (p: number) => String.fromCharCode(...data.subarray(p, p + 4));
  let count = 0;
  const targets: string[] = [];
  type Description = { uuid: string; label: string; claimLabel?: string; hasClaimCbor?: boolean };
  const tree = (start: number, end: number, depth: number): Description | undefined => {
    if (depth > 12) throw new Error('JUMBF depth limit');
    let pos = start,
      description: Description | undefined,
      children = 0,
      cborChildren = 0,
      claims = 0;
    let claimLabel: string | undefined;
    const labels = new Set<string>();
    while (pos < end) {
      if (++count > 1024 || pos + 8 > end) throw new Error('JUMBF box limit/header');
      const size = view.getUint32(pos),
        type = four(pos + 4);
      if (size < 8 || size > end - pos) throw new Error('JUMBF box length');
      const p = pos + 8,
        finish = pos + size;
      if (type === 'jumd') {
        if (children !== 0 || description || finish - p < 19) throw new Error('JUMD position/length');
        const flags = data[p + 16];
        if (flags !== 3 && flags !== 19) throw new Error('JUMD flags unsupported');
        let zero = p + 17;
        while (zero < finish && data[zero] !== 0 && zero - p <= 529) zero++;
        if (zero === p + 17 || zero >= finish || zero - p > 529) throw new Error('JUMD label');
        const label = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(p + 17, zero));
        if (flags === 3 && zero + 1 !== finish) throw new Error('JUMD trailing data');
        if (
          flags === 19 &&
          (finish - zero - 1 < 24 || view.getUint32(zero + 1) !== finish - zero - 1 || four(zero + 5) !== 'c2sh')
        )
          throw new Error('JUMD salt');
        description = {
          uuid: Array.from(data.subarray(p, p + 16), b => b.toString(16).padStart(2, '0')).join(''),
          label,
        };
      } else if (type === 'jumb') {
        const nested = tree(p, finish, depth + 1);
        if (!nested) throw new Error('JUMBF missing description');
        if (labels.has(nested.label))
          throw new Error(depth === 0 ? 'Yinelenen manifest etiketi' : 'JUMBF duplicate description');
        labels.add(nested.label);
        if (nested.uuid === C2PA_UUID) throw new Error('Nested C2PA store unsupported');
        if (depth === 0 && nested.uuid !== '63326d6100110010800000aa00389b71')
          throw new Error('Manifest type unsupported');
        if (depth === 1 && nested.uuid === CLAIM_UUID) {
          if (++claims > 1) throw new Error('Multiple C2PA claims unsupported');
          if (isClaimLabel(nested.label) && nested.hasClaimCbor) claimLabel = nested.label;
        }
        if (depth === 0 && nested.claimLabel && isPathLabel(nested.label)) {
          const path = '/c2pa/' + nested.label;
          targets.push(path, path + '/' + nested.claimLabel);
        }
      } else if (depth === 0 || !['cbor', 'json', 'uuid', 'bidb', 'bfdb', 'free'].includes(type))
        throw new Error('JUMBF content type unsupported');
      if (type === 'cbor') cborChildren++;
      if (children === 0 && type !== 'jumd') throw new Error('JUMBF description missing');
      children++;
      if (depth === 0 && children > 17) throw new Error('Manifest count limit');
      pos = finish;
    }
    if (children < 2) throw new Error('JUMBF content missing');
    if (description && isClaimLabel(description.label) && description.uuid !== CLAIM_UUID)
      throw new Error('C2PA claim UUID mismatch');
    if (description) {
      description.hasClaimCbor = cborChildren === 1 && children === 2;
      if (claims === 1) description.claimLabel = claimLabel;
    }
    return description;
  };
  if (data.length < 8 || view.getUint32(0) !== data.length || four(4) !== 'jumb')
    throw new Error('Single JUMBF root required');
  const root = tree(8, data.length, 0);
  if (root?.uuid !== C2PA_UUID || root.label !== 'c2pa') throw new Error('C2PA UUID/label mismatch');
  return { targets };
}
