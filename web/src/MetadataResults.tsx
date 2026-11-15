import { useState } from 'react';
import type { MediaScan } from './protocol';
import { categories, describeResults, type Category } from './results';

export function MetadataResults({ scan, file, origin = 'source' }: { scan: MediaScan; file: File; origin?: 'source' | 'output' }) {
  const result = describeResults(scan, file);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [opened, setOpened] = useState<Category[]>(['file']);
  const sections = categories
    .map(category => ({ ...category, fields: result.fields.filter(field => field.category === category.id) }))
    .filter(category => category.fields.length > 0);
  return <section className="metadata-results" aria-labelledby="results-title">
    <div className="panel-heading"><h3 id="results-title">Metadata sonuçları</h3><span className="chip">{origin === 'output' ? 'Temizlenmiş çıktı' : 'Kaynak dosya'}</span></div>
    <div className={`footprint-status ${result.aiState === 'declared' ? 'has-footprints' : result.aiState === 'uncertain' ? 'uncertain-footprints' : ''}`} role="status">
      <h3>{(result.aiState === 'declared' || result.aiState === 'uncertain') && <svg className="status-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M10.3 4.5 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>}<span>{result.aiState === 'declared' ? 'AI üretim beyanı bulundu' : result.aiState === 'uncertain' ? 'Provenance bulundu, AI durumu belirsiz' : 'AI üretim beyanı bulunamadı'}</span></h3>
      <p>İncelenebilen kayıtlarda {result.declarationCount} açık beyan kaynağı. Metin tabanlı araç/parametre ipuçları: {result.aiCount} blok; bunlar tek başına AI üretim kanıtı değildir.</p>
      {result.aiState === 'declared' && <p className="scan-note">Bu beyan AI üretiminin kesin kanıtı veya doğrulanmış imza sonucu değildir.</p>}
      {result.textDeclarations.map(record => <p key={record.id}>Doğrulanmamış metadata beyanı: {record.kind} · {record.id}</p>)}
      {result.c2paSources.map(source => <p key={source}>Doğrulanmamış C2PA beyanı: {source}</p>)}
      {scan.provenance?.manifests.map((manifest, index) => <p key={index}>Claim Generator: {manifest.claimGenerator.join(' · ') || 'Çözümlenemedi'} · Kaydı oluşturan araçtır; AI model adı değildir.</p>)}
      {result.provenance && <p>İmza doğrulama durumu: Yapılmadı. Trust ve içerik hash doğrulaması yapılmadı.</p>}
      {result.provenance && <p className="warning">Content authenticity present but unverified — C2PA / provenance mevcut veya belirsiz. Bu durum tek başına AI üretimi kanıtı değildir.</p>}
      <p className="scan-note">Bu sonuç metadata/provenance taramasına dayanır. Piksel düzeyinde AI tespiti değildir. Tespit edilememesi yokluk garantisi değildir.</p>
    </div>
    <div className="result-counts"><div><strong>{result.fields.length}</strong><span>Gösterilen alan / blok</span></div><div><strong>{result.aiCount}</strong><span>Metin tabanlı AI ipucu (blok)</span></div><div><strong>{result.sectionCount}</strong><span>Bölüm sayısı</span></div></div>
    <details><summary>Tarama kapsamı ve sayımlar</summary><p className="scan-note">Gösterilen alan / blok sayısı, aşağıdaki dosya alanları ve metadata bloklarının toplamıdır; blok içindeki alt alan sayısı değildir. Metin ipucu sayacı, araç/parametre işareti bulunan blokları sayar; her eşleşme bağımsız kanıt değildir. Görünür blok önizlemeleri ilk 512 karakterle sınırlıdır. Görsel kaynak analizi bu önizlemeden bağımsız, boyut sınırları olan metadata ve namespace doğrulamalı XMP alanlarını kullanır; desteklenmeyen veya tam okunamayan alanlar ayrıca belirtilir. Video akışındaki metin önizlemeleri birleşik görsel analizi kapsamına girmez. Desteklenmeyen C2PA alanları çözümlenemedi olarak gösterilir.</p></details>
    <div className="category-filters" role="group" aria-label="Metadata kategorileri"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tümü <span>{result.fields.length}</span></button>{sections.map(category => {
      const count = category.fields.length;
      return <button key={category.id} aria-pressed={filter === category.id} onClick={() => { setFilter(category.id); setOpened(current => [...new Set([...current, category.id])]); }}>{category.label} <span>{count}</span></button>;
    })}</div>
    <div className="result-controls"><button onClick={() => setOpened(sections.map(section => section.id))}>Tümünü Aç</button><button onClick={() => setOpened([])}>Tümünü Kapat</button></div>
    {sections.filter(category => filter === 'all' || category.id === filter).map(category => <details className="result-section" key={category.id} open={opened.includes(category.id)} onToggle={event => {
      const open = event.currentTarget.open;
      setOpened(current => open ? current.includes(category.id) ? current : [...current, category.id] : current.filter(id => id !== category.id));
    }}><summary>{category.title} <span>{category.fields.length}</span></summary>
      {category.id === 'c2pa' && <p className="warning">C2PA kaydı / olası provenance: imza, trust, content hash ve Provenance Chain doğrulanmıyor. Okunabilen alanlar aşağıdaki salt okunur çözümleyicide kaynak beyanı olarak gösterilir; okunmayan alanlar hakkında çıkarım yapılmaz.</p>}
      <dl className="result-fields">{category.fields.map(field => <div key={field.id} className="result-field"><dt>{field.label}{field.ai && <span className="ai-badge">AI ipucu</span>}</dt><dd>{field.record ? <><p>{field.record.reason}</p><p className="field-policy">{field.record.bytes.toLocaleString('tr-TR')} bayt · Motor durumu: {field.record.status} · {field.record.requiresRightsConsent ? 'Hak onayı gerekir' : 'Hak onayı işareti yok'}</p>{field.value ? <pre>{field.value}</pre> : <p>Motor bu blok için okunabilir önizleme sunmuyor.</p>}{/applied synthid watermark/i.test(field.value) && <p className="warning">Kaynak kaydında SynthID uygulandığı belirtiliyor. Bu ifade doğrulanmış bir filigran dedektörü sonucu değildir.</p>}</> : field.value}</dd></div>)}</dl>
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
