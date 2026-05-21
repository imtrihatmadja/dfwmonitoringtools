// =====================================================================
// beneficiary.js — Penerima Manfaat (Beneficiary Tracker)
// PMIS DFW Indonesia
// =====================================================================

// ── State ─────────────────────────────────────────────────────────────
let _benAllData      = [];   // semua beneficiary
let _benFilteredData = [];   // setelah search
let _benCurrentPage  = 1;
const BEN_PAGE_SIZE  = 20;

const SUPABASE_BATCH_SIZE = 1000;

async function fetchAllRows(queryBuilderFactory, batchSize = SUPABASE_BATCH_SIZE) {
  let from = 0;
  let all = [];
  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await queryBuilderFactory().range(from, to);
    if (error) throw error;
    const chunk = data || [];
    all = all.concat(chunk);
    if (chunk.length < batchSize) break;
    from += batchSize;
  }
  return all;
}


// ── Load utama ────────────────────────────────────────────────────────
window.loadBeneficiaries = async function () {
  const _client = window.client || client;
  showBenLoading(true);

  let benData = [], partData = [], projData = [], logData = [];
  try {
    [benData, partData, projData, logData] = await Promise.all([
      fetchAllRows(() => _client.from('beneficiaries').select('id, name, phone, gender, birth_year, location, occupation, email, note').order('id', { ascending: true })),
      fetchAllRows(() => _client.from('activity_participants').select('beneficiary_id, project_name, activity_name, attended_date').order('beneficiary_id', { ascending: true })),
      fetchAllRows(() => _client.from('beneficiary_projects').select('beneficiary_id, project_name').order('beneficiary_id', { ascending: true })),
      fetchAllRows(() => _client.from('beneficiary_activity_log').select('beneficiary_id, project_name, activity_name, attended_date, source').order('beneficiary_id', { ascending: true })),
    ]);
  } catch (loadErr) {
    const el = document.getElementById('benTableBody');
    if (el) el.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:#ef4444">
      ⚠️ Gagal memuat data: ${loadErr.message || loadErr}. Coba refresh halaman.
    </td></tr>`;
    return;
  }

  _benAllData        = benData  || [];
  const participants = partData || [];
  const benProjects  = projData || [];
  const actLogs      = logData  || [];

  // Map: beneficiary_id → log entries (aktivitas free text)
  window._benActLogMap = {};
  actLogs.forEach(l => {
    if (!window._benActLogMap[l.beneficiary_id]) window._benActLogMap[l.beneficiary_id] = [];
    window._benActLogMap[l.beneficiary_id].push(l);
  });

  // Map: beneficiary_id → Set<project_name>
  const projMapBen = {};
  benProjects.forEach(bp => {
    if (!projMapBen[bp.beneficiary_id]) projMapBen[bp.beneficiary_id] = new Set();
    projMapBen[bp.beneficiary_id].add(bp.project_name);
  });

  // Map: beneficiary_id → partisipasi kegiatan
  const partMap = {};
  participants.forEach(p => {
    if (!partMap[p.beneficiary_id]) partMap[p.beneficiary_id] = [];
    partMap[p.beneficiary_id].push(p);
  });

  // Gabungkan data
  _benAllData = _benAllData.map(b => {
    const fromProjTable = projMapBen[b.id] || new Set();
    const fromParts     = new Set((partMap[b.id] || []).map(p => p.project_name).filter(Boolean));
    const fromLogs      = new Set((window._benActLogMap[b.id] || []).map(l => l.project_name).filter(Boolean));
    const allProjects   = new Set([...fromProjTable, ...fromParts, ...fromLogs]);
    const linkedActs    = partMap[b.id] || [];
    const logActs       = window._benActLogMap[b.id] || [];
    return {
      ...b,
      projects      : [...allProjects],
      participations: linkedActs,
      activityLogs  : logActs,
      totalKegiatan : linkedActs.length + logActs.length,
      totalProyek   : allProjects.size,
    };
  });

  // Kumpulkan semua proyek unik dari data
  const allProjNames = [...new Set(
    _benAllData.flatMap(b => b.projects)
  )].filter(Boolean).sort();

  // Populate benProjectSelector (selector bar utama)
  const selMain = document.getElementById('benProjectSelector');
  if (selMain) {
    const curVal = selMain.value;
    selMain.innerHTML = '<option value="">📊 Semua Proyek</option>' +
      allProjNames.map(p => `<option value="${p}" ${p===curVal?'selected':''}>${p}</option>`).join('');
  }

  // Populate benFilterProject (filter di toolbar)
  const selFilter = document.getElementById('benFilterProject');
  if (selFilter) {
    const curF = selFilter.value;
    selFilter.innerHTML = '<option value="">Semua Proyek</option>' +
      allProjNames.map(p => `<option value="${p}" ${p===curF?'selected':''}>${p}</option>`).join('');
  }

  // Hitung & tampilkan stats (gunakan selektor aktif)
  const activeSel = selMain?.value || '';
  updateBenStats(activeSel);

  _benFilteredData = [..._benAllData];
  _benCurrentPage  = 1;
  renderBenTable();
  window.initBenModalStability && window.initBenModalStability();
  showBenLoading(false);
};

// Hitung ulang stat cards berdasarkan proyek yang dipilih
function updateBenStats(projectFilter) {
  const subset = projectFilter
    ? _benAllData.filter(b =>
        (b.projects || []).includes(projectFilter) ||
        (b.participations || []).some(p => p.project_name === projectFilter) ||
        (b.activityLogs || []).some(l => l.project_name === projectFilter)
      )
    : _benAllData;

  const linkedParts = projectFilter
    ? subset.flatMap(b => (b.participations || []).filter(p => p.project_name === projectFilter))
    : subset.flatMap(b => (b.participations || []));

  const freeLogs = projectFilter
    ? subset.flatMap(b => (b.activityLogs || []).filter(l => l.project_name === projectFilter))
    : subset.flatMap(b => (b.activityLogs || []));

  document.getElementById('benStatUnique').textContent   = subset.length.toLocaleString('id-ID');
  document.getElementById('benStatMale').textContent     = subset.filter(b=>b.gender==='Laki-laki').length.toLocaleString('id-ID');
  document.getElementById('benStatFemale').textContent   = subset.filter(b=>b.gender==='Perempuan').length.toLocaleString('id-ID');
  document.getElementById('benStatParticip').textContent = linkedParts.length.toLocaleString('id-ID');

  const logEl = document.getElementById('benStatFreeLog');
  if (logEl) logEl.textContent = freeLogs.length.toLocaleString('id-ID');

  const participLbl = document.getElementById('benStatParticipLabel');
  if (participLbl) participLbl.textContent = 'Total Partisipasi';
  const freeLbl = document.getElementById('benStatFreeLogLabel');
  if (freeLbl) freeLbl.textContent = 'Log Bebas';
  const lbl = document.getElementById('benStatUniqueLabel');
  if (lbl) lbl.textContent = projectFilter ? `Penerima — ${projectFilter.length > 25 ? projectFilter.slice(0,25)+'…' : projectFilter}` : 'Total Unik';
}

// Handler saat project selector bar berubah
window.onBenProjectSelectorChange = function (val) {
  // Update label
  const lbl = document.getElementById('benActiveProjectLabel');
  if (lbl) lbl.textContent = val || 'Semua Proyek';

  // Sync filter toolbar
  const selFilter = document.getElementById('benFilterProject');
  if (selFilter) selFilter.value = val;

  // Update stats
  updateBenStats(val);

  // Update tabel
  filterBeneficiaries();

  // Warna selector bar — biru jika proyek dipilih
  const bar = document.getElementById('benProjectSelectorBar');
  if (bar) {
    bar.style.background   = val ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fff';
    bar.style.borderColor  = val ? '#93c5fd' : '#e2e8f0';
  }
  const sel = document.getElementById('benProjectSelector');
  if (sel) {
    sel.style.background  = val ? '#dbeafe' : '#eff6ff';
    sel.style.borderColor = val ? '#1d4ed8' : '#2563eb';
  }
};

// ── Filter & Search ───────────────────────────────────────────────────
window.filterBeneficiaries = function () {
  const q       = (document.getElementById('benSearchInput')?.value || '').toLowerCase();
  const gender  = document.getElementById('benFilterGender')?.value || '';
  // Project filter: ambil dari toolbar ATAU dari selector bar (mana yang berisi)
  const project = document.getElementById('benFilterProject')?.value ||
                  document.getElementById('benProjectSelector')?.value || '';

  // Sync kedua selector agar konsisten
  const selFilter = document.getElementById('benFilterProject');
  const selMain   = document.getElementById('benProjectSelector');
  if (selFilter && selFilter.value !== project) selFilter.value = project;
  if (selMain   && selMain.value   !== project) {
    selMain.value = project;
    // Update label & warna selector bar
    const lbl = document.getElementById('benActiveProjectLabel');
    if (lbl) lbl.textContent = project || 'Semua Proyek';
    const bar = document.getElementById('benProjectSelectorBar');
    if (bar) {
      bar.style.background  = project ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fff';
      bar.style.borderColor = project ? '#93c5fd' : '#e2e8f0';
    }
  }

  // Update stat cards sesuai proyek
  if (typeof updateBenStats === 'function') updateBenStats(project);

  _benFilteredData = _benAllData.filter(b => {
    const matchQ = !q ||
      (b.name||'').toLowerCase().includes(q) ||
      (b.phone||'').toLowerCase().includes(q) ||
      (b.location||'').toLowerCase().includes(q) ||
      (b.occupation||'').toLowerCase().includes(q);
    const matchG = !gender || b.gender === gender;
    const matchP = !project ||
                   (b.projects || []).includes(project) ||
                   (b.participations || []).some(p => p.project_name === project) ||
                   (b.activityLogs || []).some(l => l.project_name === project);
    return matchQ && matchG && matchP;
  });
  _benCurrentPage = 1;
  renderBenTable();
};

// ── Render tabel ──────────────────────────────────────────────────────
function renderBenTable() {
  const tbody = document.getElementById('benTableBody');
  if (!tbody) return;
  const total = _benFilteredData.length;
  const start = (_benCurrentPage - 1) * BEN_PAGE_SIZE;
  const rows  = _benFilteredData.slice(start, start + BEN_PAGE_SIZE);

  document.getElementById('benCountLabel').textContent =
    `Menampilkan ${Math.min(start+1, total)}–${Math.min(start+BEN_PAGE_SIZE, total)} dari ${total} orang`;

  // Update charts dengan data yang sedang difilter
  const _activeProj = document.getElementById('benProjectSelector')?.value || '';
  if (typeof renderBenCharts === 'function') renderBenCharts(_benFilteredData, _activeProj);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8;">
      ${_benAllData.length ? '🔍 Tidak ada data yang cocok.' : '👤 Belum ada penerima manfaat. Tambah atau import dari Excel.'}</td></tr>`;
    renderBenPagination(0);
    return;
  }

  tbody.innerHTML = rows.map((b, i) => {
    const usia = b.birth_year ? (new Date().getFullYear() - b.birth_year) + ' th' : '-';
    const projs = (b.projects && b.projects.length) ? b.projects : [...new Set(b.participations.map(p => p.project_name))].filter(Boolean);
    const projLabel = projs.length
      ? projs.map(p => `<span style="background:#eff6ff;color:#2563eb;border-radius:4px;padding:1px 6px;font-size:10px;white-space:nowrap">${p}</span>`).join(' ')
      : '<span style="color:#94a3b8">-</span>';

    return `<tr>
      <td style="color:#94a3b8;font-size:12px">${start + i + 1}</td>
      <td>
        <div style="font-weight:600;font-size:13px;color:#0f172a">${_esc(b.name)}</div>
        ${b.phone ? `<div style="font-size:11px;color:#94a3b8">${_esc(b.phone)}</div>` : ''}
      </td>
      <td><span class="badge ${b.gender==='Laki-laki'?'badge-output':'badge-outcome'}" style="font-size:10px">${b.gender||'-'}</span></td>
      <td style="font-size:12px;color:#475569">${usia}</td>
      <td style="font-size:12px;color:#475569">${_esc(b.location||'-')}</td>
      <td style="font-size:12px;color:#475569">${_esc(b.occupation||'-')}</td>
      <td>
        <div style="font-size:12px;font-weight:700;color:#2563eb">${b.totalKegiatan}x</div>
        <div style="font-size:10px;color:#64748b">
          ${(b.participations || []).length} partisipasi · ${(b.activityLogs || []).length} log bebas
        </div>
        <div style="font-size:10px;color:#94a3b8">${b.totalProyek} proyek</div>
      </td>
      <td style="max-width:200px">${projLabel}</td>
      <td>
        <button class="btn-secondary btn-sm" style="margin-right:4px"
          onclick="openBenDetail('${b.id}')">Detail</button>
        <button class="btn-secondary btn-sm" style="margin-right:4px;color:#d97706;border-color:#fde68a"
          onclick="openEditBenModal('${b.id}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
        <button class="btn-danger btn-sm"
          onclick="deleteBeneficiary('${b.id}','${_esc(b.name).replace(/'/g,"\\\\'")}')">Hapus</button>
      </td>
    </tr>`;
  }).join('');

  renderBenPagination(total);
}

