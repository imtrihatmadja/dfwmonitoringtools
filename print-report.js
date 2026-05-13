// ============================================================
// PMIS DFW Indonesia — Print Report v3
// Modern design | Hambatan & Tantangan | Rencana Tindak Lanjut
// ============================================================

function openPrintModal() {
  if (!currentProject) { alert('Buka halaman detail proyek terlebih dahulu.'); return; }
  const m = document.getElementById('printLangModal');
  if (!m) return;
  const activeBtn = document.querySelector('#printPresetGrid .print-preset-btn.active')
    || document.querySelectorAll('#printPresetGrid .print-preset-btn')[2];
  setPrintPreset('month', activeBtn);
  m.classList.remove('hidden');
}
function closePrintModal() {
  const m = document.getElementById('printLangModal');
  if (m) m.classList.add('hidden');
}

// ── Preset helpers ─────────────────────────────────────────────
function setPrintPreset(preset, btn) {
  const today = new Date(); today.setHours(23,59,59,999);
  let from = new Date();    from.setHours(0,0,0,0);
  if      (preset==='week')    { from.setDate(today.getDate()-6); }
  else if (preset==='2week')   { from.setDate(today.getDate()-13); }
  else if (preset==='month')   { from=new Date(today.getFullYear(),today.getMonth(),1); }
  else if (preset==='quarter') { from=new Date(today.getFullYear(),today.getMonth()-2,1); }
  else if (preset==='half')    { from=new Date(today.getFullYear(),today.getMonth()-5,1); }
  if (preset!=='custom') {
    const fi=document.getElementById('printDateFrom');
    const ti=document.getElementById('printDateTo');
    if(fi) fi.value=_toInputDate(from);
    if(ti) ti.value=_toInputDate(today);
  } else {
    // Custom: isi default bulan ini jika belum ada nilai
    const fi=document.getElementById('printDateFrom');
    const ti=document.getElementById('printDateTo');
    const defFrom=new Date(today.getFullYear(),today.getMonth(),1);
    if(fi&&!fi.value) fi.value=_toInputDate(defFrom);
    if(ti&&!ti.value) ti.value=_toInputDate(today);
  }
  document.querySelectorAll('.print-preset-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  _updatePeriodInfo();
}
function clearPresetActive() {
  document.querySelectorAll('.print-preset-btn').forEach(b=>b.classList.remove('active'));
  const btns=document.querySelectorAll('.print-preset-btn');
  if(btns.length) btns[btns.length-1].classList.add('active');
  _updatePeriodInfo();
}
function _toInputDate(d) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function _updatePeriodInfo() {
  const fv=document.getElementById('printDateFrom')?.value;
  const tv=document.getElementById('printDateTo')?.value;
  const el=document.getElementById('printPeriodInfo');
  if(!el) return;
  if(fv&&tv) {
    const fStr=new Date(fv).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const tStr=new Date(tv).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    el.innerHTML=`📋 Laporan akan merangkum data dari <strong>${fStr}</strong> sampai <strong>${tStr}</strong>`;
  } else { el.innerHTML=`ℹ️ Pilih preset atau isi tanggal secara manual.`; }
}
function _getPrintRange() {
  const fv=document.getElementById('printDateFrom')?.value;
  const tv=document.getElementById('printDateTo')?.value;
  if(!fv||!tv) return null;
  const from=new Date(fv+'T00:00:00'), to=new Date(tv+'T23:59:59');
  return {
    from, to,
    fromStr: from.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}),
    toStr:   to.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}),
    fromStrEN: from.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}),
    toStrEN:   to.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}),
  };
}

// ── Fetch data segar ──────────────────────────────────────────
async function _rptFetch(projectName, dateRange = null) {
  // Semua indikator & aktivitas selalu diambil sebagai konteks
  let indQ = client.from('project_indicators')
    .select('id,indicator_name,type,target,unit,actual,indicator_updates(id,actual_value,note,updated_by,created_at)')
    .eq('project_name', projectName).order('created_at', { ascending: true });

  let actQ = client.from('project_activities')
    .select('id,title,description,pic,status,start_date,due_date,progress,sort_order,activity_notes(id,note,noted_by,created_at)')
    .eq('project_name', projectName).order('sort_order', { ascending: true });

  // Budget & outcomes
  let budQ = client.from('budget_updates')
    .select('id,actual_value,note,updated_by,created_at')
    .eq('project_name', projectName).order('created_at', { ascending: true });

  let outQ = client.from('project_outcomes')
    .select('id,outcome_text,sort_order')
    .eq('project_name', projectName).order('sort_order', { ascending: true });

  // Filter budget_updates by range di server
  if (dateRange) {
    budQ = budQ
      .gte('created_at', dateRange.from.toISOString())
      .lte('created_at', dateRange.to.toISOString());
  }

  const [indRes, actRes, budRes, outRes] = await Promise.all([indQ, actQ, budQ, outQ]);

  let indicators    = indRes.data || [];
  let activities    = actRes.data || [];
  const budgetUpdates = budRes.data || [];
  const outcomes    = outRes.data  || [];

  // Filter indicator_updates & activity_notes client-side
  if (dateRange) {
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime();

    indicators = indicators.map(ind => ({
      ...ind,
      indicator_updates_all: ind.indicator_updates || [],
      indicator_updates: (ind.indicator_updates || []).filter(u => {
        const t = new Date(u.created_at).getTime();
        return t >= fromMs && t <= toMs;
      }),
    }));

    activities = activities.map(act => {
      const sd = act.start_date ? new Date(act.start_date).getTime() : null;
      const dd = act.due_date   ? new Date(act.due_date  ).getTime() : null;
      const inRange = !sd || (sd <= toMs && (!dd || dd >= fromMs));
      return {
        ...act,
        activity_notes: (act.activity_notes || []).filter(n => {
          const t = new Date(n.created_at).getTime();
          return t >= fromMs && t <= toMs;
        }),
        _inRange: inRange,
      };
    });
  } else {
    indicators = indicators.map(i => ({ ...i, indicator_updates_all: i.indicator_updates || [] }));
    activities = activities.map(a => ({ ...a, _inRange: true }));
  }

  return { indicators, activities, budgetUpdates, outcomes, dateRange };
}

