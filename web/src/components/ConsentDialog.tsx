import { useState, type RefObject } from 'react';
import type { FootprintPlan } from '../footprints';
import type { CleaningMode } from '../engine';

export function FootprintConsentDialog({ dialog, plan, dismiss, confirm }: { dialog: RefObject<HTMLDialogElement | null>; plan?: FootprintPlan; dismiss: () => void; confirm: (consent: { c2paConsent: boolean; rightsConsent: boolean }) => void }) {
  const [c2paConsent, setC2paConsent] = useState(false);
  const [rightsConsent, setRightsConsent] = useState(false);
  function reset() { setC2paConsent(false); setRightsConsent(false); dismiss(); }
  const ready = !!plan && (!plan.requiresC2paConsent || c2paConsent) && (!plan.requiresRightsConsent || rightsConsent);
  return <dialog ref={dialog} aria-labelledby="footprint-consent-title" aria-describedby="footprint-consent-description" onCancel={reset} onClose={reset}>
    <p className="eyebrow">AI AYAK İZİ İŞLEMİ</p><h2 id="footprint-consent-title">Kaldırılacak kayıtlar için ayrı izinler</h2>
    <div id="footprint-consent-description"><p>Yalnız güvenle kaldırılabilen üst düzey kayıtlar işlenir. Kaynak dosya değişmez. Bu işlem tüm AI izlerini veya görünmez filigranları kaldırmaz; imza doğrulaması yapmaz.</p>
    <ul>{plan?.changes.map(change => <li key={change}>{change}</li>)}</ul>
    {plan?.impacts.map(impact => <p key={impact} className="scan-note">{impact}</p>)}</div>
    {plan?.requiresC2paConsent && <p><label><input type="checkbox" checked={c2paConsent} onChange={event => setC2paConsent(event.target.checked)} /> Gömülü C2PA deposunu ve doğrulanmış yerel bağlantısını kaldırmaya yetkim var. Üretici, telif, lisans ve işlem geçmişinin kaybolmasını onaylıyorum.</label></p>}
    {plan?.requiresRightsConsent && <p><label><input type="checkbox" checked={rightsConsent} onChange={event => setRightsConsent(event.target.checked)} /> Seçilen metadata bloklarındaki hak ve telif bilgilerini kaldırmaya yetkim var.</label></p>}
    <div className="dialog-actions"><button autoFocus onClick={() => dialog.current?.close()}>Vazgeç</button><button className="primary" disabled={!ready} onClick={() => { if (!ready) return; confirm({ c2paConsent, rightsConsent }); dialog.current?.close(); }}>Onayla ve AI Ayak İzini Kaldır</button></div>
  </dialog>;
}

export function ConsentDialog({ dialog, mode, dismiss, confirm }: { dialog: RefObject<HTMLDialogElement | null>; mode: CleaningMode; dismiss: () => void; confirm: () => void }) {
  return <dialog ref={dialog} aria-labelledby="consent-title" aria-describedby="consent-description" onCancel={dismiss} onClose={dismiss}>
    <p className="eyebrow">TEMİZLEME ÖNCESİ</p><h2 id="consent-title">Hak ve telif bilgileri için onay</h2>
    <p id="consent-description">Temizlenebilir bloklar hak/telif bilgileri içerebilir. Bu kayıtları kaldırmaya yetkili olduğunuzu onaylıyor musunuz? Uygun blokların tüm alt alanları kaldırılır; görüntü yönü ve C2PA korumaları değişmez. {mode === 'comprehensive' ? 'Kapsamlı mod desteklenen ICC profilini kaldırabilir; renk yönetimi ve görünüm değişebilir.' : 'ICC renk profili korunur.'}</p>
    <div className="dialog-actions"><button autoFocus onClick={() => { dialog.current?.close(); dismiss(); }}>Vazgeç</button><button className="primary" onClick={() => { confirm(); dialog.current?.close(); dismiss(); }}>Yetkim var, temizle</button></div>
  </dialog>;
}

export function C2paConsentDialog({ dialog, dismiss, confirm }: { dialog: RefObject<HTMLDialogElement | null>; dismiss: () => void; confirm: () => void }) {
  return <dialog ref={dialog} aria-labelledby="c2pa-consent-title" aria-describedby="c2pa-consent-description" onCancel={dismiss} onClose={dismiss}>
    <p className="eyebrow">AYRI C2PA İŞLEMİ</p><h2 id="c2pa-consent-title">Yalnız gömülü C2PA kaydını kaldır</h2>
    <div id="c2pa-consent-description"><p>Dosyanın üst düzey gömülü C2PA manifest deposu ve varsa yalnız bu depoya bağlandığı doğrulanmış tek yerel XMP provenance alanı birlikte kaldırılır. Bu depodaki üretici/yazar, telif, lisans ve işlem geçmişi (Actions) bilgileri çıktıda kaybolur. Bu bilgileri kaldırmaya yetkili olduğunuzu onaylamanız gerekir.</p><p>Kaynak dosya değişmez; ilgisiz XMP alanları ve diğer metadata korunur. İmzalar, trust (güven zinciri) ve C2PA içerik hash’leri kriptografik olarak doğrulanmaz. Harici manifestler ve görünmez filigranlar bu işlemden etkilenmez. Bu işlem tüm AI izlerini kaldırmaz.</p></div>
    <div className="dialog-actions"><button autoFocus onClick={() => { dialog.current?.close(); dismiss(); }}>Vazgeç</button><button className="primary" onClick={() => { confirm(); dialog.current?.close(); dismiss(); }}>Yetkim var, yalnız C2PA’yı kaldır</button></div>
  </dialog>;
}
