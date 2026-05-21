// =====================================================================
// beneficiary.js — Penerima Manfaat (Beneficiary Tracker)
// PMIS DFW Indonesia
// Revisi: Dedup identitas bertingkat (name+phone+loc / name+phone /
//         name+loc / name-only=no-merge), angka Partisipasi dan
//         Log Bebas dipisah di semua tampilan & export.
// =====================================================================

// ── State ─────────────────────────────────────────────────────────────
let _benAllData      = [];   // semua beneficiary
let _benFilteredData = [];   // setelah search
let _benCurrentPage  = 1;
const BEN_PAGE_SIZE  = 20;

// ── Load utama ────────────────────────────────────────────────────────
window.loadBeneficiaries = async function () {
  const _client = window.client || client;
  showBenLoading(true);

  const [
    { data: benData },
    { data: partData },
    { data: projData },
    { data: logData },
  ] = await Promise.all([
    _client.from('beneficiaries').select('id, name, phone, gender, birth_year, location, occupation, email, note'),
    _client.from('activity_participants').select('beneficiary_id, project_name, activity_name, attended_date'),
    _client.from('beneficiary_projects').select('beneficiary_id, project_name'),
    _client.from('beneficiary_activity_log').select('beneficiary_id, project_name, activity_name, attended_date, source'),
  ]);

  _benAllData        = benData  || [];
  const participants = partData || [];
  const benProjects  = projData || [];
  const actLogs      = logData  || [];

  window._benActLogMap = {};
  actLogs.forEach(l => {
    if (!window._benActLogMap[l.beneficiary_id]) window._benActLogMap[l.beneficiary_id] = [];
    window._benActLogMap[l.beneficiary_id].push(l);
  });

  const projMapBen = {};
  benProjects.forEach(bp => {
    if (!projMapBen[bp.beneficiary_id]) projMapBen[bp.beneficiary_id] = new Set();
    projMapBen[bp.beneficiary_id].add(bp.project_name);
  });

  const partMap = {};
  participants.forEach(p => {
    if (!partMap[p.beneficiary_id]) partMap[p.beneficiary_id] = [];
    partMap[p.beneficiary_id].push(p);
  });

  _benAllData = _benAllData.map(b => {
    const fromProjTable = projMapBen[b.id] || new Set();
    const fromParts     = new Set((partMap[b.id] || []).map(p => p.project_name).filter(Boolean));
    const fromLogs      = new Set((window._benActLogMap[b.id] || []).map(l => l.project_name).filter(Boolean));
    const allProjects   = new Set([...fromProjTable, ...fromParts, ...fromLogs]);
    const linkedActs    = partMap[b.id] || [];
    const logActs       = window._benActLogMap[b.id] || [];
    return {
      ...b,
      projects        : [...allProjects],
      participations  : linkedActs,
      activityLogs    : logActs,
      totalPartisipasi: linkedActs.length,
      totalFreeLog    : logActs.length,
      totalProyek     : allProjects.size,
    };
  });

  const allProjNames = [...new Set(_benAllData.flatMap(b => b.projects))].filter(Boolean).sort();

  const selMain = document.getElementById('benProjectSelector');
  if (selMain) {
    const curVal = selMain.value;
    selMain.innerHTML = '<option value="">📊 Semua Proyek</option>' +
      allProjNames.map(p => `<option value="${p}" ${p===curVal?'selected':''}>${p}</option>`).join('');
  }

  const selFilter = document.getElementById('benFilterProject');
  if (selFilter) {
    const curF = selFilter.value;
    selFilter.innerHTML = '<option value="">Semua Proyek</option>' +
      allProjNames.map(p => `<option value="${p}" ${p===curF?'selected':''}>${p}</option>`).join('');
  }

  const activeSel = selMain?.value || '';
  updateBenStats(activeSel);

  _benFilteredData = [..._benAllData];
  _benCurrentPage  = 1;
  renderBenTable();
  window.initBenModalStability && window.initBenModalStability();
  showBenLoading(false);
};

function updateBenStats(projectFilter) {
  const subset = projectFilter
    ? _benAllData.filter(b => (b.projects||[]).includes(projectFilter))
    : _benAllData;

  const officialParts = projectFilter
    ? subset.flatMap(b => (b.participations||[]).filter(p => p.project_name === projectFilter))
    : subset.flatMap(b => b.participations || []);

  const freeLogs = projectFilter
    ? subset.flatMap(b => (b.activityLogs||[]).filter(l => l.project_name === projectFilter))
    : subset.flatMap(b => b.activityLogs || []);

  document.getElementById('benStatUnique').textContent   = subset.length.toLocaleString('id-ID');
  document.getElementById('benStatMale').textContent     = subset.filter(b=>b.gender==='Laki-laki').length.toLocaleString('id-ID');
  document.getElementById('benStatFemale').textContent   = subset.filter(b=>b.gender==='Perempuan').length.toLocaleString('id-ID');
  document.getElementById('benStatParticip').textContent = officialParts.length.toLocaleString('id-ID');

  const elFreeLog = document.getElementById('benStatFreeLog');
  if (elFreeLog) elFreeLog.textContent = freeLogs.length.toLocaleString('id-ID');
  const elFreeLogLbl = document.getElementById('benStatFreeLogLabel');
  if (elFreeLogLbl) elFreeLogLbl.textContent = 'Log Bebas';

  const participLbl = document.getElementById('benStatParticipLabel');
  if (participLbl) participLbl.textContent = 'Total Partisipasi';
  const lbl = document.getElementById('benStatUniqueLabel');
  if (lbl) lbl.textContent = projectFilter
    ? `Penerima — ${projectFilter.length > 25 ? projectFilter.slice(0,25)+'…' : projectFilter}`
    : 'Penerima Manfaat Unik';
}