function renderBenPagination(total) {
  const container = document.getElementById('benPagination');
  if (!container) return;
  const totalPages = Math.ceil(total / BEN_PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = `<div style="display:flex;gap:6px;align-items:center;justify-content:center;margin-top:14px;flex-wrap:wrap">`;
  html += `<button class="btn-secondary btn-sm" ${_benCurrentPage===1?'disabled':''} onclick="_benGoPage(${_benCurrentPage-1})">‹ Prev</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - _benCurrentPage) <= 1) {
      html += `<button class="${p===_benCurrentPage?'btn-primary':'btn-secondary'} btn-sm" onclick="_benGoPage(${p})">${p}</button>`;
    } else if (Math.abs(p - _benCurrentPage) === 2) {
      html += `<span style="color:#94a3b8">…</span>`;
    }
  }
  html += `<button class="btn-secondary btn-sm" ${_benCurrentPage===totalPages?'disabled':''} onclick="_benGoPage(${_benCurrentPage+1})">Next ›</button>`;
  html += `</div>`;
  container.innerHTML = html;
}
window._benGoPage = function(p) { _benCurrentPage = p; renderBenTable(); };

// ── Helper ─────────────────────────────────────────────────────────────
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function showBenLoading(show) {
  const el = document.getElementById('benTableBody');
  if (el && show) el.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:#94a3b8">⏳ Memuat data...</td></tr>`;
}

function showBenFormMsg(msg, type) {
  let el = document.getElementById('benFormMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'benFormMsg';
    const body = document.querySelector('#benFormOverlay .modal-body');
    if (body) body.appendChild(el);
  }
  if (!el) return;
  el.textContent = msg;
  el.className = `form-msg ${type}`;
  el.classList.remove('hidden');
}

// ── Populate filter proyek ────────────────────────────────────────────
window.populateBenProjectFilter = async function () {
  const _client = window.client || client;
  const { data } = await _client.from('projects').select('name').order('name');
  const sel = document.getElementById('benFilterProject');
  if (!sel || !data) return;
  const active = (data || []).filter(p => !p.archived);
  sel.innerHTML = '<option value="">Semua Proyek</option>' +
    active.map(p => `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`).join('');
};

// ── Form Tambah Beneficiary ───────────────────────────────────────────

window.resetBenModalState = function () {
  const idsText = ['benF-name','benF-phone','benF-location','benF-occupation','benF-email','benF-note','benF-attend-note'];
  idsText.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['benF-gender','benF-birthyear','benF-project'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('benF-attended-date');
  if (dateEl) dateEl.value = '';
  const actSel = document.getElementById('benF-activity');
  if (actSel) {
    actSel.innerHTML = '<option value="">-- Pilih Kegiatan --</option>';
    actSel.disabled = true;
  }
  const msg = document.getElementById('benFormMsg');
  if (msg) {
    msg.className = 'form-msg hidden';
    msg.textContent = '';
  }
  const title = document.getElementById('benFormTitle');
  if (title && !document.getElementById('benFormId')?.value) title.textContent = 'Tambah Penerima Manfaat';
  const idField = document.getElementById('benFormId');
  if (idField) idField.value = '';
  const projSec = document.getElementById('benFormProjectSection');
  if (projSec) {
    projSec.style.display = '';
    projSec.dataset.editMode = 'false';
  }
  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Simpan';
  }
};

window.openAddBenModal = async function () {
  const _client = window.client || client;
  window.resetBenModalState();
  document.getElementById('benFormOverlay').classList.remove('hidden');
  document.getElementById('benFormTitle').textContent = 'Tambah Penerima Manfaat';

  const selProj = document.getElementById('benF-project');
  if (selProj) {
    selProj.disabled = true;
    selProj.innerHTML = '<option value="">Memuat proyek…</option>';
    try {
      const { data: projs, error } = await _client.from('projects').select('id,name').order('name');
      if (error) throw error;
      const activeProjs = (projs || []).filter(p => !p.archived);
      selProj.innerHTML = '<option value="">-- Pilih Proyek (opsional) --</option>' +
        activeProjs.map(p => `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`).join('');
    } catch (err) {
      selProj.innerHTML = '<option value="">-- Pilih Proyek --</option>';
    }
    selProj.disabled = false;
  }
};

window.loadActivitiesForBenForm = async function () {
  const _client  = window.client || client;
  const projName = document.getElementById('benF-project')?.value;
  const selAct   = document.getElementById('benF-activity');
  if (!selAct) return;

  if (!projName) {
    selAct.innerHTML = '<option value="">-- Pilih Kegiatan --</option>';
    selAct.disabled = true;
    return;
  }

  selAct.disabled = true;
  selAct.innerHTML = '<option value="">Memuat kegiatan…</option>';
  try {
    const { data: acts, error } = await _client
      .from('project_activities')
      .select('id,title')
      .eq('project_name', projName)
      .order('title', { ascending: true });

    if (error) throw error;

    if (!acts || !acts.length) {
      selAct.innerHTML = '<option value="">Belum ada kegiatan untuk proyek ini</option>';
      selAct.disabled = true;
      return;
    }

    selAct.innerHTML = '<option value="">-- Pilih Kegiatan (opsional) --</option>' +
      acts.map(a => `<option value="${a.id}" data-title="${_esc(a.title)}">${_esc(a.title)}</option>`).join('');
    selAct.disabled = false;
  } catch (err) {
    selAct.innerHTML = '<option value="">-- Gagal memuat kegiatan --</option>';
    selAct.disabled = false;
  }
};

window.closeBenModal = function () {
  document.getElementById('benFormOverlay').classList.add('hidden');
  window.resetBenModalState();
};


window.saveBeneficiary = async function () {
  const _client = window.client || client;
  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  const resetBtn = () => { if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = document.getElementById('benFormId')?.value ? 'Update' : 'Simpan'; } };
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Menyimpan…'; }

  try {
  const id    = document.getElementById('benFormId').value;
  const name  = document.getElementById('benF-name').value.trim();
  const phone = document.getElementById('benF-phone').value.trim();

  if (!name) {
    showBenFormMsg('Nama wajib diisi.', 'error');
    resetBtn();
    return;
  }

  const payload = {
    name,
    phone      : normalizeBenPhone(phone) || null,
    gender     : normGender(document.getElementById('benF-gender').value) || null,
    birth_year : parseInt(document.getElementById('benF-birthyear').value) || null,
    location   : document.getElementById('benF-location').value.trim() || null,
    occupation : document.getElementById('benF-occupation').value.trim() || null,
    email      : document.getElementById('benF-email').value.trim() || null,
    note       : document.getElementById('benF-note').value.trim() || null,
  };

  let benId = id;
  let error;

  if (id) {
    ({ error } = await _client.from('beneficiaries').update(payload).eq('id', id));
  } else {
    const existing = await findExistingBeneficiary(_client, payload);
    if (existing && canAutoMergeBeneficiary(existing, payload)) {
      benId = existing.id;
      const merged = mergeBeneficiaryPayload(existing, payload);
      ({ error } = await _client.from('beneficiaries').update(merged).eq('id', benId));
    } else {
      const { data: inserted, error: errIns } = await _client
        .from('beneficiaries')
        .insert(payload)
        .select('id').single();
      error = errIns;
      benId = inserted?.id;
    }
  }

  if (error) {
    showBenFormMsg(error.message, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = id ? 'Update' : 'Simpan'; }
    return;
  }

  const projName = document.getElementById('benF-project')?.value;
  const actSel   = document.getElementById('benF-activity');
  const actId    = actSel?.value;
  const actTitle = actSel?.options?.[actSel.selectedIndex]?.getAttribute('data-title');

  if (benId && projName) {
    const { data: projData } = await _client.from('projects').select('id').eq('name', projName).single();
    await _client.from('beneficiary_projects').upsert({
      beneficiary_id : benId,
      project_name   : projName,
      project_id     : projData?.id || null,
    }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });

    if (actId) {
      const attendedDate = document.getElementById('benF-attended-date')?.value || null;
      const attendNote   = document.getElementById('benF-attend-note')?.value.trim() || null;

      const { error: errPart } = await _client.from('activity_participants').upsert({
        activity_id    : actId,
        activity_name  : actTitle,
        project_name   : projName,
        project_id     : projData?.id || null,
        beneficiary_id : benId,
        attended_date  : attendedDate || null,
        note           : attendNote,
      }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });

      if (errPart) {
        showBenFormMsg('Data tersimpan, tapi gagal daftarkan ke kegiatan: ' + errPart.message, 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = id ? 'Update' : 'Simpan'; }
        setTimeout(() => { closeBenModal(); loadBeneficiaries(); }, 1500);
        return;
      }
    }
  }

  showBenFormMsg('✅ Tersimpan!', 'success');
  setTimeout(() => { closeBenModal(); loadBeneficiaries(); }, 800);
  } catch (fatalErr) {
    showBenFormMsg('Terjadi kesalahan: ' + (fatalErr.message || fatalErr), 'error');
    resetBtn();
  }
};


