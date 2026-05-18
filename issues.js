// ============================================================
// issues.js - Knowledge Management: Isu Module
// PMIS DFW Indonesia
// Consistent with beneficiary.js patterns
// ============================================================

// ── State ────────────────────────────────────────────────────
let issueAllData       = [];   // all loaded issues
let issueFilteredData  = [];   // after search/filter
let issueCurrentPage   = 1;
const ISSUE_PAGE_SIZE  = 20;
let issueCurrentId     = null; // issue open in detail modal
const ISSUE_AUDIT_USER = window.AUDITUSER || 'Tim';

// Severity & status config
const SEVERITY_CONFIG = {
  critical: { label: 'Kritis',      color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  high:     { label: 'Tinggi',      color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  medium:   { label: 'Sedang',      color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  low:      { label: 'Rendah',      color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
};
const STATUS_CONFIG = {
  pending_review:      { label: 'Menunggu Review', cls: 'badge-pending-review' },
  active:              { label: 'Aktif',           cls: 'badge-aktif'         },
  under_investigation: { label: 'Investigasi',     cls: 'badge-investigation' },
  resolved:            { label: 'Terselesaikan',   cls: 'badge-selesai'       },
  closed:              { label: 'Ditutup',          cls: 'badge-closed'        },
  rejected:            { label: 'Ditolak',         cls: 'badge-rejected'      },
};

// ── Helpers ───────────────────────────────────────────────────
function escI(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function severityBadge(sev) {
  const c = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.medium;
  return `<span style="background:${c.bg};color:${c.color};border:1px solid ${c.border};
    border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">${c.label}</span>`;
}
function statusBadge(status) {
  const s = STATUS_CONFIG[status] || { label: status, cls: '' };
  return `<span class="badge ${s.cls}" style="font-size:10px">${s.label}</span>`;
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDatetime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Load ──────────────────────────────────────────────────────

/** Load all issues from Supabase, parallel with issue_updates for timeline */
window.loadIssues = async function () {
  const client = window.client;
  showIssueLoading(true);

  // Load issues + updates in parallel
  const [
    issuesRes,
    updatesRes,
  ] = await Promise.all([
    client
      .from('issues')
      .select('id, title, description, category, severity, status, location_id, province, location_name, date_occurred, date_reported, source_type, source_link, source_hash, tags, created_by, created_at, updated_at')
      .order('created_at', { ascending: false }),
    client
      .from('issue_updates')
      .select('id, issue_id, update_text, evidence_urls, updated_by, updated_at')
      .order('updated_at', { ascending: false }),
  ]);
  const issues = issuesRes.data || [];
  const issErr = issuesRes.error;
  const updates = updatesRes.data || [];
  const updErr = updatesRes.error;

  if (issErr) {
    showIssueLoading(false);
    const errEl = document.getElementById('issueLoadError');
    if (errEl) {
      errEl.textContent = 'Gagal memuat isu: ' + issErr.message;
      errEl.style.display = 'block';
    }
    console.error('loadIssues issues error', issErr);
    return;
  }

  // Attach updates to each issue
  const updMap = {};
  (updates || []).forEach(u => {
    if (!updMap[u.issue_id]) updMap[u.issue_id] = [];
    updMap[u.issue_id].push(u);
  });

  issueAllData = (issues || []).map(i => ({
    ...i,
    updates: updMap[i.id] || [],
  }));
  console.log('issues loaded', issueAllData.length, issueAllData.slice(0,3));
  issueFilteredData = [...issueAllData];
  issueCurrentPage = 1;

  renderIssueStats();
  renderIssueTable();
  showIssueLoading(false);
  if (!issueAllData.length) {
    const body = document.getElementById('issueTableBody');
    if (body) body.innerHTML = `<tr><td colspan=\"8\" style=\"text-align:center;padding:28px;color:#94a3b8\">Belum ada data isu. Jalankan schema_issues_FIXED.sql dulu, atau tambah data manual.</td></tr>`;
  }
};

// ── Stats cards ───────────────────────────────────────────────
function renderIssueStats() {
  const data = issueAllData;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('issueTotalCount',    data.length);
  set('issuePendingCount',  data.filter(i => i.status === 'pending_review').length);
  set('issueActiveCount',   data.filter(i => i.status === 'active').length);
  set('issueCriticalCount', data.filter(i => i.severity === 'critical' && !['resolved','closed','rejected'].includes(i.status)).length);
  set('issueStaleCount',    data.filter(i => i.severity === 'critical' && (i.days_since_update || 0) > 14).length);
}

// ── Table ─────────────────────────────────────────────────────
function renderIssueTable() {
  const tbody = document.getElementById('issueTableBody');
  if (!tbody) return;
  if (!issueAllData.length) {
    tbody.innerHTML = `<tr><td colspan=\"8\" style=\"text-align:center;padding:28px;color:#94a3b8\">Belum ada data isu di database.</td></tr>`;
    renderIssuePagination(0);
    return;
  }

  const total = issueFilteredData.length;
  const start = (issueCurrentPage - 1) * ISSUE_PAGE_SIZE;
  const rows  = issueFilteredData.slice(start, start + ISSUE_PAGE_SIZE);

  const countLbl = document.getElementById('issueCountLabel');
  if (countLbl) countLbl.textContent =
    `Menampilkan ${Math.min(start+1, total)}–${Math.min(start+ISSUE_PAGE_SIZE, total)} dari ${total} isu`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">
      ${issueAllData.length ? 'Tidak ada hasil yang cocok.' : 'Belum ada isu. Tambah atau tunggu RSS scraper berjalan.'}
    </td></tr>`;
    renderIssuePagination(0);
    return;
  }

  tbody.innerHTML = rows.map((isu, i) => {
    const staleBadge = isu.severity === 'critical' && (isu.days_since_update || 0) > 14
      ? `<span style="background:#fef2f2;color:#ef4444;border:1px solid #fecaca;
          border-radius:4px;padding:1px 6px;font-size:10px;margin-left:4px">⚠ Stale</span>`
      : '';
    return `<tr style="cursor:pointer" onclick="openIssueDetail('${isu.id}')">
      <td style="color:#94a3b8;font-size:12px">${start + i + 1}</td>
      <td>
        <div style="font-weight:600;font-size:13px;color:#0f172a">${escI(isu.title)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">
          ${escI(isu.province || '')} ${isu.location_name ? '— ' + escI(isu.location_name) : ''}
        </div>
      </td>
      <td><span class="badge" style="font-size:10px">${escI(isu.category)}</span></td>
      <td>${severityBadge(isu.severity)}</td>
      <td>${statusBadge(isu.status)}${staleBadge}</td>
      <td style="font-size:12px;color:#475569">${fmtDate(isu.date_occurred)}</td>
      <td style="font-size:12px;color:#475569">
        <span style="background:#f0f9ff;color:#0369a1;border-radius:4px;padding:1px 6px;font-size:11px">
          ${isu.update_count || 0}x update
        </span>
      </td>
      <td>
        <button class="btn-secondary btn-sm" style="margin-right:4px"
          onclick="event.stopPropagation();openIssueDetail('${isu.id}')">Detail</button>
        ${isu.status === 'pending_review'
          ? `<button class="btn-primary btn-sm" style="font-size:11px;margin-right:4px"
              onclick="event.stopPropagation();approveIssue('${isu.id}')">✓ Approve</button>
             <button class="btn-danger btn-sm" style="font-size:11px"
              onclick="event.stopPropagation();rejectIssue('${isu.id}')">✕ Tolak</button>`
          : `<button class="btn-secondary btn-sm" style="margin-right:4px;color:#d97706;border-color:#fde68a"
              onclick="event.stopPropagation();openEditIssueModal('${isu.id}')">
              <i class="fa-solid fa-pen-to-square"></i> Edit</button>`
        }
      </td>
    </tr>`;
  }).join('');

  renderIssuePagination(total);
}

function renderIssuePagination(total) {
  const container = document.getElementById('issuePagination');
  if (!container) return;
  const totalPages = Math.ceil(total / ISSUE_PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<div style="display:flex;gap:6px;align-items:center;justify-content:center;margin-top:14px;flex-wrap:wrap">`;
  html += `<button class="btn-secondary btn-sm" ${issueCurrentPage===1?'disabled':''} onclick="issueGoPage(${issueCurrentPage-1})">Prev</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - issueCurrentPage) <= 1) {
      html += `<button class="${issueCurrentPage===p?'btn-primary':'btn-secondary'} btn-sm" onclick="issueGoPage(${p})">${p}</button>`;
    } else if (Math.abs(p - issueCurrentPage) === 2) {
      html += `<span style="color:#94a3b8">…</span>`;
    }
  }
  html += `<button class="btn-secondary btn-sm" ${issueCurrentPage===totalPages?'disabled':''} onclick="issueGoPage(${issueCurrentPage+1})">Next</button></div>`;
  container.innerHTML = html;
}

window.issueGoPage = function (p) { issueCurrentPage = p; renderIssueTable(); };

// ── Search & Filter ───────────────────────────────────────────
window.filterIssues = function () {
  const q        = document.getElementById('issueSearchInput')?.value.toLowerCase() || '';
  const cat      = document.getElementById('issueFilterCategory')?.value || '';
  const sev      = document.getElementById('issueFilterSeverity')?.value || '';
  const status   = document.getElementById('issueFilterStatus')?.value || '';
  const tag      = document.getElementById('issueFilterTag')?.value.trim().toLowerCase() || '';

  issueFilteredData = issueAllData.filter(i => {
    const matchQ  = !q || i.title.toLowerCase().includes(q)
                      || (i.province || '').toLowerCase().includes(q)
                      || (i.location_name || '').toLowerCase().includes(q)
                      || (i.description || '').toLowerCase().includes(q);
    const matchC  = !cat    || i.category === cat;
    const matchS  = !sev    || i.severity === sev;
    const matchSt = !status || i.status === status;
    const matchT  = !tag    || (i.tags || []).some(t => t.toLowerCase().includes(tag));
    return matchQ && matchC && matchS && matchSt && matchT;
  });
  issueCurrentPage = 1;
  renderIssueTable();
};

// ── Approve / Reject (pending_review items) ──────────────────
window.approveIssue = async function (id) {
  if (!confirm('Setujui isu ini dan ubah status menjadi Aktif?')) return;
  const client = window.client;
  const { error } = await client.from('issues').update({
    status: 'active',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { alert('Gagal approve: ' + error.message); return; }
  await addIssueUpdate(id, 'Isu disetujui dan diaktifkan oleh reviewer.');
  await loadIssues();
};

window.rejectIssue = async function (id) {
  const reason = prompt('Alasan penolakan (opsional):');
  if (reason === null) return; // user cancelled
  const client = window.client;
  const { error } = await client.from('issues').update({
    status: 'rejected',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { alert('Gagal tolak: ' + error.message); return; }
  if (reason.trim()) {
    await addIssueUpdate(id, 'Isu ditolak. Alasan: ' + reason.trim());
  }
  await loadIssues();
};

/** Internal helper: add one issue_update row */
async function addIssueUpdate(issueId, text, evidenceUrls = []) {
  const client = window.client;
  const { error } = await client.from('issue_updates').insert({
    issue_id: issueId,
    update_text: text,
    evidence_urls: evidenceUrls,
    updated_by: ISSUE_AUDIT_USER,
  });
  if (error) console.warn('addIssueUpdate:', error.message);
}

// ── Detail Modal ──────────────────────────────────────────────
window.openIssueDetail = async function (id) {
  const client  = window.client;
  issueCurrentId = id;

  const isu = issueAllData.find(i => i.id === id);
  if (!isu) return;

  // Load fresh updates for this issue
  const { data: updates } = await client
    .from('issue_updates')
    .select('*')
    .eq('issue_id', id)
    .order('updated_at', { ascending: true });

  const overlay = document.getElementById('issueDetailOverlay');
  const body    = document.getElementById('issueDetailBody');
  if (!overlay || !body) return;

  const sevCfg = SEVERITY_CONFIG[isu.severity] || SEVERITY_CONFIG.medium;

  body.innerHTML = `
    <!-- Header -->
    <div style="margin-bottom:16px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        ${statusBadge(isu.status)}
        ${severityBadge(isu.severity)}
        <span class="badge" style="font-size:10px">${escI(isu.category)}</span>
        ${isu.source_type ? `<span style="background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 7px;font-size:10px">${escI(isu.source_type)}</span>` : ''}
      </div>
      <div style="font-size:18px;font-weight:700;color:#0f172a;line-height:1.3;margin-bottom:8px">${escI(isu.title)}</div>
      <div style="font-size:12px;color:#64748b;display:flex;gap:16px;flex-wrap:wrap">
        ${isu.province ? `<span><i class="fa-solid fa-location-dot" style="margin-right:4px"></i>${escI(isu.province)}${isu.location_name ? ' — ' + escI(isu.location_name) : ''}</span>` : ''}
        ${isu.date_occurred ? `<span><i class="fa-solid fa-calendar" style="margin-right:4px"></i>Kejadian: ${fmtDate(isu.date_occurred)}</span>` : ''}
        ${isu.date_reported ? `<span><i class="fa-solid fa-flag" style="margin-right:4px"></i>Dilaporkan: ${fmtDate(isu.date_reported)}</span>` : ''}
      </div>
    </div>

    <!-- Description -->
    ${isu.description ? `
      <div style="background:#f8fafc;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#334155;line-height:1.6">
        ${escI(isu.description)}
        ${isu.source_link ? `<div style="margin-top:8px"><a href="${escI(isu.source_link)}" target="_blank" rel="noopener noreferrer"
          style="font-size:11px;color:#2563eb">🔗 Sumber Asli</a></div>` : ''}
      </div>` : ''}

    <!-- Tags -->
    ${(isu.tags || []).length ? `
      <div style="margin-bottom:16px;display:flex;gap:6px;flex-wrap:wrap">
        ${(isu.tags || []).map(t => `<span style="background:#eff6ff;color:#2563eb;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600">#${escI(t)}</span>`).join('')}
      </div>` : ''}

    <!-- Timeline -->
    <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:8px">
      <i class="fa-solid fa-timeline" style="color:#2563eb"></i>
      Timeline Update <span style="font-size:11px;color:#94a3b8;font-weight:400">${(updates || []).length} entri</span>
    </div>
    <div style="max-height:280px;overflow-y:auto;padding-right:4px;margin-bottom:16px" id="issueTimelineList">
      ${renderIssueTimeline(isu, updates || [])}
    </div>

    <!-- Add Update Form -->
    ${['resolved','closed','rejected'].includes(isu.status) ? '' : `
    <div style="border-top:1px solid #f1f5f9;padding-top:14px">
      <div style="font-weight:600;font-size:12px;color:#475569;margin-bottom:8px">Tambah Update</div>
      <div class="form-group">
        <label>Catatan Perkembangan <span class="required">*</span></label>
        <textarea id="issueUpdateText" rows="3"
          placeholder="Perkembangan terbaru, temuan baru, tindak lanjut..."
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;resize:vertical"></textarea>
      </div>
      <div class="form-group">
        <label>URL Bukti/Referensi <span style="font-weight:400;color:#94a3b8">opsional, pisah koma</span></label>
        <input type="text" id="issueUpdateEvidence"
          placeholder="https://link1.com, https://link2.com"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn-primary btn-sm" onclick="saveIssueUpdate()">
          <i class="fa-solid fa-floppy-disk"></i> Simpan Update
        </button>
        ${isu.status !== 'resolved'
          ? `<button class="btn-secondary btn-sm" style="color:#22c55e;border-color:#bbf7d0"
              onclick="changeIssueStatus('${isu.id}','resolved')">✓ Tandai Terselesaikan</button>`
          : ''}
        ${isu.status === 'active'
          ? `<button class="btn-secondary btn-sm" style="color:#6366f1;border-color:#c7d2fe"
              onclick="changeIssueStatus('${isu.id}','under_investigation')">🔍 Mulai Investigasi</button>`
          : ''}
      </div>
      <div id="issueUpdateMsg" class="form-msg hidden" style="margin-top:8px;font-size:12px"></div>
    </div>`}
  `;

  overlay.classList.remove('hidden');
};

function renderIssueTimeline(isu, updates) {
  // Build combined timeline: issue created + all updates
  const entries = [
    {
      type: 'created',
      text: isu.description || 'Isu dicatat ke sistem.',
      actor: isu.created_by || 'Tim',
      at: isu.created_at,
      evidence: [],
    },
    ...(updates || []).map(u => ({
      type: 'update',
      text: u.update_text,
      actor: u.updated_by,
      at: u.updated_at,
      evidence: u.evidence_urls || [],
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  if (!entries.length) return `<div style="padding:16px;color:#94a3b8;font-size:13px;text-align:center">Belum ada update.</div>`;

  return entries.map((e, idx) => {
    const isLast = idx === entries.length - 1;
    const dotColor = e.type === 'created' ? '#94a3b8' : '#2563eb';
    return `
      <div style="display:flex;gap:12px;padding-bottom:${isLast ? '0' : '14px'};position:relative">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
          <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};margin-top:3px;flex-shrink:0"></div>
          ${!isLast ? `<div style="width:2px;flex:1;background:#e2e8f0;margin-top:4px"></div>` : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#334155;line-height:1.5;margin-bottom:4px">${escI(e.text)}</div>
          ${e.evidence.length
            ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                ${e.evidence.map(url => `<a href="${escI(url)}" target="_blank" rel="noopener"
                  style="font-size:10px;color:#2563eb">🔗 Bukti</a>`).join('')}
              </div>`
            : ''}
          <div style="font-size:11px;color:#94a3b8">${fmtDatetime(e.at)} &nbsp;·&nbsp; ${escI(e.actor)}</div>
        </div>
      </div>`;
  }).join('');
}

window.saveIssueUpdate = async function () {
  const client  = window.client;
  const text    = document.getElementById('issueUpdateText')?.value.trim();
  const evRaw   = document.getElementById('issueUpdateEvidence')?.value.trim();
  const msgEl   = document.getElementById('issueUpdateMsg');

  if (!text) {
    if (msgEl) { msgEl.textContent = 'Catatan tidak boleh kosong.'; msgEl.className = 'form-msg error'; msgEl.style.display = 'block'; }
    return;
  }

  const evidenceUrls = evRaw
    ? evRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const { error } = await client.from('issue_updates').insert({
    issue_id:      issueCurrentId,
    update_text:   text,
    evidence_urls: evidenceUrls,
    updated_by:    ISSUE_AUDIT_USER,
  });

  if (error) {
    if (msgEl) { msgEl.textContent = 'Gagal simpan: ' + error.message; msgEl.className = 'form-msg error'; msgEl.style.display = 'block'; }
    return;
  }

  if (msgEl) { msgEl.textContent = 'Update tersimpan!'; msgEl.className = 'form-msg success'; msgEl.style.display = 'block'; }
  if (document.getElementById('issueUpdateText')) document.getElementById('issueUpdateText').value = '';
  if (document.getElementById('issueUpdateEvidence')) document.getElementById('issueUpdateEvidence').value = '';

  // Refresh modal timeline
  setTimeout(() => openIssueDetail(issueCurrentId), 400);
  await loadIssues();
};

window.changeIssueStatus = async function (id, newStatus) {
  const client = window.client;
  const { error } = await client.from('issues').update({
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { alert('Gagal ubah status: ' + error.message); return; }
  const statusLabels = { resolved: 'Terselesaikan', under_investigation: 'Investigasi', closed: 'Ditutup' };
  await addIssueUpdate(id, `Status diubah menjadi: ${statusLabels[newStatus] || newStatus}`);
  await loadIssues();
  openIssueDetail(id); // refresh modal
};

window.closeIssueDetail = function () {
  document.getElementById('issueDetailOverlay')?.classList.add('hidden');
  issueCurrentId = null;
};

// ── Add / Edit Modal ──────────────────────────────────────────
window.openAddIssueModal = function () {
  document.getElementById('issueFormId').value       = '';
  document.getElementById('issueFormTitle').textContent = 'Tambah Isu Baru';
  ['issueF-title','issueF-description','issueF-province','issueF-location',
   'issueF-source-link','issueF-tags'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('issueF-category').value  = 'Lainnya';
  document.getElementById('issueF-severity').value  = 'medium';
  document.getElementById('issueF-status').value    = 'active';
  document.getElementById('issueF-date-occurred').value = '';
  const msgEl = document.getElementById('issueFormMsg');
  if (msgEl) msgEl.className = 'form-msg hidden';
  document.getElementById('issueFormOverlay').classList.remove('hidden');
};

window.openEditIssueModal = function (id) {
  const isu = issueAllData.find(i => i.id === id);
  if (!isu) return;
  document.getElementById('issueFormId').value          = isu.id;
  document.getElementById('issueFormTitle').textContent = 'Edit Isu';
  document.getElementById('issueF-title').value         = isu.title;
  document.getElementById('issueF-description').value   = isu.description || '';
  document.getElementById('issueF-category').value      = isu.category;
  document.getElementById('issueF-severity').value      = isu.severity;
  document.getElementById('issueF-status').value        = isu.status;
  document.getElementById('issueF-province').value      = isu.province || '';
  document.getElementById('issueF-location').value      = isu.location_name || '';
  document.getElementById('issueF-date-occurred').value = isu.date_occurred || '';
  document.getElementById('issueF-source-link').value   = isu.source_link || '';
  document.getElementById('issueF-tags').value          = (isu.tags || []).join(', ');
  const msgEl = document.getElementById('issueFormMsg');
  if (msgEl) msgEl.className = 'form-msg hidden';
  document.getElementById('issueFormOverlay').classList.remove('hidden');
};

window.closeIssueModal = function () {
  document.getElementById('issueFormOverlay')?.classList.add('hidden');
};

window.saveIssue = async function () {
  const client  = window.client;
  const id      = document.getElementById('issueFormId').value;
  const title   = document.getElementById('issueF-title').value.trim();
  const msgEl   = document.getElementById('issueFormMsg');
  const saveBtn = document.querySelector('#issueFormOverlay .btn-primary[onclick="saveIssue()"]');

  if (!title) {
    if (msgEl) { msgEl.textContent = 'Judul wajib diisi.'; msgEl.className = 'form-msg error'; }
    return;
  }
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan…'; }

  const tagsRaw = document.getElementById('issueF-tags').value;
  const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const payload = {
    title,
    description:   document.getElementById('issueF-description').value.trim() || null,
    category:      document.getElementById('issueF-category').value,
    severity:      document.getElementById('issueF-severity').value,
    status:        document.getElementById('issueF-status').value,
    province:      document.getElementById('issueF-province').value.trim() || null,
    location_name: document.getElementById('issueF-location').value.trim() || null,
    date_occurred: document.getElementById('issueF-date-occurred').value || null,
    source_link:   document.getElementById('issueF-source-link').value.trim() || null,
    source_type:   'manual',
    tags,
    created_by:    ISSUE_AUDIT_USER,
    updated_at:    new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await client.from('issues').update(payload).eq('id', id));
  } else {
    ({ error } = await client.from('issues').insert(payload));
  }

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Simpan'; }

  if (error) {
    if (msgEl) { msgEl.textContent = 'Gagal: ' + error.message; msgEl.className = 'form-msg error'; }
    return;
  }
  if (msgEl) { msgEl.textContent = 'Tersimpan!'; msgEl.className = 'form-msg success'; }
  setTimeout(() => { closeIssueModal(); loadIssues(); }, 800);
};

// ── Delete ────────────────────────────────────────────────────
window.deleteIssue = async function (id, title) {
  if (!confirm(`Hapus isu "${title}"? Semua update akan terhapus.`)) return;
  const { error } = await window.client.from('issues').delete().eq('id', id);
  if (error) { alert('Gagal hapus: ' + error.message); return; }
  await loadIssues();
};

// ── Loading state ─────────────────────────────────────────────
function showIssueLoading(show) {
  const el = document.getElementById('issueTableBody');
  if (!el || !show) return;
  el.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">Memuat data…</td></tr>`;
}

// ── Modal close on overlay click ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['issueDetailOverlay', 'issueFormOverlay'].forEach(overlayId => {
    const el = document.getElementById(overlayId);
    if (el) el.addEventListener('click', e => {
      if (e.target === el) el.classList.add('hidden');
    });
  });
});