window.onBenProjectSelectorChange = function (val) {
  const lbl = document.getElementById('benActiveProjectLabel');
  if (lbl) lbl.textContent = val || 'Semua Proyek';

  const selFilter = document.getElementById('benFilterProject');
  if (selFilter) selFilter.value = val;

  updateBenStats(val);
  filterBeneficiaries();

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

window.filterBeneficiaries = function () {
  const q       = (document.getElementById('benSearchInput')?.value || '').toLowerCase();
  const gender  = document.getElementById('benFilterGender')?.value || '';
  const project = document.getElementById('benFilterProject')?.value ||
                  document.getElementById('benProjectSelector')?.value || '';

  const selFilter = document.getElementById('benFilterProject');
  const selMain   = document.getElementById('benProjectSelector');
  if (selFilter && selFilter.value !== project) selFilter.value = project;
  if (selMain   && selMain.value   !== project) {
    selMain.value = project;
    const lbl = document.getElementById('benActiveProjectLabel');
    if (lbl) lbl.textContent = project || 'Semua Proyek';
    const bar = document.getElementById('benProjectSelectorBar');
    if (bar) {
      bar.style.background  = project ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fff';
      bar.style.borderColor = project ? '#93c5fd' : '#e2e8f0';
    }
  }

  if (typeof updateBenStats === 'function') updateBenStats(project);

  _benFilteredData = _benAllData.filter(b => {
    const matchQ = !q ||
      (b.name||'').toLowerCase().includes(q) ||
      (b.phone||'').toLowerCase().includes(q) ||
      (b.location||'').toLowerCase().includes(q) ||
      (b.occupation||'').toLowerCase().includes(q);
    const matchG = !gender || b.gender === gender;
    const matchP = !project || (b.projects || []).includes(project) ||
                   b.participations.some(p => p.project_name === project);
    return matchQ && matchG && matchP;
  });
  _benCurrentPage = 1;
  renderBenTable();
};

function renderBenTable() {
  const tbody = document.getElementById('benTableBody');
  if (!tbody) return;
  const total = _benFilteredData.length;
  const start = (_benCurrentPage - 1) * BEN_PAGE_SIZE;
  const rows  = _benFilteredData.slice(start, start + BEN_PAGE_SIZE);

  document.getElementById('benCountLabel').textContent =
    `Menampilkan ${Math.min(start+1, total)}–${Math.min(start+BEN_PAGE_SIZE, total)} dari ${total} orang`;

  if (typeof window.renderBenCharts === 'function') {
    const project = document.getElementById('benProjectSelector')?.value || '';
    window.renderBenCharts(_benFilteredData, project);
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#94a3b8;font-size:13px">
      ${_benAllData.length ? '🔍 Tidak ada data sesuai filter.' : '👤 Belum ada penerima manfaat. Klik "+ Tambah" untuk memulai.'}
    </td></tr>`;
    renderBenPagination(total);
    return;
  }

  tbody.innerHTML = rows.map((b, idx) => {
    const age    = b.birth_year ? new Date().getFullYear() - b.birth_year : null;
    const projBadges = (b.projects||[]).slice(0,2).map(p =>
      `<span style="background:#eff6ff;color:#2563eb;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:600;margin-right:2px">${_esc(p)}</span>`
    ).join('') + ((b.projects||[]).length > 2 ? `<span style="color:#94a3b8;font-size:10px">+${b.projects.length-2}</span>` : '');

    return `<tr style="cursor:pointer" onclick="openBenDetail('${b.id}')">
      <td style="color:#94a3b8;font-size:12px">${start+idx+1}</td>
      <td>
        <div style="font-weight:600;font-size:13px;color:#0f172a">${_esc(b.name)}</div>
        ${b.email ? `<div style="font-size:11px;color:#94a3b8">${_esc(b.email)}</div>` : ''}
      </td>
      <td>
        <span style="background:${b.gender==='Laki-laki'?'#eff6ff':'#fdf4ff'};color:${b.gender==='Laki-laki'?'#2563eb':'#7e22ce'};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">
          ${b.gender||'-'}
        </span>
      </td>
      <td style="font-size:12px;color:#475569">${age ? age+' th' : (b.birth_year||'-')}</td>
      <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(b.location||'-')}</td>
      <td style="font-size:12px;color:#475569">${_esc(b.occupation||'-')}</td>
      <td>
        <div style="font-size:12px;font-weight:600;color:#2563eb">${b.totalPartisipasi}x partisipasi</div>
        <div style="font-size:10px;color:#94a3b8">${b.totalProyek} proyek</div>
        ${b.totalFreeLog > 0 ? `<div style="font-size:10px;background:#fffbeb;color:#92400e;border-radius:3px;padding:1px 5px;display:inline-block;margin-top:2px">+${b.totalFreeLog} log bebas</div>` : ''}
      </td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn-sm btn-primary" onclick="openEditBenModal('${b.id}')" title="Edit" style="margin-right:3px">✏️</button>
        <button class="btn-sm" onclick="deleteBeneficiary('${b.id}','${_esc(b.name).replace(/'/g,"\\'")}')" title="Hapus"
          style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  renderBenPagination(total);
}

