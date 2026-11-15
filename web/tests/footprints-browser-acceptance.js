async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const requests = [];
  page.on('request', request => requests.push({method:request.method(),url:request.url()}));
  // Delays and failures are injected only at the Worker boundary in this isolated test page.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__testWorkerMode = '';
    window.__testCleanRequests = 0;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) {
        if (message.type !== 'clean-footprints') return super.postMessage(message, ...rest);
        window.__testCleanRequests++;
        if (window.__testWorkerMode === 'delay') return setTimeout(() => super.postMessage(message, ...rest), 600);
        if (window.__testWorkerMode === 'failure') {
          return setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { type: 'clean-footprints', footprintResult: { status: 'VERIFICATION_FAILED', reason: 'Injected boundary failure', plan: { metadataIds: [], removeC2pa: false, unsupported: [] }, before: { evidence: [], state: 'INCOMPLETE', incomplete: true } } } })), 0);
        }
        return super.postMessage(message, ...rest);
      }
    };
  });
  await page.goto('http://localhost:3000');
  const upload = async (kind = 'combined') => {
    await page.evaluate(async kind => {
      const e = s => new TextEncoder().encode(s);
      const join = (...parts) => { const a = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){a.set(p,o);o+=p.length;}return a; };
      const box = (t,p) => {const a=new Uint8Array(p.length+8);new DataView(a.buffer).setUint32(0,a.length);a.set(e(t),4);a.set(p,8);return a;};
      const sb=(t,l,p)=>box('jumb',join(box('jumd',join(e(t),new Uint8Array([0,17,0,16,128,0,0,170,0,56,155,113,3]),e(l+'\0'))),p));
      const store=sb('c2pa','c2pa',sb('c2ma','manifest',sb('c2cl','c2pa.claim',box('cbor',new Uint8Array([0xa0])))));
      const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;
      const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));
      let data=new Uint8Array(await blob.arrayBuffer());
      const segment=(marker,p)=>{data=join(data.subarray(0,2),new Uint8Array([255,marker,(p.length+2)>>8,(p.length+2)&255]),p,data.subarray(2));};
      if(['combined','c2pa','blocked','partial'].includes(kind)) segment(235,join(new Uint8Array([74,80,0,1,0,0,0,1]),store));
      const attrs=kind==='blocked'?'https://example.invalid/manifest': 'self#jumbf=/c2pa/manifest/c2pa.claim';
      if(['combined','blocked','partial'].includes(kind)) segment(225,e('http://ns.adobe.com/xap/1.0/\0<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:d="http://purl.org/dc/terms/" xmlns:i="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:t="urn:unrelated" t:rights="Copyright retained" d:provenance="'+attrs+'"'+(kind==='partial'?' i:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"':'')+'/></r:RDF>'));
      if(['combined','text','partial'].includes(kind))segment(254,e('AI parameters: ComfyUI prompt: synthetic test only'));
      if(kind==='hint')segment(254,e('Copyright Alice. ComfyUI mentioned in an article.'));
      if(kind==='partial')segment(224,e('JFXX\0opaque retained thumbnail metadata'));
      const dt=new DataTransfer();dt.items.add(new File([data],kind+'.jpg',{type:'image/jpeg'}));const input=document.querySelector('#media');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    }, kind);
    await page.locator('#footprint-title').waitFor();
    await page.waitForFunction(()=>!document.querySelector('.status-dot.busy'));
  };
  const remove=page.locator('#remove-footprints');
  const dialog=page.locator('dialog[aria-labelledby="footprint-consent-title"]');
  await upload();
  assert(await remove.isEnabled(),'Combined plan not enabled');
  assert(!await page.locator('#advanced-tools').evaluate(e=>e.open),'Advanced tools initially expanded');
  await remove.click();
  assert(await dialog.isVisible(),'Common consent missing');
  assert(await dialog.locator('input[type=checkbox]').count()===2,'Separate permissions missing');
  assert(await dialog.getByRole('button',{name:'Vazgeç',exact:true}).evaluate(e=>e===document.activeElement),'Initial cancel focus missing');
  const confirm=dialog.getByRole('button',{name:'Onayla ve AI Ayak İzini Kaldır',exact:true});
  assert(await confirm.isDisabled(),'Consent defaulted to true');
  await dialog.locator('input[type=checkbox]').first().check();
  assert(await confirm.isDisabled(),'One consent grants both');
  await page.keyboard.press('Escape');assert(!await dialog.isVisible(),'Escape failed');
  await page.waitForFunction(()=>document.activeElement?.id==='remove-footprints');
  await remove.click();assert(await dialog.locator('input:checked').count()===0,'Consent not reset');
  await dialog.getByRole('button',{name:'Vazgeç',exact:true}).click();assert(await remove.isEnabled(),'Cancel started operation');
  await page.waitForFunction(()=>document.activeElement?.id==='remove-footprints');
  assert(await dialog.getAttribute('aria-describedby')==='footprint-consent-description','Consent scope not described');
  await remove.focus();await page.keyboard.press('Enter');
  await dialog.locator('input[type=checkbox]').nth(0).check();await dialog.locator('input[type=checkbox]').nth(1).check();
  await confirm.click();
  const download=page.getByRole('button',{name:'Doğrulanmış Dosyayı İndir',exact:true});await download.waitFor();
  assert(await page.locator('#footprint-title').textContent()==='Desteklenen kaynak kayıtları kaldırıldı','Combined success missing');
  assert(await remove.isDisabled(),'Second clean enabled');
  await page.locator('#advanced-tools > summary').click();
  const mode=page.getByRole('button',{name:'Kapsamlı Temizlik',exact:true});
  assert(await mode.isDisabled(),'Mode can discard unified output');
  await mode.evaluate(element=>element.click());
  assert(await download.isVisible(),'Mode discarded unified output');
  assert(await page.getByRole('heading',{name:'Çıktıda kalan metadata kayıtları',exact:true}).isVisible(),'Output records not labeled');
  assert(await page.locator('#advanced-tools .summary-counts strong').first().textContent()==='2','Source records shown as remaining output');
  assert(await page.locator('#advanced-tools .record-heading strong').allTextContents().then(names=>names.length===2 && names.includes('XMP') && names.includes('JFIF')),'Unexpected retained metadata');
  const downloading=page.waitForEvent('download');await download.click();const file=await downloading;assert(file.suggestedFilename().endsWith('.jpg'),'Download filename');
  const viewports=[];
  for(const width of [320,390,768,1280,1440]){
    await page.setViewportSize({width,height:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${width}`);
    viewports.push({width,overflow:false});
  }
  await upload('none');assert(await remove.isDisabled(),'No-record removal enabled');assert(!await download.isVisible(),'Old download remained');
  await upload('hint');assert(await remove.isDisabled(),'Mixed hint removal enabled');
  assert(await page.locator('#footprint-title').textContent()==='AI ile ilişkili metadata ipuçları bulundu','Hint heading replaced by unsupported warning');
  assert(await page.locator('.footprint-summary .warning').first().isVisible(),'Unsupported hint warning missing');
  await upload('blocked');assert(await remove.isDisabled(),'External reference not blocked');
  assert(await page.locator('.status').evaluate(element=>element.classList.contains('has-warning')),'Blocked scan shown as green');
  await upload('partial');
  assert(await page.locator('#footprint-title').textContent()==='AI üretimine ilişkin kayıt bulundu','AI declaration heading replaced by unsupported warning');
  await remove.click();for(const input of await dialog.locator('input[type=checkbox]').all())await input.check();await confirm.click();await download.waitFor();
  assert(await page.locator('#footprint-title').textContent()==='Bazı kayıtlar kaldırıldı, bazıları korundu','Partial result missing');
  assert(await page.locator('.footprint-summary').getByText(/Korunan metadata tam incelenemedi/).isVisible(),'Partial retained metadata limitation missing');
  assert(await page.locator('.status strong').textContent()==='Kısmen kaldırıldı · Çıktı doğrulandı','Partial verification status missing');
  assert(await page.locator('.metadata-results .panel-heading .chip').textContent()==='Temizlenmiş çıktı','Output labeled as source');
  await page.locator('#advanced-tools > summary').click();
  assert(!await page.locator('#advanced-tools').getByText(/All performed stages verified/).isVisible(),'Raw technical result reason exposed');
  // Hold the Worker boundary to make replacement, double-click and cancellation deterministic.
  await upload('text');await page.evaluate(()=>{window.__testWorkerMode='delay';window.__testCleanRequests=0;});
  await remove.click();for(const input of await dialog.locator('input[type=checkbox]').all())await input.check();
  await page.evaluate(()=>{const button=document.querySelector('dialog[open] .primary');button.click();button.click();});
  assert(await page.evaluate(()=>window.__testCleanRequests)===1,'Duplicate clean request');
  await upload('none');assert(!await download.isVisible(),'Stale clean output survived new source');
  await upload('text');await remove.click();for(const input of await dialog.locator('input[type=checkbox]').all())await input.check();await confirm.click();
  await page.getByRole('button',{name:'İptal et',exact:true}).click();
  assert(!await download.isVisible(),'Cancelled output published');
  await upload('text');await page.evaluate(()=>{window.__testWorkerMode='failure';});
  await remove.click();for(const input of await dialog.locator('input[type=checkbox]').all())await input.check();await confirm.click();
  await page.getByRole('heading',{name:'Temizleme doğrulanamadı',exact:true}).waitFor();
  assert(!await download.isVisible(),'Failed verification permits download');
  assert(await page.locator('.status').evaluate(element=>element.classList.contains('has-warning')),'Failed verification shown as green');
  assert(await page.locator('.status strong').textContent()==='Temizleme doğrulanamadı','Failed verification status missing');
  await page.locator('#advanced-tools > summary').click();
  assert(!await page.locator('#advanced-tools').getByText('Injected boundary failure',{exact:false}).isVisible(),'Raw failure reason exposed');
  assert(await page.getByRole('button',{name:"Metadata'yı Temizle",exact:true}).isEnabled(),'Failed unified result unnecessarily blocks advanced cleaning');
  assert(await page.getByRole('button',{name:'Kapsamlı Temizlik',exact:true}).isDisabled(),'Mode can erase failed result');
  await page.evaluate(()=>{window.__testWorkerMode='';});
  assert(requests.every(r=>r.method==='GET'&&r.url.startsWith('http://localhost:3000/')),'Unexpected media/network request');
  return {combined:true,download:true,separateConsent:true,escape:true,cancel:true,keyboard:true,noRecord:true,hintsProtected:true,externalBlocked:true,partial:true,sourceReplacement:true,viewports,requests:requests.length};
}
