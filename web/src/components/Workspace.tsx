import type { RefObject } from 'react';
import type { MediaScan, VerifiedOutput } from '../protocol';
import type { FootprintReport, FootprintPlan, FootprintResult } from '../footprints';
import { describeAiTools, detectAiTools } from '../ai-generator';
import { formatBytes } from '../app-state';
import { Icon } from './Home';

export const footprintStatuses: Record<FootprintResult['status'], string> = {
  REMOVED_VERIFIED: 'Metadata kaldırıldı',
  PARTIALLY_REMOVED: 'Metadata kaldırıldı; bazı kayıtlar korundu',
  BLOCKED: 'Bu dosya güvenle temizlenemiyor',
  NOTHING_TO_REMOVE: 'Kaldırılacak metadata yok',
  VERIFICATION_FAILED: 'Temizlik doğrulanamadı',
};
const reasons: Record<string, string> = {
  'Provenance or metadata that cannot be removed safely is present':
    'Dosyada güvenle kaldırılamayan bir kaynak kaydı veya metadata var; dosyaya dokunulmadı.',
  'No removable metadata': 'Dosyada kaldırılabilecek metadata bulunmadı.',
  'All metadata removal stages verified; retained blocks are listed': 'Çıktı yeniden tarandı ve doğrulandı.',
  'Atomic operation failed; no output released': 'İşlem doğrulanamadığı için çıktı verilmedi.',
};
export function footprintReason(result: FootprintResult) {
  return reasons[result.reason] ?? footprintStatuses[result.status];
}

const headings = {
  AI_DECLARATION: 'AI METADATA BULUNDU',
  METADATA_HINTS: 'AI METADATA BULUNDU',
  PROVENANCE_ONLY: 'AI METADATA BULUNDU',
  NO_RECORDS: 'AI METADATA BULUNAMADI',
  INCOMPLETE: 'METADATA BULUNDU',
};
const descriptions = {
  AI_DECLARATION: 'Dosyada açık bir AI üretim beyanı var. Beyan doğrulanmamıştır.',
  METADATA_HINTS: 'Dosyada AI aracı veya üretim ayarı izleri var. Bunlar AI üretiminin kanıtı değildir.',
  PROVENANCE_ONLY: 'Dosyada C2PA kaynak kaydı var. Bu kayıt tek başına AI üretimi anlamına gelmez.',
  NO_RECORDS: 'İncelenen metadata’da AI kaydı yok. Bu, görselin AI ile üretilmediği anlamına gelmez.',
  INCOMPLETE: 'Bazı metadata alanları tam incelenemedi.',
};
const counts = [
  ['explicit-ai', 'AI beyanı'],
  ['metadata-hint', 'AI izi'],
  ['provenance', 'C2PA kaydı'],
] as const;

export function FootprintSummary({
  report,
  plan,
  result,
  scanning,
  failed,
}: {
  report?: FootprintReport;
  plan?: FootprintPlan;
  result?: FootprintResult;
  scanning?: boolean;
  failed?: boolean;
}) {
  const current = result?.after ?? report;
  const state =
    failed ||
    (current?.incomplete && (current.state === 'NO_RECORDS' || (current.state === 'PROVENANCE_ONLY' && plan?.blocked)))
      ? 'INCOMPLETE'
      : current?.state;
  // A scan that produced no report at all is a failure, not found-but-incomplete metadata.
  const unreadable = failed && !current;
  const pending = scanning || (!current && !failed);
  const tone = pending ? 'pending' : result ? 'processed' : state === 'NO_RECORDS' ? 'clear' : 'detected';
  return (
    <section
      className={`footprint-summary ${tone}`}
      aria-labelledby="footprint-title"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={!!scanning}
    >
      <h3 id="footprint-title">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d={tone === 'clear' ? 'm8 12 3 3 5-6' : 'M12 7v6 M12 17h.01'} />
        </svg>
        <span>
          {pending
            ? 'Taranıyor…'
            : result
              ? footprintStatuses[result.status]
              : unreadable
                ? 'METADATA ANALİZİ TAMAMLANAMADI'
                : headings[state ?? 'INCOMPLETE']}
        </span>
      </h3>
      {!pending && (
        <p>
          {result
            ? footprintReason(result)
            : unreadable
              ? 'Dosya okunamadı. Başka bir dosya dene.'
              : descriptions[state ?? 'INCOMPLETE']}
        </p>
      )}
      {!pending && current && (
        <ul className="footprint-counts" aria-label={result?.after ? 'Kalan kayıtlar' : 'Bulunan kayıtlar'}>
          {counts.map(([category, label]) => {
            const count = current.evidence.filter(item => item.category === category).length;
            return count > 0 ? (
              <li key={category}>
                <strong>{count}</strong> {label}
                {result?.after ? ' kaldı' : ''}
              </li>
            ) : null;
          })}
        </ul>
      )}
      {!pending && !result && plan?.blocked && (
        <p className="scan-note">Bu dosya güvenle temizlenemiyor; nedeni ayrıntılarda.</p>
      )}
    </section>
  );
}