// ── Helpers ───────────────────────────────────────────────────
function _rptActual(ind) {
  // Pakai indicator_updates (bisa filtered by range — untuk RTL/notes periode)
  const upds = ind.indicator_updates || [];
  if (upds.length) {
    const v = Number([...upds].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0].actual_value);
    if (!isNaN(v)) return v;
  }
  return isNaN(Number(ind.actual)) ? 0 : Number(ind.actual);
}
function _rptActualAll(ind) {
  // Selalu pakai semua updates (untuk overall progress & capaian aktual proyek)
  const upds = ind.indicator_updates_all || ind.indicator_updates || [];
  if (upds.length) {
    const v = Number([...upds].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0].actual_value);
    if (!isNaN(v)) return v;
  }
  return isNaN(Number(ind.actual)) ? 0 : Number(ind.actual);
}

function _rptPct(a, t) { const n=Number(t)||0; return n>0?Math.min(Math.round(a/n*100),999):0; }
function _rptRupiah(n) { if(!n&&n!==0)return'—'; return'Rp\u00a0'+Number(n).toLocaleString('id-ID'); }
function _rptDate(d)   { if(!d)return'—'; return new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); }
function _rptDateTime(d){ if(!d)return'—'; return new Date(d).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }

function _statusColor(s) {
  return {Selesai:'#16a34a','Sedang Berjalan':'#2563eb','On Track':'#2563eb',
          Aktif:'#16a34a',Terlambat:'#dc2626',Tertunda:'#d97706',
          'Belum Mulai':'#94a3b8',Ditangguhkan:'#94a3b8'}[s]||'#64748b';
}
function _pctColor(p) {
  if(p>=85)return'#16a34a'; if(p>=60)return'#2563eb'; if(p>=35)return'#d97706'; return'#dc2626';
}
function _pctLabel(p) {
  if(p>=85)return'Sangat Baik'; if(p>=60)return'Baik'; if(p>=35)return'Sedang'; return'Perlu Perhatian';
}
function _impactIcon(u) {
  u=(u||'').toLowerCase();
  if(['orang','jiwa','nelayan','peserta','perempuan','laki-laki','anak','pekerja','buruh','anggota','komunitas','keluarga'].some(k=>u.includes(k)))return'👥';
  if(['dokumen','laporan','modul','publikasi','panduan','kebijakan','regulasi'].some(k=>u.includes(k)))return'📄';
  if(['kapal','perahu','alat','unit'].some(k=>u.includes(k)))return'🚢';
  if(['hektar','ha','km','wilayah','desa','kawasan','area'].some(k=>u.includes(k)))return'🗺️';
  if(['kegiatan','event','pelatihan','workshop','pertemuan','sosialisasi'].some(k=>u.includes(k)))return'📅';
  if(['kg','ton','gram','kwintal'].some(k=>u.includes(k)))return'⚖️';
  if(['mou','perjanjian','kontrak','kesepakatan'].some(k=>u.includes(k)))return'🤝';
  return'🎯';
}

