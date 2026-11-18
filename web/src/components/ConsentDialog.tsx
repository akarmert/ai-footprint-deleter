import type { RefObject } from 'react';
import type { CleaningMode } from '../engine';

export function ConsentDialog({
  dialog,
  mode,
  dismiss,
  confirm,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  mode: CleaningMode;
  dismiss: () => void;
  confirm: () => void;
}) {
  return (
    <dialog
      ref={dialog}
      aria-labelledby="consent-title"
      aria-describedby="consent-description"
      onCancel={dismiss}
      onClose={dismiss}
    >
      <p className="eyebrow">TEMİZLEME ÖNCESİ</p>
      <h2 id="consent-title">Hak ve telif bilgileri için onay</h2>
      <p id="consent-description">
        Temizlenebilir bloklar hak/telif bilgileri içerebilir. Bu kayıtları kaldırmaya yetkili olduğunuzu onaylıyor
        musunuz? Uygun blokların tüm alt alanları kaldırılır; görüntü yönü ve C2PA korumaları değişmez.{' '}
        {mode === 'comprehensive'
          ? 'Kapsamlı mod desteklenen ICC profilini kaldırabilir; renk yönetimi ve görünüm değişebilir.'
          : 'ICC renk profili korunur.'}
      </p>
      <div className="dialog-actions">
        <button
          autoFocus
          onClick={() => {
            dialog.current?.close();
            dismiss();
          }}
        >
          Vazgeç
        </button>
        <button
          className="primary"
          onClick={() => {
            confirm();
            dialog.current?.close();
            dismiss();
          }}
        >
          Yetkim var, temizle
        </button>
      </div>
    </dialog>
  );
}
