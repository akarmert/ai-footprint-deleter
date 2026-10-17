import { useState } from 'react';
import type { MediaScan } from './protocol';
import { categories, describeResults, type Category } from './results';

export function MetadataResults({ scan, file }: { scan: MediaScan; file: File }) {
  const result = describeResults(scan, file);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [opened, setOpened] = useState<Category[]>([]);
  const sections = categories.filter(category => result.fields.some(field => field.category === category.id));
  return <section className="panel metadata-results" aria-labelledby="results-title">
    <div className="panel-heading"><h2 id="results-title">TARAMA <span>Metadata sonuçları</span></h2><span className="chip">Kaynak dosya</span></div>
    <div className={`footprint-status ${result.aiCount ? 'has-footprints' : ''}`} role="status">
      <p className="result-filename">{file.name}</p>
      <h3>{result.aiCount ? 'AI Footprints Found' : 'No AI traces found'}</h3>
      <p>{result.aiCount ? 'Bu sonuç dosya içi metadata / provenance kayıtlarına dayanır. Piksel tabanlı analiz değildir.' : 'AI footprint bulunamadı. Bu sonuç yalnız dosya içi metadata taramasına dayanır.'}</p>
      {result.provenance && <p className="warning">Content authenticity present but unverified — C2PA / provenance mevcut veya belirsiz. Bu durum tek başına AI üretimi kanıtı değildir.</p>}
      <p className="scan-note">Bu sonuç metadata/provenance taramasına dayanır. Piksel düzeyinde AI tespiti değildir. Tespit edilememesi yokluk garantisi değildir.</p>
    </div>
    <div className="summary-counts result-counts"><div><strong>{result.fields.length}</strong><span>Total Fields</span></div><div><strong>{result.aiCount}</strong><span>AI Footprint count</span></div><div><strong>{result.sectionCount}</strong><span>Bölüm sayısı</span></div></div>
    <p className="scan-note">Total Fields, aşağıdaki dosya alanları ve metadata bloklarının toplamıdır; blok içindeki alt alan sayısı değildir. AI sayacı, önizlemesinde açık AI üretim/üretim parametresi işareti bulunan blokları sayar. Önizlemeler 512 karakterle sınırlıdır; C2PA claim içeriği bu motor tarafından çözümlenmez.</p>
    <div className="category-filters" role="group" aria-label="Metadata kategorileri"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tümü <span>{result.fields.length}</span></button>{categories.map(category => {
      const count = result.fields.filter(field => field.category === category.id).length;
      return <button key={category.id} aria-pressed={filter === category.id} disabled={!count} onClick={() => { setFilter(category.id); setOpened(current => [...new Set([...current, category.id])]); }}>{category.label} <span>{count}</span></button>;
    })}</div>
    <div className="result-controls"><button onClick={() => setOpened(sections.map(section => section.id))}>Expand all</button><button onClick={() => setOpened([])}>Collapse all</button></div>
    {sections.filter(category => filter === 'all' || category.id === filter).map(category => <details className="result-section" key={category.id} open={opened.includes(category.id)} onToggle={event => {
      const open = event.currentTarget.open;
      setOpened(current => open ? current.includes(category.id) ? current : [...current, category.id] : current.filter(id => id !== category.id));
    }}><summary>{category.title} <span>{result.fields.filter(field => field.category === category.id).length}</span></summary>
      {category.id === 'c2pa' && <p className="warning">C2PA kaydı / olası provenance: imza, trust, content hash, Claim Generator ve Provenance Chain doğrulanmıyor. Okunmayan alanlar veya AI Generation Claims hakkında çıkarım yapılmaz.</p>}
      <dl className="result-fields">{result.fields.filter(field => field.category === category.id).map(field => <div key={field.id} className="result-field"><dt>{field.label}{field.ai && <span className="ai-badge">AI Footprint</span>}</dt><dd>{field.record ? <><p>{field.record.reason}</p><p className="field-policy">{field.record.bytes.toLocaleString('tr-TR')} bayt · Motor durumu: {field.record.status} · {field.record.requiresRightsConsent ? 'Hak onayı gerekir' : 'Hak onayı işareti yok'}</p>{field.value ? <pre>{field.value}</pre> : <p>Motor bu blok için okunabilir önizleme sunmuyor.</p>}{/applied synthid watermark/i.test(field.value) && <p className="warning">Kaynak kaydında SynthID uygulandığı belirtiliyor. Bu ifade doğrulanmış bir filigran dedektörü sonucu değildir.</p>}</> : field.value}</dd></div>)}</dl>
    </details>)}
    {scan.notes.map((note, index) => <p className="scan-note" key={index}>{note}</p>)}
  </section>;
}
