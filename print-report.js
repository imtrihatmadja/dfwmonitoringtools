// ===================== MOBILE SIDEBAR =====================
function toggleSidebar() {
  const sidebar = document.getElementById('mainSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('mainSidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ===================== PRINT MODAL =====================
function openPrintModal() {
  if (!currentProject) {
    alert('Buka halaman detail proyek terlebih dahulu sebelum mencetak laporan.');
    return;
  }
  document.getElementById('printLangModal').classList.remove('hidden');
}
function closePrintModal() {
  document.getElementById('printLangModal').classList.add('hidden');
}

// ===================== FETCH FRESH DATA DARI SUPABASE =====================
async function _rptFetchFreshData(projectName) {
  // Query 1: indikator + semua history update (untuk nilai aktual terbaru)
  const { data: indData, error: indErr } = await client
    .from('project_indicators')
    .select(`
      id,
      indicator_name,
      type,
      target,
      unit,
      actual,
      indicator_updates (
        id,
        actual_value,
        note,
        updated_by,
        created_at
      )
    `)
    .eq('project_name', projectName)
    .order('created_at', { ascending: true });

  if (indErr) console.error('[PMIS Print] Error fetch indicators:', indErr);

  // Query 2: aktivitas + catatan per aktivitas
  const { data: actData, error: actErr } = await client
    .from('project_activities')
    .select(`
      id,
      title,
      description,
      pic,
      status,
      start_date,
      due_date,
      progress,
      sort_order,
      activity_notes (
        id,
        note,
        noted_by,
        created_at
      )
    `)
    .eq('project_name', projectName)
    .order('sort_order', { ascending: true });

  if (actErr) console.error('[PMIS Print] Error fetch activities:', actErr);

  // Query 3: budget updates history
  const { data: budgetData, error: budgetErr } = await client
    .from('budget_updates')
    .select('id, actual_value, note, updated_by, created_at')
    .eq('project_name', projectName)
    .order('created_at', { ascending: true });

  if (budgetErr) console.error('[PMIS Print] Error fetch budget:', budgetErr);

  return {
    indicators: indData || [],
    activities: actData || [],
    budgetUpdates: budgetData || [],
  };
}

// ===================== HELPER: NILAI AKTUAL TERBARU PER INDIKATOR =====================
function _rptGetActual(ind) {
  const upds = ind.indicator_updates || [];
  if (upds.length > 0) {
    const sorted = [...upds].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const val = Number(sorted[0].actual_value);
    if (!isNaN(val)) return val;
  }
  const base = Number(ind.actual);
  return isNaN(base) ? 0 : base;
}

// ===================== HELPER: HITUNG PROGRESS =====================
function _rptCalcProgress(inds, acts) {
  let avgInd = null, avgAct = null;

  if (inds.length > 0) {
    const total = inds.reduce((sum, ind) => {
      const act = _rptGetActual(ind);
      const tgt = Number(ind.target) || 0;
      const pct = tgt > 0 ? Math.min(Math.round(act / tgt * 100), 100) : 0;
      return sum + pct;
    }, 0);
    avgInd = Math.round(total / inds.length);
  }

  if (acts.length > 0) {
    const total = acts.reduce((sum, act) => sum + (Number(act.progress) || 0), 0);
    avgAct = Math.round(total / acts.length);
  }

  if (avgInd !== null && avgAct !== null) return Math.round((avgInd + avgAct) / 2);
  if (avgInd !== null) return avgInd;
  if (avgAct !== null) return avgAct;
  return 0;
}

function _rptAvgInd(inds) {
  if (!inds.length) return 0;
  const total = inds.reduce((sum, ind) => {
    const act = _rptGetActual(ind);
    const tgt = Number(ind.target) || 0;
    const pct = tgt > 0 ? Math.min(Math.round(act / tgt * 100), 100) : 0;
    return sum + pct;
  }, 0);
  return Math.round(total / inds.length);
}

function _rptCountDoneInd(inds) {
  return inds.filter(ind => {
    const act = _rptGetActual(ind);
    const tgt = Number(ind.target) || 0;
    return tgt > 0 && act >= tgt;
  }).length;
}

function _rptCountDoneAct(acts) {
  return acts.filter(a => a.status === 'Selesai').length;
}


// ============================================================
// IMPACT FETCH — per proyek (dari freshInds yang sudah diquery)
// ============================================================
function _rptCalcImpactFromInds(inds) {
  const grouped = {};
  (inds || []).forEach(ind => {
    const rawUnit = (ind.unit || '').trim();
    if (!rawUnit) return;
    const unitKey = rawUnit.toLowerCase();
    const upds    = ind.indicator_updates || [];
    const actVal  = upds.length
      ? Number([...upds].sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        )[0].actual_value) || 0
      : Number(ind.actual) || 0;

    if (!grouped[unitKey]) {
      grouped[unitKey] = {
        unitDisplay: rawUnit, total: 0, count: 0,
        indicators: []
      };
    }
    grouped[unitKey].total += actVal;
    grouped[unitKey].count += 1;
    grouped[unitKey].indicators.push({
      indicator_name: ind.indicator_name,
      actual: actVal,
      target: Number(ind.target) || 0,
      type:   ind.type || 'Output',
    });
  });
  return grouped;
}

// ===================== GENERATE & PRINT REPORT =====================
async function generateAndPrint(lang) {
  closePrintModal();
  if (!currentProject) return;

  // Tampilkan loading state
  const container = document.getElementById('print-report-container');
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:100vh;gap:16px;font-family:sans-serif">
      <div style="font-size:32px">⏳</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a">
        ${lang === 'id' ? 'Menyiapkan laporan...' : 'Preparing report...'}
      </div>
      <div style="font-size:12px;color:#64748b">
        ${lang === 'id' ? 'Mengambil data terbaru dari server' : 'Fetching latest data from server'}
      </div>
    </div>`;
  container.style.display = 'block';
  document.body.style.overflow = 'hidden';

  // ── FETCH FRESH DATA ──────────────────────────────────
  let freshInds = [], freshActs = [], freshBudgetUpdates = [];
  try {
    const result = await _rptFetchFreshData(currentProject.name);
    freshInds          = result.indicators;
    freshActs          = result.activities;
    freshBudgetUpdates = result.budgetUpdates;
  } catch (e) {
    console.error('[PMIS Print] Fetch error:', e);
    // fallback ke state yang ada
    freshInds = indicators || [];
    freshActs = allActivities || [];
  }

  // ── TERJEMAHAN ────────────────────────────────────────
  const T = lang === 'id' ? {
    org: 'DFW Indonesia',
    printDate: 'Tanggal Cetak',
    period: 'Periode Pelaksanaan',
    donor: 'Donor / Mitra',
    budget: 'Anggaran',
    budgetApproved: 'Disetujui',
    budgetActual: 'Realisasi',
    absorption: 'Serapan',
    overallProgress: 'Progres Keseluruhan',
    indicators: 'Capaian Indikator',
    indName: 'Indikator', target: 'Target', actual: 'Realisasi',
    pct: '% Capaian', statusCol: 'Status',
    activities: 'Daftar Aktivitas (Sedang Berjalan & Belum Mulai)',
    actTitle: 'Aktivitas', pic: 'PIC',
    startPlan: 'Rencana Mulai', duePlan: 'Deadline',
    actStatus: 'Status', actProgress: 'Progress', notes: 'Catatan',
    budgetSection: 'Realisasi Anggaran',
    narrative: 'Narasi & Pembelajaran',
    highlight: '✅ Capaian Utama',
    constraints: '⚠️ Kendala',
    nextPlan: '📌 Rencana Tindak Lanjut',
    lessons: '💡 Pembelajaran (Lessons Learned)',
    signature: 'Tanda Tangan',
    executor: 'Pelaksana', supervisor: 'Supervisor', manager: 'Manajer',
    page: 'Halaman',
    onTrack: 'On Track', delayed: 'Terlambat',
    excellent: 'Sangat Baik', good: 'Baik', fair: 'Sedang', needsAttn: 'Perlu Perhatian',
    notStarted: 'Belum Mulai', inProgress: 'Sedang Berjalan',
    done: 'Selesai', deferred: 'Tertunda',
    goal: 'Tujuan / Goal',
    noData: '—',
    component: 'Komponen', plan: 'Rencana',
    realization: 'Realisasi', remainingCol: 'Sisa', pctAbsorption: '% Serapan',
    closeBtn: 'Tutup', printBtn: 'Cetak / Simpan PDF',
    previewTitle: 'Preview Laporan',
    allDone: 'Semua aktivitas telah selesai',
    noNotes: 'Belum ada catatan tersedia.',
    totalBudget: 'Total Anggaran Proyek',
    remainingBudget: 'Sisa anggaran',
    absLabel: 'Serapan',
    indDone: 'Indikator Tercapai',
    actDone: 'Aktivitas Selesai',
    avgInd: 'Rata-rata Capaian',
    achieved: 'Tercapai',
    avgLabel: 'Rata-rata',
  } : {
    org: 'DFW Indonesia',
    printDate: 'Print Date',
    period: 'Implementation Period',
    donor: 'Donor / Partner',
    budget: 'Budget',
    budgetApproved: 'Approved',
    budgetActual: 'Actual',
    absorption: 'Absorption',
    overallProgress: 'Overall Progress',
    indicators: 'Indicator Achievement',
    indName: 'Indicator', target: 'Target', actual: 'Actual',
    pct: '% Achievement', statusCol: 'Status',
    activities: 'Activities (In Progress & Not Started)',
    actTitle: 'Activity', pic: 'PIC',
    startPlan: 'Planned Start', duePlan: 'Deadline',
    actStatus: 'Status', actProgress: 'Progress', notes: 'Notes',
    budgetSection: 'Budget Realization',
    narrative: 'Narrative & Lessons Learned',
    highlight: '✅ Key Achievements',
    constraints: '⚠️ Challenges',
    nextPlan: '📌 Next Steps',
    lessons: '💡 Lessons Learned',
    signature: 'Signatures',
    executor: 'Executor', supervisor: 'Supervisor', manager: 'Manager',
    page: 'Page',
    onTrack: 'On Track', delayed: 'Delayed',
    excellent: 'Excellent', good: 'Good', fair: 'Fair', needsAttn: 'Needs Attention',
    notStarted: 'Not Started', inProgress: 'In Progress',
    done: 'Completed', deferred: 'Deferred',
    goal: 'Project Goal',
    noData: '—',
    component: 'Component', plan: 'Planned',
    realization: 'Realization', remainingCol: 'Remaining', pctAbsorption: '% Absorption',
    closeBtn: 'Close', printBtn: 'Print / Save PDF',
    previewTitle: 'Report Preview',
    allDone: 'All activities are completed',
    noNotes: 'No notes available yet.',
    totalBudget: 'Total Project Budget',
    remainingBudget: 'Remaining budget',
    absLabel: 'Absorption',
    indDone: 'Indicators Achieved',
    actDone: 'Activities Done',
    avgInd: 'Avg. Achievement',
    achieved: 'Achieved',
    avgLabel: 'Average',
  };

  // ── KALKULASI ─────────────────────────────────────────
  const proj           = currentProject;
  const overallPct     = _rptCalcProgress(freshInds, freshActs);
  const avgIndPct      = _rptAvgInd(freshInds);
  const doneIndCount   = _rptCountDoneInd(freshInds);
  const doneActCount   = _rptCountDoneAct(freshActs);

  const budgetApproved  = Number(proj.budget_approved) || 0;
  // Ambil budget actual: prioritas dari budget_updates terbaru, fallback ke proj.budget_actual
  const latestBudgetUpd = freshBudgetUpdates.length
    ? freshBudgetUpdates[freshBudgetUpdates.length - 1].actual_value
    : null;
  const budgetActual    = latestBudgetUpd !== null
    ? Number(latestBudgetUpd)
    : Number(proj.budget_actual) || 0;
  const budgetPct       = pctBudget(budgetApproved, budgetActual);
  const budgetRemaining = budgetApproved - budgetActual;

  const now = new Date();
  const printDateStr = now.toLocaleDateString(
    lang === 'id' ? 'id-ID' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

  // ── HELPER FUNGSI ─────────────────────────────────────
  function fmtDate(d) {
    if (!d) return T.noData;
    return new Date(d).toLocaleDateString(
      lang === 'id' ? 'id-ID' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' }
    );
  }

  function statusBadge(s) {
    const map = {
      'Aktif':        ['active',      T.onTrack],
      'On Track':     ['on-track',    T.onTrack],
      'Terlambat':    ['delayed',     T.delayed],
      'Selesai':      ['done',        T.done],
      'Ditangguhkan': ['not-started', T.deferred],
    };
    const [cls, label] = map[s] || ['active', s];
    return `<span class="rpt-badge ${cls}">${label}</span>`;
  }

  function actStatusBadge(s) {
    const map = {
      'Belum Mulai':     ['not-started', T.notStarted],
      'Sedang Berjalan': ['active',      T.inProgress],
      'Selesai':         ['done',        T.done],
      'Tertunda':        ['pending',     T.deferred],
    };
    const [cls, label] = map[s] || ['not-started', s];
    return `<span class="rpt-badge ${cls}">${label}</span>`;
  }

  function indStatusBadge(pct) {
    if (pct >= 100) return `<span class="rpt-badge on-track">${T.achieved}</span>`;
    if (pct >= 85)  return `<span class="rpt-badge on-track">${T.excellent}</span>`;
    if (pct >= 60)  return `<span class="rpt-badge active">${T.good}</span>`;
    if (pct >= 35)  return `<span class="rpt-badge at-risk">${T.fair}</span>`;
    return `<span class="rpt-badge delayed">${T.needsAttn}</span>`;
  }

  function progressBar(pct, color) {
    const safePct = Math.min(Math.max(Number(pct) || 0, 0), 100);
    const c = color || (safePct >= 85 ? '#22c55e' : safePct >= 60 ? '#3b82f6' : safePct >= 35 ? '#f59e0b' : '#ef4444');
    return `<div style="display:flex;align-items:center;gap:6px">
      <div class="rpt-prog-bar-wrap" style="flex:1">
        <div class="rpt-prog-bar-fill" style="width:${safePct}%;background:${c}"></div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${c};min-width:32px;text-align:right">${safePct}%</span>
    </div>`;
  }

  // Aktivitas yang masih aktif (belum mulai & sedang berjalan)
  const activeActs = freshActs.filter(a =>
    a.status === 'Sedang Berjalan' || a.status === 'Belum Mulai'
  );

  // ── Kumpulkan catatan aktivitas per aktivitas (untuk Kendala & Lessons)
  // Struktur: [{ actTitle, notes: [{note, created_at, noted_by}] }]
  const actNotesGrouped = freshActs
    .filter(a => (a.activity_notes || []).length > 0)
    .map(a => ({
      actTitle: a.title,
      actStatus: a.status,
      notes: [...(a.activity_notes || [])]
        .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
    }));

  // Semua catatan aktivitas (flat, terbaru dulu)
  const allActNoteFlat = freshActs
    .flatMap(a => (a.activity_notes || []).map(n => ({
      ...n,
      actTitle: a.title,
      actStatus: a.status,
    })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter(n => n.note);

  // Catatan update indikator (flat)
  const allIndNoteFlat = freshInds
    .flatMap(ind => (ind.indicator_updates || []).map(u => ({
      ...u,
      indName: ind.indicator_name,
    })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter(u => u.note);

  // Kendala: semua catatan pelaksanaan aktivitas (ditampilkan per aktivitas)
  function buildKendalaHTML() {
    if (actNotesGrouped.length === 0) {
      return lang === 'id'
        ? 'Tidak ada catatan pelaksanaan yang dicatat.'
        : 'No activity notes recorded.';
    }
    return actNotesGrouped.map(g => {
      const noteLines = g.notes.slice(0, 3)
        .map(n => {
          const tgl = n.created_at
            ? new Date(n.created_at).toLocaleDateString(
                lang === 'id' ? 'id-ID' : 'en-GB',
                { day: 'numeric', month: 'short', year: 'numeric' }
              )
            : '';
          const by  = n.noted_by ? ` (${n.noted_by})` : '';
          return `  ${tgl}${by}: ${n.note}`;
        }).join('\n');
      return `▸ ${g.actTitle}\n${noteLines}`;
    }).join('\n\n');
  }

  // Lessons learned: dari catatan update indikator (+ catatan aktivitas jika ada)
  const lessonsSrc = allIndNoteFlat.length > 0 ? allIndNoteFlat : allActNoteFlat;
  const lessonsList = lessonsSrc.length
    ? lessonsSrc.slice(0, 6).map(n => {
        const src = n.indName
          ? `[${n.indName}]`
          : n.actTitle ? `[${n.actTitle}]` : '';
        return `• ${src} ${n.note}`;
      }).join('\n')
    : `• ${T.noNotes}`;

  // ─────────────────────────────────────────────────────
  // PAGE 1: Cover + Ringkasan Eksekutif
  // ─────────────────────────────────────────────────────
  const page1 = `
<div class="rpt-page">
  <div class="rpt-cover-header">
    <div class="rpt-org-name">${T.org}</div>
    <div class="rpt-proj-name">${proj.name}</div>
    <div class="rpt-proj-code">📍 ${proj.location || T.noData}</div>
    <div style="margin-top:12px">${statusBadge(proj.status)}</div>
  </div>

  <div class="rpt-meta-grid">
    <div class="rpt-meta-item">
      <div class="rpt-meta-label">${T.period}</div>
      <div class="rpt-meta-value">${fmtDate(proj.start_date)}</div>
      <div class="rpt-meta-sub">s/d ${fmtDate(proj.deadline)}</div>
    </div>
    <div class="rpt-meta-item">
      <div class="rpt-meta-label">${T.donor}</div>
      <div class="rpt-meta-value">${proj.donor || T.noData}</div>
    </div>
    <div class="rpt-meta-item">
      <div class="rpt-meta-label">PIC</div>
      <div class="rpt-meta-value">${proj.owner || T.noData}</div>
    </div>
    <div class="rpt-meta-item">
      <div class="rpt-meta-label">${T.budget} (${T.budgetApproved})</div>
      <div class="rpt-meta-value">${formatRupiah(budgetApproved)}</div>
    </div>
    <div class="rpt-meta-item">
      <div class="rpt-meta-label">${T.budget} (${T.budgetActual})</div>
      <div class="rpt-meta-value">${formatRupiah(budgetActual)}</div>
      <div class="rpt-meta-sub">${budgetPct}% ${T.absorption}</div>
    </div>
    <div class="rpt-meta-item">
      <div class="rpt-meta-label">${T.printDate}</div>
      <div class="rpt-meta-value">${printDateStr}</div>
    </div>
  </div>

  ${proj.goal ? `
  <div class="rpt-section">
    <div class="rpt-section-title">${T.goal}</div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-text">${proj.goal}</div>
    </div>
    ${(proj.project_outcomes && proj.project_outcomes.length) ? `
    <ul style="font-size:10px;color:#1e293b;padding-left:16px;line-height:1.8;margin-top:6px">
      ${proj.project_outcomes.map(o => `<li>${o.outcome_text}</li>`).join('')}
    </ul>` : ''}
  </div>` : ''}

  <div class="rpt-section">
    <div class="rpt-section-title">📊 ${T.overallProgress}</div>
    <div class="rpt-progress-wrap">
      <div style="flex-shrink:0;text-align:center;min-width:90px;padding-right:16px;border-right:2px solid #e2e8f0">
        <div class="rpt-circle-pct">${overallPct}%</div>
        <div class="rpt-circle-label">${progressLabel(overallPct)}</div>
      </div>
      <div style="flex:1;padding-left:16px">
        <div style="margin-bottom:12px">${progressBar(overallPct)}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <div style="font-size:9px;color:#64748b;text-align:center;background:#f1f5f9;border-radius:8px;padding:8px 4px">
            <div style="font-size:16px;font-weight:800;color:#2563eb;line-height:1.2">${avgIndPct}%</div>
            <div style="margin-top:3px">${T.avgInd}</div>
          </div>
          <div style="font-size:9px;color:#64748b;text-align:center;background:#f0fdf4;border-radius:8px;padding:8px 4px">
            <div style="font-size:16px;font-weight:800;color:#16a34a;line-height:1.2">${doneIndCount}<span style="font-size:10px;color:#64748b">/${freshInds.length}</span></div>
            <div style="margin-top:3px">${T.indDone}</div>
          </div>
          <div style="font-size:9px;color:#64748b;text-align:center;background:#f0fdf4;border-radius:8px;padding:8px 4px">
            <div style="font-size:16px;font-weight:800;color:#16a34a;line-height:1.2">${doneActCount}<span style="font-size:10px;color:#64748b">/${freshActs.length}</span></div>
            <div style="margin-top:3px">${T.actDone}</div>
          </div>
          <div style="font-size:9px;color:#64748b;text-align:center;background:#eff6ff;border-radius:8px;padding:8px 4px">
            <div style="font-size:16px;font-weight:800;color:#2563eb;line-height:1.2">${budgetPct}%</div>
            <div style="margin-top:3px">${lang==='id'?'Serapan Anggaran':'Budget Used'}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="rpt-page-footer">
    <span>${T.org} — ${proj.name}</span>
    <span>${T.page} 1 | ${printDateStr}</span>
  </div>
</div>`;

  // ─────────────────────────────────────────────────────
  // PAGE 2: Tabel Indikator + Tabel Aktivitas
  // ─────────────────────────────────────────────────────
  const indRows = freshInds.map((ind, i) => {
    const actVal = _rptGetActual(ind);
    const tgtVal = Number(ind.target) || 0;
    const pct    = tgtVal > 0 ? Math.min(Math.round(actVal / tgtVal * 100), 100) : 0;

    // Ambil catatan update indikator terbaru
    const lastIndNote = (ind.indicator_updates || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    return `<tr>
      <td style="text-align:center;color:#94a3b8;font-size:10px">${i + 1}</td>
      <td>
        <strong style="font-size:10px">${ind.indicator_name}</strong><br>
        <span style="color:#94a3b8;font-size:9px">${ind.type || 'Output'}</span>
      </td>
      <td style="text-align:center;font-weight:600">${Number(tgtVal).toLocaleString('id-ID')} ${ind.unit || ''}</td>
      <td style="text-align:center;font-weight:800;color:#0f172a">${Number(actVal).toLocaleString('id-ID')} ${ind.unit || ''}</td>
      <td style="min-width:100px">${progressBar(pct)}</td>
      <td>${indStatusBadge(pct)}</td>
    </tr>`;
  }).join('');

  const actRows = activeActs.map((act, i) => {
    const actNotes = (act.activity_notes || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const lastNote = actNotes.length ? actNotes[0].note : T.noData;
    const prog = Number(act.progress) || 0;
    return `<tr>
      <td style="text-align:center;color:#94a3b8;font-size:10px">${i + 1}</td>
      <td>
        <strong style="font-size:10px">${act.title}</strong>
        ${act.description ? `<br><span style="color:#64748b;font-size:9px">${act.description}</span>` : ''}
      </td>
      <td style="font-size:10px">${act.pic || T.noData}</td>
      <td style="font-size:10px">${fmtDate(act.start_date)}</td>
      <td style="font-size:10px">${fmtDate(act.due_date)}</td>
      <td>${actStatusBadge(act.status)}</td>
      <td style="min-width:80px">${progressBar(prog)}</td>
      <td style="max-width:110px;font-size:9px;color:#475569;line-height:1.4">${lastNote}</td>
    </tr>`;
  }).join('');

  const page2 = `
<div class="rpt-page">
  <div class="rpt-section">
    <div class="rpt-section-title">🎯 ${T.indicators}</div>
    ${freshInds.length === 0
      ? `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:11px;background:#f8fafc;border-radius:8px">${T.noData}</div>`
      : `<table class="rpt-table">
          <thead><tr>
            <th style="width:24px">#</th>
            <th>${T.indName}</th>
            <th style="text-align:center;width:80px">${T.target}</th>
            <th style="text-align:center;width:80px">${T.actual}</th>
            <th style="width:130px">${T.pct}</th>
            <th style="width:80px">${T.statusCol}</th>
          </tr></thead>
          <tbody>${indRows}</tbody>
          <tfoot>
            <tr style="background:#f1f5f9;border-top:2px solid #e2e8f0">
              <td colspan="4" style="text-align:right;font-weight:700;font-size:10px;color:#0f172a;padding:8px 9px">
                ${T.avgLabel}:
              </td>
              <td style="padding:8px 9px">${progressBar(avgIndPct)}</td>
              <td style="padding:8px 9px">${indStatusBadge(avgIndPct)}</td>
            </tr>
          </tfoot>
        </table>`
    }
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">📅 ${T.activities}</div>
    ${activeActs.length === 0
      ? `<div style="text-align:center;padding:20px;color:#64748b;font-size:11px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
          ✅ ${T.allDone}
        </div>`
      : `<table class="rpt-table">
          <thead><tr>
            <th style="width:24px">#</th>
            <th>${T.actTitle}</th>
            <th style="width:80px">${T.pic}</th>
            <th style="width:68px">${T.startPlan}</th>
            <th style="width:68px">${T.duePlan}</th>
            <th style="width:85px">${T.actStatus}</th>
            <th style="width:90px">${T.actProgress}</th>
            <th>${T.notes}</th>
          </tr></thead>
          <tbody>${actRows}</tbody>
        </table>`
    }
  </div>

  <div class="rpt-page-footer">
    <span>${T.org} — ${proj.name}</span>
    <span>${T.page} 2 | ${printDateStr}</span>
  </div>
</div>`;

  // ─────────────────────────────────────────────────────
  // PAGE 3: Anggaran + Narasi + Tanda Tangan
  // ─────────────────────────────────────────────────────

  // Budget history rows (dari budget_updates jika ada)
  const budgetHistRows = freshBudgetUpdates.length > 0
    ? freshBudgetUpdates.map((b, i) => `
        <tr>
          <td style="text-align:center;color:#94a3b8">${i + 1}</td>
          <td style="font-size:10px">${fmtDate(b.created_at)}</td>
          <td style="font-size:10px">${b.updated_by || T.noData}</td>
          <td style="text-align:right;font-weight:600;color:#2563eb">${formatRupiah(b.actual_value)}</td>
          <td style="font-size:9px;color:#475569">${b.note || T.noData}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">${T.noData}</td></tr>`;

  const page3 = `
<div class="rpt-page">
  <div class="rpt-section">
    <div class="rpt-section-title">💰 ${T.budgetSection}</div>
    <table class="rpt-table" style="margin-bottom:10px">
      <thead><tr>
        <th>${T.component}</th>
        <th style="text-align:right">${T.plan}</th>
        <th style="text-align:right">${T.realization}</th>
        <th style="text-align:right">${T.remainingCol}</th>
        <th style="min-width:110px">${T.pctAbsorption}</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><strong>${T.totalBudget}</strong></td>
          <td style="text-align:right;font-weight:600">${formatRupiah(budgetApproved)}</td>
          <td style="text-align:right;font-weight:700;color:#2563eb">${formatRupiah(budgetActual)}</td>
          <td style="text-align:right;font-weight:700;color:${budgetRemaining >= 0 ? '#15803d' : '#b91c1c'}">${formatRupiah(budgetRemaining)}</td>
          <td>${progressBar(budgetPct, budgetPct >= 80 ? '#22c55e' : '#3b82f6')}</td>
        </tr>
      </tbody>
    </table>
    ${freshBudgetUpdates.length > 0 ? `
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">
      ${lang==='id'?'Riwayat Update Anggaran':'Budget Update History'}
    </div>
    <table class="rpt-table">
      <thead><tr>
        <th style="width:24px">#</th>
        <th style="width:80px">${lang==='id'?'Tanggal':'Date'}</th>
        <th>${lang==='id'?'Diperbarui Oleh':'Updated By'}</th>
        <th style="text-align:right">${T.realization}</th>
        <th>${lang==='id'?'Keterangan':'Note'}</th>
      </tr></thead>
      <tbody>${budgetHistRows}</tbody>
    </table>` : ''}
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">📝 ${T.narrative}</div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.highlight}</div>
      <div class="rpt-narrative-text">${proj.description || (lang==='id'?'Belum ada deskripsi proyek.':'No project description.')}</div>
    </div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.constraints}</div>
      <div class="rpt-narrative-text" style="white-space:pre-line">${buildKendalaHTML()}</div>
      ${proj.note ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:9px;color:#64748b">
        <strong>${lang==='id'?'Catatan Proyek:':'Project Note:'}</strong> ${proj.note}
      </div>` : ''}
    </div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.nextPlan}</div>
      <div class="rpt-narrative-text">${
        activeActs.length > 0
          ? activeActs.slice(0, 4).map(a =>
              `• ${a.title}${a.pic ? ' — ' + T.pic + ': ' + a.pic : ''}${a.due_date ? ' (' + fmtDate(a.due_date) + ')' : ''}`
            ).join('\n')
          : T.noData
      }</div>
    </div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.lessons}</div>
      <div class="rpt-narrative-text">${lessonsList}</div>
    </div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">📎 ${T.signature}</div>
    <div class="rpt-signature-grid">
      <div class="rpt-signature-box">
        <div class="rpt-signature-title">${T.executor}</div>
        <div class="rpt-signature-line">(___________________)</div>
      </div>
      <div class="rpt-signature-box">
        <div class="rpt-signature-title">${T.supervisor}</div>
        <div class="rpt-signature-line">(___________________)</div>
      </div>
      <div class="rpt-signature-box">
        <div class="rpt-signature-title">${T.manager}</div>
        <div class="rpt-signature-line">(___________________)</div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:9px;color:#94a3b8;text-align:center">
      ${printDateStr} &nbsp;—&nbsp; ${T.org}
    </div>
  </div>

  <div class="rpt-page-footer">
    <span>${T.org} — ${proj.name}</span>
    <span>${T.page} 3 | ${printDateStr}</span>
  </div>