export function FootprintDetails({ plan }: { plan?: FootprintPlan }) {
  return (
    <section aria-label="Analiz kapsamı">
      <h3>Analiz kapsamı</h3>
      <p>
        Yalnız dosyanın üst düzey metadata’sı incelenir. Pikseller, görünmez filigranlar ve harici kayıtlar incelenmez;
        C2PA imzaları doğrulanmaz. AI beyanları doğrulanmamış iddialardır.
      </p>
      {plan?.reasons.map(reason => (
        <p key={reason}>{reason}</p>
      ))}
    </section>
  );
}

export function FileDropzone({
  input,
  dragging,
  disabled,
  setDragging,
  select,
}: {
  input: RefObject<HTMLInputElement | null>;
  dragging: boolean;
  disabled: boolean;
  setDragging: (value: boolean) => void;
  select: (files: FileList | null) => void;
}) {
  return (
    <section
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      aria-labelledby="source-title"
      onDragOver={event => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) select(event.dataTransfer.files);
      }}
    >
      <div className="upload-icon">
        <Icon kind="file" />
      </div>
      <h2 id="source-title">Görsel veya videonu buraya bırak</h2>
      <input
        ref={input}
        id="media"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
        aria-label="Dosya seç"
        onChange={event => select(event.target.files)}
        disabled={disabled}
      />
      <button className="primary" onClick={() => input.current?.click()} disabled={disabled}>
        Dosya Seç
      </button>
      <p className="formats">JPEG · PNG · WebP · MP4 · MOV</p>
      <div className="limits">
        <span>Görsel: en fazla 128 MiB</span>
        <span>Video: en fazla 1 GB</span>
      </div>
      <p className="privacy-note">
        <Icon /> Dosyan cihazından çıkmaz
      </p>
    </section>
  );
}

export function FileDetails({ file, scan }: { file: File; scan?: MediaScan }) {
  const tools = scan ? describeAiTools(detectAiTools(scan)) : undefined;
  return (
    <section className="panel file-details" aria-label="Seçili dosya">
      <div className="file-icon">
        <Icon kind="file" />
      </div>
      <div>
        <p className="eyebrow">SEÇİLİ DOSYA</p>
        <h2 className="filename">{file.name}</h2>
        <p>
          {formatBytes(file.size)} <span aria-hidden="true">·</span> {scan?.format ?? 'Taranıyor…'}
        </p>
        {tools && (
          <p className={`ai-tool ${tools.found ? 'found' : ''}`} title={tools.detail}>
            AI aracı: <strong>{tools.headline}</strong>
            {tools.found && <span className="ai-tool-note"> · dosyadaki beyan, doğrulanmamış</span>}
          </p>
        )}
      </div>
      <span className="chip">Orijinal değişmez</span>
    </section>
  );
}