// ── CSS Modern ────────────────────────────────────────────────
function _css() { return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:10.5pt;color:#1e293b;background:#f8fafc;line-height:1.6}
@page{size:A4 portrait;margin:15mm 14mm 18mm 14mm}
@media print{
  body{background:#fff!important;font-size:10pt}
  .no-print{display:none!important}
  .page-break{page-break-before:always}
  .avoid-break{page-break-inside:avoid}
  .section-card{box-shadow:none!important;border:1px solid #e2e8f0!important}
  .cover-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
}

/* ── Float action bar ─── */
.print-bar{position:fixed;bottom:24px;right:24px;z-index:9999;
  display:flex;gap:10px;filter:drop-shadow(0 4px 16px rgba(0,0,0,.18))}
.btn-print{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;
  padding:12px 26px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;
  letter-spacing:.3px;transition:transform .15s}
.btn-print:hover{transform:translateY(-2px)}
.btn-close{background:#fff;color:#64748b;border:1.5px solid #e2e8f0;
  padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer}
.btn-close:hover{background:#f1f5f9}

/* ── Page wrapper ─── */
.page{max-width:820px;margin:0 auto;padding:24px 20px 60px}

/* ── Cover header ─── */
.cover-header{background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 60%,#0ea5e9 100%);
  border-radius:16px;padding:32px 36px 28px;color:#fff;margin-bottom:24px;position:relative;overflow:hidden}
.cover-header::before{content:'';position:absolute;top:-40px;right:-40px;width:220px;height:220px;
  background:rgba(255,255,255,.06);border-radius:50%}
.cover-header::after{content:'';position:absolute;bottom:-60px;left:60px;width:160px;height:160px;
  background:rgba(255,255,255,.04);border-radius:50%}
.cover-org-badge{display:inline-block;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:4px 14px;
  font-size:10pt;font-weight:600;letter-spacing:.5px;margin-bottom:16px}
.cover-type{font-size:9.5pt;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;
  opacity:.75;margin-bottom:6px}
.cover-title{font-size:21pt;font-weight:800;line-height:1.15;margin-bottom:14px;position:relative;z-index:1}
.cover-period-badge{
  display:inline-block;background:rgba(255,255,255,.18);color:#fff;
  font-size:9pt;font-weight:700;letter-spacing:.4px;
  padding:4px 12px;border-radius:20px;margin-bottom:10px;
  border:1px solid rgba(255,255,255,.3)
}
.cover-period-footer{
  font-size:9pt;font-weight:700;opacity:.9;
  background:rgba(255,255,255,.15);padding:3px 10px;border-radius:12px
}
.cover-meta-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;
  background:rgba(255,255,255,.12);border-radius:10px;padding:12px 16px;
  backdrop-filter:blur(6px);position:relative;z-index:1}
.cover-meta-item{display:flex;flex-direction:column;gap:1px}
.cover-meta-label{font-size:8pt;opacity:.7;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.cover-meta-value{font-size:10pt;font-weight:600}
.cover-footer{display:flex;justify-content:space-between;align-items:center;
  margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2);
  font-size:9pt;opacity:.75;position:relative;z-index:1}

/* ── Status badge ─── */
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:8.5pt;font-weight:700;white-space:nowrap}

/* ── Summary stats ─── */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.stat-card{background:#fff;border-radius:14px;padding:16px 14px;text-align:center;
  box-shadow:0 1px 4px rgba(0,0,0,.08);border:1px solid #f1f5f9}
.stat-val{font-size:24pt;font-weight:800;line-height:1.1}
.stat-sub{margin-top:4px}
.stat-bar{height:5px;border-radius:4px;background:#e2e8f0;margin:6px 6px 0;overflow:hidden}
.stat-bar-fill{height:5px;border-radius:4px}
.stat-label{font-size:8.5pt;color:#64748b;margin-top:5px;font-weight:500}

/* ── Section card ─── */
.section-card{background:#fff;border-radius:14px;padding:20px 22px;margin-bottom:18px;
  box-shadow:0 1px 6px rgba(0,0,0,.07);border:1px solid #f1f5f9}
.sec-head{display:flex;align-items:center;gap:10px;margin-bottom:16px;
  padding-bottom:10px;border-bottom:2px solid #f1f5f9}
.sec-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;
  justify-content:center;font-size:14pt;flex-shrink:0}
.sec-title-text{font-size:11pt;font-weight:800;color:#0f172a;letter-spacing:.3px}
.sec-badge{margin-left:auto;font-size:8.5pt;font-weight:600;color:#64748b;
  background:#f1f5f9;border-radius:20px;padding:2px 10px}

/* ── Info rows ─── */
.info-row{display:flex;border-bottom:1px solid #f8fafc;padding:5px 0}
.info-row:last-child{border-bottom:none}
.info-key{width:160px;font-size:9.5pt;color:#64748b;font-weight:600;flex-shrink:0}
.info-val{font-size:9.5pt;color:#1e293b;flex:1}

/* ── Goal/outcome box ─── */
.goal-box{border-radius:10px;padding:12px 16px;margin-bottom:10px}
.goal-label{font-size:8.5pt;font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px}
.outcome-ol{padding-left:18px;margin:0}
.outcome-ol li{font-size:10pt;margin-bottom:4px;line-height:1.5}

/* ── Data table ─── */
.tbl{width:100%;border-collapse:collapse;font-size:9.5pt}
.tbl th{background:#1e3a8a;color:#fff;padding:8px 10px;font-weight:600;
  font-size:9pt;text-align:left;letter-spacing:.2px}
.tbl th:first-child{border-radius:6px 0 0 0}
.tbl th:last-child{border-radius:0 6px 0 0}
.tbl td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#334155}
.tbl tr:nth-child(even) td{background:#f8fafc}
.tbl tfoot td{background:#eff6ff!important;font-weight:700;border-top:2px solid #bfdbfe}
.tbl .num{text-align:right}
.tbl .ctr{text-align:center}

/* ── Progress bar ─── */
.pbar{display:inline-flex;align-items:center;gap:6px;min-width:110px}
.pbar-track{width:70px;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;flex-shrink:0}
.pbar-fill{height:7px;border-radius:4px}
.pbar-pct{font-size:9pt;font-weight:700;min-width:30px}

/* ── Hambatan cards ─── */
.hambatan-list{display:flex;flex-direction:column;gap:10px}
.hambatan-card{border-radius:10px;padding:12px 16px;
  border-left:4px solid #f59e0b;background:#fffbeb}
.hambatan-act-title{font-size:9.5pt;font-weight:700;color:#92400e;margin-bottom:6px;
  display:flex;align-items:center;gap:6px}
.hambatan-notes{display:flex;flex-direction:column;gap:5px}
.hambatan-note-item{display:flex;gap:8px;align-items:flex-start}
.hambatan-note-dot{width:6px;height:6px;border-radius:50%;background:#f59e0b;
  flex-shrink:0;margin-top:5px}
.hambatan-note-text{font-size:9.5pt;color:#1e293b;line-height:1.5;flex:1}
.hambatan-note-meta{font-size:8pt;color:#94a3b8;margin-top:1px}
.hambatan-empty{font-size:9.5pt;color:#94a3b8;font-style:italic;padding:10px 0}

/* ── RTL cards ─── */
.rtl-list{display:flex;flex-direction:column;gap:10px}
.rtl-card{border-radius:10px;padding:12px 16px;
  border-left:4px solid #2563eb;background:#eff6ff}
.rtl-ind-title{font-size:9.5pt;font-weight:700;color:#1e40af;margin-bottom:6px;
  display:flex;align-items:center;gap:6px}
.rtl-type-badge{font-size:8pt;background:#dbeafe;color:#1d4ed8;
  border-radius:20px;padding:1px 8px;font-weight:600}
.rtl-notes{display:flex;flex-direction:column;gap:5px}
.rtl-note-item{display:flex;gap:8px;align-items:flex-start}
.rtl-note-dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;
  flex-shrink:0;margin-top:5px}
.rtl-note-text{font-size:9.5pt;color:#1e293b;line-height:1.5;flex:1}
.rtl-note-meta{font-size:8pt;color:#94a3b8;margin-top:1px}
.rtl-progress{display:flex;align-items:center;gap:8px;margin-top:6px;
  padding-top:6px;border-top:1px solid #dbeafe}
.rtl-progress-label{font-size:8.5pt;color:#475569}

/* ── Budget ─── */
.budget-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.bud-card{border-radius:12px;padding:14px 16px;border:1px solid #e2e8f0;background:#f8fafc}
.bud-card-label{font-size:8.5pt;color:#64748b;font-weight:600;margin-bottom:4px}
.bud-card-val{font-size:14pt;font-weight:800;color:#0f172a;line-height:1.1}
.bud-card-sub{font-size:8.5pt;color:#f59e0b;margin-top:4px;font-weight:600}

/* ── Impact chips ─── */
.impact-chips{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px}
.imp-chip{background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;
  padding:12px 18px;text-align:center;min-width:110px}
.imp-icon{font-size:20pt;line-height:1}
.imp-val{font-size:14pt;font-weight:800;color:#15803d;margin:3px 0 2px}
.imp-unit{font-size:8.5pt;color:#166534;font-weight:600}

/* ── Report footer ─── */
.rpt-footer{margin-top:28px;padding-top:14px;border-top:1.5px solid #e2e8f0;
  display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;
  gap:6px;font-size:8.5pt;color:#94a3b8}
.rpt-footer-brand{font-weight:700;color:#2563eb;font-size:9pt}
`; }

// ── Fungsi utama ──────────────────────────────────────────────
async function generateAndPrint(lang) {
  const dateRange = _getPrintRange();
  if (!dateRange) {
    alert('Harap isi tanggal "Dari" dan "Sampai" terlebih dahulu.');
    return;
  }
  closePrintModal();
  if (!currentProject) return;
  const proj = currentProject;

  // Loading
  const ld = document.createElement('div');
  ld.innerHTML = `<div style="position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;
    display:flex;align-items:center;justify-content:center">
    <div style="background:#fff;border-radius:20px;padding:32px 48px;text-align:center;
      box-shadow:0 24px 64px rgba(0,0,0,.25);max-width:320px">
      <div style="font-size:36px;margin-bottom:10px">📊</div>
      <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">Menyiapkan Laporan</div>
      <div style="font-size:12px;color:#64748b">Mengambil data terbaru dari database…</div>
    </div></div>`;
  document.body.appendChild(ld);

  let fresh;
  try { fresh = await _rptFetch(proj.name, dateRange); }
  catch(e) { document.body.removeChild(ld); alert('Gagal: '+e.message); return; }
  document.body.removeChild(ld);

  const { indicators, activities, budgetUpdates, outcomes } = fresh;
  const isID = lang !== 'en';
  const now  = new Date();
  const nowStr = now.toLocaleString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const dr = fresh.dateRange;
  const periodLabel = dr
    ? (isID
        ? `Periode: ${dr.fromStr} – ${dr.toStr}`
        : `Period: ${dr.fromStrEN} – ${dr.toStrEN}`)
    : (isID ? 'Semua Data' : 'All Data');

  // ── Kalkulasi progress ────────────────────────────────────
  let avgInd=null, avgAct=null;
  if(indicators.length){
    avgInd = Math.round(indicators.reduce((s,i)=>{
      const a=_rptActualAll(i),t=Number(i.target)||0;
      return s+(t>0?Math.min(Math.round(a/t*100),100):0);
    },0)/indicators.length);
  }
  if(activities.length){
    avgAct = Math.round(activities.reduce((s,a)=>s+(Number(a.progress)||0),0)/activities.length);
  }
  let overall=0;
  if(avgInd!==null&&avgAct!==null)overall=Math.round((avgInd+avgAct)/2);
  else if(avgInd!==null)overall=avgInd;
  else if(avgAct!==null)overall=avgAct;

  const doneInd = indicators.filter(i=>{const a=_rptActualAll(i),t=Number(i.target)||0;return t>0&&a>=t;}).length;
  const doneAct = activities.filter(a=>a.status==='Selesai').length;
  const budAppr = Number(proj.budget_approved)||0;
  const lastBudRow = budgetUpdates.length ? [...budgetUpdates].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] : null;
  const budActFinal = lastBudRow ? Number(lastBudRow.actual_value)||0 : Number(proj.budget_actual)||0;
  const budPct = budAppr>0?Math.min(Math.round(budActFinal/budAppr*100),999):0;

  // ── Impact grouping ───────────────────────────────────────
  const impG={};
  indicators.forEach(ind=>{
    const ru=(ind.unit||'').trim(); if(!ru)return;
    const k=ru.toLowerCase(); const av=_rptActual(ind);
    if(!impG[k])impG[k]={unit:ru,total:0};
    impG[k].total+=av;
  });
  const impEntries=Object.entries(impG).sort((a,b)=>b[1].total-a[1].total);

  // ── Labels ────────────────────────────────────────────────
  const L = isID ? {
    org:'DFW Indonesia — Program Monitoring & Evaluation',
    reportType:'LAPORAN KEMAJUAN PROYEK',
    printedOn:'Dicetak pada',
    sec_info:'INFORMASI PROYEK',
    sec_summary:'RINGKASAN KEMAJUAN',
    sec_goal:'GOAL & OUTCOMES PROGRAM',
    sec_ind:'CAPAIAN INDIKATOR KINERJA',
    sec_act:'AKTIVITAS PELAKSANAAN',
    sec_hambatan:'HAMBATAN & TANTANGAN PELAKSANAAN',
    sec_rtl:'RENCANA TINDAK LANJUT (RTL)',
    sec_budget:'REALISASI ANGGARAN',
    sec_impact:'DAMPAK PROGRAM',
    overallProg:'Progress Keseluruhan',
    avgInd:'Rata-rata Indikator',
    avgAct:'Rata-rata Aktivitas',
    budAbsorption:'Penyerapan Anggaran',
    indDone:'Indikator Tercapai',
    actDone:'Aktivitas Selesai',
    status:'Status', location:'Lokasi', owner:'Penanggung Jawab',
    donor:'Donor/Mitra', start:'Tanggal Mulai', deadline:'Deadline',
    desc:'Deskripsi', goal:'Goal', outcomes:'Outcomes',
    indName:'Nama Indikator', type:'Tipe', target:'Target',
    actual:'Realisasi', pct:'Capaian', lastNote:'Catatan Terakhir',
    actTitle:'Judul Aktivitas', pic:'PIC', startAct:'Mulai', dueAct:'Deadline',
    actStatus:'Status', actProg:'Progress', actNotes:'Hambatan/Tantangan',
    budAppr:'Anggaran Disetujui', budAct:'Realisasi', budLeft:'Sisa',
    date:'Tanggal', updBy:'Diperbarui Oleh', amount:'Jumlah', note:'Keterangan',
    noHambatan:'Tidak ada hambatan/tantangan yang dicatat untuk aktivitas ini.',
    noRTL:'Tidak ada catatan rencana tindak lanjut untuk indikator ini.',
    noActData:'Belum ada aktivitas.',
    noIndData:'Belum ada indikator.',
    footerNote:'Laporan ini digenerate otomatis oleh sistem PMIS',
    pageOf:'Halaman',
    hambatanDesc:'Dihimpun dari catatan tantangan & hambatan yang dicatat pada setiap aktivitas pelaksanaan.',
    rtlDesc:'Dihimpun dari catatan update indikator sebagai dasar penyusunan rencana tindak lanjut pencapaian target.',
    rtlIndProg:'Capaian saat ini',
  } : {
    org:'DFW Indonesia — Program Monitoring & Evaluation',
    reportType:'PROJECT PROGRESS REPORT',
    printedOn:'Printed on',
    sec_info:'PROJECT INFORMATION',
    sec_summary:'PROGRESS SUMMARY',
    sec_goal:'PROGRAM GOAL & OUTCOMES',
    sec_ind:'KEY PERFORMANCE INDICATORS',
    sec_act:'IMPLEMENTATION ACTIVITIES',
    sec_hambatan:'CHALLENGES & OBSTACLES',
    sec_rtl:'FOLLOW-UP ACTION PLAN',
    sec_budget:'BUDGET REALIZATION',
    sec_impact:'PROGRAM IMPACT',
    overallProg:'Overall Progress',
    avgInd:'Avg. Indicators',
    avgAct:'Avg. Activities',
    budAbsorption:'Budget Absorption',
    indDone:'Indicators Achieved',
    actDone:'Activities Completed',
    status:'Status', location:'Location', owner:'Person in Charge',
    donor:'Donor/Partner', start:'Start Date', deadline:'Deadline',
    desc:'Description', goal:'Goal', outcomes:'Outcomes',
    indName:'Indicator Name', type:'Type', target:'Target',
    actual:'Actual', pct:'Achievement', lastNote:'Last Note',
    actTitle:'Activity Title', pic:'PIC', startAct:'Start', dueAct:'Deadline',
    actStatus:'Status', actProg:'Progress', actNotes:'Challenges/Obstacles',
    budAppr:'Approved Budget', budAct:'Realization', budLeft:'Remaining',
    date:'Date', updBy:'Updated By', amount:'Amount', note:'Note',
    noHambatan:'No challenges or obstacles have been recorded for this activity.',
    noRTL:'No follow-up notes have been recorded for this indicator.',
    noActData:'No activities yet.',
    noIndData:'No indicators yet.',
    footerNote:'This report is auto-generated by the PMIS system',
    pageOf:'Page',
    hambatanDesc:'Compiled from challenges & obstacles notes recorded on each implementation activity.',
    rtlDesc:'Compiled from indicator update notes as the basis for follow-up action planning.',
    rtlIndProg:'Current achievement',
  };

  // ── Helper HTML ───────────────────────────────────────────
  const badge = (text, color) =>
    `<span class="badge" style="background:${color}18;color:${color};border:1.5px solid ${color}40">${text||'—'}</span>`;

  const pbar = (pct, color) => {
    const c=color||_pctColor(pct), w=Math.min(pct,100);
    return `<span class="pbar">
      <span class="pbar-track"><span class="pbar-fill" style="width:${w}%;background:${c}"></span></span>
      <span class="pbar-pct" style="color:${c}">${pct}%</span>
    </span>`;
  };

  const secHead = (icon, title, iconBg, count) =>
    `<div class="sec-head">
      <div class="sec-icon" style="background:${iconBg}20;color:${iconBg}">${icon}</div>
      <div class="sec-title-text">${title}</div>
      ${count!==undefined?`<div class="sec-badge">${count}</div>`:''}
    </div>`;

  // ═══════════════════════════════════════════════════════════
  // SECTION 1: Cover Header
  // ═══════════════════════════════════════════════════════════
  const overallC = _pctColor(overall);
  const s1 = `
  <div class="cover-header avoid-break">
    <div class="cover-org-badge">🏢 ${L.org}</div>
    <div class="cover-type">${L.reportType}</div>
    <div class="cover-period-badge">📅 ${periodLabel}</div>
    <div class="cover-title">${proj.name}</div>
    <div class="cover-meta-grid">
      ${proj.location  ?`<div class="cover-meta-item"><span class="cover-meta-label">${L.location}</span><span class="cover-meta-value">${proj.location}</span></div>`:''}
      ${proj.owner     ?`<div class="cover-meta-item"><span class="cover-meta-label">${L.owner}</span><span class="cover-meta-value">${proj.owner}</span></div>`:''}
      ${proj.donor     ?`<div class="cover-meta-item"><span class="cover-meta-label">${L.donor}</span><span class="cover-meta-value">${proj.donor}</span></div>`:''}
      ${proj.start_date?`<div class="cover-meta-item"><span class="cover-meta-label">${L.start}</span><span class="cover-meta-value">${_rptDate(proj.start_date)}</span></div>`:''}
      ${proj.deadline  ?`<div class="cover-meta-item"><span class="cover-meta-label">${L.deadline}</span><span class="cover-meta-value">${_rptDate(proj.deadline)}</span></div>`:''}
      <div class="cover-meta-item"><span class="cover-meta-label">${L.status}</span>
        <span class="cover-meta-value">${proj.status||'—'}</span></div>
    </div>
    <div class="cover-footer">
      <span>${L.printedOn}: ${nowStr}</span>
      <span class="cover-period-footer">📅 ${periodLabel}</span>
      <span style="font-size:18pt;font-weight:900;opacity:.95">${overall}% <span style="font-size:10pt;opacity:.8">${_pctLabel(overall)}</span></span>
    </div>
  </div>`;

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: Summary Stats
  // ═══════════════════════════════════════════════════════════
  const s2 = `
  <div class="stats-row avoid-break">
    <div class="stat-card">
      <div class="stat-val" style="color:${overallC}">${overall}%</div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min(overall,100)}%;background:${overallC}"></div></div>
      <div class="stat-label">${L.overallProg}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:${_pctColor(avgInd??0)}">${avgInd??'—'}${avgInd!==null?'%':''}</div>
      ${avgInd!==null?`<div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min(avgInd,100)}%;background:${_pctColor(avgInd)}"></div></div>`:'<div style="height:5px;margin:6px 6px 0"></div>'}
      <div class="stat-label">${L.avgInd}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:${_pctColor(avgAct??0)}">${avgAct??'—'}${avgAct!==null?'%':''}</div>
      ${avgAct!==null?`<div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min(avgAct,100)}%;background:${_pctColor(avgAct)}"></div></div>`:'<div style="height:5px;margin:6px 6px 0"></div>'}
      <div class="stat-label">${L.avgAct}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:#2563eb;font-size:16pt">${doneInd}/${indicators.length}</div>
      <div class="stat-label">${L.indDone}</div>
      <div style="margin-top:6px;border-top:1px solid #f1f5f9;padding-top:6px">
      <div class="stat-val" style="color:#16a34a;font-size:16pt">${doneAct}/${activities.length}</div>
      <div class="stat-label">${L.actDone}</div></div>
    </div>
  </div>`;

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: Goal & Outcomes
  // ═══════════════════════════════════════════════════════════
  const hasGoal=!!proj.goal, hasOut=outcomes.length>0, hasDesc=!!proj.description;
  const s3 = (hasGoal||hasOut||hasDesc) ? `
  <div class="section-card avoid-break">
    ${secHead('🎯',L.sec_goal,'#7c3aed')}
    ${hasDesc?`<p style="font-size:10pt;color:#475569;margin-bottom:12px;line-height:1.7">${proj.description}</p>`:''}
    ${hasGoal?`<div class="goal-box" style="background:#eff6ff;border-color:#2563eb">
      <div class="goal-label" style="color:#1d4ed8">${L.goal}</div>
      <p style="font-size:10.5pt;color:#1e3a5f;line-height:1.6">${proj.goal}</p>
    </div>`:''}
    ${hasOut?`<div class="goal-box" style="background:#f5f3ff;border-color:#7c3aed;margin-bottom:0">
      <div class="goal-label" style="color:#6d28d9">${L.outcomes}</div>
      <ol class="outcome-ol">${outcomes.map(o=>`<li>${o.outcome_text}</li>`).join('')}</ol>
    </div>`:''}
  </div>` : '';

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: Indikator
  // ═══════════════════════════════════════════════════════════
  const indRows = indicators.map((ind,i)=>{
    const a=_rptActualAll(ind), tg=Number(ind.target)||0, pct=_rptPct(a,tg), c=_pctColor(pct);
    const notes = (ind.indicator_updates||[]).filter(u=>u.note&&u.note.trim());
    const lastNote = notes.length ? [...notes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0].note : '—';
    return `<tr>
      <td class="ctr" style="font-weight:600;color:#64748b">${i+1}</td>
      <td><strong style="color:#0f172a">${ind.indicator_name}</strong></td>
      <td class="ctr"><span style="font-size:8pt;background:#e0e7ff;color:#3730a3;border-radius:20px;padding:2px 8px;font-weight:700">${ind.type||'Output'}</span></td>
      <td class="num">${tg.toLocaleString('id-ID')} <span style="color:#94a3b8;font-size:8.5pt">${ind.unit||''}</span></td>
      <td class="num"><strong style="color:${c}">${a.toLocaleString('id-ID')}</strong> <span style="color:#94a3b8;font-size:8.5pt">${ind.unit||''}</span></td>
      <td>${pbar(pct,c)}</td>
      <td style="font-size:8.5pt;color:#64748b;font-style:${lastNote==='—'?'italic':'normal'}">${lastNote}</td>
    </tr>`;
  }).join('');

  const s4 = indicators.length ? `
  <div class="section-card page-break">
    ${secHead('📊',L.sec_ind,'#2563eb',indicators.length+' indikator')}
    <table class="tbl">
      <thead><tr>
        <th class="ctr" style="width:28px">#</th>
        <th>${L.indName}</th>
        <th class="ctr" style="width:65px">${L.type}</th>
        <th class="num" style="width:100px">${L.target}</th>
        <th class="num" style="width:110px">${L.actual}</th>
        <th style="width:120px">${L.pct}</th>
        <th>${L.lastNote}</th>
      </tr></thead>
      <tbody>${indRows}</tbody>
      <tfoot><tr>
        <td colspan="5" style="text-align:right;color:#1e40af">${L.avgInd}:</td>
        <td colspan="2">${pbar(avgInd??0)}</td>
      </tr></tfoot>
    </table>
  </div>` : '';

  // ═══════════════════════════════════════════════════════════
  // SECTION 5: Aktivitas
  // ═══════════════════════════════════════════════════════════
  const rangedActivities = activities.filter(a => a._inRange !== false);
  const actRows = rangedActivities.map((act,i)=>{
    const c=_statusColor(act.status), prog=Number(act.progress)||0;
    const notes=(act.activity_notes||[]);
    const noteSummary = notes.length
      ? [...notes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
          .map(n=>`<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:4px"><span style="color:#f59e0b;flex-shrink:0">⚠️</span><span style="font-size:8.5pt;color:#92400e;line-height:1.5">${n.note}</span></div>`).join('')
      : `<span style="color:#94a3b8;font-size:8.5pt;font-style:italic">—</span>`;
    return `<tr>
      <td class="ctr" style="font-weight:600;color:#64748b">${i+1}</td>
      <td><strong style="color:#0f172a">${act.title}</strong>${act.description?`<div style="font-size:8.5pt;color:#64748b;margin-top:2px">${act.description}</div>`:''}</td>
      <td style="font-size:9pt;white-space:nowrap">${act.pic||'—'}</td>
      <td class="ctr">${badge(act.status,c)}</td>
      <td class="ctr"><strong style="font-size:11pt;color:${c}">${prog}%</strong></td>
      <td>${noteSummary}</td>
    </tr>`;
  }).join('');

  const s5 = activities.length ? `
  <div class="section-card page-break">
    ${secHead('📋',L.sec_act,'#0891b2',rangedActivities.length+' aktivitas')}
    <table class="tbl">
      <thead><tr>
        <th class="ctr" style="width:28px">#</th>
        <th>${L.actTitle}</th>
        <th style="width:80px">${L.pic}</th>
        <th class="ctr" style="width:72px">${L.actStatus}</th>
        <th class="ctr" style="width:60px">${L.actProg}</th>
        <th style="min-width:160px">${L.actNotes}</th>
      </tr></thead>
      <tbody>${actRows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:right;color:#1e40af">${L.avgAct}:</td>
        <td class="ctr"><strong style="font-size:11pt;color:${_pctColor(avgAct??0)}">${avgAct??0}%</strong></td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>` : '';

  // ═══════════════════════════════════════════════════════════
  // SECTION 6: Hambatan & Tantangan (dari activity_notes)
  // ═══════════════════════════════════════════════════════════
  const actsWithNotes = rangedActivities.filter(a=>(a.activity_notes||[]).length>0);
  const hambatanCards = actsWithNotes.length
    ? actsWithNotes.map(act=>{
        const notes=[...act.activity_notes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
        const noteItems = notes.map(n=>`
          <div class="hambatan-note-item">
            <div class="hambatan-note-dot"></div>
            <div>
              <div class="hambatan-note-text">${n.note}</div>
              <div class="hambatan-note-meta">${_rptDateTime(n.created_at)}${n.noted_by&&n.noted_by!=='Tim'?' · '+n.noted_by:''}</div>
            </div>
          </div>`).join('');
        return `<div class="hambatan-card">
          <div class="hambatan-act-title">
            <span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 8px;font-size:8.5pt">Aktivitas</span>
            ${act.title}
          </div>
          <div class="hambatan-notes">${noteItems}</div>
        </div>`;
      }).join('')
    : `<div class="hambatan-empty">${L.noHambatan}</div>`;

  const s6 = `
  <div class="section-card page-break avoid-break">
    ${secHead('⚠️',L.sec_hambatan,'#f59e0b', actsWithNotes.length+' aktivitas')}
    <p style="font-size:9pt;color:#64748b;margin-bottom:14px;font-style:italic">${L.hambatanDesc}</p>
    <div class="hambatan-list">${hambatanCards}</div>
  </div>`;

  // ═══════════════════════════════════════════════════════════
  // SECTION 7: Rencana Tindak Lanjut (dari indicator_updates.note)
  // ═══════════════════════════════════════════════════════════
  const indsWithNotes = indicators.filter(i=>(i.indicator_updates||[]).some(u=>u.note&&u.note.trim()));
  const rtlCards = indsWithNotes.length
    ? indsWithNotes.map(ind=>{
        const pct=_rptPct(_rptActual(ind),Number(ind.target)||0);
        const c=_pctColor(pct);
        const notes=[...(ind.indicator_updates||[])].filter(u=>u.note&&u.note.trim())
          .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
        const noteItems = notes.map(n=>`
          <div class="rtl-note-item">
            <div class="rtl-note-dot"></div>
            <div>
              <div class="rtl-note-text">${n.note}</div>
              <div class="rtl-note-meta">${_rptDateTime(n.created_at)} · ${isID?'Capaian':'Value'}: <strong>${Number(n.actual_value).toLocaleString('id-ID')} ${ind.unit||''}</strong>${n.updated_by&&n.updated_by!=='Tim'?' · '+n.updated_by:''}</div>
            </div>
          </div>`).join('');
        return `<div class="rtl-card">
          <div class="rtl-ind-title">
            <span class="rtl-type-badge">${ind.type||'Output'}</span>
            ${ind.indicator_name}
          </div>
          <div class="rtl-notes">${noteItems}</div>
          <div class="rtl-progress">
            <span class="rtl-progress-label">${L.rtlIndProg}:</span>
            ${pbar(pct,c)}
            <span style="font-size:8.5pt;color:#64748b">Target: ${Number(ind.target||0).toLocaleString('id-ID')} ${ind.unit||''}</span>
          </div>
        </div>`;
      }).join('')
    : `<div class="hambatan-empty">${L.noRTL}</div>`;

  const s7 = `
  <div class="section-card avoid-break">
    ${secHead('🗂️',L.sec_rtl,'#2563eb', indsWithNotes.length+' indikator')}
    <p style="font-size:9pt;color:#64748b;margin-bottom:14px;font-style:italic">${L.rtlDesc}</p>
    <div class="rtl-list">${rtlCards}</div>
  </div>`;

  // ═══════════════════════════════════════════════════════════
  // SECTION 8: Anggaran
  // ═══════════════════════════════════════════════════════════
  const budLeft = budAppr - budActFinal;
  const budHistRows = [...budgetUpdates].reverse().map((b,i)=>`<tr>
    <td class="ctr" style="color:#64748b;font-weight:600">${i+1}</td>
    <td class="ctr" style="font-size:9pt">${_rptDate(b.created_at)}</td>
    <td style="font-size:9pt">${b.updated_by||'—'}</td>
    <td class="num" style="font-weight:700">${_rptRupiah(b.actual_value)}</td>
    <td style="font-size:8.5pt;color:#64748b;font-style:italic">${b.note||'—'}</td>
  </tr>`).join('');

  const s8 = budAppr > 0 ? `
  <div class="section-card page-break avoid-break">
    ${secHead('💰',L.sec_budget,'#f59e0b')}
    <div class="budget-cards">
      <div class="bud-card">
        <div class="bud-card-label">${L.budAppr}</div>
        <div class="bud-card-val">${_rptRupiah(budAppr)}</div>
      </div>
      <div class="bud-card" style="background:#fffbeb;border-color:#fde68a">
        <div class="bud-card-label">${L.budAct}</div>
        <div class="bud-card-val" style="color:#d97706">${_rptRupiah(budActFinal)}</div>
        <div class="bud-card-sub">${pbar(budPct,'#f59e0b')}</div>
      </div>
      <div class="bud-card" style="background:${budLeft>=0?'#f0fdf4':'#fef2f2'};border-color:${budLeft>=0?'#86efac':'#fca5a5'}">
        <div class="bud-card-label">${L.budLeft}</div>
        <div class="bud-card-val" style="color:${budLeft>=0?'#16a34a':'#dc2626'}">${_rptRupiah(budLeft)}</div>
      </div>
    </div>
    ${budHistRows?`<table class="tbl" style="margin-top:4px">
      <thead><tr>
        <th class="ctr" style="width:28px">#</th>
        <th class="ctr" style="width:88px">${L.date}</th>
        <th style="width:110px">${L.updBy}</th>
        <th class="num" style="width:130px">${L.amount}</th>
        <th>${L.note}</th>
      </tr></thead>
      <tbody>${budHistRows}</tbody>
    </table>`:''}
  </div>` : '';

  // ═══════════════════════════════════════════════════════════
  // SECTION 9: Impact
  // ═══════════════════════════════════════════════════════════
  const impChips = impEntries.map(([k,d])=>`
    <div class="imp-chip">
      <div class="imp-icon">${_impactIcon(k)}</div>
      <div class="imp-val">${Number(d.total).toLocaleString('id-ID')}</div>
      <div class="imp-unit">${d.unit}</div>
    </div>`).join('');

  const s9 = impEntries.length ? `
  <div class="section-card avoid-break">
    ${secHead('🌟',L.sec_impact,'#16a34a')}
    <div class="impact-chips">${impChips}</div>
  </div>` : '';

  // ── Footer ────────────────────────────────────────────────
  const footer = `
  <div class="rpt-footer">
    <span class="rpt-footer-brand">PMIS DFW Indonesia</span>
    <span>${L.footerNote} · ${nowStr}</span>
  </div>`;

  // ── Assemble ──────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="${isID?'id':'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isID?'Laporan':'Report'}: ${proj.name}</title>
<style>${_css()}</style>
</head>
<body>
<div class="no-print print-bar">
  <button class="btn-print" onclick="window.print()">🖨️ ${isID?'Cetak / Simpan PDF':'Print / Save PDF'}</button>
  <button class="btn-close" onclick="window.close()">✕</button>
</div>
<div class="page">
  ${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${footer}
</div>
</body></html>`;

  const win = window.open('','_blank','width=1060,height=860,scrollbars=yes,resizable=yes');
  if (!win) { alert('Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

window.openPrintModal   = openPrintModal;
window.closePrintModal  = closePrintModal;
window.generateAndPrint = generateAndPrint;
