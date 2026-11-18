// Presentational sections of the "Teknik Ayrıntılar ve Gelişmiş Araçlar" panel, moved out of
// main.tsx unchanged. State and worker lifecycle stay in App.
import type { MetadataRecord } from '../engine';
import type { FootprintResult } from '../footprints';
import type { MediaScan, VerifiedOutput } from '../protocol';
import { supportsDiskOutput } from '../output';
import { footprintReason, footprintStatuses } from './Workspace';

export function FootprintOperationDetails({ result }: { result: FootprintResult }) {
  return (
    <section aria-label="AI ayak izi işlem ayrıntıları">
      <h3>İşlem sonucu ve kalan kayıtlar</h3>
      <p>
        {footprintStatuses[result.status]} · {footprintReason(result)}
      </p>
      {(result.after ?? result.before).evidence.map((item, index) => (
        <article className="record" key={index}>
          <strong>
            {item.category === 'explicit-ai'
              ? 'AI beyanı · Doğrulanmamış'
              : item.category === 'metadata-hint'
                ? 'Metadata ipucu'
                : 'Kaynak geçmişi'}
          </strong>
          <pre>{item.source}</pre>
        </article>
      ))}
    </section>
  );
}

export function CleaningEligibilityNote({
  scan,
  output,
  eligible,
}: {
  scan: MediaScan;
  output?: VerifiedOutput;
  eligible: MetadataRecord[];
}) {
  if (output)
    return (
      <p className="scan-note">
        Bu liste yeniden taranan çıktıda korunan kayıtları gösterir; temizleme seçenekleri kaynak dosyaya aittir.
      </p>
    );
  if (scan.cleaningBlocked)
    return (
      <p className="warning">
        Kaynak/imza kaydı mevcut, belirsiz veya yapı güvenle işlenemiyor: metadata temizliği engellendi. Yalnız
        desteklenen gömülü C2PA deposu için ayrı kaldırma düğmesi sunulur. İmza doğrulama yapılmaz.
      </p>
    );
  if (!eligible.length)
    return (
      <p className="warning">
        {scan.records.length
          ? 'Kaldırılabilecek metadata bulunamadı. Renk profili, görüntü yönü veya desteklenmeyen kayıtlar güvenlik için korunuyor.'
          : 'Desteklenen metadata kaydı bulunamadı; temizlenecek kayıt yok. Bu, tüm metadata’nın yokluğu garantisi değildir.'}
      </p>
    );
  return (
    <p className="scan-note">
      Temizlenecek kayıtlar seçilen moda göre belirlenir. Hak/telif bilgisi için gerektiğinde onay istenir.
    </p>
  );
}

export function C2paScopeNote() {
  return (
    <p className="scan-note" id="c2pa-scope-note">
      Yalnız C2PA’yı Kaldır: üst düzey gömülü C2PA deposu ve varsa yalnız ona bağlı tek yerel XMP işaretçisi kaldırılır.
      Bu depodaki üretici, telif, lisans ve Actions bilgileri çıktıda kaybolur; diğer metadata korunur. İmzalar
      doğrulanmaz; harici manifestler ve görünmez filigranlar etkilenmez.
    </p>
  );
}

export function CleaningPolicyDetails({
  records,
  eligible,
  output,
}: {
  records: MetadataRecord[];
  eligible: MetadataRecord[];
  output?: VerifiedOutput;
}) {
  return (
    <details className="metadata">
      <summary>Temizleme politikası ve doğrulama ayrıntıları</summary>
      <div>
        {records.map(record => (
          <article className="record" key={record.id}>
            <div className="record-heading">
              <strong>{record.kind}</strong>
              <span>
                {eligible.some(item => item.id === record.id)
                  ? record.requiresRightsConsent
                    ? 'Yetki onayıyla'
                    : 'Temizlenebilir'
                  : 'Korunur'}{' '}
                · {record.bytes.toLocaleString('tr-TR')} bayt
              </span>
            </div>
            <p>{record.reason}</p>
            {record.preview && <pre>{record.preview}</pre>}
          </article>
        ))}
      </div>
      {output && (
        <details>
          <summary>Payload SHA-256</summary>
          <code>{output.payloadHash}</code>
        </details>
      )}
    </details>
  );
}

export function VideoDiskOptions({
  disabled,
  temporaryDirectory,
  selectTemporaryDirectory,
  useOpfs,
}: {
  disabled: boolean;
  temporaryDirectory?: FileSystemDirectoryHandle;
  selectTemporaryDirectory: () => void;
  useOpfs: () => void;
}) {
  return (
    <>
      <p className="warning">
        Video kaydı güncel masaüstü Chrome/Edge, HTTPS (veya localhost), File System Access ve yeterli geçici yerel alan
        gerektirir.{' '}
        {supportsDiskOutput()
          ? 'Dosya yeniden doğrulandıktan sonra ayrı hedefe kaydedilir.'
          : 'Bu tarayıcı doğrudan disk kaydını desteklemiyor; video çıktısı kaydedilemez. Blob indirme alternatifi yoktur.'}
      </p>
      <details className="output">
        <summary>Geçici video alanı ve disk sınırları</summary>
        <p>
          Varsayılan OPFS kotası işlem öncesinde tahmin edilir; tahmin gerçek boş alan garantisi değildir. Kota
          hatasında veya büyük videolarda ayrı bir yerel klasör seçebilirsiniz. Bu klasöre geçici medya yazılır ve işlem
          sonunda silinir; çökmede kalabilir. Kaynak ve hedef için ayrı dosyalar kullanın.
        </p>
        <button disabled={disabled} onClick={selectTemporaryDirectory}>
          Geçici yerel klasör seç
        </button>
        {temporaryDirectory && (
          <>
            <p>Seçilen klasör: {temporaryDirectory.name}</p>
            <button disabled={disabled} onClick={useOpfs}>
              OPFS kullan
            </button>
          </>
        )}
      </details>
    </>
  );
}