const decisionReasons: Record<string, string> = {
  SUPPORTED_EMBEDDED: 'C2PA kaydı kaldırılabilir.',
  SUPPORTED_WITH_LOCAL_XMP_REFERENCE: 'C2PA kaydı ve ona bağlı XMP işaretçisi kaldırılabilir.',
  BLOCKED_EXTERNAL_REFERENCE: 'Dosya harici bir kaynak kaydına bağlanıyor; değiştirilmez.',
  BLOCKED_AMBIGUOUS_PROVENANCE: 'Kaynak kaydı belirsiz; dosyaya dokunulmaz.',
  BLOCKED_UNSUPPORTED_STRUCTURE: 'Kaynak kaydının yapısı desteklenmiyor; dosyaya dokunulmaz.',
  BLOCKED_MALFORMED_METADATA: 'Metadata bozuk veya belirsiz; dosyaya dokunulmaz.',
  NO_EMBEDDED_MANIFEST: 'Gömülü C2PA kaydı bulunmadı.',
};

export function ScanStatus({
  busy,
  committing,
  done,
  output,
  scan,
  error,
  footprintResult,
}: {
  busy: '' | 'scan' | 'clean';
  committing: boolean;
  done: boolean;
  output?: VerifiedOutput;
  scan?: MediaScan;
  error: string;
  footprintResult?: FootprintResult;
}) {
  const failed = footprintResult?.status === 'VERIFICATION_FAILED' || footprintResult?.status === 'BLOCKED';
  const title = committing
    ? 'Kaydediliyor · iptal edilemez'
    : busy === 'scan'
      ? 'Taranıyor…'
      : busy === 'clean'
        ? 'Metadata kaldırılıyor…'
        : failed
          ? 'Temizlik tamamlanamadı'
          : done
            ? 'Kaydedildi ve doğrulandı'
            : output
              ? 'Metadata kaldırıldı'
              : error
                ? /iptal/i.test(error)
                  ? 'İşlem iptal edildi'
                  : 'İşlem tamamlanamadı'
                : scan
                  ? 'Tarama tamamlandı'
                  : 'Dosya bekleniyor';
  const detail = busy
    ? 'Bu sekmeyi açık tut.'
    : failed && footprintResult
      ? footprintReason(footprintResult)
      : !output && !done && scan && 'c2paDecision' in scan && scan.c2paDecision
        ? (decisionReasons[scan.c2paDecision.code] ?? 'Kaynak kaydı değerlendirilemedi; dosyaya dokunulmaz.')
        : 'Yalnız incelenebilen kayıtlar kapsanır.';
  return (
    <div className={`status ${error || failed ? 'has-warning' : ''}`} role="status" aria-live="polite">
      <span className={`status-dot ${busy ? 'busy' : ''}`} />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function ScanSummary({ total, removable }: { total: number; removable: number }) {
  return (
    <div className="summary-counts">
      <div>
        <strong>{total}</strong>
        <span>Metadata kaydı</span>
      </div>
      <div>
        <strong>{removable}</strong>
        <span>Kaldırılabilir</span>
      </div>
      <div>
        <strong>{total - removable}</strong>
        <span>Korunur</span>
      </div>
    </div>
  );
}

export function VerificationResult({
  output,
  videoDone,
  videoRemoved,
  download,
}: {
  output?: VerifiedOutput;
  videoDone: boolean;
  videoRemoved: number;
  download: () => void;
}) {
  if (videoDone)
    return (
      <section className="verification" role="status">
        <span className="chip">Doğrulandı</span>
        <h3>Metadata kaldırıldı</h3>
        <p>{videoRemoved} kayıt kaldırıldı. Temizlenen video seçtiğin konuma kaydedildi.</p>
      </section>
    );
  if (!output) return null;
  return (
    <section className="verification" role="status">
      <span className="chip">Doğrulandı</span>
      <h3>
        {output.footprintResult.status === 'PARTIALLY_REMOVED'
          ? 'Metadata kaldırıldı; bazı AI kayıtları korunan bloklarda kaldı'
          : 'Metadata kaldırıldı'}
      </h3>
      <p>
        {output.removed} kayıt kaldırıldı, {output.retained} kayıt korundu.
        {output.retainedKinds.length > 0 &&
          ` Korunanlar: ${output.retainedKinds.join(', ')} (görüntünün doğru görünmesi için).`}
      </p>
      <p>Görüntü verisi bayt bayt aynı; orijinal dosya değişmedi.</p>
      <p className="warning">Piksel içine gömülü filigranlar (ör. SynthID) kaldırılmaz.</p>
      <button className="primary" onClick={download}>
        Download
      </button>
    </section>
  );
}