function renderBenPagination(total) {
  const pag = document.getElementById('benPagination');
  if (!pag) return;
  const totalPages = Math.ceil(total / BEN_PAGE_SIZE);
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';
  if (_benCurrentPage > 1) html += `<button class="btn-sm" onclick="benGoPage(${_benCurrentPage-1})">‹ Prev</button>`;

  const start = Math.max(1, _benCurrentPage - 2);
  const end   = Math.min(totalPages, _benCurrentPage + 2);
  if (start > 1) html += `<button class="btn-sm" onclick="benGoPage(1)">1</button>${start>2?'<span style="padding:0 4px;color:#94a3b8">…</span>':''}`;
  for (let i = start; i <= end; i++) {
    html += `<button class="btn-sm${i===_benCurrentPage?' btn-primary':''}" onclick="benGoPage(${i})">${i}</button>`;
  }
  if (end < totalPages) html += `${end<totalPages-1?'<span style="padding:0 4px;color:#94a3b8">…</span>':''}<button class="btn-sm" onclick="benGoPage(${totalPages})">${totalPages}</button>`;
  if (_benCurrentPage < totalPages) html += `<button class="btn-sm" onclick="benGoPage(${_benCurrentPage+1})">Next ›</button>`;

  pag.innerHTML = html;
}

window.benGoPage = function (page) {
  _benCurrentPage = page;
  renderBenTable();
  document.getElementById('benTableWrap')?.scrollIntoView({ behavior:'smooth', block:'start' });
};

