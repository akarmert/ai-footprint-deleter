import type { RefObject } from 'react';
import type { CleaningMode } from '../engine';

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
