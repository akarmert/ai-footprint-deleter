// Read-only sections of the "Ayrıntılar" panel. State and the Worker lifecycle stay in App.
import type { MetadataRecord } from '../engine';
import type { FootprintResult } from '../footprints';
import type { VerifiedOutput } from '../protocol';
import { supportsDiskOutput } from '../output';
import { formatBytes } from '../app-state';
import { footprintReason, footprintStatuses } from './Workspace';

const evidenceLabels = { 'explicit-ai': 'AI beyanı', 'metadata-hint': 'AI izi', provenance: 'Kaynak kaydı' } as const;

export function FootprintOperationDetails({ result }: { result: FootprintResult }) {
  const evidence = (result.after ?? result.before).evidence;
  return (
    <section aria-label="İşlem sonucu">
      <h3>İşlem sonucu</h3>
      <p>
        {footprintStatuses[result.status]} · {footprintReason(result)}
      </p>
      {result.after && evidence.length > 0 && <p>Çıktıda kalan AI kayıtları:</p>}
      {evidence.map((item, index) => (
        <article className="record" key={index}>
          <strong>{evidenceLabels[item.category]}</strong>
          <pre>{item.source}</pre>
        </article>
      ))}
    </section>
  );
}

export function RecordList({
  records,
  removable,
  output,
}: {
  records: MetadataRecord[];
  removable: MetadataRecord[];
  output?: VerifiedOutput;
}) {
  return (
    <details className="metadata">
      <summary>Kayıtlar ve uygulanan kural</summary>
      <div>
        {records.map(record => (
          <article className="record" key={record.id}>
            <div className="record-heading">
              <strong>{record.kind}</strong>
              <span>
                {removable.some(item => item.id === record.id) ? 'Kaldırılır' : 'Korunur'} · {formatBytes(record.bytes)}
              </span>
            </div>
            <p>{record.reason}</p>
            {record.preview && <pre>{record.preview}</pre>}
          </article>
        ))}
      </div>
      {output && (
        <details>
          <summary>Görüntü verisi SHA-256</summary>
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
        {supportsDiskOutput()
          ? 'Video, doğrulandıktan sonra seçtiğin konuma kaydedilir. Masaüstü Chrome veya Edge gerekir.'
          : 'Bu tarayıcı video kaydını desteklemiyor. Masaüstü Chrome veya Edge kullan.'}
      </p>
      <details className="output">
        <summary>Geçici alan</summary>
        <p>
          İşlem sırasında video, tarayıcının geçici alanına yazılır ve iş bitince silinir. Yer yetmezse geçici dosyalar
          için ayrı bir klasör seçebilirsin. Tarayıcı çökerse geçici dosya kalabilir.
        </p>
        <button disabled={disabled} onClick={selectTemporaryDirectory}>
          Geçici klasör seç
        </button>
        {temporaryDirectory && (
          <>
            <p>Seçilen klasör: {temporaryDirectory.name}</p>
            <button disabled={disabled} onClick={useOpfs}>
              Tarayıcı alanını kullan
            </button>
          </>
        )}
      </details>
    </>
  );
}
