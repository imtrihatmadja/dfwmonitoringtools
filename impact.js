// ============================================================
// IMPACT SUMMARY — Agregasi dampak lintas proyek per satuan
// ============================================================

let impactData = {}; // { 'orang': { total, count, indicators: [] }, ... }

// ── Load & hitung dampak dari semua indikator ────────────────
async function loadImpactSummary() {
  const { data, error } = await client
    .from('project_indicators')
    .select(`
      id,
      project_name,
      indicator_name,
      unit,
      actual,
      target,
      indicator_updates ( actual_value, created_at )
    `)
    .not('unit', 'is', null)
    .neq('unit', '');

  if (error) {
    console.error('[PMIS Impact] Error:', error);
    return;
  }

  // Reset
  impactData = {};

  (data || []).forEach(ind => {
    const rawUnit = (ind.unit || '').trim();
    if (!rawUnit) return;

    // Normalisasi unit: lowercase untuk grouping, tapi simpan display original
    const unitKey = rawUnit.toLowerCase();

    // Ambil nilai aktual terbaru
    const upds = ind.indicator_updates || [];
    const actVal = upds.length
      ? Number([...upds].sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        )[0].actual_value) || 0
      : Number(ind.actual) || 0;

    if (!impactData[unitKey]) {
      impactData[unitKey] = {
        unitDisplay: rawUnit,   // tampilan asli (kapitalisasi pertama)
        total: 0,
        count: 0,
        indicators: [],
      };
    }

    impactData[unitKey].total += actVal;
    impactData[unitKey].count += 1;
    impactData[unitKey].indicators.push({
      project_name:   ind.project_name,
      indicator_name: ind.indicator_name,
      actual: actVal,
      target: Number(ind.target) || 0,
    });
  });

  renderImpactCards();
}

// ── Icon per satuan ──────────────────────────────────────────
function impactIcon(unit) {
  const u = unit.toLowerCase();
  if (['orang','jiwa','nelayan','peserta','benefisiari',
       'perempuan','laki-laki','anak','pekerja','buruh',
       'anggota','komunitas','keluarga','rumah tangga'].some(k => u.includes(k)))
    return '👥';
  if (['dokumen','laporan','modul','publikasi','buku',
       'materi','panduan','kebijakan','regulasi','peraturan'].some(k => u.includes(k)))
    return '📄';
  if (['kapal','perahu','unit','alat'].some(k => u.includes(k)))
    return '🚢';
  if (['kg','ton','gram','kg','kwintal'].some(k => u.includes(k)))
    return '⚖️';
  if (['hektar','ha','km','meter','m²','wilayah','lokasi','desa',
       'kawasan','area'].some(k => u.includes(k)))
    return '🗺️';
  if (['kegiatan','event','pertemuan','pelatihan','workshop',
       'sosialisasi','rakor','rapat'].some(k => u.includes(k)))
    return '📅';
  if (['mou','perjanjian','kontrak','kesepakatan'].some(k => u.includes(k)))
    return '🤝';
  if (['persen','%'].some(k => u.includes(k)))
    return '📊';
  return '🎯';
}

