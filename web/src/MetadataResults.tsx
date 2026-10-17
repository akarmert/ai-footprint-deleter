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
    <div className={`footprint-status ${result.aiState === 'declared' ? 'has-footprints' : ''}`} role="status">
      <p className="result-filename">{file.name}</p>
      <h3>{result.aiState === 'declared' ? 'AI üretim beyanı bulundu' : result.aiState === 'uncertain' ? 'Provenance bulundu, AI durumu belirsiz' : 'AI üretim beyanı bulunamadı'}</h3>
      <p>İncelenebilen kayıtlarda {result.declarationCount} açık beyan kaynağı. Metin tabanlı araç/parametre ipuçları: {result.aiCount} blok; bunlar tek başına AI üretim kanıtı değildir.</p>
      {result.textDeclarations.map(record => <p key={record.id}>Doğrulanmamış metadata beyanı: {record.kind} · {record.id}</p>)}
      {result.c2paSources.map(source => <p key={source}>Doğrulanmamış C2PA beyanı: {source}</p>)}
      {scan.provenance?.manifests.map((manifest, index) => <p key={index}>Claim Generator: {manifest.claimGenerator.join(' · ') || 'Çözümlenemedi'} · Kaydı oluşturan araçtır; AI model adı değildir.</p>)}
      {result.provenance && <p>İmza doğrulama durumu: Yapılmadı. Trust ve içerik hash doğrulaması yapılmadı.</p>}
      {result.provenance && <p className="warning">Content authenticity present but unverified — C2PA / provenance mevcut veya belirsiz. Bu durum tek başına AI üretimi kanıtı değildir.</p>}
      <p className="scan-note">Bu sonuç metadata/provenance taramasına dayanır. Piksel düzeyinde AI tespiti değildir. Tespit edilememesi yokluk garantisi değildir.</p>
    </div>
    <div className="summary-counts result-counts"><div><strong>{result.fields.length}</strong><span>Total Fields</span></div><div><strong>{result.aiCount}</strong><span>Metin tabanlı AI ipucu (blok)</span></div><div><strong>{result.sectionCount}</strong><span>Bölüm sayısı</span></div></div>
    <p className="scan-note">Total Fields, aşağıdaki dosya alanları ve metadata bloklarının toplamıdır; blok içindeki alt alan sayısı değildir. Metin ipucu sayacı, araç/parametre işareti bulunan blokları sayar; her eşleşme bağımsız kanıt değildir. Metadata önizlemeleri ve XMP beyanı araması ilk 512 karakterle sınırlıdır; sonraki alanlar ve rdf:resource biçimi kaçırılabilir. XMP eşleşmesi yapısal XML/namespace doğrulaması değildir; yorum veya örnek metin de eşleşebilir. Desteklenmeyen C2PA alanları çözümlenemedi olarak gösterilir.</p>
    <div className="category-filters" role="group" aria-label="Metadata kategorileri"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tümü <span>{result.fields.length}</span></button>{categories.map(category => {
      const count = result.fields.filter(field => field.category === category.id).length;
      return <button key={category.id} aria-pressed={filter === category.id} disabled={!count} onClick={() => { setFilter(category.id); setOpened(current => [...new Set([...current, category.id])]); }}>{category.label} <span>{count}</span></button>;
    })}</div>
    <div className="result-controls"><button onClick={() => setOpened(sections.map(section => section.id))}>Expand all</button><button onClick={() => setOpened([])}>Collapse all</button></div>
    {sections.filter(category => filter === 'all' || category.id === filter).map(category => <details className="result-section" key={category.id} open={opened.includes(category.id)} onToggle={event => {
      const open = event.currentTarget.open;
      setOpened(current => open ? current.includes(category.id) ? current : [...current, category.id] : current.filter(id => id !== category.id));
    }}><summary>{category.title} <span>{result.fields.filter(field => field.category === category.id).length}</span></summary>
      {category.id === 'c2pa' && <p className="warning">C2PA kaydı / olası provenance: imza, trust, content hash ve Provenance Chain doğrulanmıyor. Okunabilen alanlar aşağıdaki salt okunur çözümleyicide kaynak beyanı olarak gösterilir; okunmayan alanlar hakkında çıkarım yapılmaz.</p>}
      <dl className="result-fields">{result.fields.filter(field => field.category === category.id).map(field => <div key={field.id} className="result-field"><dt>{field.label}{field.ai && <span className="ai-badge">AI ipucu</span>}</dt><dd>{field.record ? <><p>{field.record.reason}</p><p className="field-policy">{field.record.bytes.toLocaleString('tr-TR')} bayt · Motor durumu: {field.record.status} · {field.record.requiresRightsConsent ? 'Hak onayı gerekir' : 'Hak onayı işareti yok'}</p>{field.value ? <pre>{field.value}</pre> : <p>Motor bu blok için okunabilir önizleme sunmuyor.</p>}{/applied synthid watermark/i.test(field.value) && <p className="warning">Kaynak kaydında SynthID uygulandığı belirtiliyor. Bu ifade doğrulanmış bir filigran dedektörü sonucu değildir.</p>}</> : field.value}</dd></div>)}</dl>
    {category.id === 'c2pa' && scan.provenance && scan.provenance.status !== 'absent' && <div className="c2pa-reader">
      <h3>Salt okunur C2PA alanları</h3><p>{scan.provenance.reason}</p>
      {scan.provenance.status !== 'readable-unverified' && <p className="warning">Çözümlenemedi. Desteklenmeyen veya bozuk yapı hakkında tahmin yapılmaz.</p>}
      {scan.provenance.manifests.map((manifest, index) => <section className="c2pa-manifest" key={index}><h4>C2PA manifest · {manifest.label}</h4>
        <h4>Claim Generator</h4><p>{manifest.claimGenerator.join(' · ') || 'Çözümlenemedi'}</p><p>Kaynak kaydını oluşturan araç; AI model adı olarak yorumlanmaz.</p>
        <h4>AI Generation Claims</h4>{manifest.aiSources.length ? manifest.aiSources.map(source => <p key={source}>{source} · Doğrulanmamış beyan</p>) : <p>Açık AI üretim beyanı bulunamadı; AI olmadığı anlamına gelmez.</p>}
        <h4>Actions History</h4>{manifest.actions.length ? manifest.actions.map((action, i) => <div className="record" key={i}><strong>{action.action}</strong><p>Kaynak: {action.source}</p>{action.sourceType && <p>Digital Source Type: {action.sourceType}</p>}{action.software && <p>Kaynak uygulama: {action.software}</p>}{action.description && <p>{/applied synthid watermark/i.test(action.description) ? 'Kaynak kaydında SynthID uygulandığı belirtiliyor. Dedektör sonucu değildir.' : action.description}</p>}</div>) : <p>Çözümlenemedi</p>}
        <h4>C2PA assertion etiketleri</h4>{manifest.assertions.map(label => <p key={label}>{label}</p>)}
        <p>İmza varlığı: {manifest.signature === 'present-unverified' ? 'Var; doğrulanmadı' : 'Çözümlenemedi'}. İmza doğrulaması yapılmadı.</p>
      </section>)}
    </div>}
    </details>)}
    {scan.notes.map((note, index) => <p className="scan-note" key={index}>{note}</p>)}
  </section>;
}
