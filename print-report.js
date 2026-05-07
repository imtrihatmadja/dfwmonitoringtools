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

// ===================== GENERATE & PRINT REPORT =====================
async function generateAndPrint(lang) {
  closePrintModal();
  if (!currentProject) return;

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
    activities: 'Daftar Aktivitas (Berjalan & Belum Mulai)',
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
    allDone: 'All activities completed',
    noNotes: 'No notes available yet.',
    totalBudget: 'Total Project Budget',
    remainingBudget: 'Remaining budget',
    absLabel: 'Absorption',
  };

  const proj = currentProject;
  const inds = indicators || [];
  const acts = allActivities || [];
  const notes = allActNotes || [];

  const overallPct = calcOverallProgress(proj);
  const budgetApproved  = Number(proj.budget_approved) || 0;
  const budgetActual    = Number(proj.budget_actual)   || 0;
  const budgetPct       = pctBudget(budgetApproved, budgetActual);
  const budgetRemaining = budgetApproved - budgetActual;

  const now = new Date();
  const printDateStr = now.toLocaleDateString(
    lang === 'id' ? 'id-ID' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

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
    if (pct >= 85) return `<span class="rpt-badge on-track">${T.excellent}</span>`;
    if (pct >= 60) return `<span class="rpt-badge active">${T.good}</span>`;
    if (pct >= 35) return `<span class="rpt-badge at-risk">${T.fair}</span>`;
    return `<span class="rpt-badge delayed">${T.needsAttn}</span>`;
  }

  function progressBar(pct, color) {
    const c = color || (pct >= 85 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 35 ? '#f59e0b' : '#ef4444');
    return `<div style="display:flex;align-items:center;gap:6px">
      <div class="rpt-prog-bar-wrap" style="flex:1">
        <div class="rpt-prog-bar-fill" style="width:${Math.min(pct,100)}%;background:${c}"></div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${c};min-width:28px">${pct}%</span>
    </div>`;
  }

  const activeActs = acts.filter(a =>
    a.status === 'Sedang Berjalan' || a.status === 'Belum Mulai'
  );

  const actNoteTexts = notes.map(n => n.note || '').filter(Boolean);
  const indNoteTexts = inds.flatMap(ind =>
    (ind.indicator_updates || []).map(u => u.note).filter(Boolean)
  );
  const combinedNotes = [...actNoteTexts, ...indNoteTexts];
  const lessonsList = combinedNotes.length
    ? combinedNotes.slice(0, 6).map(n => `• ${n}`).join('\n')
    : `• ${T.noNotes}`;

  // PAGE 1
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
      <div style="flex-shrink:0;text-align:center;min-width:80px">
        <div class="rpt-circle-pct">${overallPct}%</div>
        <div class="rpt-circle-label">${progressLabel(overallPct)}</div>
      </div>
      <div style="flex:1">
        ${progressBar(overallPct)}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">
          <div style="font-size:10px;color:#64748b;text-align:center">
            <strong style="display:block;color:#0f172a;font-size:14px">${inds.length}</strong>
            ${lang === 'id' ? 'Indikator' : 'Indicators'}
          </div>
          <div style="font-size:10px;color:#64748b;text-align:center">
            <strong style="display:block;color:#0f172a;font-size:14px">${acts.length}</strong>
            ${lang === 'id' ? 'Aktivitas' : 'Activities'}
          </div>
          <div style="font-size:10px;color:#64748b;text-align:center">
            <strong style="display:block;color:#2563eb;font-size:14px">${budgetPct}%</strong>
            ${lang === 'id' ? 'Serapan Anggaran' : 'Budget Used'}
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

  // PAGE 2
  const indRows = inds.map((ind, i) => {
    const act = getLatestActual(ind);
    const tgt = Number(ind.target) || 0;
    const pct = tgt > 0 ? Math.min(Math.round(act / tgt * 100), 100) : 0;
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${ind.indicator_name}</strong><br><span style="color:#94a3b8;font-size:9px">${ind.type || ''}</span></td>
      <td style="text-align:center">${tgt} ${ind.unit || ''}</td>
      <td style="text-align:center">${act} ${ind.unit || ''}</td>
      <td style="min-width:90px">${progressBar(pct)}</td>
      <td>${indStatusBadge(pct)}</td>
    </tr>`;
  }).join('');

  const actRows = activeActs.map((act, i) => {
    const actNotes = notes.filter(n => n.activity_id === act.id);
    const lastNote = actNotes.length ? actNotes[actNotes.length - 1].note : T.noData;
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${act.title}</strong>${act.description ? `<br><span style="color:#64748b;font-size:9px">${act.description}</span>` : ''}</td>
      <td>${act.pic || T.noData}</td>
      <td>${fmtDate(act.start_date)}</td>
      <td>${fmtDate(act.due_date)}</td>
      <td>${actStatusBadge(act.status)}</td>
      <td style="min-width:70px">${progressBar(act.progress || 0)}</td>
      <td style="max-width:110px;font-size:9px;color:#475569">${lastNote}</td>
    </tr>`;
  }).join('');

  const page2 = `
<div class="rpt-page">
  <div class="rpt-section">
    <div class="rpt-section-title">🎯 ${T.indicators}</div>
    <table class="rpt-table">
      <thead><tr>
        <th>#</th><th>${T.indName}</th>
        <th style="text-align:center">${T.target}</th>
        <th style="text-align:center">${T.actual}</th>
        <th>${T.pct}</th><th>${T.statusCol}</th>
      </tr></thead>
      <tbody>${indRows || `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px">${T.noData}</td></tr>`}</tbody>
    </table>
  </div>
  <div class="rpt-section">
    <div class="rpt-section-title">📅 ${T.activities}</div>
    <table class="rpt-table">
      <thead><tr>
        <th>#</th><th>${T.actTitle}</th><th>${T.pic}</th>
        <th>${T.startPlan}</th><th>${T.duePlan}</th>
        <th>${T.actStatus}</th><th>${T.actProgress}</th><th>${T.notes}</th>
      </tr></thead>
      <tbody>${actRows || `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px">${T.allDone}</td></tr>`}</tbody>
    </table>
  </div>
  <div class="rpt-page-footer">
    <span>${T.org} — ${proj.name}</span>
    <span>${T.page} 2 | ${printDateStr}</span>
  </div>