// ── Warna per kategori ───────────────────────────────────────
function impactColor(unit) {
  const u = unit.toLowerCase();
  if (['orang','jiwa','nelayan','peserta','benefisiari',
       'perempuan','laki-laki','anak','pekerja','buruh',
       'anggota','komunitas','keluarga'].some(k => u.includes(k)))
    return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', badge: '#dbeafe' };
  if (['dokumen','laporan','modul','publikasi','buku',
       'panduan','kebijakan'].some(k => u.includes(k)))
    return { bg: '#faf5ff', border: '#e9d5ff', text: '#7c3aed', badge: '#ede9fe' };
  if (['kapal','perahu','unit'].some(k => u.includes(k)))
    return { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', badge: '#ffedd5' };
  if (['hektar','ha','km','wilayah','lokasi','desa'].some(k => u.includes(k)))
    return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', badge: '#dcfce7' };
  if (['kegiatan','event','pelatihan','workshop'].some(k => u.includes(k)))
    return { bg: '#fff1f2', border: '#fecdd3', text: '#be123c', badge: '#ffe4e6' };
  return { bg: '#f8fafc', border: '#e2e8f0', text: '#334155', badge: '#f1f5f9' };
}

// ── Render cards ke DOM ──────────────────────────────────────
function renderImpactCards() {
  const wrap = document.getElementById('impactSummaryWrap');
  if (!wrap) return;

  const entries = Object.entries(impactData);

  if (entries.length === 0) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">
        Belum ada data dampak. Pastikan indikator memiliki satuan (unit) yang diisi.
      </div>`;
    return;
  }

  // Urutkan: terbesar dulu
  entries.sort((a, b) => b[1].total - a[1].total);

  const cards = entries.map(([unitKey, d]) => {
    const col   = impactColor(unitKey);
    const icon  = impactIcon(unitKey);
    const total = Number(d.total).toLocaleString('id-ID');

    // Tooltip: daftar indikator kontributor
    const contribs = d.indicators
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 5)
      .map(i => `${i.project_name}: ${i.indicator_name} — ${Number(i.actual).toLocaleString('id-ID')} ${d.unitDisplay}`)
      .join('\n');

    return `
<div class="impact-card" style="
  background:${col.bg}; border:1.5px solid ${col.border};
  border-radius:14px; padding:16px 18px; cursor:pointer;
  transition:transform .15s, box-shadow .15s;
  position:relative; overflow:hidden;
" title="${contribs}"
  onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.1)'"
  onmouseout="this.style.transform='';this.style.boxShadow=''"
  onclick="showImpactDetail('${unitKey}')">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
    <div style="font-size:26px;line-height:1">${icon}</div>
    <div style="background:${col.badge};color:${col.text};
      font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;
      white-space:nowrap">
      ${d.count} indikator
    </div>
  </div>
  <div style="margin-top:10px">
    <div style="font-size:24px;font-weight:800;color:${col.text};line-height:1.1">
      ${total}
    </div>
    <div style="font-size:12px;font-weight:600;color:${col.text};
      opacity:.85;margin-top:3px;text-transform:capitalize">
      ${d.unitDisplay}
    </div>
  </div>
</div>`;
  }).join('');

  wrap.innerHTML = cards;
}

// ── Modal detail per satuan ──────────────────────────────────
function showImpactDetail(unitKey) {
  const d = impactData[unitKey];
  if (!d) return;

  const col  = impactColor(unitKey);
  const icon = impactIcon(unitKey);

  const rows = d.indicators
    .sort((a, b) => b.actual - a.actual)
    .map((ind, i) => {
      const pct = ind.target > 0
        ? Math.min(Math.round(ind.actual / ind.target * 100), 100)
        : 0;
      const barColor = pct >= 85 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 35 ? '#f59e0b' : '#ef4444';
      return `
<tr>
  <td style="text-align:center;color:#94a3b8;font-size:12px">${i+1}</td>
  <td style="font-size:12px;color:#64748b">${ind.project_name}</td>
  <td style="font-size:12px;font-weight:600">${ind.indicator_name}</td>
  <td style="text-align:right;font-weight:700;color:#0f172a;font-size:13px">
    ${Number(ind.actual).toLocaleString('id-ID')}
  </td>
  <td style="text-align:right;color:#64748b;font-size:12px">
    ${ind.target > 0 ? Number(ind.target).toLocaleString('id-ID') : '—'}
  </td>
  <td style="min-width:100px">
    <div style="display:flex;align-items:center;gap:5px">
      <div style="flex:1;background:#e2e8f0;border-radius:3px;height:6px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px"></div>
      </div>
      <span style="font-size:11px;font-weight:700;color:${barColor};min-width:28px">${pct}%</span>
    </div>
  </td>
</tr>`;
    }).join('');

  const totalVal = Number(d.total).toLocaleString('id-ID');

  const modalHTML = `
<div id="impactDetailModal" class="modal-overlay"
  style="display:flex" onclick="if(event.target===this)closeImpactDetail()">
  <div class="modal-box" style="max-width:680px;width:100%">
    <div class="modal-header" style="background:${col.bg};border-bottom:1px solid ${col.border}">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">${icon}</span>
        <div>
          <div style="font-size:16px;font-weight:800;color:${col.text};text-transform:capitalize">
            Total: ${totalVal} ${d.unitDisplay}
          </div>
          <div style="font-size:12px;color:#64748b;margin-top:1px">
            Dari ${d.count} indikator lintas proyek
          </div>
        </div>
      </div>
      <button class="modal-close" onclick="closeImpactDetail()">✕</button>
    </div>
    <div class="modal-body" style="padding:16px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#0f172a;color:#fff">
            <th style="padding:8px;width:28px">#</th>
            <th style="padding:8px;text-align:left">Proyek</th>
            <th style="padding:8px;text-align:left">Indikator</th>
            <th style="padding:8px;text-align:right">Realisasi</th>
            <th style="padding:8px;text-align:right">Target</th>
            <th style="padding:8px">% Capaian</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f1f5f9;border-top:2px solid #e2e8f0">
            <td colspan="3" style="padding:10px 8px;font-weight:800;
              font-size:13px;color:#0f172a;text-align:right">
              TOTAL
            </td>
            <td style="padding:10px 8px;text-align:right;font-weight:800;
              font-size:15px;color:${col.text}">
              ${totalVal}
            </td>
            <td colspan="2" style="padding:10px 8px;font-size:11px;
              color:#64748b;text-align:right">
              ${d.unitDisplay}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeImpactDetail() {
  const el = document.getElementById('impactDetailModal');
  if (el) el.remove();
}
