async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.goto('http://localhost:3000');
  const upload = async (ai, malformed = false) => {
    await page.evaluate(async ({ ai, malformed }) => {
      const e = text => new TextEncoder().encode(text);
      const join = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
      const u32 = n => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n); return a; };
      const box = (type, ...parts) => { const p = join(...parts); return join(u32(p.length + 8), e(type), p); };
      const sb = (type, label, ...parts) => box('jumb', box('jumd', e(type), new Uint8Array([0,17,0,16,128,0,0,170,0,56,155,113,3]), e(label), new Uint8Array([0])), ...parts);
      const cb = value => { const h = (m,n) => n < 24 ? new Uint8Array([m*32+n]) : new Uint8Array([m*32+24,n]); if (typeof value === 'string') { const b=e(value); return join(h(3,b.length),b); } if (Array.isArray(value)) return join(h(4,value.length),...value.map(cb)); const entries=Object.entries(value); return join(h(5,entries.length),...entries.flatMap(([k,v])=>[cb(k),cb(v)])); };
      const actions = malformed ? new Uint8Array([0xa1]) : cb({actions:[{action:'c2pa.created',digitalSourceType:`http://cv.iptc.org/newscodes/digitalsourcetype/${ai ? 'trainedAlgorithmicMedia' : 'digitalCapture'}`,description:'Applied SynthID watermark'}]});
      const store = sb('c2pa','c2pa',sb('c2ma','urn:uuid:browser-fixture',sb('c2as','c2pa.assertions',sb('cbor','c2pa.actions.v2',box('cbor',actions))),sb('c2cl','c2pa.claim.v2',box('cbor',cb({claim_generator_info:[{name:'Fixture Generator <script>not executable</script>'}]}))),sb('c2cs','c2pa.signature',box('cbor',new Uint8Array([0xd2,0x80])))));
      const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
      const jpeg=new Uint8Array(await blob.arrayBuffer()), parts=[];
      for(let pos=8,seq=1;pos<store.length;pos+=64,seq++) { const p=join(new Uint8Array([74,80,0,1]),u32(seq),store.subarray(0,8),store.subarray(pos,pos+64));parts.push(join(new Uint8Array([255,235,(p.length+2)>>8,(p.length+2)&255]),p)); }
      const dt=new DataTransfer();dt.items.add(new File([jpeg.subarray(0,2),...parts,jpeg.subarray(2)],'c2pa-fixture.jpg',{type:'image/jpeg'}));
      const input=document.querySelector('#media');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    }, { ai, malformed });
    await page.getByText('Metadata taraması tamamlandı',{exact:true}).waitFor();
  };
  await upload(true);
  const results=page.locator('.metadata-results');
  assert(await results.getByRole('heading',{name:'AI üretim beyanı bulundu',exact:true}).count()===1,'AI declaration missing');
  await results.getByRole('button',{name:'Expand all',exact:true}).click();
  assert(await results.getByText('Fixture Generator <script>not executable</script>',{exact:true}).isVisible(),'Generator missing');
  await results.getByRole('button',{name:'Collapse all',exact:true}).click();
  assert(!await results.locator('.c2pa-reader').isVisible(),'C2PA collapse failed');
  await results.getByRole('button',{name:/^File /}).click();
  assert(await results.locator('.c2pa-reader').count()===0,'C2PA category filter failed');
  await results.getByRole('button',{name:/^C2PA /}).click();
  assert(await results.locator('.c2pa-reader').isVisible(),'C2PA expand failed');
  assert(await results.locator('script').count()===0,'HTML executed');
  assert(await results.getByText(/Var; doğrulanmadı/).count()===1,'Signature unverified status missing');
  assert(await page.getByRole('button',{name:"Metadata'yı Temizle",exact:true}).isDisabled(),'Cleaning unblocked');
  for(const width of [320,390,768,1320]) {
    await page.setViewportSize({width,height:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${width}`);
    assert(await page.evaluate(()=>{
      const sections=['.source-panel','.inspection-panel','.metadata-results','footer'].map(selector=>document.querySelector(selector));
      return sections.every((element,index)=>index===0||sections[index-1].getBoundingClientRect().bottom<=element.getBoundingClientRect().top+1);
    }),`Section order ${width}`);
    assert(await results.locator('.c2pa-reader p').evaluateAll(elements=>elements.every(element=>element.scrollWidth<=element.clientWidth+1)),`Metadata overflow ${width}`);
    assert(await page.evaluate(()=>{
      const host=document.querySelector('.c2pa-manifest');
      const value='https://example.invalid/'+ 'a'.repeat(512) + '/' + '0123456789abcdef'.repeat(32);
      const probe=document.createElement('pre');probe.textContent=value;host.append(probe);
      const range=document.createRange();range.selectNodeContents(probe);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      const valid=selection.toString()===value&&probe.textContent===value&&probe.scrollWidth<=probe.clientWidth+1&&getComputedStyle(probe).textOverflow!=='ellipsis';
      selection.removeAllRanges();probe.remove();return valid;
    }),`Long value readability/selection ${width}`);
  }
  await upload(false);
  assert(await results.getByRole('heading',{name:'Provenance bulundu, AI durumu belirsiz',exact:true}).count()===1,'Non AI provenance mislabeled');
  await upload(true,true);
  assert(await results.getByRole('heading',{name:'Provenance bulundu, AI durumu belirsiz',exact:true}).count()===1,'Malformed provenance mislabeled');
  assert(await results.getByText(/Çözümlenemedi\. Desteklenmeyen/).count()===1,'Unreadable missing');
  return {syntheticC2pa:'passed',fragmented:'passed',aiStates:'passed',unverified:'passed',malformed:'passed',html:'escaped',viewports:[320,390,768,1320],realGemini:'NOT TESTED'};
}
