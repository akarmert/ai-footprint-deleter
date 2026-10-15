import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { scanImage, cleanImage } from './engine.ts';
test('image Worker requires explicit valid mode and returns verified mode', async () => {
  const source = readFileSync(new URL('./inspect.worker.ts', import.meta.url), 'utf8');
  const messages: any[] = [];
  const self: any = { postMessage: (value: any) => messages.push(value) };
  runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, '')), { self, Uint8Array, Blob, IMAGE_LIMIT: 128 * 1024 * 1024, validateSelection: () => 'JPEG', scanImage, cleanImage });
  const data = new Uint8Array(readFileSync(new URL('../tests/fixtures/image-1.jpg', import.meta.url)));
  await self.onmessage({ data: { type: 'scan', file: { size: data.length, arrayBuffer: async () => data.buffer } } });
  for (const mode of [undefined, 'invalid', null]) {
    await self.onmessage({ data: { type: 'clean', ids: [], rightsConsent: true, mode } });
    assert.equal(messages.at(-1).type, 'error');
  }
  await self.onmessage({ data: { type: 'clean', ids: [], rightsConsent: true, mode: 'comprehensive' } });
  assert.equal(messages.at(-1).output.mode, 'comprehensive');
});
const encode = (text: string) => new TextEncoder().encode(text);
const source = () => new Uint8Array(readFileSync(new URL('../tests/fixtures/progressive.jpg', import.meta.url)));
const join = (...parts: Uint8Array[]) => { const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length}return out; };
const insert = (data:Uint8Array,marker:number,payload:Uint8Array) => join(data.subarray(0,2),new Uint8Array([255,marker,(payload.length+2)>>8,(payload.length+2)&255]),payload,data.subarray(2));
test('genuine JPEG with XMP CreatorTool, model, prompt and seed: preview, consent, removal',async()=>{
  const xmp=encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:ai="urn:fixture:ai" xmp:CreatorTool="Fixture generator" ai:model="test-model" ai:prompt="blue mountain" ai:seed="42"/></rdf:RDF></x:xmpmeta>');
  const original=source(),data=insert(original,225,xmp),record=scanImage(data).records.find(r=>r.kind==='XMP')!;
  assert.match(record.preview,/CreatorTool.*test-model.*blue mountain.*42/);
  await assert.rejects(cleanImage(data,[record.id],false),/onay/);
  const result=await cleanImage(data,[record.id],true);
  assert.deepEqual(result.data,original);assert.equal(result.removed,1);
});
test('genuine JPEG Photoshop IPTC copyright resource remains unless explicitly authorized',async()=>{
  // Photoshop Image Resource Block 0x0404 containing IIM dataset 2:116 (copyright notice).
  const value=encode('Copyright fixture owner');
  const iim=join(new Uint8Array([0x1c,2,116,0,value.length]),value);
  const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,iim.length);
  const resource=join(encode('Photoshop 3.0\0'),encode('8BIM'),new Uint8Array([4,4,0,0]),size,iim,...(iim.length%2?[new Uint8Array(1)]:[]));
  const original=source(),data=insert(original,237,resource),record=scanImage(data).records.find(r=>r.kind==='IPTC')!;
  assert.equal(record.status,'protected');assert.equal(record.requiresRightsConsent,true);assert.match(record.preview,/Copyright fixture owner/);
  await assert.rejects(cleanImage(data,[record.id],false));
  assert.deepEqual((await cleanImage(data,[record.id],true)).data,original);
});
