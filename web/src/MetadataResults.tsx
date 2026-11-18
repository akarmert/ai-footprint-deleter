import { useState } from 'react';
import type { MediaScan } from './protocol';
import { isRemovable } from './engine';
import { formatBytes } from './app-state';
import { categories, describeResults, type Category } from './results';

const synthId = /applied synthid watermark/i;
const SYNTHID_NOTE = 'Kayıtta SynthID uygulandığı yazıyor; bu bir filigran tespiti değildir.';

export function MetadataResults({
  scan,
  file,
  origin = 'source',
}: {
  scan: MediaScan;
  file: File;
  origin?: 'source' | 'output';
}) {
  const result = describeResults(scan, file);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [opened, setOpened] = useState<Category[]>(['file']);
  const sections = categories
    .map(category => ({ ...category, fields: result.fields.filter(field => field.category === category.id) }))
    .filter(category => category.fields.length > 0);
  // Images show the AI summary above (FootprintSummary); videos get it here.
  const video = !('footprints' in scan);
  return (
    <section className="metadata-results" aria-labelledby="results-title">
      <div className="panel-heading">
        <h3 id="results-title">Metadata</h3>
        <span className="chip">{origin === 'output' ? 'Temizlenmiş kopya' : 'Orijinal dosya'}</span>
      </div>
      {video && (
        <div
          className={`footprint-status ${result.aiState === 'declared' ? 'has-footprints' : result.aiState === 'uncertain' ? 'uncertain-footprints' : ''}`}
          role="status"
        >
          <h3>
            <span>{result.aiState === 'not-found' ? 'AI METADATA BULUNAMADI' : 'AI METADATA BULUNDU'}</span>
          </h3>
          <p>
            {result.aiState === 'declared'
              ? 'Metadata’da açık bir AI üretim beyanı var. Beyan doğrulanmamıştır.'
              : result.aiState === 'uncertain'
                ? 'Dosyada kaynak kaydı veya AI izi var; bu tek başına AI üretimi anlamına gelmez.'
                : 'İncelenen metadata’da AI kaydı yok. Bu, AI ile üretilmediği anlamına gelmez.'}
          </p>
        </div>
      )}
      <div className="category-filters" role="group" aria-label="Metadata kategorileri">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Tümü <span>{result.fields.length}</span>
        </button>
        {sections.map(category => (
          <button
            key={category.id}
            aria-pressed={filter === category.id}
            onClick={() => {
              setFilter(category.id);
              setOpened(current => [...new Set([...current, category.id])]);
            }}
          >
            {category.label} <span>{category.fields.length}</span>
          </button>
        ))}
      </div>
      <div className="result-controls">
        <button onClick={() => setOpened(sections.map(section => section.id))}>Tümünü aç</button>
        <button onClick={() => setOpened([])}>Tümünü kapat</button>
      </div>
      {sections
        .filter(category => filter === 'all' || category.id === filter)
        .map(category => (
          <details
            className="result-section"
            key={category.id}
            open={opened.includes(category.id)}
            onToggle={event => {
              const open = event.currentTarget.open;
              setOpened(current =>
                open
                  ? current.includes(category.id)
                    ? current
                    : [...current, category.id]
                  : current.filter(id => id !== category.id),
              );
            }}
          >
            <summary>
              {category.label} <span>{category.fields.length}</span>
            </summary>
            {category.id === 'c2pa' && (
              <p className="warning">
                C2PA imzası, güven zinciri ve içerik hash’i doğrulanmaz. Aşağıdaki bilgiler dosyanın kendi beyanıdır.
              </p>
            )}
            <dl className="result-fields">
              {category.fields.map(field => (
                <div key={field.id} className="result-field">
                  <dt>
                    {field.label}
                    {field.ai && <span className="ai-badge">AI izi</span>}
                  </dt>
                  <dd>
                    {field.record ? (
                      <>
                        <p>{field.record.reason}</p>
                        <p className="field-policy">
                          {formatBytes(field.record.bytes)} ·{' '}
                          {origin === 'source' && isRemovable(field.record) ? 'Kaldırılır' : 'Korunur'}
                        </p>
                        {field.value ? <pre>{field.value}</pre> : <p>Bu blok için önizleme yok.</p>}
                        {synthId.test(field.value) && <p className="warning">{SYNTHID_NOTE}</p>}
                      </>
                    ) : (
                      field.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {category.id === 'c2pa' && scan.provenance && scan.provenance.status !== 'absent' && (
              <div className="c2pa-reader">
                <h3>C2PA kaydı</h3>
                <p>{scan.provenance.reason}</p>
                {scan.provenance.status !== 'readable-unverified' && (
                  <p className="warning">Kaydın içeriği okunamadı; hakkında tahmin yapılmaz.</p>
                )}
                {scan.provenance.manifests.map((manifest, index) => (
                  <section className="c2pa-manifest" key={index}>
                    <h4>Manifest · {manifest.label}</h4>
                    <h4>Claim Generator</h4>
                    <p>{manifest.claimGenerator.join(' · ') || 'Okunamadı'}</p>
                    <p>Kaydı oluşturan uygulama; AI modelinin adı olmayabilir.</p>
                    <h4>AI Generation Claims</h4>
                    {manifest.aiSources.length ? (
                      manifest.aiSources.map(source => <p key={source}>{source} · doğrulanmamış beyan</p>)
                    ) : (
                      <p>Açık AI beyanı yok; bu, AI ile üretilmediği anlamına gelmez.</p>
                    )}
                    <h4>Actions History</h4>
                    {manifest.actions.length ? (
                      manifest.actions.map((action, i) => (
                        <div className="record" key={i}>
                          <strong>{action.action}</strong>
                          <p>Kayıt: {action.source}</p>
                          {action.sourceType && <p>Digital Source Type: {action.sourceType}</p>}
                          {action.software && <p>Uygulama: {action.software}</p>}
                          {action.description && (
                            <p>{synthId.test(action.description) ? SYNTHID_NOTE : action.description}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p>Okunamadı</p>
                    )}
                    <h4>Assertion etiketleri</h4>
                    {manifest.assertions.map(label => (
                      <p key={label}>{label}</p>
                    ))}
                    <p>İmza: {manifest.signature === 'present-unverified' ? 'var, doğrulanmadı' : 'okunamadı'}.</p>
                  </section>
                ))}
              </div>
            )}
          </details>
        ))}
      {scan.notes.map((note, index) => (
        <p className="scan-note" key={index}>
          {note}
        </p>
      ))}
    </section>
  );
}
