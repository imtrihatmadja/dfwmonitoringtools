// ============================================================
// PMIS DFW Indonesia — Print Report (v2)
// Membuka jendela baru dengan laporan siap cetak per proyek
// ============================================================

// ── Modal pilihan bahasa ─────────────────────────────────────
function openPrintModal() {
  if (!currentProject) {
    alert('Buka halaman detail proyek terlebih dahulu sebelum mencetak laporan.');
    return;
  }
  const m = document.getElementById('printLangModal');
  if (m) m.classList.remove('hidden');
}
function closePrintModal() {
  const m = document.getElementById('printLangModal');
  if (m) m.classList.add('hidden');
}

// ── Fetch data segar dari Supabase ───────────────────────────
async function _rptFetch(projectName) {
  const [indRes, actRes, budRes, outRes] = await Promise.all([
    client.from('project_indicators')
      .select('id,indicator_name,type,target,unit,actual,indicator_updates(id,actual_value,note,updated_by,created_at)')
      .eq('project_name', projectName).order('created_at', { ascending: true }),
    client.from('project_activities')
      .select('id,title,description,pic,status,start_date,due_date,progress,sort_order,activity_notes(id,note,noted_by,created_at)')
      .eq('project_name', projectName).order('sort_order', { ascending: true }),
    client.from('budget_updates')
      .select('id,actual_value,note,updated_by,created_at')
      .eq('project_name', projectName).order('created_at', { ascending: true }),
    client.from('project_outcomes')
      .select('id,outcome_text,sort_order')
      .eq('project_name', projectName).order('sort_order', { ascending: true }),
  ]);
  return {
    indicators:    indRes.data  || [],
    activities:    actRes.data  || [],
    budgetUpdates: budRes.data  || [],
    outcomes:      outRes.data  || [],
  };
}

// ── Helpers ───────────────────────────────────────────────────
function _rptActual(ind) {
  const upds = ind.indicator_updates || [];
  if (upds.length) {
    const v = Number([...upds].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0].actual_value);
    if (!isNaN(v)) return v;
  }
  return isNaN(Number(ind.actual)) ? 0 : Number(ind.actual);
}
function _rptPct(actual, target) {
  const t = Number(target) || 0;
  return t > 0 ? Math.min(Math.round(actual / t * 100), 999) : 0;
}
function _rptRupiah(n) {
  if (!n && n !== 0) return '—';
  return 'Rp\u00a0' + Number(n).toLocaleString('id-ID');
}
function _rptDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}
function _rptStatusColor(s) {
  const m = { 'Selesai':'#22c55e','Sedang Berjalan':'#3b82f6','On Track':'#3b82f6',
               'Aktif':'#22c55e','Terlambat':'#ef4444','Tertunda':'#f59e0b',
               'Belum Mulai':'#94a3b8','Ditangguhkan':'#94a3b8' };
  return m[s] || '#64748b';
}
function _rptPctColor(p) {
  if (p >= 85) return '#16a34a';
  if (p >= 60) return '#2563eb';
  if (p >= 35) return '#d97706';
  return '#dc2626';
}
function _rptPctLabel(p) {
  if (p >= 85) return 'Sangat Baik';
  if (p >= 60) return 'Baik';
  if (p >= 35) return 'Sedang';
  return 'Perlu Perhatian';
}
function _rptImpactIcon(unit) {
  const u = (unit||'').toLowerCase();
  if (['orang','jiwa','nelayan','peserta','perempuan','laki-laki','anak','pekerja','buruh','anggota','komunitas','keluarga'].some(k=>u.includes(k))) return '👥';
  if (['dokumen','laporan','modul','publikasi','panduan','kebijakan','regulasi'].some(k=>u.includes(k))) return '📄';
  if (['kapal','perahu','alat','unit'].some(k=>u.includes(k))) return '🚢';
  if (['hektar','ha','km','wilayah','desa','kawasan','area'].some(k=>u.includes(k))) return '🗺️';
  if (['kegiatan','event','pelatihan','workshop','pertemuan','sosialisasi'].some(k=>u.includes(k))) return '📅';
  if (['kg','ton','gram','kwintal'].some(k=>u.includes(k))) return '⚖️';
  if (['mou','perjanjian','kontrak','kesepakatan'].some(k=>u.includes(k))) return '🤝';
  return '🎯';
}

