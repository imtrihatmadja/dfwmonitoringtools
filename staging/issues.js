// issues.js
let issuesAllData = [];
let issuesFilteredData = [];
let currentIssueDetailId = null;

const ISSUE_STATUS_LABELS = {
  pending_review: 'Pending Review',
  active: 'Active',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  rejected: 'Rejected'
};

const ISSUE_SEVERITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical'
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return v;
  }
}

function fmtDateTime(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return v;
  }
}

function parseTextList(v) {
  return [...new Set(
    String(v || '')
      .split(/\n|,/)
      .map(x => x.trim())
      .filter(Boolean)
  )];
}

function issueBadge(text, bg, color, border = 'transparent') {
  return `<span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${bg};color:${color};border:1px solid ${border};white-space:nowrap;">${esc(text)}</span>`;
}

function renderSeverityBadge(v) {
  if (v === 'critical') return issueBadge('Critical', '#fef2f2', '#dc2626', '#fecaca');
  if (v === 'high') return issueBadge('High', '#fff7ed', '#c2410c', '#fed7aa');
  if (v === 'medium') return issueBadge('Medium', '#fffbeb', '#b45309', '#fde68a');
  return issueBadge('Low', '#f0fdf4', '#15803d', '#bbf7d0');
}

function renderStatusBadge(v) {
  if (v === 'resolved') return issueBadge('Resolved', '#dcfce7', '#15803d', '#bbf7d0');
  if (v === 'rejected') return issueBadge('Rejected', '#f1f5f9', '#475569', '#e2e8f0');
  if (v === 'monitoring') return issueBadge('Monitoring', '#ede9fe', '#6d28d9', '#ddd6fe');
  if (v === 'pending_review') return issueBadge('Pending Review', '#fff7ed', '#c2410c', '#fed7aa');
  return issueBadge('Active', '#dbeafe', '#1d4ed8', '#bfdbfe');
}

function shortText(v, max = 90) {
  const s = String(v || '').trim();
  if (!s) return '-';
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function showIssueMsg(msg, type = 'success', elId = 'issueMsg') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `form-msg ${type}`;
  el.classList.remove('hidden');
}

function hideIssueMsg(elId = 'issueMsg') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = '';
  el.className = 'form-msg hidden';
}