// ── Detail beneficiary + riwayat kegiatan ─────────────────────────────
window.openBenDetail = async function (id) {
  const _client = window.client || client;
  const ben = _benAllData.find(b => b.id === id);
  if (!ben) return;

  const overlay = document.getElementById('benDetailOverlay');
  overlay.classList.remove('hidden');

  document.getElementById('benDetailName').textContent = ben.name;
  document.getElementById('benDetailMeta').textContent =
    [ben.gender, ben.birth_year ? (new Date().getFullYear()-ben.birth_year)+' tahun' : null,
     ben.location, ben.occupation].filter(Boolean).join(' · ');

  const renderHistory = (parts, logs) => {
    const linked = (parts || []).map(p => ({ ...p, _type: 'linked' }));
    const free   = (logs  || []).map(l => ({ ...l, _type: 'log' }));
    const list   = [...linked, ...free].sort((a,b) => {
      if (!a.attended_date && !b.attended_date) return 0;
      if (!a.attended_date) return 1;
      if (!b.attended_date) return -1;
      return String(b.attended_date).localeCompare(String(a.attended_date));
    });

    const allProjects = new Set(list.map(p => p.project_name).filter(Boolean));
    document.getElementById('benDetailStats').innerHTML = `
      <span style="background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
        ${list.length}x kegiatan
      </span>
      <span style="background:#f0fdf4;color:#15803d;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
        ${(parts||[]).length} partisipasi
      </span>
      <span style="background:#fffbeb;color:#92400e;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
        📝 ${(logs||[]).length} log bebas
      </span>
      <span style="background:#f8fafc;color:#475569;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
        ${allProjects.size} proyek
      </span>`;

    if (!list.length) {
      document.getElementById('benDetailHistory').innerHTML =
        '<div style="padding:16px;color:#94a3b8;font-size:13px">Belum ada riwayat kegiatan.</div>';
      return;
    }

    const byProj = {};
    list.forEach(p => {
      const proj = p.project_name || 'Tanpa Proyek';
      if (!byProj[proj]) byProj[proj] = [];
      byProj[proj].push(p);
    });

    document.getElementById('benDetailHistory').innerHTML = Object.entries(byProj).map(([proj, items]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #f1f5f9">
          📁 ${_esc(proj)} <span style="color:#94a3b8;font-weight:400">(${items.length} kegiatan)</span>
        </div>
        ${items.map(it => `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 10px;border-radius:6px;background:${it._type==='log'?'#fffbeb':'#f8fafc'};margin-bottom:6px;border:1px solid ${it._type==='log'?'#fde68a':'#e2e8f0'}">
            <div>
              <div style="font-size:12px;font-weight:600;color:#334155">
                ${_esc(it.activity_name||'-')}
                ${it._type==='log' ? '<span style="font-size:10px;background:#fef9c3;color:#92400e;border-radius:3px;padding:1px 5px;margin-left:4px">log bebas</span>' : '<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:1px 5px;margin-left:4px">partisipasi</span>'}
              </div>
              ${it.note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${_esc(it.note)}</div>` : ''}
              ${it.source ? `<div style="font-size:10px;color:#a16207;margin-top:2px">sumber: ${_esc(it.source)}</div>` : ''}
            </div>
            <div style="font-size:11px;color:#94a3b8;white-space:nowrap;margin-left:8px">
              ${it.attended_date ? new Date(it.attended_date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-'}
            </div>
          </div>`).join('')}
      </div>`).join('');
  };

  renderHistory(ben.participations || [], ben.activityLogs || []);

  try {
    const [{ data: parts }, { data: logs }] = await Promise.all([
      _client.from('activity_participants')
        .select('activity_name, project_name, attended_date, note')
        .eq('beneficiary_id', id)
        .order('attended_date', { ascending: false }),
      _client.from('beneficiary_activity_log')
        .select('activity_name, project_name, attended_date, source, note')
        .eq('beneficiary_id', id)
        .order('attended_date', { ascending: false }),
    ]);
    renderHistory(parts || [], logs || []);
  } catch (err) {
  }
};
window.closeBenDetail = function () {
  document.getElementById('benDetailOverlay').classList.add('hidden');
};

// ── Delete beneficiary ────────────────────────────────────────────────
window.deleteBeneficiary = async function (id, name) {
  if (!confirm(`Hapus "${name}" dari daftar penerima manfaat?\nRiwayat kegiatan orang ini juga akan terhapus.`)) return;
  const _client = window.client || client;
  const { error } = await _client.from('beneficiaries').delete().eq('id', id);
  if (error) { alert('Gagal hapus: ' + error.message); return; }
  loadBeneficiaries();
};

// ── Import dari Excel ─────────────────────────────────────────────────
// ── Import dari Excel ─────────────────────────────────────────────────
window.openBenImport = function () {
  document.getElementById('benImportOverlay').classList.remove('hidden');
  document.getElementById('benImportFileInput').value = '';
  document.getElementById('benImportPreview').innerHTML = '';
  document.getElementById('benImportMsg').className = 'form-msg hidden';
  document.getElementById('benImportConfirmBtn').classList.add('hidden');
  document.getElementById('benImportConfirmBtn').disabled = false;
  document.getElementById('benImportConfirmBtn').innerHTML = '<i class="fa-solid fa-upload"></i> Import Sekarang';
  window._benImportRows = null;
};
window.closeBenImport = function () {
  document.getElementById('benImportOverlay').classList.add('hidden');
};

// ── Flat column mapping ───────────────────────────────────────────────
const FLAT_COL_MAP = {
  project_name  : ['project','proyek','nama proyek','project name','nama_proyek','project_name'],
  activity_name : ['aktivitas','kegiatan','activity','nama kegiatan','event','nama_kegiatan','activity_name'],
  name          : ['name','nama','nama lengkap','full name','nama_lengkap','full_name'],
  phone         : ['handphone','hp','no hp','no_hp','telepon','phone','nomor_hp'],
  gender        : ['jenis kelamin','gender','kelamin','jenis_kelamin','sex'],
  location      : ['asal','lokasi','desa','alamat','location','domisili','kecamatan','asal/lokasi'],
  occupation    : ['pekerjaan','occupation','profesi','job'],
  birth_year    : ['tahun lahir','birth_year','thn_lahir','tahun_lahir','lahir'],
  email         : ['email','e_mail','surel'],
  note          : ['catatan','note','keterangan'],
  attended_date : ['tanggal','tanggal hadir','event date','date','attended_date','tanggal_hadir'],
};

function resolveFlatField(row, aliases) {
  for (const a of aliases) if (row[a] !== undefined && String(row[a]).trim() !== '') return String(row[a]).trim();
  return '';
}
function mapFlatRow(row) {
  const r = {};
  Object.keys(FLAT_COL_MAP).forEach(f => { r[f] = resolveFlatField(row, FLAT_COL_MAP[f]); });
  return r;
}
function normGender(v) {
  if (!v) return null;
  const vl = String(v).toLowerCase();
  if (vl.startsWith('l') || vl === 'm' || vl.includes('laki')) return 'Laki-laki';
  if (vl.startsWith('p') || vl === 'f' || vl.includes('perempuan') || vl.includes('wanita')) return 'Perempuan';
  return String(v).trim();
}

// ── Dedup helpers — identitas bertingkat ─────────────────────────────
function normalizeBenText(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function normalizeBenName(v) {
  return normalizeBenText(v);
}
function normalizeBenLocation(v) {
  return normalizeBenText(v).replace(/[.,\/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizeBenPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}
function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function cleanNullable(v) {
  const s = String(v || '').trim();
  return s ? s : null;
}
function getBeneficiaryIdentityParts(r) {
  return {
    name     : normalizeBenName(r?.name),
    phone    : normalizeBenPhone(r?.phone),
    location : normalizeBenLocation(r?.location),
  };
}
function getBeneficiaryUniqueKey(r) {
  const { name, phone, location } = getBeneficiaryIdentityParts(r);
  if (name && phone && location) return `npl:${name}|${phone}|${location}`;
  if (name && phone)             return `np:${name}|${phone}`;
  if (name && location)          return `nl:${name}|${location}`;
  if (name)                      return `n:${name}`;
  return 'unknown';
}
function canAutoMergeBeneficiary(existing, incoming) {
  const ex  = getBeneficiaryIdentityParts(existing);
  const inc = getBeneficiaryIdentityParts(incoming);
  if (!ex.name || !inc.name || ex.name !== inc.name) return false;
  if (ex.phone && inc.phone && ex.location && inc.location)
    return ex.phone === inc.phone && ex.location === inc.location;
  if (ex.phone && inc.phone)    return ex.phone === inc.phone;
  if (ex.location && inc.location) return ex.location === inc.location;
  return false;
}
function mergeBeneficiaryPayload(existing, incoming) {
  return {
    name       : cleanNullable(incoming?.name)       || cleanNullable(existing?.name),
    phone      : normalizeBenPhone(incoming?.phone)  || normalizeBenPhone(existing?.phone),
    gender     : normGender(incoming?.gender)        || existing?.gender || null,
    birth_year : safeInt(incoming?.birth_year)       || safeInt(existing?.birth_year),
    location   : cleanNullable(incoming?.location)   || cleanNullable(existing?.location),
    occupation : cleanNullable(incoming?.occupation) || cleanNullable(existing?.occupation),
    email      : cleanNullable(incoming?.email)      || cleanNullable(existing?.email),
    note       : cleanNullable(incoming?.note)       || cleanNullable(existing?.note),
  };
}
async function findExistingBeneficiary(client, row) {
  const name = cleanNullable(row?.name);
  if (!name) return null;
  const { phone, location } = getBeneficiaryIdentityParts(row);
  const { data, error } = await client
    .from('beneficiaries')
    .select('id, name, phone, gender, birth_year, location, occupation, email, note')
    .ilike('name', name);
  if (error || !data?.length) return null;
  const norm = normalizeBenName(name);
  return (
    data.find(item => {
      const ex = getBeneficiaryIdentityParts(item);
      return ex.name === norm && phone && ex.phone === phone && location && ex.location === location;
    }) ||
    data.find(item => {
      const ex = getBeneficiaryIdentityParts(item);
      return ex.name === norm && phone && ex.phone === phone;
    }) ||
    data.find(item => {
      const ex = getBeneficiaryIdentityParts(item);
      return ex.name === norm && location && ex.location === location;
    }) ||
    null
  );
}

// ── parseDate + normalizeRow ──────────────────────────────────────────
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  if (/^\d{4,5}$/.test(s)) {
    const d = new Date(Math.round((parseInt(s) - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  return null;
}
function normalizeRow(r) {
  const n = {};
  Object.keys(r).forEach(k => { n[k.toLowerCase().trim().replace(/\s+/g,' ')] = String(r[k]||'').trim(); });
  return n;
}

// ── handleBenImportFile ───────────────────────────────────────────────
window.handleBenImportFile = function (input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array', raw: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const rows = raw.map(r => mapFlatRow(normalizeRow(r))).filter(r => cleanNullable(r.name));
      window._benImportRows = rows;
      previewBenImport(rows);
    } catch(err) {
      showBenImportMsg('\u274c Gagal baca file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── previewBenImport ──────────────────────────────────────────────────
function previewBenImport(rows) {
  const area = document.getElementById('benImportPreview');
  if (!area) return;
  if (!rows?.length) {
    area.innerHTML = '<div style="color:#ef4444;font-size:13px">Tidak ada data valid. Pastikan kolom Nama terisi.</div>';
    document.getElementById('benImportConfirmBtn')?.classList.add('hidden');
    return;
  }

  const uniquePeople   = new Set(rows.map(r => getBeneficiaryUniqueKey(r))).size;
  const uniqueProjects = new Set(rows.map(r => r.project_name).filter(Boolean)).size;
  const uniqueActs     = new Set(rows.map(r => `${r.project_name}|${r.activity_name}`).filter(r => r.activity_name)).size;

  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  area.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 12px;font-size:12px;color:#1d4ed8;font-weight:600">${uniquePeople} orang unik</div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:6px 12px;font-size:12px;color:#15803d;font-weight:600">${uniqueProjects} proyek</div>
      <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:6px;padding:6px 12px;font-size:12px;color:#7e22ce;font-weight:600">${uniqueActs} kegiatan</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:12px;color:#475569;font-weight:600">${rows.length} total baris</div>
    </div>
    <div class="table-wrap" style="max-height:220px;overflow-y:auto">
      <table style="font-size:11px">
        <thead><tr>
          <th>#</th><th>Proyek</th><th>Aktivitas</th><th>Nama</th>
          <th>Gender</th><th>Asal</th><th>HP</th><th>Pekerjaan</th><th>Tanggal</th>
        </tr></thead>
        <tbody>
          ${rows.map((r,i) => `<tr>
            <td style="color:#94a3b8">${i+1}</td>
            <td style="color:#2563eb;font-size:10px;font-weight:600">${esc(r.project_name||'-')}</td>
            <td style="font-size:10px">${esc(r.activity_name||'-')}</td>
            <td style="font-weight:600">${esc(r.name)}</td>
            <td>${r.gender ? normGender(r.gender) : '-'}</td>
            <td style="font-size:10px">${esc(r.location||'-')}</td>
            <td style="font-size:10px">${esc(r.phone||'-')}</td>
            <td style="font-size:10px">${esc(r.occupation||'-')}</td>
            <td style="font-size:10px;color:#64748b">${r.attended_date ? (parseDate(r.attended_date)||r.attended_date) : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  showBenImportMsg(`${rows.length} baris siap diimport, ${uniquePeople} penerima manfaat unik terdeteksi.`, 'success');

  const btn = document.getElementById('benImportConfirmBtn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> Import Sekarang';
    btn.onclick = window.runBenImport;
  }
}

// ── runBenImport ──────────────────────────────────────────────────────
window.runBenImport = async function () {
  const rows = window._benImportRows;
  if (!rows?.length) return;

  const btn = document.getElementById('benImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengimport...'; }

  const _client = window.client || client;
  let processed = 0;
  const total   = rows.length;
  const updateProgress = () => { if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengimport ${processed}/${total}`; };
  updateProgress();

  const [{ data: allProjs }, { data: allActs }] = await Promise.all([
    _client.from('projects').select('id, name'),
    _client.from('project_activities').select('id, title, project_name'),
  ]);

  const projMap = {};
  (allProjs||[]).forEach(p => { projMap[String(p.name||'').toLowerCase()] = p.id; });

  const actMap = {};
  (allActs||[]).forEach(a => {
    const key = `${String(a.project_name||'').toLowerCase()}|${String(a.title||'').toLowerCase()}`;
    actMap[key] = a;
  });

  let okBen = 0, okPart = 0, skipPart = 0, logPart = 0;
  const benIdCache = {};

  for (const r of rows) {
    const normalizedRow = {
      name       : cleanNullable(r.name),
      phone      : normalizeBenPhone(r.phone),
      gender     : normGender(r.gender) || null,
      birth_year : safeInt(r.birth_year),
      location   : cleanNullable(r.location),
      occupation : cleanNullable(r.occupation),
      email      : cleanNullable(r.email),
      note       : cleanNullable(r.note),
    };

    const cacheKey = getBeneficiaryUniqueKey(normalizedRow);
    let benId = benIdCache[cacheKey];

    if (!benId) {
      const existing = await findExistingBeneficiary(_client, normalizedRow);

      if (existing && canAutoMergeBeneficiary(existing, normalizedRow)) {
        benId = existing.id;
        const merged = mergeBeneficiaryPayload(existing, normalizedRow);
        const { error: errUpd } = await _client.from('beneficiaries').update(merged).eq('id', benId);
        if (errUpd) { skipPart++; processed++; updateProgress(); continue; }
        okBen++;
      } else {
        const { data: inserted, error: errBen } = await _client
          .from('beneficiaries').insert(normalizedRow).select('id').single();
        if (errBen || !inserted) { skipPart++; processed++; updateProgress(); continue; }
        benId = inserted.id;
        okBen++;
      }
      benIdCache[cacheKey] = benId;
    }

    if (benId && r.project_name) {
      await _client.from('beneficiary_projects').upsert({
        beneficiary_id : benId,
        project_name   : r.project_name,
        project_id     : projMap[String(r.project_name||'').toLowerCase()] || null,
      }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
    }

    if (benId && r.activity_name) {
      const projId  = projMap[String(r.project_name||'').toLowerCase()] || null;
      const actKey  = `${String(r.project_name||'').toLowerCase()}|${String(r.activity_name||'').toLowerCase()}`;
      const act     = actMap[actKey];

      if (act) {
        const { error: errPart } = await _client.from('activity_participants').upsert({
          activity_id    : act.id,
          activity_name  : act.title,
          project_name   : r.project_name || null,
          project_id     : projId,
          beneficiary_id : benId,
          attended_date  : parseDate(r.attended_date) || null,
          note           : cleanNullable(r.note),
        }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });
        if (!errPart) okPart++; else skipPart++;
      } else {
        const { error: errLog } = await _client.from('beneficiary_activity_log').upsert({
          beneficiary_id : benId,
          project_name   : r.project_name || null,
          project_id     : projId,
          activity_name  : r.activity_name,
          attended_date  : parseDate(r.attended_date) || null,
          source         : 'import',
          note           : cleanNullable(r.note),
        }, { onConflict: 'beneficiary_id,project_name,activity_name', ignoreDuplicates: true });
        if (!errLog) { okPart++; logPart++; } else skipPart++;
      }
    }

    processed++;
    updateProgress();
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> Import Sekarang';
    btn.onclick   = window.runBenImport;
  }

  const uniqueBen = Object.keys(benIdCache).length;
  let msg = `${uniqueBen} penerima manfaat diproses`;
  if (okPart)   msg += `, ${okPart} data aktivitas terekam`;
  if (logPart)  msg += ` (${logPart} sebagai log bebas)`;
  if (skipPart) msg += `, ${skipPart} gagal`;
  showBenImportMsg(msg + '.', 'success');

  if (logPart) {
    const area = document.getElementById('benImportPreview');
    if (area) area.innerHTML += `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;font-size:11px;color:#92400e;margin-top:8px">
        <strong>${logPart} kegiatan tersimpan sebagai catatan bebas</strong><br>
        Nama aktivitas tidak cocok dengan sistem, namun kehadiran tetap direkam di log.
        Data ini tetap terlihat di halaman detail penerima manfaat.
      </div>`;
  }

  setTimeout(() => { closeBenImport(); loadBeneficiaries(); }, logPart ? 2000 : 1500);
};

// ── checkBenDuplicates — alias ke runBenImport (dedup otomatis) ───────
window.checkBenDuplicates = function () { return window.runBenImport(); };

function showBenImportMsg(msg, type) {
  const el = document.getElementById('benImportMsg');
  el.textContent = msg; el.className = `form-msg ${type}`; el.classList.remove('hidden');
}


// ── Download template beneficiary ─────────────────────────────────────
window.downloadBenTemplate = function () {
  const wb = XLSX.utils.book_new();

  // Satu sheet flat — Project | Aktivitas | Nama | ...
  const headers = [
    'Project', 'Aktivitas', 'Nama*', 'Jenis Kelamin',
    'Asal', 'Handphone', 'Pekerjaan', 'Tahun Lahir', 'Tanggal Hadir', 'Catatan'
  ];
  const examples = [
    ['Project ATLI FIP x DFW Indonesia','Pelatihan Pengawas Perikanan','Ahmad Fauzi','Laki-laki','Bali / Jembrana','081234567890','Nelayan','1985','2026-03-15',''],
    ['Project ATLI FIP x DFW Indonesia','Pelatihan Pengawas Perikanan','Siti Rahma','Perempuan','Sulawesi Utara / Manado','082345678901','Pengolah Ikan','1990','2026-03-15',''],
    ['Project ATLI FIP x DFW Indonesia','Workshop Rekrutmen Adil','Ahmad Fauzi','Laki-laki','Bali / Jembrana','081234567890','Nelayan','1985','2026-04-10','Hadir penuh'],
    ['Project ATLI FIP x DFW Indonesia','Workshop Rekrutmen Adil','Budi Santoso','Laki-laki','Kalimantan Timur / Balikpapan','083456789012','Nelayan','1978','2026-04-10',''],
    ['Project ATLI FIP x DFW Indonesia','Sosialisasi C188','Laode Hardiani','Laki-laki','Bali / Jembrana','084567890123','Nelayan','1982','2026-05-01',''],
    ['ENABLe Project - DFW Indonesia','Sosialisasi Hak Pekerja','Siti Rahma','Perempuan','Sulawesi Utara / Manado','082345678901','Pengolah Ikan','1990','2026-05-05',''],
  ];

  const wsData = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [35,30,25,15,25,15,18,12,14,20].map(w=>({wch:w}));

  // Freeze row pertama (header)
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Penerima Manfaat');
  XLSX.writeFile(wb, 'Template_PenerimManfaat_PMIS_DFW.xlsx');
};

// ── Tambah peserta ke kegiatan (dari modal aktivitas) ─────────────────
window.openAddParticipantModal = async function (activityId, activityName, projectName) {
  const _client = window.client || client;
  const overlay = document.getElementById('benPickerOverlay');
  overlay.classList.remove('hidden');
  overlay.dataset.actId   = activityId;
  overlay.dataset.actName = activityName;
  overlay.dataset.projName= projectName;
  document.getElementById('benPickerTitle').textContent = `Tambah Peserta: ${activityName}`;
  document.getElementById('benPickerSearch').value = '';
  document.getElementById('benPickerMsg').className = 'form-msg hidden';

  // Load existing participants
  const { data: existing } = await _client
    .from('activity_participants')
    .select('beneficiary_id')
    .eq('activity_id', activityId);
  const existingIds = new Set((existing||[]).map(e => e.beneficiary_id));

  // Load all beneficiaries
  const bens = await fetchAllRows(() => _client.from('beneficiaries').select('id,name,phone,gender,location').order('id', { ascending: true }));
  window._benPickerAll  = bens || [];
  window._benPickerExisting = existingIds;
  renderBenPicker('');
};
window.closeBenPicker = function () {
  document.getElementById('benPickerOverlay').classList.add('hidden');
};

window.renderBenPicker = function (q) {
  const lower = (q||'').toLowerCase();
  const all   = window._benPickerAll || [];
  const list  = !q ? all : all.filter(b =>
    (b.name||'').toLowerCase().includes(lower) || (b.phone||'').includes(lower) ||
    (b.location||'').toLowerCase().includes(lower)
  );
  const container = document.getElementById('benPickerList');
  const badge     = document.getElementById('benPickerCountBadge');

  const alreadyCount = list.filter(b => window._benPickerExisting?.has(b.id)).length;
  if (badge) badge.textContent = `${list.length} orang${alreadyCount ? ' · ' + alreadyCount + ' sudah hadir' : ''}`;

  if (!all.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">
      👤 Belum ada penerima manfaat.<br>
      <button class="btn-primary btn-sm" style="margin-top:8px" onclick="closeBenPicker();openAddBenModal()">
        + Tambah Dulu
      </button>
    </div>`;
    return;
  }
  if (!list.length) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">
      🔍 Tidak ditemukan. <span style="color:#2563eb;cursor:pointer" onclick="document.getElementById('benPickerSearch').value='';renderBenPicker('')">Reset</span>
    </div>`;
    return;
  }

  container.innerHTML = list.map(b => {
    const already = window._benPickerExisting?.has(b.id);
    const meta    = [b.phone, b.location].filter(Boolean).join(' · ');
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;margin-bottom:3px;background:${already?'#f0fdf4':'#f8fafc'};border:1px solid ${already?'#bbf7d0':'#f1f5f9'}">
      <div style="min-width:0">
        <div style="font-weight:600;font-size:12px;color:#0f172a">${_esc(b.name)}</div>
        ${meta ? `<div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(meta)}</div>` : ''}
      </div>
      <div style="margin-left:8px;flex-shrink:0">
        ${already
          ? `<span style="font-size:11px;color:#15803d;font-weight:600;white-space:nowrap">✓ Sudah hadir</span>`
          : `<button class="btn-primary btn-sm" onclick="addParticipant('${b.id}','${_esc(b.name).replace(/'/g,"\\'")}')">+ Tambah</button>`}
      </div>
    </div>`;
  }).join('');
};

window.addParticipant = async function (benId, benName) {
  const _client  = window.client || client;
  const overlay  = document.getElementById('benPickerOverlay');
  const actId    = overlay.dataset.actId;
  const actName  = overlay.dataset.actName;
  const projName = overlay.dataset.projName;

  // Cari project_id
  const { data: projData } = await _client.from('projects').select('id').eq('name', projName).single();

  const { error } = await _client.from('activity_participants').upsert({
    activity_id   : actId,
    activity_name : actName,
    project_name  : projName,
    project_id    : projData?.id || null,
    beneficiary_id: benId,
    attended_date : new Date().toISOString().split('T')[0],
  }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });

  if (error && !error.message.includes('unique') && !error.message.includes('duplicate')) {
    alert('Gagal tambah: ' + error.message); return;
  }

  // Catat relasi beneficiary ↔ proyek agar filter proyek bekerja
  if (projName) {
    await _client.from('beneficiary_projects').upsert({
      beneficiary_id: benId,
      project_name  : projName,
      project_id    : projData?.id || null,
    }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
  }

  window._benPickerExisting?.add(benId);
  renderBenPicker(document.getElementById('benPickerSearch')?.value || '');

  // Update badge jumlah peserta di card aktivitas
  if (typeof refreshParticipantBadge === 'function') refreshParticipantBadge(actId);
  if (typeof window.refreshParticipantBadge === 'function') window.refreshParticipantBadge(actId);
};

// ══════════════════════════════════════════════════════════════
// CHART DASHBOARD — Penerima Manfaat
// ══════════════════════════════════════════════════════════════

// Palet warna konsisten
const BEN_CHART_COLORS = [
  '#2563eb','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#ea580c','#65a30d','#0284c7',
  '#6366f1','#14b8a6','#f59e0b','#ef4444','#8b5cf6',
];

let _benChartOcc     = null;
let _benChartOccBar  = null;
let _benChartGender  = null;
let _benChartsVisible = true;

// Toggle tampilkan/sembunyikan charts
window.toggleBenCharts = function () {
  _benChartsVisible = !_benChartsVisible;
  const container = document.getElementById('benChartsContainer');
  const icon      = document.getElementById('benChartToggleIcon');
  const btn       = document.getElementById('benChartToggleBtn');
  if (container) container.style.display = _benChartsVisible ? 'grid' : 'none';
  if (icon) icon.className = _benChartsVisible ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
  if (btn)  btn.innerHTML  = `<i class="${icon?.className}"></i> ${_benChartsVisible ? 'Sembunyikan' : 'Tampilkan'}`;
};

// Update semua chart berdasarkan dataset yang sedang ditampilkan
window.renderBenCharts = function (data, projectFilter) {
  if (!window.Chart) return;
  if (!data || !data.length) {
    ['benChartOccupation','benChartOccupationBar','benChartGenderOccupation'].forEach(id => {
      const ctx = document.getElementById(id);
      if (ctx) ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height);
    });
    return;
  }

  // Update badge proyek aktif
  const badge = document.getElementById('benChartProjectBadge');
  if (badge) {
    badge.textContent    = projectFilter || '';
    badge.style.display  = projectFilter ? 'inline' : 'none';
  }

  // ── Hitung distribusi pekerjaan ──────────────────────────────
  const occMap = {};
  data.forEach(b => {
    const occ = (b.occupation || 'Tidak Diketahui').trim();
    occMap[occ] = (occMap[occ] || 0) + 1;
  });

  // Sort desc, gabungkan yang < 2% jadi "Lainnya"
  const total    = data.length;
  const sorted   = Object.entries(occMap).sort((a,b) => b[1]-a[1]);
  const mainOccs = [], otherCount = { label:'Lainnya', count:0 };
  sorted.forEach(([label,count]) => {
    if (count / total < 0.02 && sorted.length > 6) {
      otherCount.count += count;
    } else {
      mainOccs.push({ label, count });
    }
  });
  if (otherCount.count > 0) mainOccs.push({ label: otherCount.label, count: otherCount.count });

  const occLabels = mainOccs.map(o => o.label);
  const occCounts = mainOccs.map(o => o.count);
  const occColors = BEN_CHART_COLORS.slice(0, occLabels.length);

  // ── Chart 1: Donut ───────────────────────────────────────────
  const ctx1 = document.getElementById('benChartOccupation');
  if (ctx1) {
    if (_benChartOcc) _benChartOcc.destroy();
    _benChartOcc = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels  : occLabels,
        datasets: [{ data: occCounts, backgroundColor: occColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: { font: { size: 11 }, padding: 10, boxWidth: 12,
              generateLabels: (chart) => {
                const ds = chart.data.datasets[0];
                return chart.data.labels.map((label, i) => ({
                  text        : `${label} (${ds.data[i]}, ${Math.round(ds.data[i]/total*100)}%)`,
                  fillStyle   : ds.backgroundColor[i],
                  strokeStyle : ds.backgroundColor[i],
                  hidden      : false, index: i,
                }));
              }
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} orang (${Math.round(ctx.raw/total*100)}%)`
            }
          }
        }
      }
    });
  }

  // ── Chart 2: Bar Horizontal ──────────────────────────────────
  const ctx2 = document.getElementById('benChartOccupationBar');
  if (ctx2) {
    if (_benChartOccBar) _benChartOccBar.destroy();
    _benChartOccBar = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels  : occLabels,
        datasets: [{
          label          : 'Jumlah',
          data           : occCounts,
          backgroundColor: occColors.map(c => c + 'cc'),
          borderColor    : occColors,
          borderWidth    : 1,
          borderRadius   : 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.raw} orang (${Math.round(ctx.raw/total*100)}%)`
            }
          }
        },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, stepSize: 1 } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  // ── Chart 3: Stacked Bar Gender per Pekerjaan ────────────────
  const ctx3 = document.getElementById('benChartGenderOccupation');
  if (ctx3) {
    const genderMap = {};
    data.forEach(b => {
      const occ = (b.occupation || 'Tidak Diketahui').trim();
      if (!genderMap[occ]) genderMap[occ] = { 'Laki-laki': 0, 'Perempuan': 0, 'Lainnya': 0 };
      const g = b.gender === 'Laki-laki' ? 'Laki-laki'
              : b.gender === 'Perempuan' ? 'Perempuan' : 'Lainnya';
      genderMap[occ][g]++;
    });

    // Urutkan sesuai occLabels (konsisten dengan chart 1 & 2)
    const gLabels = occLabels.filter(l => genderMap[l]);
    const maleData   = gLabels.map(l => genderMap[l]?.['Laki-laki'] || 0);
    const femaleData = gLabels.map(l => genderMap[l]?.['Perempuan'] || 0);
    const otherData  = gLabels.map(l => genderMap[l]?.['Lainnya']   || 0);

    if (_benChartGender) _benChartGender.destroy();
    _benChartGender = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels  : gLabels,
        datasets: [
          { label:'Laki-laki', data: maleData,   backgroundColor:'#2563ebcc', borderColor:'#2563eb', borderWidth:1, borderRadius:3 },
          { label:'Perempuan', data: femaleData,  backgroundColor:'#db2777cc', borderColor:'#db2777', borderWidth:1, borderRadius:3 },
          ...(otherData.some(v=>v>0) ? [{ label:'Lainnya', data: otherData, backgroundColor:'#94a3b8cc', borderColor:'#94a3b8', borderWidth:1, borderRadius:3 }] : []),
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, padding: 12, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, stepSize: 1 } }
        }
      }
    });
  }
};

// ══════════════════════════════════════════════════════════════
// EXPORT EXCEL — Penerima Manfaat
// ══════════════════════════════════════════════════════════════
window.exportBenToExcel = async function () {
  const _client   = window.client || client;
  const projFilter = document.getElementById('benProjectSelector')?.value || '';

  // Tampilkan loading di tombol
  const btn = document.getElementById('benExportBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting…'; }

  try {
    // Load data lengkap dari DB (termasuk activity log)
    const [bens, parts, logs] = await Promise.all([
      fetchAllRows(() => _client.from('beneficiaries').select('*').order('id', { ascending: true })),
      fetchAllRows(() => _client.from('activity_participants').select('beneficiary_id,project_name,activity_name,attended_date,note').order('beneficiary_id', { ascending: true })),
      fetchAllRows(() => _client.from('beneficiary_activity_log').select('beneficiary_id,project_name,activity_name,attended_date,note,source').order('beneficiary_id', { ascending: true })),
    ]);

    // Filter per proyek jika ada
    let benList = bens || [];
    if (projFilter) {
      const { data: bp } = await _client.from('beneficiary_projects')
        .select('beneficiary_id').eq('project_name', projFilter);
      const bpIds = new Set((bp||[]).map(r=>r.beneficiary_id));
      benList = benList.filter(b => bpIds.has(b.id));
    }

    const partMap = {};
    (parts||[]).forEach(p => { if(!partMap[p.beneficiary_id]) partMap[p.beneficiary_id]=[]; partMap[p.beneficiary_id].push(p); });
    const logMap = {};
    (logs||[]).forEach(l => { if(!logMap[l.beneficiary_id]) logMap[l.beneficiary_id]=[]; logMap[l.beneficiary_id].push(l); });

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Master Penerima Manfaat ──────────────────────
    const headers1 = ['No','Nama','No HP','Jenis Kelamin','Tahun Lahir','Usia',
                       'Lokasi/Asal','Pekerjaan','Email','Total Kegiatan','Proyek','Catatan'];
    const now = new Date().getFullYear();
    const rows1 = benList.map((b, i) => {
      const allParts = [...(partMap[b.id]||[]), ...(logMap[b.id]||[])];
      const projs    = [...new Set(allParts.map(p=>p.project_name).filter(Boolean))].join(', ');
      return [
        i+1, b.name, b.phone||'', b.gender||'', b.birth_year||'',
        b.birth_year ? now - b.birth_year : '',
        b.location||'', b.occupation||'', b.email||'',
        allParts.length, projs, b.note||''
      ];
    });
    const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...rows1]);
    ws1['!cols'] = [5,25,15,14,12,8,25,18,25,14,40,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws1, 'Penerima Manfaat');

    // ── Sheet 2: Riwayat Kegiatan (flat) ──────────────────────
    const headers2 = ['No','Nama','No HP','Proyek','Kegiatan','Tanggal Hadir','Sumber','Catatan'];
    const rows2 = [];
    let no2 = 1;
    benList.forEach(b => {
      const allParts = [
        ...(partMap[b.id]||[]).map(p=>({...p,_src:'Sistem'})),
        ...(logMap[b.id] ||[]).map(l=>({...l,_src:'Log Bebas'})),
      ].sort((a,c) => (b.attended_date||'').localeCompare(c.attended_date||''));
      allParts.forEach(p => {
        rows2.push([no2++, b.name, b.phone||'', p.project_name||'', p.activity_name||'',
          p.attended_date ? new Date(p.attended_date).toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'}) : '',
          p._src, p.note||'']);
      });
    });
    if (rows2.length) {
      const ws2 = XLSX.utils.aoa_to_sheet([headers2, ...rows2]);
      ws2['!cols'] = [5,25,15,35,35,14,12,25].map(w=>({wch:w}));
      XLSX.utils.book_append_sheet(wb, ws2, 'Riwayat Kegiatan');
    }

    // ── Sheet 3: Statistik ringkas ─────────────────────────────
    const totalL   = benList.filter(b=>b.gender==='Laki-laki').length;
    const totalP   = benList.filter(b=>b.gender==='Perempuan').length;
    const occMap   = {};
    benList.forEach(b => { const o=b.occupation||'Tidak Diketahui'; occMap[o]=(occMap[o]||0)+1; });
    const occRows  = Object.entries(occMap).sort((a,c)=>c[1]-a[1])
                       .map(([occ,cnt])=>[occ, cnt, `${Math.round(cnt/benList.length*100)}%`]);

    const statsData = [
      ['RINGKASAN PENERIMA MANFAAT'],
      projFilter ? ['Proyek', projFilter] : ['Scope', 'Semua Proyek'],
      ['Tanggal Export', new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})],
      [],
      ['Total Penerima Manfaat Unik', benList.length],
      ['Laki-laki', totalL, totalL ? `${Math.round(totalL/benList.length*100)}%` : ''],
      ['Perempuan',  totalP, totalP ? `${Math.round(totalP/benList.length*100)}%` : ''],
      [],
      ['DISTRIBUSI PEKERJAAN','Jumlah','Persentase'],
      ...occRows,
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(statsData);
    ws3['!cols'] = [{wch:35},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Statistik');

    const fname = projFilter
      ? `PenerimManfaat_${projFilter.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)}_${new Date().toISOString().slice(0,10)}.xlsx`
      : `PenerimManfaat_SemuaProyek_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fname);

  } catch(err) {
    alert('Gagal export: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-export"></i> Export Excel'; }
  }
};

// ══════════════════════════════════════════════════════════════
// EDIT PENERIMA MANFAAT — openEditBenModal
// ══════════════════════════════════════════════════════════════
window.openEditBenModal = async function (id) {
  const b = _benAllData.find(x => x.id === id);
  if (!b) return;

  window.resetBenModalState();
  document.getElementById('benFormOverlay').classList.remove('hidden');
  document.getElementById('benFormTitle').textContent = 'Edit Penerima Manfaat';
  document.getElementById('benFormId').value = id;

  document.getElementById('benF-name').value       = b.name || '';
  document.getElementById('benF-phone').value      = b.phone || '';
  document.getElementById('benF-gender').value     = b.gender || '';
  document.getElementById('benF-birthyear').value  = b.birth_year || '';
  document.getElementById('benF-location').value   = b.location || '';
  document.getElementById('benF-occupation').value = b.occupation || '';
  document.getElementById('benF-email').value      = b.email || '';
  document.getElementById('benF-note').value       = b.note || '';

  const projSec = document.getElementById('benFormProjectSection');
  if (projSec) {
    projSec.style.display = 'none';
    projSec.dataset.editMode = 'true';
  }
  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  if (saveBtn) saveBtn.innerHTML = 'Update';
};


window.initBenModalStability = function () {
  const overlay = document.getElementById('benFormOverlay');
  if (overlay && !overlay.dataset.boundClose) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) window.closeBenModal();
    });
    overlay.dataset.boundClose = 'true';
  }
};