// ── Progress bar SVG inline ───────────────────────────────────
function _rptBar(pct, color) {
  const c = color || _rptPctColor(pct);
  const w = Math.min(pct, 100);
  return `<div style="background:#e2e8f0;border-radius:6px;height:8px;min-width:80px;overflow:hidden">
    <div style="background:${c};height:8px;width:${w}%;border-radius:6px"></div></div>`;
}

// ── CSS laporan ───────────────────────────────────────────────
function _rptCSS() {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1e293b;background:#fff;line-height:1.5}
  @page{size:A4 portrait;margin:18mm 16mm 18mm 16mm}
  @media print{
    body{font-size:10pt}
    .no-print{display:none!important}
    .page-break{page-break-before:always}
    .avoid-break{page-break-inside:avoid}
    table{page-break-inside:auto}
    tr{page-break-inside:avoid;page-break-after:auto}
  }

  /* ── Print button ─────── */
  .print-btn-bar{position:fixed;top:16px;right:20px;z-index:999;display:flex;gap:10px}
  .btn-print{background:#2563eb;color:#fff;border:none;padding:10px 22px;border-radius:8px;
    font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,.4)}
  .btn-print:hover{background:#1d4ed8}
  .btn-close{background:#fff;color:#64748b;border:1px solid #e2e8f0;padding:10px 16px;
    border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
  .btn-close:hover{background:#f8fafc}

  /* ── Cover ─────────────── */
  .cover{display:flex;flex-direction:column;min-height:200px;padding:28px 0 20px;
    border-bottom:3px solid #2563eb;margin-bottom:24px}
  .cover-logo{display:flex;align-items:center;gap:10px;margin-bottom:16px}
  .cover-logo-box{background:#2563eb;color:#fff;font-weight:800;font-size:13px;
    border-radius:8px;padding:6px 12px;letter-spacing:.5px}
  .cover-org{font-size:12px;color:#64748b;font-weight:500}
  .cover-title{font-size:20pt;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:8px}
  .cover-sub{font-size:11pt;color:#475569;margin-bottom:14px}
  .cover-meta{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:10pt;color:#64748b}
  .cover-meta span strong{color:#334155}
  .cover-date{margin-top:10px;font-size:9.5pt;color:#94a3b8}

  /* ── Summary cards ──────── */
  .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .sum-card{background:#f8fafc;border-radius:10px;padding:12px 14px;border:1px solid #e2e8f0;text-align:center}
  .sum-card .val{font-size:22pt;font-weight:800;line-height:1}
  .sum-card .lbl{font-size:9pt;color:#64748b;margin-top:4px}

  /* ── Section header ────── */
  .sec-title{font-size:11pt;font-weight:700;color:#2563eb;text-transform:uppercase;
    letter-spacing:.6px;border-bottom:2px solid #bfdbfe;padding-bottom:5px;margin:20px 0 12px}

  /* ── Info table ──────────  */
  .info-table{width:100%;border-collapse:collapse;margin-bottom:16px}
  .info-table td{padding:5px 8px;font-size:10pt;vertical-align:top;border-bottom:1px solid #f1f5f9}
  .info-table td:first-child{width:160px;color:#64748b;font-weight:600;white-space:nowrap}
  .info-table td:nth-child(2){color:#475569;padding-right:4px;font-weight:500}
  .info-table td:last-child{width:auto;color:#1e293b}

  /* ── Goal/Outcome box ───── */
  .goal-box{background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;
    padding:10px 14px;margin-bottom:10px}
  .goal-box .label{font-size:9pt;font-weight:700;color:#2563eb;letter-spacing:.5px;margin-bottom:4px}
  .outcome-list{margin:0;padding-left:18px}
  .outcome-list li{font-size:10pt;color:#1e293b;margin-bottom:3px;line-height:1.4}

  /* ── Data table ──────────  */
  .data-table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10pt}
  .data-table th{background:#1e40af;color:#fff;padding:7px 9px;font-weight:600;font-size:9.5pt;text-align:left}
  .data-table td{padding:6px 9px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#334155}
  .data-table tr:nth-child(even) td{background:#f8fafc}
  .data-table tr:last-child td{border-bottom:2px solid #cbd5e1;font-weight:700;background:#eff6ff}
  .data-table .num{text-align:right}
  .data-table .ctr{text-align:center}

  /* ── Badge ───────────────  */
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:8.5pt;font-weight:700;white-space:nowrap}

  /* ── Progress bar print ── */
  .pbar-wrap{background:#e2e8f0;border-radius:6px;height:8px;min-width:60px;overflow:hidden;display:inline-block;width:100px}
  .pbar-fill{height:8px;border-radius:6px}

  /* ── Budget box ─────────  */
  .budget-row{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
  .budget-card{flex:1;min-width:130px;background:#f8fafc;border-radius:10px;padding:12px 14px;border:1px solid #e2e8f0}
  .budget-card .b-label{font-size:9pt;color:#64748b;margin-bottom:4px}
  .budget-card .b-value{font-size:13pt;font-weight:800;color:#0f172a}
  .budget-card .b-pct{font-size:9pt;color:#f59e0b;font-weight:600;margin-top:2px}

  /* ── Impact chips ────────  */
  .impact-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}
  .impact-chip{background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:10px 16px;min-width:120px;text-align:center}
  .impact-chip .ic-icon{font-size:18pt;line-height:1}
  .impact-chip .ic-val{font-size:13pt;font-weight:800;color:#15803d;margin:2px 0}
  .impact-chip .ic-unit{font-size:9pt;color:#166534;font-weight:600}

  /* ── Activity notes ──────  */
  .note-list{margin:0;padding-left:16px}
  .note-list li{font-size:9pt;color:#475569;margin-bottom:2px}

  /* ── Budget history ──────  */
  .bud-hist-note{font-size:8.5pt;color:#94a3b8;font-style:italic}

  /* ── Footer ─────────────  */
  .report-footer{margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;
    font-size:9pt;color:#94a3b8;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}
  `;
}

// ── Fungsi utama generate + print ────────────────────────────
async function generateAndPrint(lang) {
  closePrintModal();
  if (!currentProject) return;
  const proj = currentProject;

  // Loading overlay
  const loadDiv = document.createElement('div');
  loadDiv.id = '_pmis_loading';
  loadDiv.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;
    display:flex;align-items:center;justify-content:center">
    <div style="background:#fff;border-radius:14px;padding:28px 40px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:28px;margin-bottom:8px">📄</div>
      <div style="font-weight:700;font-size:15px;color:#1e293b">Menyiapkan Laporan…</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Mengambil data dari database</div>
    </div></div>`;
  document.body.appendChild(loadDiv);

  let fresh;
  try {
    fresh = await _rptFetch(proj.name);
  } catch(e) {
    document.body.removeChild(loadDiv);
    alert('Gagal mengambil data: ' + e.message);
    return;
  }
  document.body.removeChild(loadDiv);

  const { indicators, activities, budgetUpdates, outcomes } = fresh;
  const isID = lang !== 'en';

  // ── Kalkulasi ────────────────────────────────────────────
  let avgInd = null, avgAct = null;
  if (indicators.length) {
    const t = indicators.reduce((s,ind) => {
      const a = _rptActual(ind), tg = Number(ind.target)||0;
      return s + (tg>0 ? Math.min(Math.round(a/tg*100),100) : 0);
    }, 0);
    avgInd = Math.round(t / indicators.length);
  }
  if (activities.length) {
    avgAct = Math.round(activities.reduce((s,a)=>s+(Number(a.progress)||0),0)/activities.length);
  }
  let overall = 0;
  if (avgInd!==null && avgAct!==null) overall = Math.round((avgInd+avgAct)/2);
  else if (avgInd!==null) overall = avgInd;
  else if (avgAct!==null) overall = avgAct;

  const doneInd  = indicators.filter(i=>{ const a=_rptActual(i),t=Number(i.target)||0; return t>0&&a>=t; }).length;
  const doneAct  = activities.filter(a=>a.status==='Selesai').length;
  const budAppr  = Number(proj.budget_approved)||0;
  const budAct   = Number(proj.budget_actual)||0;
  const budLeft  = budAppr - budAct;
  const budPct   = budAppr>0 ? Math.min(Math.round(budAct/budAppr*100),999) : 0;

  // ── Impact grouping ──────────────────────────────────────
  const impGroup = {};
  indicators.forEach(ind => {
    const ru = (ind.unit||'').trim(); if (!ru) return;
    const k  = ru.toLowerCase();
    const av = _rptActual(ind);
    if (!impGroup[k]) impGroup[k] = { unit: ru, total: 0 };
    impGroup[k].total += av;
  });

  // ── Label helpers ────────────────────────────────────────
  const T = isID ? {
    reportTitle:'LAPORAN KEMAJUAN PROYEK', org:'DFW Indonesia',
    generatedOn:'Dicetak pada', by:'oleh',
    projInfo:'INFORMASI PROYEK',
    summaryTitle:'RINGKASAN KEMAJUAN',
    goalTitle:'GOAL & OUTCOMES',
    indTitle:'CAPAIAN INDIKATOR KINERJA',
    actTitle:'AKTIVITAS PELAKSANAAN',
    budTitle:'REALISASI ANGGARAN',
    impTitle:'DAMPAK PROGRAM',
    overallProgress:'Progress Keseluruhan',
    indProgress:'Avg. Indikator',
    actProgress:'Avg. Aktivitas',
    totalInd:'Total Indikator',
    doneInd:'Tercapai',
    totalAct:'Total Aktivitas',
    doneAct:'Selesai',
    status:'Status',indName:'Nama Indikator',type:'Tipe',
    target:'Target',actual:'Realisasi',pct:'%',note:'Catatan',
    actName:'Judul Aktivitas',pic:'PIC',start:'Tgl Mulai',due:'Deadline',
    actStatus:'Status',actProgress2:'Progress',actNotes:'Catatan',
    budAppr:'Anggaran Disetujui',budActual:'Realisasi Anggaran',
    budLeft:'Sisa Anggaran',absorption:'Penyerapan',
    budHistory:'RIWAYAT REALISASI ANGGARAN',
    date:'Tanggal',updBy:'Diperbarui Oleh',amount:'Jumlah',
    location:'Lokasi',owner:'Penanggung Jawab',donor:'Donor/Mitra',
    start_date:'Tanggal Mulai',deadline:'Deadline',description:'Deskripsi',
    noData:'Belum ada data',impDesc:'Capaian program berdasarkan realisasi indikator',
    footerNote:'Laporan ini digenerate otomatis dari sistem PMIS DFW Indonesia',
  } : {
    reportTitle:'PROJECT PROGRESS REPORT', org:'DFW Indonesia',
    generatedOn:'Printed on', by:'by',
    projInfo:'PROJECT INFORMATION',
    summaryTitle:'PROGRESS SUMMARY',
    goalTitle:'GOAL & OUTCOMES',
    indTitle:'KEY PERFORMANCE INDICATORS',
    actTitle:'IMPLEMENTATION ACTIVITIES',
    budTitle:'BUDGET REALIZATION',
    impTitle:'PROGRAM IMPACT',
    overallProgress:'Overall Progress',
    indProgress:'Avg. Indicators',
    actProgress:'Avg. Activities',
    totalInd:'Total Indicators',
    doneInd:'Achieved',
    totalAct:'Total Activities',
    doneAct:'Completed',
    status:'Status',indName:'Indicator Name',type:'Type',
    target:'Target',actual:'Actual',pct:'%',note:'Note',
    actName:'Activity Title',pic:'PIC',start:'Start Date',due:'Deadline',
    actStatus:'Status',actProgress2:'Progress',actNotes:'Notes',
    budAppr:'Approved Budget',budActual:'Budget Realization',
    budLeft:'Remaining Budget',absorption:'Absorption',
    budHistory:'BUDGET REALIZATION HISTORY',
    date:'Date',updBy:'Updated By',amount:'Amount',
    location:'Location',owner:'Person in Charge',donor:'Donor/Partner',
    start_date:'Start Date',deadline:'Deadline',description:'Description',
    noData:'No data available',impDesc:'Program achievements based on indicator realizations',
    footerNote:'This report is auto-generated from PMIS DFW Indonesia system',
  };

  const nowStr = new Date().toLocaleString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

  // ── Helper: status badge HTML ─────────────────────────────
  const badge = (text, color) =>
    `<span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}50">${text||'—'}</span>`;

  // ── Helper: progress bar HTML ─────────────────────────────
  const pbar = (pct, color) => {
    const c = color||_rptPctColor(pct), w = Math.min(pct,100);
    return `<div style="display:flex;align-items:center;gap:6px">
      <div class="pbar-wrap"><div class="pbar-fill" style="width:${w}%;background:${c}"></div></div>
      <span style="font-weight:700;color:${c};min-width:30px">${pct}%</span></div>`;
  };

  // ═══════════════════════════════════════════════════════════
  // BUILD HTML DOCUMENT
  // ═══════════════════════════════════════════════════════════

  // ── SECTION 1: Cover + Project Info ────────────────────────
  const sec1 = `
  <div class="cover avoid-break">
    <div class="cover-logo">
      <div class="cover-logo-box">DFW-I</div>
      <div class="cover-org">${T.org} — Monitoring &amp; Evaluation System</div>
    </div>
    <div class="cover-title">${proj.name}</div>
    <div class="cover-sub">${T.reportTitle}</div>
    <div class="cover-meta">
      ${proj.location  ? `<span><strong>${T.location}:</strong> ${proj.location}</span>` : ''}
      ${proj.owner     ? `<span><strong>${T.owner}:</strong> ${proj.owner}</span>` : ''}
      ${proj.donor     ? `<span><strong>${T.donor}:</strong> ${proj.donor}</span>` : ''}
      ${proj.start_date? `<span><strong>${T.start_date}:</strong> ${_rptDate(proj.start_date)}</span>` : ''}
      ${proj.deadline  ? `<span><strong>${T.deadline}:</strong> ${_rptDate(proj.deadline)}</span>` : ''}
      <span><strong>${T.status}:</strong> ${badge(proj.status, _rptStatusColor(proj.status))}</span>
    </div>
    <div class="cover-date">${T.generatedOn}: ${nowStr}</div>
  </div>

  <!-- Summary Cards -->
  <div class="sec-title">${T.summaryTitle}</div>
  <div class="summary-grid avoid-break">
    <div class="sum-card">
      <div class="val" style="color:${_rptPctColor(overall)}">${overall}%</div>
      <div>${pbar(overall)}</div>
      <div class="lbl">${T.overallProgress}</div>
    </div>
    <div class="sum-card">
      <div class="val" style="color:${_rptPctColor(avgInd??0)}">${avgInd??'—'}${avgInd!==null?'%':''}</div>
      <div>${avgInd!==null?pbar(avgInd):''}</div>
      <div class="lbl">${T.indProgress}</div>
    </div>
    <div class="sum-card">
      <div class="val" style="color:${_rptPctColor(avgAct??0)}">${avgAct??'—'}${avgAct!==null?'%':''}</div>
      <div>${avgAct!==null?pbar(avgAct):''}</div>
      <div class="lbl">${T.actProgress}</div>
    </div>
    <div class="sum-card">
      <div class="val" style="color:#2563eb">${doneInd}/${indicators.length}</div>
      <div class="lbl">${T.doneInd} / ${T.totalInd}</div>
      <br>
      <div class="val" style="color:#16a34a;font-size:16pt">${doneAct}/${activities.length}</div>
      <div class="lbl">${T.doneAct} / ${T.totalAct}</div>
    </div>
  </div>
  `;

  // ── SECTION 2: Goal & Outcomes ──────────────────────────────
  const hasGoal    = !!proj.goal;
  const hasOutcome = outcomes.length > 0;
  const hasDesc    = !!proj.description;
  const sec2 = (hasGoal||hasOutcome||hasDesc) ? `
  <div class="sec-title">${T.goalTitle}</div>
  <div class="avoid-break">
    ${hasDesc ? `<div style="font-size:10pt;color:#475569;margin-bottom:10px;line-height:1.6">${proj.description}</div>` : ''}
    ${hasGoal ? `<div class="goal-box" style="margin-bottom:10px">
      <div class="label">GOAL</div>
      <div style="font-size:10.5pt;color:#1e3a5f;line-height:1.5">${proj.goal}</div>
    </div>` : ''}
    ${hasOutcome ? `<div class="goal-box" style="background:#f5f3ff;border-color:#7c3aed">
      <div class="label" style="color:#7c3aed">OUTCOMES</div>
      <ol class="outcome-list">
        ${outcomes.map(o=>`<li>${o.outcome_text}</li>`).join('')}
      </ol>
    </div>` : ''}
  </div>
  ` : '';

  // ── SECTION 3: Indikator Kinerja ────────────────────────────
  const indRows = indicators.map((ind, i) => {
    const a   = _rptActual(ind);
    const tg  = Number(ind.target)||0;
    const pct = _rptPct(a, tg);
    const c   = _rptPctColor(pct);
    const lastNote = (ind.indicator_updates||[]).length
      ? [...ind.indicator_updates].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0].note||'—'
      : '—';
    return `<tr>
      <td class="ctr">${i+1}</td>
      <td><strong>${ind.indicator_name}</strong></td>
      <td class="ctr"><span style="font-size:8.5pt;background:#e0e7ff;color:#3730a3;border-radius:20px;padding:1px 7px;font-weight:600">${ind.type||'Output'}</span></td>
      <td class="num">${tg.toLocaleString('id-ID')} ${ind.unit||''}</td>
      <td class="num" style="font-weight:700;color:${c}">${a.toLocaleString('id-ID')} ${ind.unit||''}</td>
      <td class="ctr">${pbar(pct,c)}</td>
      <td style="font-size:9pt;color:#64748b;font-style:italic">${lastNote}</td>
    </tr>`;
  }).join('');

  const sec3 = indicators.length ? `
  <div class="sec-title page-break">${T.indTitle}</div>
  <table class="data-table avoid-break">
    <thead><tr>
      <th class="ctr" style="width:30px">#</th>
      <th>${T.indName}</th>
      <th class="ctr" style="width:70px">${T.type}</th>
      <th class="num" style="width:100px">${T.target}</th>
      <th class="num" style="width:100px">${T.actual}</th>
      <th style="width:120px">${T.pct}</th>
      <th>${T.note}</th>
    </tr></thead>
    <tbody>${indRows}</tbody>
    <tfoot><tr>
      <td colspan="5" style="text-align:right;padding-right:8px">${T.indProgress}:</td>
      <td colspan="2">${pbar(avgInd??0)}</td>
    </tr></tfoot>
  </table>
  ` : '';

  // ── SECTION 4: Aktivitas ─────────────────────────────────────
  const actRows = activities.map((act, i) => {
    const c     = _rptStatusColor(act.status);
    const prog  = Number(act.progress)||0;
    const notes = (act.activity_notes||[]);
    const noteHtml = notes.length
      ? `<ul class="note-list">${[...notes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,3)
          .map(n=>`<li>${n.note}</li>`).join('')}${notes.length>3?`<li style="color:#94a3b8">…+${notes.length-3} catatan lainnya</li>`:''}</ul>`
      : `<span style="color:#94a3b8;font-size:9pt">—</span>`;
    return `<tr>
      <td class="ctr">${i+1}</td>
      <td><strong>${act.title}</strong>${act.description?`<div style="font-size:9pt;color:#64748b;margin-top:2px">${act.description}</div>`:''}</td>
      <td style="white-space:nowrap">${act.pic||'—'}</td>
      <td class="ctr">${_rptDate(act.start_date)}</td>
      <td class="ctr">${_rptDate(act.due_date)}</td>
      <td class="ctr">${badge(act.status, c)}</td>
      <td class="ctr">${pbar(prog, c)}</td>
      <td>${noteHtml}</td>
    </tr>`;
  }).join('');

  const sec4 = activities.length ? `
  <div class="sec-title page-break">${T.actTitle}</div>
  <table class="data-table avoid-break">
    <thead><tr>
      <th class="ctr" style="width:28px">#</th>
      <th style="min-width:140px">${T.actName}</th>
      <th style="width:80px">${T.pic}</th>
      <th class="ctr" style="width:75px">${T.start}</th>
      <th class="ctr" style="width:75px">${T.due}</th>
      <th class="ctr" style="width:70px">${T.actStatus}</th>
      <th style="width:120px">${T.actProgress2}</th>
      <th style="min-width:100px">${T.actNotes}</th>
    </tr></thead>
    <tbody>${actRows}</tbody>
    <tfoot><tr>
      <td colspan="6" style="text-align:right;padding-right:8px">${T.actProgress}:</td>
      <td colspan="2">${pbar(avgAct??0)}</td>
    </tr></tfoot>
  </table>
  ` : '';

  // ── SECTION 5: Anggaran ──────────────────────────────────────
  const lastBud = budgetUpdates.length
    ? [...budgetUpdates].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]
    : null;
  const budActFinal = lastBud ? Number(lastBud.actual_value)||0 : budAct;
  const budPctFinal = budAppr>0 ? Math.min(Math.round(budActFinal/budAppr*100),999) : 0;
  const budLeftFinal = budAppr - budActFinal;

  const budHistRows = [...budgetUpdates].reverse().map((b,i)=>`<tr>
    <td class="ctr">${i+1}</td>
    <td class="ctr">${_rptDate(b.created_at)}</td>
    <td>${b.updated_by||'—'}</td>
    <td class="num" style="font-weight:700">${_rptRupiah(b.actual_value)}</td>
    <td class="bud-hist-note">${b.note||'—'}</td>
  </tr>`).join('');

  const sec5 = budAppr > 0 ? `
  <div class="sec-title page-break">${T.budTitle}</div>
  <div class="budget-row avoid-break">
    <div class="budget-card">
      <div class="b-label">${T.budAppr}</div>
      <div class="b-value">${_rptRupiah(budAppr)}</div>
    </div>
    <div class="budget-card">
      <div class="b-label">${T.budActual}</div>
      <div class="b-value" style="color:#f59e0b">${_rptRupiah(budActFinal)}</div>
      <div class="b-pct">${pbar(budPctFinal,'#f59e0b')}</div>
    </div>
    <div class="budget-card">
      <div class="b-label">${T.budLeft}</div>
      <div class="b-value" style="color:${budLeftFinal>=0?'#16a34a':'#dc2626'}">${_rptRupiah(budLeftFinal)}</div>
    </div>
  </div>
  ${budHistRows ? `
  <div style="font-size:9.5pt;font-weight:700;color:#475569;margin-bottom:8px">${T.budHistory}</div>
  <table class="data-table">
    <thead><tr>
      <th class="ctr" style="width:30px">#</th>
      <th class="ctr" style="width:90px">${T.date}</th>
      <th style="width:120px">${T.updBy}</th>
      <th class="num" style="width:140px">${T.amount}</th>
      <th>${T.note}</th>
    </tr></thead>
    <tbody>${budHistRows}</tbody>
  </table>` : ''}
  ` : '';

  // ── SECTION 6: Dampak ─────────────────────────────────────────
  const impEntries = Object.entries(impGroup).sort((a,b)=>b[1].total-a[1].total);
  const impChips = impEntries.map(([k,d])=>`
    <div class="impact-chip">
      <div class="ic-icon">${_rptImpactIcon(k)}</div>
      <div class="ic-val">${Number(d.total).toLocaleString('id-ID')}</div>
      <div class="ic-unit">${d.unit}</div>
    </div>`).join('');

  const impIndRows = indicators.map((ind,i)=>{
    const a=_rptActual(ind), tg=Number(ind.target)||0, pct=_rptPct(a,tg), c=_rptPctColor(pct);
    return `<tr>
      <td class="ctr">${i+1}</td>
      <td style="font-size:8.5pt;background:#e0e7ff20;color:#3730a3;font-weight:600;text-align:center;border-radius:4px">${ind.type||'Output'}</td>
      <td>${ind.indicator_name}</td>
      <td class="num" style="font-weight:700;color:${c}">${a.toLocaleString('id-ID')} ${ind.unit||''}</td>
      <td class="num">${tg.toLocaleString('id-ID')} ${ind.unit||''}</td>
      <td class="ctr">${pbar(pct,c)}</td>
    </tr>`;
  }).join('');

  const sec6 = impEntries.length ? `
  <div class="sec-title page-break">${T.impTitle}</div>
  <div style="font-size:9.5pt;color:#475569;margin-bottom:10px">${T.impDesc}</div>
  <div class="impact-grid avoid-break">${impChips}</div>
  ${indicators.length ? `
  <table class="data-table">
    <thead><tr>
      <th class="ctr" style="width:30px">#</th>
      <th class="ctr" style="width:65px">${isID?'Tipe':'Type'}</th>
      <th>${isID?'Indikator':'Indicator'}</th>
      <th class="num" style="width:120px">${T.actual}</th>
      <th class="num" style="width:120px">${T.target}</th>
      <th style="width:120px">${T.pct}</th>
    </tr></thead>
    <tbody>${impIndRows}</tbody>
  </table>` : ''}
  ` : '';

  // ── Footer ────────────────────────────────────────────────────
  const footer = `
  <div class="report-footer">
    <span>${T.footerNote}</span>
    <span>${nowStr}</span>
  </div>`;

  // ── Assemble full document ────────────────────────────────────
  const fullHTML = `<!DOCTYPE html>
<html lang="${isID?'id':'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${isID?'Laporan':'Report'} — ${proj.name}</title>
  <style>${_rptCSS()}</style>
</head>
<body>
  <div class="no-print print-btn-bar">
    <button class="btn-print" onclick="window.print()">🖨️ ${isID?'Cetak / Simpan PDF':'Print / Save PDF'}</button>
    <button class="btn-close" onclick="window.close()">✕ ${isID?'Tutup':'Close'}</button>
  </div>
  <div style="max-width:900px;margin:0 auto;padding:20px">
    ${sec1}
    ${sec2}
    ${sec3}
    ${sec4}
    ${sec5}
    ${sec6}
    ${footer}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1000,height=800,scrollbars=yes');
  if (!win) { alert('Pop-up diblokir browser. Izinkan pop-up untuk situs ini.'); return; }
  win.document.open();
  win.document.write(fullHTML);
  win.document.close();
}

// ── Expose global ─────────────────────────────────────────────
window.openPrintModal   = openPrintModal;
window.closePrintModal  = closePrintModal;
window.generateAndPrint = generateAndPrint;