function showBenLoading(show) {
  const el = document.getElementById('benLoadingIndicator');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function _esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Delete ────────────────────────────────────────────────────────────
window.deleteBeneficiary = async function (id, name) {
  if (!confirm(`Hapus "${name}" dari daftar penerima manfaat?\n\nData riwayat kegiatan yang terkait juga akan terhapus.`)) return;
  const _client = window.client || client;
  await Promise.all([
    _client.from('activity_participants').delete().eq('beneficiary_id', id),
    _client.from('beneficiary_projects').delete().eq('beneficiary_id', id),
    _client.from('beneficiary_activity_log').delete().eq('beneficiary_id', id),
  ]);
  const { error } = await _client.from('beneficiaries').delete().eq('id', id);
  if (error) { alert('Gagal hapus: ' + error.message); return; }
  loadBeneficiaries();
};

// ── Reset form modal ──────────────────────────────────────────────────
window.resetBenModalState = function () {
  ['benF-name','benF-phone','benF-location','benF-occupation','benF-email','benF-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const genderEl = document.getElementById('benF-gender');
  if (genderEl) genderEl.value = '';
  const yearEl = document.getElementById('benF-birthyear');
  if (yearEl) yearEl.value = '';
  const projEl = document.getElementById('benF-project');
  if (projEl) projEl.value = '';
  const noteEl = document.getElementById('benF-attend-note');
  if (noteEl) noteEl.value = '';
  const dateEl = document.getElementById('benF-attended-date');
  if (dateEl) dateEl.value = '';
  const actSel = document.getElementById('benF-activity');
  if (actSel) {
    actSel.innerHTML = '<option value="">-- Pilih Kegiatan --</option>';
    actSel.disabled = true;
  }
  const msg = document.getElementById('benFormMsg');
  if (msg) { msg.className = 'form-msg hidden'; msg.textContent = ''; }
  const title = document.getElementById('benFormTitle');
  if (title && !document.getElementById('benFormId')?.value) title.textContent = 'Tambah Penerima Manfaat';
  const idField = document.getElementById('benFormId');
  if (idField) idField.value = '';
  const projSec = document.getElementById('benFormProjectSection');
  if (projSec) { projSec.style.display = ''; projSec.dataset.editMode = 'false'; }
  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = 'Simpan'; }
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
    const { data: projs, error } = await _client.from('projects').select('id,name').eq('archived', false).order('name');
    if (error) {
      selProj.innerHTML = '<option value="">Gagal memuat proyek</option>';
      showBenFormMsg('Gagal memuat daftar proyek. Silakan tutup dan coba lagi.', 'error');
    } else {
      selProj.innerHTML = '<option value="">-- Pilih Proyek (opsional) --</option>' +
        (projs||[]).map(p => `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`).join('');
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
  const { data: acts, error } = await _client
    .from('project_activities')
    .select('id,title')
    .eq('project_name', projName)
    .order('created_at', { ascending: true });

  if (error) {
    selAct.innerHTML = '<option value="">Gagal memuat kegiatan</option>';
    showBenFormMsg('Gagal memuat kegiatan proyek.', 'error');
    return;
  }

  if (!acts || !acts.length) {
    selAct.innerHTML = '<option value="">Belum ada kegiatan untuk proyek ini</option>';
    selAct.disabled = true;
    return;
  }

  selAct.innerHTML = '<option value="">-- Pilih Kegiatan (opsional) --</option>' +
    acts.map(a => `<option value="${a.id}" data-title="${_esc(a.title)}">${_esc(a.title)}</option>`).join('');
  selAct.disabled = false;
};

window.closeBenModal = function () {
  document.getElementById('benFormOverlay').classList.add('hidden');
  window.resetBenModalState();
};

window.saveBeneficiary = async function () {
  const _client = window.client || client;
  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Menyimpan…'; }
  const id   = document.getElementById('benFormId').value;
  const name = document.getElementById('benF-name').value.trim();
  const phone= document.getElementById('benF-phone').value.trim();
  if (!name) {
    showBenFormMsg('Nama wajib diisi.', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = id ? 'Update' : 'Simpan'; }
    return;
  }

  const payload = {
    name,
    phone      : normalizeBenPhone(phone) || null,
    gender     : document.getElementById('benF-gender').value || null,
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
    if (existing) {
      benId = existing.id;
      const merged = mergeBeneficiaryPayload(existing, payload);
      ({ error } = await _client.from('beneficiaries').update(merged).eq('id', benId));
    } else {
      const { data: inserted, error: errIns } = await _client
        .from('beneficiaries').insert(payload).select('id').single();
      error = errIns;
      benId = inserted?.id;
    }
  }

  if (error) {
    showBenFormMsg('❌ ' + error.message, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = id ? 'Update' : 'Simpan'; }
    return;
  }

  const projName = document.getElementById('benF-project')?.value;
  const actSel   = document.getElementById('benF-activity');
  const actId    = actSel?.value;
  const actTitle = actSel?.options[actSel.selectedIndex]?.getAttribute('data-title');

  if (benId && projName) {
    const { data: projData } = await _client.from('projects').select('id').eq('name', projName).single();
    await _client.from('beneficiary_projects').upsert({
      beneficiary_id: benId,
      project_name : projName,
      project_id   : projData?.id || null,
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
        setTimeout(() => { closeBenModal(); loadBeneficiaries(); }, 1500);
        return;
      }
    }
  }

  showBenFormMsg('✅ Tersimpan!', 'success');
  setTimeout(() => { closeBenModal(); loadBeneficiaries(); }, 800);
};

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

  const linked = (parts||[]).map(p => ({ ...p, _type: 'linked' }));
  const free   = (logs ||[]).map(l => ({ ...l, _type: 'log'    }));
  const list   = [...linked, ...free].sort((a,b) => {
    if (!a.attended_date) return 1;
    if (!b.attended_date) return -1;
    return b.attended_date.localeCompare(a.attended_date);
  });

  const allProjects = new Set(list.map(p=>p.project_name).filter(Boolean));
  document.getElementById('benDetailStats').innerHTML = `
    <span style="background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
      ${linked.length}x partisipasi resmi
    </span>
    <span style="background:#f0fdf4;color:#15803d;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
      ${allProjects.size} proyek
    </span>
    ${free.length ? `<span style="background:#fffbeb;color:#92400e;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
      📝 ${free.length} log bebas
    </span>` : ''}`;

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
        <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f8fafc">
          <span style="font-size:16px;flex-shrink:0">${it._type==='linked' ? '✅' : '📝'}</span>
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:600;color:#0f172a">${_esc(it.activity_name||'Kegiatan tidak diketahui')}</div>
            <div style="font-size:11px;color:#94a3b8">
              ${it.attended_date ? new Date(it.attended_date).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : 'Tanggal tidak diketahui'}
              ${it._type==='log' ? ' · <span style="color:#92400e;font-weight:600">log bebas</span>' : ''}
              ${it.source ? ` · ${_esc(it.source)}` : ''}
            </div>
            ${it.note ? `<div style="font-size:11px;color:#64748b;font-style:italic;margin-top:2px">${_esc(it.note)}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>`).join('');
};

window.closeBenDetail = function () {
  document.getElementById('benDetailOverlay').classList.add('hidden');
};

function showBenFormMsg(msg, type) {
  const el = document.getElementById('benFormMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = `form-msg ${type}`;
  el.classList.remove('hidden');
}

// ── Normalisasi gender ─────────────────────────────────────────────────
function normGender(v) {
  if (!v) return '';
  const vl = v.toLowerCase();
  if (vl.startsWith('l') || vl === 'm' || vl.includes('laki')) return 'Laki-laki';
  if (vl.startsWith('p') || vl === 'f' || vl.includes('perempuan') || vl.includes('wanita')) return 'Perempuan';
  return v;
}

// ── Normalisasi teks & telepon ─────────────────────────────────────
function normalizeBenText(v) {
  return String(v || '').trim().toLowerCase();
}
function normalizeBenPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

// ── Identitas unik bertingkat (FINAL FORMULA) ──────────────────────
// Prioritas 1: name + phone + location
// Prioritas 2: name + phone
// Prioritas 3: name + location
// Jika hanya name → LOW-CONFIDENCE, jangan auto-merge
function getBeneficiaryUniqueKey(r) {
  const name  = normalizeBenText(r?.name);
  const phone = normalizeBenPhone(r?.phone);
  const loc   = normalizeBenText(r?.location);
  if (!name) return 'unknown|unverified';
  if (phone && loc)  return `${name}|${phone}|${loc}`;
  if (phone && !loc) return `${name}|${phone}|no-loc`;
  if (!phone && loc) return `${name}|no-phone|${loc}`;
  const uid = r?.id ? String(r.id) : Math.random().toString(36).slice(2);
  return `${name}|name-only|${uid}`;
}

function isSameBeneficiary(existing, incoming) {
  const exName  = normalizeBenText(existing?.name);
  const exPhone = normalizeBenPhone(existing?.phone);
  const exLoc   = normalizeBenText(existing?.location);
  const inName  = normalizeBenText(incoming?.name);
  const inPhone = normalizeBenPhone(incoming?.phone);
  const inLoc   = normalizeBenText(incoming?.location);
  if (!exName || !inName || exName !== inName) return false;
  if (inPhone && inLoc)  return exPhone === inPhone && exLoc === inLoc;
  if (inPhone && !inLoc) return exPhone === inPhone;
  if (!inPhone && inLoc) return exLoc === inLoc;
  return false;
}

function mergeBeneficiaryPayload(existing, incoming) {
  const incomingBirthYear = incoming?.birth_year ? parseInt(incoming.birth_year, 10) : null;
  const existingBirthYear = existing?.birth_year ? parseInt(existing.birth_year, 10) : null;
  return {
    name      : String(incoming?.name || '').trim() || existing?.name || null,
    phone     : normalizeBenPhone(incoming?.phone) || existing?.phone || null,
    gender    : normGender(incoming?.gender || '') || existing?.gender || null,
    birth_year: Number.isFinite(incomingBirthYear) ? incomingBirthYear : existingBirthYear,
    location  : String(incoming?.location || '').trim() || existing?.location || null,
    occupation: String(incoming?.occupation || '').trim() || existing?.occupation || null,
    email     : String(incoming?.email || '').trim() || existing?.email || null,
    note      : String(incoming?.note || '').trim() || existing?.note || null,
  };
}

async function findExistingBeneficiary(client, row) {
  const name  = String(row?.name || '').trim();
  const phone = normalizeBenPhone(row?.phone);
  const loc   = normalizeBenText(row?.location);
  if (!name) return null;
  if (!phone && !loc) return null;

  const { data, error } = await client
    .from('beneficiaries')
    .select('id, name, phone, gender, birth_year, location, occupation, email, note')
    .ilike('name', name);
  if (error || !data?.length) return null;
  return data.find(item => isSameBeneficiary(item, row)) || null;
}

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
  Object.keys(r).forEach(k => { n[k.toLowerCase().trim().replace(/\s+/g,'_')] = String(r[k]||'').trim(); });
  return n;
}

window.handleBenImportFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array', raw: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const rows = raw.map(r => mapFlatRow(normalizeRow(r))).filter(r => r.name);
      window._benImportRows = rows;
      previewBenImport(rows);
    } catch(err) {
      showBenImportMsg('❌ Gagal baca file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

function previewBenImport(rows) {
  const area = document.getElementById('benImportPreview');
  if (!rows.length) {
    area.innerHTML = '<div style="color:#ef4444;font-size:13px">Tidak ada data valid. Pastikan kolom Nama terisi.</div>';
    return;
  }
  const uniquePeople   = new Set(rows.map(r => getBeneficiaryUniqueKey(r))).size;
  const uniqueProjects = new Set(rows.map(r => r.project_name).filter(Boolean)).size;
  const uniqueActs     = new Set(rows.map(r => `${r.project_name}|${r.activity_name}`).filter(Boolean)).size;

  area.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 12px;font-size:12px;color:#1d4ed8;font-weight:600">
        👤 ${uniquePeople} orang unik
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:6px 12px;font-size:12px;color:#15803d;font-weight:600">
        📁 ${uniqueProjects} proyek
      </div>
      <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:6px;padding:6px 12px;font-size:12px;color:#7e22ce;font-weight:600">
        📋 ${uniqueActs} kegiatan
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:12px;color:#475569;font-weight:600">
        📊 ${rows.length} total baris
      </div>
    </div>
    <div class="table-wrap" style="max-height:220px;overflow-y:auto">
      <table style="font-size:11px">
        <thead>
          <tr>
            <th>#</th><th>Proyek</th><th>Aktivitas</th><th>Nama</th>
            <th>Gender</th><th>Asal</th><th>HP</th><th>Pekerjaan</th><th>Tanggal</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i) => `<tr>
            <td style="color:#94a3b8">${i+1}</td>
            <td style="color:#2563eb;font-size:10px;font-weight:600">${_esc(r.project_name||'-')}</td>
            <td style="font-size:10px">${_esc(r.activity_name||'-')}</td>
            <td style="font-weight:600">${_esc(r.name)}</td>
            <td>${r.gender ? normGender(r.gender) : '-'}</td>
            <td style="font-size:10px">${_esc(r.location||'-')}</td>
            <td style="font-size:10px">${_esc(r.phone||'-')}</td>
            <td style="font-size:10px">${_esc(r.occupation||'-')}</td>
            <td style="font-size:10px;color:#64748b">${r.attended_date ? parseDate(r.attended_date)||r.attended_date : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  showBenImportMsg(`✅ ${rows.length} baris siap diimport (${uniquePeople} penerima manfaat unik).`, 'success');
  document.getElementById('benImportConfirmBtn').classList.remove('hidden');
}

window.runBenImport = async function () {
  const rows = window._benImportRows || [];
  if (!rows.length) return;

  const btn = document.getElementById('benImportConfirmBtn');
  btn.disabled = true;
  const _client = window.client || client;

  let processed = 0;
  const total = rows.length;
  const updateProgress = () => { btn.textContent = `⏳ ${processed}/${total}...`; };
  updateProgress();

  const [{ data: allProjs }, { data: allActs }] = await Promise.all([
    _client.from('projects').select('id, name'),
    _client.from('project_activities').select('id, title, project_name'),
  ]);

  const projMap = {};
  (allProjs || []).forEach(p => { projMap[(p.name || '').toLowerCase()] = p.id; });
  const actMap = {};
  (allActs || []).forEach(a => {
    const key = `${(a.project_name || '').toLowerCase()}|${(a.title || '').toLowerCase()}`;
    actMap[key] = a;
  });

  let okBen = 0, okPart = 0, skipPart = 0, logPart = 0;
  const benIdCache = {};

  for (const r of rows) {
    const normalizedRow = {
      name      : String(r.name || '').trim(),
      phone     : normalizeBenPhone(r.phone) || null,
      gender    : normGender(r.gender) || null,
      birth_year: parseInt(r.birth_year) || null,
      location  : r.location || null,
      occupation: r.occupation || null,
      email     : r.email || null,
      note      : r.note || null,
    };

    // cacheKey pakai formula identitas baru: name+phone+location
    const cacheKey = getBeneficiaryUniqueKey(normalizedRow);
    let benId = benIdCache[cacheKey];

    if (!benId) {
      const existing = await findExistingBeneficiary(_client, normalizedRow);
      if (existing) {
        benId = existing.id;
        const merged = mergeBeneficiaryPayload(existing, normalizedRow);
        await _client.from('beneficiaries').update(merged).eq('id', benId);
      } else {
        const { data: ins, error: eIns } = await _client
          .from('beneficiaries').insert(normalizedRow).select('id').single();
        if (!eIns && ins?.id) { benId = ins.id; okBen++; }
      }
      if (benId) benIdCache[cacheKey] = benId;
    }

    if (!benId) { processed++; updateProgress(); continue; }

    const projName  = r.project_name?.trim() || '';
    const actName   = r.activity_name?.trim() || '';
    const projId    = projMap[projName.toLowerCase()] || null;
    const actKey    = `${projName.toLowerCase()}|${actName.toLowerCase()}`;
    const actRecord = actMap[actKey];

    if (projName) {
      await _client.from('beneficiary_projects').upsert({
        beneficiary_id: benId,
        project_name  : projName,
        project_id    : projId,
      }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
    }

    if (projName && actName) {
      if (actRecord) {
        const { error: ePart } = await _client.from('activity_participants').upsert({
          activity_id   : actRecord.id,
          activity_name : actName,
          project_name  : projName,
          project_id    : projId,
          beneficiary_id: benId,
          attended_date : parseDate(r.attended_date) || null,
          note          : r.note || null,
        }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });
        if (!ePart) okPart++; else skipPart++;
      } else {
        // Aktivitas belum ada di DB → catat ke beneficiary_activity_log
        const { error: eLog } = await _client.from('beneficiary_activity_log').upsert({
          beneficiary_id: benId,
          project_name  : projName,
          activity_name : actName,
          attended_date : parseDate(r.attended_date) || null,
          note          : r.note || null,
          source        : 'import',
        }, { onConflict: 'beneficiary_id,project_name,activity_name', ignoreDuplicates: true });
        if (!eLog) logPart++;
      }
    }

    processed++;
    updateProgress();
  }

  btn.disabled = false;
  btn.textContent = 'Import Sekarang';
  showBenImportMsg(
    `✅ Import selesai: ${okBen} penerima baru, ${okPart} partisipasi resmi, ${logPart} log bebas, ${skipPart} dilewati.`,
    'success'
  );

  // Tutup modal import lalu reload data
  setTimeout(async () => {
    const importOverlay = document.getElementById('benImportOverlay');
    if (importOverlay) importOverlay.classList.add('hidden');
    window._benImportRows = [];
    await loadBeneficiaries();
  }, 1500);
};

function mapFlatRow(r) {
  const name = r.nama || r['nama*'] || r.name || r.full_name || r.fullname || '';
  if (!name) return {};
  return {
    name         : name,
    project_name : r.project || r.proyek || r.project_name || r.nama_proyek || '',
    activity_name: r.aktivitas || r.activity || r.activity_name || r.kegiatan || r.nama_kegiatan || '',
    gender       : r.jenis_kelamin || r.gender || r.sex || '',
    location     : r.asal || r.lokasi || r.location || r.daerah || r.kabupaten || r.kota || '',
    phone        : r.handphone || r.hp || r.telepon || r.phone || r.no_hp || r.nomor_hp || '',
    occupation   : r.pekerjaan || r.occupation || r.jabatan || '',
    birth_year   : r.tahun_lahir || r.birth_year || r.lahir || '',
    attended_date: r.tanggal_hadir || r.attended_date || r.tanggal || r.date || '',
    note         : r.catatan || r.note || r.keterangan || '',
    email        : r.email || '',
  };
}

function showBenImportMsg(msg, type) {
  const el = document.getElementById('benImportMsg');
  el.textContent = msg; el.className = `form-msg ${type}`; el.classList.remove('hidden');
}

window.downloadBenTemplate = function () {
  const wb = XLSX.utils.book_new();
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
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = [35,30,25,15,25,15,18,12,14,20].map(w=>({wch:w}));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Penerima Manfaat');
  XLSX.writeFile(wb, 'Template_PenerimManfaat_PMIS_DFW.xlsx');
};

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

  const { data: existing } = await _client
    .from('activity_participants').select('beneficiary_id').eq('activity_id', activityId);
  const existingIds = new Set((existing||[]).map(e => e.beneficiary_id));

  const { data: bens } = await _client.from('beneficiaries').select('id,name,phone,gender,location').order('name');
  window._benPickerAll      = bens || [];
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

  if (projName) {
    await _client.from('beneficiary_projects').upsert({
      beneficiary_id: benId,
      project_name  : projName,
      project_id    : projData?.id || null,
    }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
  }

  window._benPickerExisting?.add(benId);
  renderBenPicker(document.getElementById('benPickerSearch')?.value || '');

  if (typeof refreshParticipantBadge === 'function') refreshParticipantBadge(actId);
  if (typeof window.refreshParticipantBadge === 'function') window.refreshParticipantBadge(actId);
};

// ══════════════════════════════════════════════════════════════
// EXPORT EXCEL — Penerima Manfaat
// ══════════════════════════════════════════════════════════════
window.exportBenToExcel = async function () {
  const _client    = window.client || client;
  const projFilter = document.getElementById('benProjectSelector')?.value || '';

  const btn = document.getElementById('benExportBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting…'; }

  try {
    const [{ data: bens }, { data: parts }, { data: logs }] = await Promise.all([
      _client.from('beneficiaries').select('*').order('name'),
      _client.from('activity_participants').select('beneficiary_id,project_name,activity_name,attended_date,note'),
      _client.from('beneficiary_activity_log').select('beneficiary_id,project_name,activity_name,attended_date,note,source'),
    ]);

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

    // ── Sheet 1: Master ──────────────────────────────────────
    const headers1 = [
      'No','Nama','No HP','Jenis Kelamin','Tahun Lahir','Usia',
      'Lokasi/Asal','Pekerjaan','Email',
      'Total Partisipasi Resmi','Total Log Bebas','Proyek','Catatan'
    ];
    const now = new Date().getFullYear();
    const rows1 = benList.map((b, i) => {
      const officialParts = (partMap[b.id] || []);
      const freeLogParts  = (logMap[b.id]  || []);
      const allParts      = [...officialParts, ...freeLogParts];
      const projs         = [...new Set(allParts.map(p=>p.project_name).filter(Boolean))].join(', ');
      return [
        i+1, b.name, b.phone||'', b.gender||'', b.birth_year||'',
        b.birth_year ? now - b.birth_year : '',
        b.location||'', b.occupation||'', b.email||'',
        officialParts.length,
        freeLogParts.length,
        projs, b.note||''
      ];
    });
    const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...rows1]);
    ws1['!cols'] = [5,25,15,14,12,8,25,18,25,14,12,40,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws1, 'Penerima Manfaat');

    // ── Sheet 2: Riwayat Kegiatan ────────────────────────────
    const headers2 = ['No','Nama','No HP','Proyek','Kegiatan','Tanggal Hadir','Sumber','Catatan'];
    const rows2 = [];
    let no2 = 1;
    benList.forEach(b => {
      const allParts = [
        ...(partMap[b.id]||[]).map(p=>({...p,_src:'Partisipasi Resmi'})),
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

    // ── Sheet 3: Statistik ───────────────────────────────────
    const totalL  = benList.filter(b=>b.gender==='Laki-laki').length;
    const totalP  = benList.filter(b=>b.gender==='Perempuan').length;
    const occMap  = {};
    benList.forEach(b => { const o=b.occupation||'Tidak Diketahui'; occMap[o]=(occMap[o]||0)+1; });
    const occRows = Object.entries(occMap).sort((a,c)=>c[1]-a[1])
                      .map(([occ,cnt])=>[occ, cnt, `${Math.round(cnt/benList.length*100)}%`]);

    const statsData = [
      ['RINGKASAN PENERIMA MANFAAT'],
      projFilter ? ['Proyek', projFilter] : ['Scope', 'Semua Proyek'],
      ['Tanggal Export', new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})],
      [],
      ['Total Penerima Manfaat Unik', benList.length],
      ['Total Partisipasi Resmi', (parts||[]).filter(p => !projFilter || p.project_name === projFilter).length],
      ['Total Log Bebas', (logs||[]).filter(l => !projFilter || l.project_name === projFilter).length],
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
// EDIT BENEFICIARY
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
  if (projSec) { projSec.style.display = 'none'; projSec.dataset.editMode = 'true'; }
  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  if (saveBtn) saveBtn.innerHTML = 'Update';
};

// ══════════════════════════════════════════════════════════════
// VALIDASI DUPLIKAT sebelum import
// ══════════════════════════════════════════════════════════════
window.checkBenDuplicates = async function () {
  const rows = window._benImportRows || [];
  if (!rows.length) return;

  const _client = window.client || client;
  const btn = document.getElementById('benImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Cek duplikat…'; }

  const { data: existing } = await _client.from('beneficiaries')
    .select('id,name,phone,gender,location,occupation')
    .in('name', rows.map(r => r.name));

  const existMap = {};
  (existing||[]).forEach(e => {
    existMap[e.name.toLowerCase()] = existMap[e.name.toLowerCase()] || [];
    existMap[e.name.toLowerCase()].push(e);
  });

  const dupList = [];
  rows.forEach(r => {
    const key  = r.name.toLowerCase().trim();
    const inDB = existMap[key] || [];
    inDB.forEach(db => {
      if (db.phone !== (r.phone||'') && !dupList.find(d => d.importName === r.name && d.dbId === db.id)) {
        dupList.push({
          importName : r.name,
          importPhone: r.phone || '-',
          importLoc  : r.location || '-',
          dbId       : db.id,
          dbPhone    : db.phone || '-',
          dbLoc      : db.location || '-',
          dbGender   : db.gender || '-',
        });
      }
    });
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Import Sekarang'; }

  if (!dupList.length) {
    window.runBenImport();
    return;
  }
  showDuplicateConfirm(dupList);
};

function showDuplicateConfirm(dupList) {
  let overlay = document.getElementById('benDupOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id        = 'benDupOverlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal-box" style="max-width:580px">
      <div class="modal-header">
        <span>⚠️ Potensi Data Duplikat Ditemukan</span>
        <button class="modal-close" onclick="document.getElementById('benDupOverlay').classList.add('hidden')">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:#475569;margin-bottom:12px">
          Ditemukan <strong>${dupList.length} nama</strong> yang sudah ada di database dengan nomor HP atau lokasi yang berbeda.
          Sistem akan tetap menggunakan formula identitas (nama+HP+lokasi) untuk menentukan apakah ini orang yang sama atau berbeda.
        </p>
        <div style="max-height:200px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px">
          <table style="font-size:11px;width:100%;border-collapse:collapse">
            <thead style="background:#f8fafc;position:sticky;top:0">
              <tr>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0">Nama</th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0">Di File</th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0">Di Database</th>
              </tr>
            </thead>
            <tbody>
              ${dupList.map(d => `<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:5px 8px;font-weight:600">${_esc(d.importName)}</td>
                <td style="padding:5px 8px;color:#0891b2;font-size:10px">${_esc(d.importPhone)}<br>${_esc(d.importLoc)}</td>
                <td style="padding:5px 8px;color:#7e22ce;font-size:10px">${_esc(d.dbPhone)}<br>${_esc(d.dbLoc)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end">
          <button class="btn-sm" onclick="document.getElementById('benDupOverlay').classList.add('hidden')">Batal</button>
          <button class="btn-primary btn-sm" onclick="document.getElementById('benDupOverlay').classList.add('hidden');window.runBenImport()">
            Lanjutkan Import
          </button>
        </div>
      </div>
    </div>`;

  overlay.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════
// CHART DASHBOARD
// ══════════════════════════════════════════════════════════════
const BEN_CHART_COLORS = [
  '#2563eb','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#ea580c','#65a30d','#0284c7',
  '#6366f1','#14b8a6','#f59e0b','#ef4444','#8b5cf6',
];

let _benChartOcc     = null;
let _benChartOccBar  = null;
let _benChartGender  = null;
let _benChartsVisible = true;

window.toggleBenCharts = function () {
  _benChartsVisible = !_benChartsVisible;
  const container = document.getElementById('benChartsContainer');
  const icon      = document.getElementById('benChartToggleIcon');
  const btn       = document.getElementById('benChartToggleBtn');
  if (container) container.style.display = _benChartsVisible ? 'grid' : 'none';
  if (icon) icon.className = _benChartsVisible ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
  if (btn)  btn.innerHTML  = `<i class="${icon?.className}"></i> ${_benChartsVisible ? 'Sembunyikan' : 'Tampilkan'}`;
};

window.renderBenCharts = function (data, projectFilter) {
  if (!window.Chart) return;
  if (!data || !data.length) {
    ['benChartOccupation','benChartOccupationBar','benChartGenderOccupation'].forEach(id => {
      const ctx = document.getElementById(id);
      if (ctx) ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height);
    });
    return;
  }

  const badge = document.getElementById('benChartProjectBadge');
  if (badge) { badge.textContent = projectFilter || ''; badge.style.display = projectFilter ? 'inline' : 'none'; }

  const occMap = {};
  data.forEach(b => {
    const occ = (b.occupation || 'Tidak Diketahui').trim();
    occMap[occ] = (occMap[occ] || 0) + 1;
  });

  const total    = data.length;
  const sorted   = Object.entries(occMap).sort((a,b) => b[1]-a[1]);
  const mainOccs = [], otherCount = { label:'Lainnya', count:0 };
  sorted.forEach(([label,count]) => {
    if (count / total < 0.02 && sorted.length > 6) otherCount.count += count;
    else mainOccs.push({ label, count });
  });
  if (otherCount.count > 0) mainOccs.push({ label: otherCount.label, count: otherCount.count });

  const occLabels = mainOccs.map(o => o.label);
  const occCounts = mainOccs.map(o => o.count);
  const occColors = BEN_CHART_COLORS.slice(0, occLabels.length);

  const ctx1 = document.getElementById('benChartOccupation');
  if (ctx1) {
    if (_benChartOcc) _benChartOcc.destroy();
    _benChartOcc = new Chart(ctx1, {
      type: 'doughnut',
      data: { labels: occLabels, datasets: [{ data: occCounts, backgroundColor: occColors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/total*100)}%)` } }
        },
        cutout: '60%',
      }
    });
  }

  const ctx2 = document.getElementById('benChartOccupationBar');
  if (ctx2) {
    if (_benChartOccBar) _benChartOccBar.destroy();
    _benChartOccBar = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: occLabels,
        datasets: [{ label: 'Jumlah', data: occCounts, backgroundColor: occColors, borderRadius: 4, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.raw} orang (${Math.round(ctx.raw/total*100)}%)` } }
        },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, stepSize: 1 } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  const ctx3 = document.getElementById('benChartGenderOccupation');
  if (ctx3) {
    if (_benChartGender) _benChartGender.destroy();
    const top6 = sorted.slice(0, 6).map(([label]) => label);
    const maleData   = top6.map(occ => data.filter(b => b.gender==='Laki-laki' && (b.occupation||'Tidak Diketahui')===occ).length);
    const femaleData = top6.map(occ => data.filter(b => b.gender==='Perempuan' && (b.occupation||'Tidak Diketahui')===occ).length);
    _benChartGender = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: top6,
        datasets: [
          { label: 'Laki-laki', data: maleData,   backgroundColor: '#3b82f6', borderRadius: 3 },
          { label: 'Perempuan', data: femaleData,  backgroundColor: '#ec4899', borderRadius: 3 },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, stepSize: 1 } }
        }
      }
    });
  }
};

// ── Modal stability init ─────────────────────────────────────────────
window.initBenModalStability = function () {
  const overlay = document.getElementById('benFormOverlay');
  if (!overlay) return;
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) window.closeBenModal();
  });
  const detailOverlay = document.getElementById('benDetailOverlay');
  if (detailOverlay) {
    detailOverlay.addEventListener('click', function (e) {
      if (e.target === detailOverlay) window.closeBenDetail();
    });
  }
};
// ── End of beneficiary_revised.js ────────────────────────────────────