</div>`;


  // ─────────────────────────────────────────────────────
  // PAGE 4: Ringkasan Dampak Proyek Ini
  // ─────────────────────────────────────────────────────
  function _rptPrintImpactIcon(unit) {
    const u = (unit || '').toLowerCase();
    if (['orang','jiwa','nelayan','peserta','benefisiari','perempuan',
         'laki-laki','anak','pekerja','buruh','anggota','komunitas',
         'keluarga','rumah tangga'].some(k => u.includes(k))) return '👥';
    if (['dokumen','laporan','modul','publikasi','buku','panduan',
         'kebijakan','regulasi'].some(k => u.includes(k))) return '📄';
    if (['kapal','perahu','alat','unit'].some(k => u.includes(k))) return '🚢';
    if (['hektar','ha','km','wilayah','lokasi','desa','kawasan'].some(k => u.includes(k))) return '🗺️';
    if (['kegiatan','event','pelatihan','workshop','pertemuan'].some(k => u.includes(k))) return '📅';
    if (['kg','ton','gram','kwintal'].some(k => u.includes(k))) return '⚖️';
    if (['mou','perjanjian','kontrak','kesepakatan'].some(k => u.includes(k))) return '🤝';
    return '🎯';
  }

  const impactGrouped = _rptCalcImpactFromInds(freshInds);
  const impactEntries = Object.entries(impactGrouped)
    .sort((a, b) => b[1].total - a[1].total);

  // Grid kartu summary (max 4 per baris)
  function buildImpactGrid() {
    const cells = impactEntries.map(([unitKey, d]) => {
      const icon  = _rptPrintImpactIcon(unitKey);
      const total = Number(d.total).toLocaleString('id-ID');
      return `<div style="
        background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px;
        padding:14px 10px; text-align:center;">
        <div style="font-size:24px;margin-bottom:6px">${icon}</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.1">${total}</div>
        <div style="font-size:11px;font-weight:700;color:#2563eb;
          text-transform:capitalize;margin-top:4px">${d.unitDisplay}</div>
        <div style="font-size:9px;color:#94a3b8;margin-top:2px">
          ${d.count} ${lang==='id'?'indikator':'indicator(s)'}
        </div>
      </div>`;
    });
    // grid 4 kolom otomatis
    return `<div style="display:grid;
      grid-template-columns:repeat(${Math.min(impactEntries.length,4)},1fr);
      gap:10px;margin-bottom:20px">${cells.join('')}</div>`;
  }

  // Tabel rincian per satuan
  function buildImpactDetailTables() {
    return impactEntries.map(([unitKey, d]) => {
      const icon    = _rptPrintImpactIcon(unitKey);
      const indRows = d.indicators
        .sort((a, b) => b.actual - a.actual)
        .map((ind, i) => {
          const pct = ind.target > 0
            ? Math.min(Math.round(ind.actual / ind.target * 100), 100) : 0;
          const barC = pct >= 85 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 35 ? '#f59e0b' : '#ef4444';
          return `<tr>
            <td style="text-align:center;color:#94a3b8;font-size:9px">${i+1}</td>
            <td style="font-size:9px;color:#64748b">${ind.type}</td>
            <td style="font-size:10px;font-weight:600">${ind.indicator_name}</td>
            <td style="text-align:right;font-weight:700;color:#0f172a">
              ${Number(ind.actual).toLocaleString('id-ID')} ${d.unitDisplay}
            </td>
            <td style="text-align:right;color:#64748b;font-size:10px">
              ${ind.target > 0 ? Number(ind.target).toLocaleString('id-ID') : '—'}
            </td>
            <td style="min-width:80px">
              <div style="display:flex;align-items:center;gap:4px">
                <div style="flex:1;background:#e2e8f0;border-radius:3px;
                  height:6px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:${barC};
                    border-radius:3px"></div>
                </div>
                <span style="font-size:9px;font-weight:700;color:${barC};
                  min-width:26px">${pct}%</span>
              </div>
            </td>
          </tr>`;
        }).join('');

      return `<div style="margin-bottom:16px;page-break-inside:avoid">
        <div style="font-size:10px;font-weight:800;color:#0f172a;
          border-left:4px solid #2563eb;padding-left:8px;
          margin-bottom:7px;display:flex;align-items:center;gap:6px">
          <span>${icon}</span>
          <span style="text-transform:uppercase">${d.unitDisplay}</span>
          <span style="font-weight:400;color:#64748b;font-size:9px;margin-left:4px">
            — Total:
            <strong style="color:#2563eb">
              ${Number(d.total).toLocaleString('id-ID')} ${d.unitDisplay}
            </strong>
            &nbsp;(${d.count} ${lang==='id'?'indikator':'indicators'})
          </span>
        </div>
        <table class="rpt-table">
          <thead><tr>
            <th style="width:24px">#</th>
            <th style="width:60px">${lang==='id'?'Tipe':'Type'}</th>
            <th>${lang==='id'?'Indikator':'Indicator'}</th>
            <th style="text-align:right;width:90px">${lang==='id'?'Realisasi':'Actual'}</th>
            <th style="text-align:right;width:70px">${lang==='id'?'Target':'Target'}</th>
            <th style="width:90px">% ${lang==='id'?'Capaian':'Achievement'}</th>
          </tr></thead>
          <tbody>${indRows}</tbody>
          <tfoot>
            <tr style="background:#eff6ff;border-top:2px solid #bfdbfe">
              <td colspan="3" style="text-align:right;font-weight:800;
                font-size:10px;padding:7px 9px;color:#0f172a">TOTAL</td>
              <td style="text-align:right;font-weight:800;font-size:13px;
                color:#2563eb;padding:7px 9px">
                ${Number(d.total).toLocaleString('id-ID')} ${d.unitDisplay}
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
    }).join('');
  }

  const page4 = impactEntries.length === 0 ? '' : `
<div class="rpt-page">
  <div class="rpt-cover-header" style="padding:22px 24px 18px">
    <div class="rpt-org-name">${T.org}</div>
    <div class="rpt-proj-name" style="font-size:17px">
      🌍 ${lang==='id'?'Ringkasan Dampak Proyek':'Project Impact Summary'}
    </div>
    <div class="rpt-proj-code">${proj.name}</div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">
      📊 ${lang==='id'?'Total Dampak per Satuan':'Total Impact by Unit'}
    </div>
    ${buildImpactGrid()}
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">
      📋 ${lang==='id'?'Rincian per Indikator':'Detail per Indicator'}
    </div>
    ${buildImpactDetailTables()}
  </div>

  <div class="rpt-page-footer">
    <span>${T.org} — ${proj.name}</span>
    <span>${T.page} 4 | ${printDateStr}</span>
  </div>
</div>`;

  // ── RENDER ────────────────────────────────────────────
  const fullHTML = `
<div class="rpt-preview-toolbar">
  <span class="rpt-toolbar-title">🖨️ ${T.previewTitle} — ${proj.name}</span>
  <div class="rpt-preview-actions">
    <button class="btn-close-preview" onclick="closePrintPreview()">✕ ${T.closeBtn}</button>
    <button class="btn-do-print" onclick="window.print()">🖨️ ${T.printBtn}</button>
  </div>
</div>
<div class="rpt-preview-content">
  ${page1}
  ${page2}
  ${page3}
  ${page4}
</div>`;

  container.innerHTML = fullHTML;
}

function closePrintPreview() {
  const container = document.getElementById('print-report-container');
  container.style.display = 'none';
  container.innerHTML = '';
  document.body.style.overflow = '';
}

// ===================== AUTO SHOW/HIDE PRINT BUTTON =====================
(function watchDetailTab() {
  function checkTab() {
    const detailTab = document.getElementById('tab-detail');
    const printBtn  = document.getElementById('printReportBtn');
    if (!detailTab || !printBtn) return;
    printBtn.style.display = detailTab.classList.contains('active') ? 'inline-flex' : 'none';
  }
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(checkTab);
    document.querySelectorAll('.tab-content').forEach(el =>
      observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    );
    checkTab();
  });
})();