</div>`;

  // PAGE 3
  const page3 = `
<div class="rpt-page">
  <div class="rpt-section">
    <div class="rpt-section-title">💰 ${T.budgetSection}</div>
    <table class="rpt-table">
      <thead><tr>
        <th>${T.component}</th>
        <th style="text-align:right">${T.plan}</th>
        <th style="text-align:right">${T.realization}</th>
        <th style="text-align:right">${T.remainingCol}</th>
        <th>${T.pctAbsorption}</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><strong>${T.totalBudget}</strong></td>
          <td style="text-align:right">${formatRupiah(budgetApproved)}</td>
          <td style="text-align:right">${formatRupiah(budgetActual)}</td>
          <td style="text-align:right;color:${budgetRemaining >= 0 ? '#15803d' : '#b91c1c'}">${formatRupiah(budgetRemaining)}</td>
          <td style="min-width:100px">${progressBar(budgetPct, budgetPct >= 80 ? '#22c55e' : '#3b82f6')}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:8px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:10px;color:#64748b">
      ${T.remainingBudget}: <strong style="color:#0f172a">${formatRupiah(budgetRemaining)}</strong>
      &nbsp;|&nbsp; ${T.absLabel}: <strong style="color:#2563eb">${budgetPct}%</strong>
    </div>
  </div>
  <div class="rpt-section">
    <div class="rpt-section-title">📝 ${T.narrative}</div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.highlight}</div>
      <div class="rpt-narrative-text">${proj.description || T.noData}</div>
    </div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.constraints}</div>
      <div class="rpt-narrative-text">${proj.note || (lang === 'id' ? 'Tidak ada kendala yang dicatat.' : 'No challenges recorded.')}</div>
    </div>
    <div class="rpt-narrative-box">
      <div class="rpt-narrative-title">${T.nextPlan}</div>
      <div class="rpt-narrative-text">${activeActs.slice(0, 4).map(a =>
        `• ${a.title}${a.pic ? ' — ' + T.pic + ': ' + a.pic : ''}${a.due_date ? ' (' + fmtDate(a.due_date) + ')' : ''}`
      ).join('\n') || T.noData}</div>
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

  const fullHTML = `
<div class="rpt-preview-toolbar">
  <span class="rpt-toolbar-title">🖨️ ${T.previewTitle} — ${proj.name}</span>
  <div class="rpt-preview-actions">
    <button class="btn-close-preview" onclick="closePrintPreview()">✕ ${T.closeBtn}</button>
    <button class="btn-do-print" onclick="window.print()">🖨️ ${T.printBtn}</button>
  </div>
</div>
<div class="rpt-preview-content">
  ${page1}${page2}${page3}
</div>`;

  const container = document.getElementById('print-report-container');
  container.innerHTML = fullHTML;
  container.style.display = 'block';
  document.body.style.overflow = 'hidden';
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
