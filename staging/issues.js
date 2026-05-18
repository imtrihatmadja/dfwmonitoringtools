// ============================================================
// issues.js - DEBUG VERSION
// PMIS DFW Indonesia
// Purpose: show exactly where loading fails
// ============================================================

let issueAllData = [];
let issueFilteredData = [];
let issueCurrentPage = 1;
const ISSUE_PAGE_SIZE = 20;
let issueCurrentId = null;
const ISSUE_AUDIT_USER = window.AUDITUSER || 'Tim';

function escI(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setIssueMsg(text, type='info') {
  const el = document.getElementById('issueLoadError');
  if (!el) return;
  el.style.display = 'block';
  const color = type === 'error' ? '#ef4444' : type === 'success' ? '#15803d' : '#2563eb';
  const bg = type === 'error' ? '#fef2f2' : type === 'success' ? '#f0fdf4' : '#eff6ff';
  const border = type === 'error' ? '#fecaca' : type === 'success' ? '#bbf7d0' : '#bfdbfe';
  el.style.background = bg;
  el.style.color = color;
  el.style.border = `1px solid ${border}`;
  el.textContent = text;
}

function hideIssueMsg() {
  const el = document.getElementById('issueLoadError');
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
}

function renderIssueStats() {
  const d = issueAllData;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('issueTotalCount', d.length);
  set('issuePendingCount', d.filter(x => x.status === 'pending_review').length);
  set('issueActiveCount', d.filter(x => x.status === 'active').length);
  set('issueCriticalCount', d.filter(x => x.severity === 'critical' && !['resolved','closed','rejected'].includes(x.status)).length);
  set('issueStaleCount', d.filter(x => x.severity === 'critical' && (x.days_since_update || 0) > 14).length);
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

function renderIssueTable() {
  const tbody = document.getElementById('issueTableBody');
  if (!tbody) return;
  const total = issueFilteredData.length;
  const start = (issueCurrentPage - 1) * ISSUE_PAGE_SIZE;
  const rows = issueFilteredData.slice(start, start + ISSUE_PAGE_SIZE);
  const lbl = document.getElementById('issueCountLabel');
  if (lbl) lbl.textContent = `Menampilkan ${Math.min(start+1,total)}–${Math.min(start+ISSUE_PAGE_SIZE,total)} dari ${total} isu`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">Tidak ada data isu yang cocok.</td></tr>`;
    renderIssuePagination(0);
    return;
  }

  tbody.innerHTML = rows.map((isu, i) => `
    <tr>
      <td>${start + i + 1}</td>
      <td>
        <div style="font-weight:600;color:#0f172a">${escI(isu.title)}</div>
        <div style="font-size:11px;color:#94a3b8">${escI(isu.province || '')}${isu.location_name ? ' — ' + escI(isu.location_name) : ''}</div>
      </td>
      <td>${escI(isu.category)}</td>
      <td>${escI(isu.severity)}</td>
      <td>${escI(isu.status)}</td>
      <td>${isu.date_occurred || '-'}</td>
      <td>${(isu.updates || []).length}x</td>
      <td><button class="btn-secondary btn-sm" onclick="openIssueDetail('${isu.id}')">Detail</button></td>
    </tr>`).join('');

  renderIssuePagination(total);
}

window.issueGoPage = function(p) { issueCurrentPage = p; renderIssueTable(); };

window.loadIssues = async function () {
  const client = window.client;
  if (!client) {
    setIssueMsg('window.client belum siap. Cek apakah supabase client berhasil dimuat di app.js.', 'error');
    return;
  }

  setIssueMsg('Memuat data isu dari Supabase...', 'info');
  showIssueLoading(true);
  console.log('[issues-debug] loadIssues started');

  try {
    const [{ data: issues, error: issErr }, { data: updates, error: updErr }] = await Promise.all([
      client.from('issues')
        .select('id, title, description, category, severity, status, province, location_name, date_occurred, date_reported, source_type, source_link, source_hash, tags, created_by, created_at, updated_at')
        .order('created_at', { ascending: false }),
      client.from('issue_updates')
        .select('id, issue_id, update_text, evidence_urls, updated_by, updated_at')
        .order('updated_at', { ascending: false }),
    ]);

    console.log('[issues-debug] issues query result', { issuesCount: issues?.length || 0, issErr });
    console.log('[issues-debug] updates query result', { updatesCount: updates?.length || 0, updErr });

    if (issErr) {
      setIssueMsg('ERROR issues: ' + issErr.message, 'error');
      showIssueLoading(false);
      return;
    }
    if (updErr) {
      setIssueMsg('WARNING issue_updates: ' + updErr.message, 'error');
    }

    const updMap = {};
    (updates || []).forEach(u => {
      if (!updMap[u.issue_id]) updMap[u.issue_id] = [];
      updMap[u.issue_id].push(u);
    });

    issueAllData = (issues || []).map(i => ({ ...i, updates: updMap[i.id] || [] }));
    issueFilteredData = [...issueAllData];
    issueCurrentPage = 1;
    renderIssueStats();
    renderIssueTable();
    hideIssueMsg();
    showIssueLoading(false);

    if (!issueAllData.length) {
      setIssueMsg('Query berhasil, tetapi tabel issues kosong. Cek apakah data dummy benar-benar tersimpan.', 'error');
    } else {
      setIssueMsg(`Query berhasil. ${issueAllData.length} data isu terbaca.`, 'success');
    }
  } catch (err) {
    setIssueMsg('EXCEPTION loadIssues: ' + err.message, 'error');
    console.error('[issues-debug] exception', err);
    showIssueLoading(false);
  }
};

window.filterIssues = function () {
  const q = document.getElementById('issueSearchInput')?.value.toLowerCase() || '';
  const cat = document.getElementById('issueFilterCategory')?.value || '';
  const sev = document.getElementById('issueFilterSeverity')?.value || '';
  const status = document.getElementById('issueFilterStatus')?.value || '';
  const tag = document.getElementById('issueFilterTag')?.value.toLowerCase().trim() || '';
  issueFilteredData = issueAllData.filter(i => {
    const matchQ = !q || [i.title, i.description, i.province, i.location_name].filter(Boolean).join(' ').toLowerCase().includes(q);
    const matchC = !cat || i.category === cat;
    const matchS = !sev || i.severity === sev;
    const matchSt = !status || i.status === status;
    const matchT = !tag || (i.tags || []).some(t => String(t).toLowerCase().includes(tag));
    return matchQ && matchC && matchS && matchSt && matchT;
  });
  issueCurrentPage = 1;
  renderIssueTable();
};

window.openIssueDetail = async function (id) {
  const overlay = document.getElementById('issueDetailOverlay');
  const body = document.getElementById('issueDetailBody');
  if (!overlay || !body) return;
  const issue = issueAllData.find(x => x.id === id);
  if (!issue) { body.innerHTML = '<div style="padding:20px;color:#ef4444">Issue tidak ditemukan di data yang sudah dimuat.</div>'; overlay.classList.remove('hidden'); return; }
  body.innerHTML = `<div style="padding:8px 0"><div style="font-size:18px;font-weight:700;margin-bottom:8px">${escI(issue.title)}</div><div style="color:#64748b;font-size:13px">${escI(issue.category)} · ${escI(issue.severity)} · ${escI(issue.status)}</div><div style="margin-top:12px;font-size:13px;line-height:1.6">${escI(issue.description || 'Tidak ada deskripsi.')} </div><div style="margin-top:12px;font-size:12px;color:#94a3b8">Province: ${escI(issue.province || '-')} | Location: ${escI(issue.location_name || '-')}</div><div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px">Timeline update: ${(issue.updates || []).length} item(s)</div></div>`;
  overlay.classList.remove('hidden');
};

window.closeIssueDetail = function () { document.getElementById('issueDetailOverlay')?.classList.add('hidden'); };
window.saveIssueUpdate = async function(){ alert('DEBUG mode: saveIssueUpdate belum diaktifkan.'); };
window.changeIssueStatus = async function(){ alert('DEBUG mode: changeIssueStatus belum diaktifkan.'); };
window.openAddIssueModal = function(){ document.getElementById('issueFormOverlay')?.classList.remove('hidden'); };
window.openEditIssueModal = function(){ document.getElementById('issueFormOverlay')?.classList.remove('hidden'); };
window.closeIssueModal = function(){ document.getElementById('issueFormOverlay')?.classList.add('hidden'); };
window.saveIssue = async function(){ alert('DEBUG mode: saveIssue belum diaktifkan.'); };
window.deleteIssue = async function(){ alert('DEBUG mode: deleteIssue belum diaktifkan.'); };

function showIssueLoading(show) {
  const el = document.getElementById('issueTableBody');
  if (!el) return;
  if (show) el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">Memuat data isu...</td></tr>';
}

document.addEventListener('DOMContentLoaded', () => {
  const overlays = ['issueDetailOverlay', 'issueFormOverlay'];
  overlays.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
  });
});