function populateIssueCategoryFilter() {
  const sel = document.getElementById('issueCategoryFilter');
  if (!sel) return;
  const current = sel.value;
  const cats = [...new Set(issuesAllData.map(x => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (cats.includes(current)) sel.value = current;
}

function renderIssueStats() {
  const total = issuesFilteredData.length;
  const critical = issuesFilteredData.filter(x => x.severity === 'critical').length;
  const resolved = issuesFilteredData.filter(x => x.status === 'resolved').length;
  const updates = issuesFilteredData.reduce((a, b) => a + (b.updates?.length || 0), 0);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = Number(val || 0).toLocaleString('id-ID');
  };

  set('issueStatTotal', total);
  set('issueStatCritical', critical);
  set('issueStatResolved', resolved);
  set('issueStatUpdates', updates);
}

function renderIssueTable() {
  const tbody = document.getElementById('issueTableBody');
  if (!tbody) return;

  if (!issuesFilteredData.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:28px; color:#94a3b8;">
          Belum ada data isu yang cocok.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = issuesFilteredData.map((item, idx) => {
    const tags = (item.tags || []).length
      ? (item.tags || []).slice(0, 3).map(tag =>
          `<span style="display:inline-flex;padding:2px 7px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:10px;font-weight:600;margin-right:4px;margin-top:4px;">${esc(tag)}</span>`
        ).join('')
      : '<span style="color:#94a3b8;">-</span>';

    return `
      <tr>
        <td style="color:#94a3b8;">${idx + 1}</td>
        <td style="min-width:260px;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:3px;">${esc(item.title)}</div>
          <div style="font-size:11px; color:#64748b; line-height:1.5;">${esc(shortText(item.description, 100))}</div>
          <div style="margin-top:4px;">${tags}</div>
        </td>
        <td>${esc(item.category || '-')}</td>
        <td>${renderSeverityBadge(item.severity)}</td>
        <td>${renderStatusBadge(item.status)}</td>
        <td>${fmtDate(item.date_occurred)}</td>
        <td>
          <div style="font-size:12px; font-weight:700; color:#475569;">${esc(item.source_type || '-')}</div>
          ${item.source_link ? `<a href="${esc(item.source_link)}" target="_blank" style="font-size:11px; color:#2563eb; text-decoration:none;">Buka sumber</a>` : '<span style="font-size:11px; color:#94a3b8;">-</span>'}
        </td>
        <td>
          <div style="font-size:13px; font-weight:700; color:#2563eb;">${item.updates?.length || 0}x</div>
          <div style="font-size:10px; color:#94a3b8;">${item.updates?.length ? fmtDateTime(item.updates[0].created_at) : '-'}</div>
        </td>
        <td style="white-space:nowrap;">
          <button class="btn-secondary btn-sm" style="margin-right:4px;" onclick="openIssueDetail('${item.id}')">Detail</button>
          <button class="btn-edit" style="margin-right:4px;" onclick="openIssueModal('${item.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteIssue('${item.id}', ${JSON.stringify('')})">Hapus</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.filterIssues = function () {
  const q = (document.getElementById('issueSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('issueStatusFilter')?.value || '';
  const category = document.getElementById('issueCategoryFilter')?.value || '';

  issuesFilteredData = issuesAllData.filter(item => {
    const haystack = [
      item.title,
      item.description,
      item.category,
      item.status,
      item.severity,
      item.source_type,
      ...(item.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();

    const matchQ = !q || haystack.includes(q);
    const matchS = !status || item.status === status;
    const matchC = !category || item.category === category;
    return matchQ && matchS && matchC;
  });

  renderIssueStats();
  renderIssueTable();
};

window.loadIssues = async function () {
  const client = window.client;
  if (!client) return;

  hideIssueMsg('issueMsg');

  const tbody = document.getElementById('issueTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:28px; color:#94a3b8;">Memuat data isu...</td>
      </tr>
    `;
  }

  const [{ data: issues, error: errIssues }, { data: updates, error: errUpdates }] = await Promise.all([
    client.from('issues').select('*').order('created_at', { ascending: false }),
    client.from('issue_updates').select('*').order('created_at', { ascending: false })
  ]);

  if (errIssues || errUpdates) {
    showIssueMsg(`Gagal memuat data: ${(errIssues || errUpdates).message}`, 'error', 'issueMsg');
    return;
  }

  const updateMap = {};
  (updates || []).forEach(u => {
    if (!updateMap[u.issue_id]) updateMap[u.issue_id] = [];
    updateMap[u.issue_id].push(u);
  });

  issuesAllData = (issues || []).map(item => ({
    ...item,
    updates: updateMap[item.id] || []
  }));

  populateIssueCategoryFilter();
  filterIssues();

  if (currentIssueDetailId) {
    const stillExists = issuesAllData.find(x => x.id === currentIssueDetailId);
    if (stillExists) renderIssueDetail();
  }
};

function resetIssueForm() {
  const setVal = (id, val = '') => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('issueF-id');
  setVal('issueF-title');
  setVal('issueF-description');
  setVal('issueF-category');
  setVal('issueF-severity', 'medium');
  setVal('issueF-status', 'active');
  setVal('issueF-date-occurred');
  setVal('issueF-source-type', 'MANUAL');
  setVal('issueF-source-link');
  setVal('issueF-tags');
  setVal('issueF-initial-update');

  hideIssueMsg('issueFormMsg');
  const title = document.getElementById('issueFormTitle');
  if (title) title.textContent = 'Tambah Isu';
}

window.openIssueModal = function (id = null) {
  resetIssueForm();

  const overlay = document.getElementById('issueFormOverlay');
  if (overlay) overlay.classList.remove('hidden');

  if (!id) return;

  const item = issuesAllData.find(x => x.id === id);
  if (!item) return;

  const setVal = (elId, val = '') => {
    const el = document.getElementById(elId);
    if (el) el.value = val ?? '';
  };

  const title = document.getElementById('issueFormTitle');
  if (title) title.textContent = 'Edit Isu';

  setVal('issueF-id', item.id);
  setVal('issueF-title', item.title);
  setVal('issueF-description', item.description);
  setVal('issueF-category', item.category);
  setVal('issueF-severity', item.severity || 'medium');
  setVal('issueF-status', item.status || 'active');
  setVal('issueF-date-occurred', item.date_occurred || '');
  setVal('issueF-source-type', item.source_type || 'MANUAL');
  setVal('issueF-source-link', item.source_link || '');
  setVal('issueF-tags', (item.tags || []).join(', '));
};

window.closeIssueModal = function () {
  const overlay = document.getElementById('issueFormOverlay');
  if (overlay) overlay.classList.add('hidden');
  resetIssueForm();
};

window.saveIssue = async function () {
  const client = window.client;
  if (!client) return;

  hideIssueMsg('issueFormMsg');

  const id = document.getElementById('issueF-id')?.value || '';
  const title = document.getElementById('issueF-title')?.value.trim();
  const description = document.getElementById('issueF-description')?.value.trim() || null;
  const category = document.getElementById('issueF-category')?.value.trim();
  const severity = document.getElementById('issueF-severity')?.value || 'medium';
  const status = document.getElementById('issueF-status')?.value || 'active';
  const dateOccurred = document.getElementById('issueF-date-occurred')?.value || null;
  const sourceType = document.getElementById('issueF-source-type')?.value || 'MANUAL';
  const sourceLink = document.getElementById('issueF-source-link')?.value.trim() || null;
  const tags = parseTextList(document.getElementById('issueF-tags')?.value || '');
  const initialUpdate = document.getElementById('issueF-initial-update')?.value.trim() || null;

  if (!title) {
    showIssueMsg('Judul isu wajib diisi.', 'error', 'issueFormMsg');
    return;
  }

  if (!category) {
    showIssueMsg('Kategori wajib diisi.', 'error', 'issueFormMsg');
    return;
  }

  const payload = {
    title,
    description,
    category,
    severity,
    status,
    location_id: null,
    date_occurred: dateOccurred,
    source_type: sourceType,
    source_link: sourceLink,
    tags,
    created_by: null
  };

  let savedId = id;

  if (id) {
    const { data, error } = await client
      .from('issues')
      .update(payload)
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      showIssueMsg(`Gagal update isu: ${error.message}`, 'error', 'issueFormMsg');
      return;
    }

    savedId = data.id;
  } else {
    const sourceHash = sourceLink || `${title}|${category}|${Date.now()}`;

    const { data, error } = await client
      .from('issues')
      .insert({
        ...payload,
        source_hash: sourceHash
      })
      .select('id')
      .single();

    if (error) {
      showIssueMsg(`Gagal simpan isu: ${error.message}`, 'error', 'issueFormMsg');
      return;
    }

    savedId = data.id;
  }

  if (initialUpdate) {
    const { error: updErr } = await client
      .from('issue_updates')
      .insert({
        issue_id: savedId,
        update_text: initialUpdate,
        evidence_urls: []
      });

    if (updErr) {
      showIssueMsg(`Isu tersimpan, tapi update awal gagal disimpan: ${updErr.message}`, 'error', 'issueFormMsg');
      await loadIssues();
      return;
    }
  }

  showIssueMsg('Data isu berhasil disimpan.', 'success', 'issueFormMsg');
  await loadIssues();

  setTimeout(() => {
    closeIssueModal();
  }, 700);
};

window.deleteIssue = async function (id) {
  if (!confirm('Hapus isu ini? Semua update terkait juga akan terhapus.')) return;

  const client = window.client;
  if (!client) return;

  const { error } = await client.from('issues').delete().eq('id', id);
  if (error) {
    showIssueMsg(`Gagal hapus isu: ${error.message}`, 'error', 'issueMsg');
    return;
  }

  if (currentIssueDetailId === id) closeIssueDetail();
  showIssueMsg('Isu berhasil dihapus.', 'success', 'issueMsg');
  await loadIssues();
};

function renderIssueDetail() {
  const issue = issuesAllData.find(x => x.id === currentIssueDetailId);
  if (!issue) return;

  const titleEl = document.getElementById('issueDetailTitle');
  const metaEl = document.getElementById('issueDetailMeta');
  const listEl = document.getElementById('issueDetailUpdates');

  if (titleEl) titleEl.textContent = issue.title;

  if (metaEl) {
    const tags = (issue.tags || []).length
      ? (issue.tags || []).map(tag =>
          `<span style="display:inline-flex;padding:2px 7px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:10px;font-weight:600;margin-right:4px;margin-top:4px;">${esc(tag)}</span>`
        ).join('')
      : '<span style="color:#94a3b8;">-</span>';

    metaEl.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        ${renderSeverityBadge(issue.severity)}
        ${renderStatusBadge(issue.status)}
        ${issueBadge(issue.category || '-', '#f8fafc', '#475569', '#e2e8f0')}
        ${issueBadge(issue.source_type || '-', '#eff6ff', '#1d4ed8', '#bfdbfe')}
      </div>
      <div style="font-size:12px; color:#64748b; line-height:1.7;">
        <div><strong style="color:#0f172a;">Tanggal kejadian:</strong> ${fmtDate(issue.date_occurred)}</div>
        <div><strong style="color:#0f172a;">Dibuat:</strong> ${fmtDateTime(issue.created_at)}</div>
        <div><strong style="color:#0f172a;">Deskripsi:</strong> ${esc(issue.description || '-')}</div>
        <div style="margin-top:4px;"><strong style="color:#0f172a;">Tags:</strong> ${tags}</div>
        ${issue.source_link ? `<div style="margin-top:4px;"><a href="${esc(issue.source_link)}" target="_blank" style="color:#2563eb; text-decoration:none;">Buka tautan sumber</a></div>` : ''}
      </div>
    `;
  }

  const updates = [...(issue.updates || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (listEl) {
    if (!updates.length) {
      listEl.innerHTML = `<div style="padding:16px; text-align:center; color:#94a3b8; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">Belum ada update.</div>`;
    } else {
      listEl.innerHTML = updates.map(u => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
          <div style="font-size:12px; color:#0f172a; line-height:1.6; margin-bottom:6px;">${esc(u.update_text)}</div>
          ${
            (u.evidence_urls || []).length
              ? `<div style="margin-bottom:6px;">${u.evidence_urls.map(url =>
                  `<a href="${esc(url)}" target="_blank" style="display:inline-block; font-size:11px; color:#2563eb; text-decoration:none; margin-right:8px; margin-bottom:4px;">Evidence</a>`
                ).join('')}</div>`
              : ''
          }
          <div style="font-size:11px; color:#94a3b8;">${fmtDateTime(u.created_at)}</div>
        </div>
      `).join('');
    }
  }
}

window.openIssueDetail = function (id) {
  currentIssueDetailId = id;
  hideIssueMsg('issueUpdateMsg');

  const overlay = document.getElementById('issueDetailOverlay');
  if (overlay) overlay.classList.remove('hidden');

  const txt = document.getElementById('issueUpdText');
  const ev = document.getElementById('issueUpdEvidence');
  if (txt) txt.value = '';
  if (ev) ev.value = '';

  renderIssueDetail();
};

window.closeIssueDetail = function () {
  currentIssueDetailId = null;
  const overlay = document.getElementById('issueDetailOverlay');
  if (overlay) overlay.classList.add('hidden');
  hideIssueMsg('issueUpdateMsg');
};

window.saveIssueUpdate = async function () {
  const client = window.client;
  if (!client || !currentIssueDetailId) return;

  hideIssueMsg('issueUpdateMsg');

  const updateText = document.getElementById('issueUpdText')?.value.trim();
  const evidenceUrls = parseTextList(document.getElementById('issueUpdEvidence')?.value || '');

  if (!updateText) {
    showIssueMsg('Catatan update wajib diisi.', 'error', 'issueUpdateMsg');
    return;
  }

  const { error } = await client
    .from('issue_updates')
    .insert({
      issue_id: currentIssueDetailId,
      update_text: updateText,
      evidence_urls: evidenceUrls
    });

  if (error) {
    showIssueMsg(`Gagal simpan update: ${error.message}`, 'error', 'issueUpdateMsg');
    return;
  }

  showIssueMsg('Update berhasil disimpan.', 'success', 'issueUpdateMsg');

  const txt = document.getElementById('issueUpdText');
  const ev = document.getElementById('issueUpdEvidence');
  if (txt) txt.value = '';
  if (ev) ev.value = '';

  await loadIssues();
  renderIssueDetail();
};

function patchIssueTab() {
  if (window.__issuesTabPatched) return;
  if (typeof window.switchTab !== 'function') return;

  const oldSwitchTab = window.switchTab;

  window.switchTab = function (tab) {
    oldSwitchTab(tab);

    if (tab === 'issues') {
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = 'Manajemen Isu';
      if (subtitle) subtitle.textContent = 'Pantau dan perbarui isu lapangan';
      loadIssues();
    }
  };

  window.__issuesTabPatched = true;
}

function bindIssueEvents() {
  const search = document.getElementById('issueSearchInput');
  const status = document.getElementById('issueStatusFilter');
  const category = document.getElementById('issueCategoryFilter');

  if (search && !search.dataset.bound) {
    search.addEventListener('input', filterIssues);
    search.dataset.bound = '1';
  }

  if (status && !status.dataset.bound) {
    status.addEventListener('change', filterIssues);
    status.dataset.bound = '1';
  }

  if (category && !category.dataset.bound) {
    category.addEventListener('change', filterIssues);
    category.dataset.bound = '1';
  }

  const formOverlay = document.getElementById('issueFormOverlay');
  if (formOverlay && !formOverlay.dataset.bound) {
    formOverlay.addEventListener('click', e => {
      if (e.target === formOverlay) closeIssueModal();
    });
    formOverlay.dataset.bound = '1';
  }

  const detailOverlay = document.getElementById('issueDetailOverlay');
  if (detailOverlay && !detailOverlay.dataset.bound) {
    detailOverlay.addEventListener('click', e => {
      if (e.target === detailOverlay) closeIssueDetail();
    });
    detailOverlay.dataset.bound = '1';
  }
}

(function initIssuesModule() {
  patchIssueTab();
  bindIssueEvents();

  const activeTab = document.querySelector('.nav-links li.active')?.dataset?.tab;
  if (activeTab === 'issues') loadIssues();
})();
