// =====================================================================
// beneficiary.js — Penerima Manfaat (Beneficiary Tracker)
// PMIS DFW Indonesia
// =====================================================================

// ── State ─────────────────────────────────────────────────────────────
let _benAllData      = [];   // semua beneficiary
let _benFilteredData = [];   // setelah search
let _benCurrentPage  = 1;
const BEN_PAGE_SIZE  = 20;

// ── Load utama ────────────────────────────────────────────────────────

window.loadBeneficiaries = async function () {
  const client = window.client;
  if (!client) return;

  showBenLoading(true);

  try {
    const [
      { data: benData, error: benErr },
      { data: partData, error: partErr },
      { data: projData, error: projErr },
      { data: logData, error: logErr }
    ] = await Promise.all([
      client.from('beneficiaries').select('id, name, phone, gender, birthyear, location, occupation, email, note').order('name'),
      client.from('activityparticipants').select('beneficiaryid, activityid, projectname, activityname, attendeddate, note'),
      client.from('beneficiaryprojects').select('beneficiaryid, projectname'),
      client.from('beneficiaryactivitylog').select('beneficiaryid, projectname, activityname, attendeddate, source, note')
    ]);

    if (benErr) throw benErr;
    if (partErr) throw partErr;
    if (projErr) throw projErr;
    if (logErr) throw logErr;

    benAllData = benData || [];
    const participants = partData || [];
    const benProjects = projData || [];
    const actLogs = logData || [];

    window.benActLogMap = {};
    actLogs.forEach(l => {
      if (!window.benActLogMap[l.beneficiaryid]) window.benActLogMap[l.beneficiaryid] = [];
      window.benActLogMap[l.beneficiaryid].push(l);
    });

    const projMapBen = {};
    benProjects.forEach(bp => {
      if (!projMapBen[bp.beneficiaryid]) projMapBen[bp.beneficiaryid] = new Set();
      if (bp.projectname) projMapBen[bp.beneficiaryid].add(bp.projectname);
    });

    const partMap = {};
    participants.forEach(p => {
      if (!partMap[p.beneficiaryid]) partMap[p.beneficiaryid] = [];
      partMap[p.beneficiaryid].push(p);
    });

    benAllData = benAllData.map(b => {
      const fromProjTable = projMapBen[b.id] || new Set();
      const linkedActs = partMap[b.id] || [];
      const logActs = window.benActLogMap[b.id] || [];
      const fromParts = new Set(linkedActs.map(p => p.projectname).filter(Boolean));
      const fromLogs = new Set(logActs.map(l => l.projectname).filter(Boolean));
      const allProjects = new Set([...fromProjTable, ...fromParts, ...fromLogs]);

      return {
        ...b,
        projects: [...allProjects],
        participations: linkedActs,
        activityLogs: logActs,
        totalKegiatan: linkedActs.length + logActs.length,
        totalProyek: allProjects.size
      };
    });

    window.benCanonicalData = buildCanonicalBeneficiaries(benAllData);

    const allProjNames = [...new Set(window.benCanonicalData.flatMap(b => b.projects || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));

    const selMain = document.getElementById('benProjectSelector');
    if (selMain) {
      const curVal = allProjNames.includes(selMain.value) ? selMain.value : '';
      selMain.innerHTML = `<option value="">Semua Proyek</option>` + allProjNames.map(p => `<option value="${esc(p)}" ${curVal === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    }

    const selFilter = document.getElementById('benFilterProject');
    if (selFilter) {
      const curVal = allProjNames.includes(selFilter.value) ? selFilter.value : '';
      selFilter.innerHTML = `<option value="">Semua Proyek</option>` + allProjNames.map(p => `<option value="${esc(p)}" ${curVal === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    }

    const activeSel = document.getElementById('benProjectSelector')?.value || '';
    benFilteredData = activeSel ? window.benCanonicalData.filter(b => matchBeneficiaryProject(b, activeSel)) : [...window.benCanonicalData];

    updateBenStats(activeSel);
    benCurrentPage = 1;
    renderBenTable();
    if (window.initBenModalStability) window.initBenModalStability();
  } catch (err) {
    alert(`Gagal memuat penerima manfaat: ${err.message}`);
  } finally {
    showBenLoading(false);
  }
};

// Hitung ulang stat cards berdasarkan proyek yang dipilih

function updateBenStats(projectFilter) {
  const source = window.benCanonicalData || [];
  const subset = projectFilter ? source.filter(b => matchBeneficiaryProject(b, projectFilter)) : source;

  const totalPartisipasiResmi = projectFilter
    ? subset.reduce((sum, b) => sum + filterParticipationsByProject(b, projectFilter).length, 0)
    : subset.reduce((sum, b) => sum + Number(b.totalPartisipasiResmi || 0), 0);

  const totalOrangPernahIkut = projectFilter
    ? subset.filter(b => filterParticipationsByProject(b, projectFilter).length > 0 || filterLogsByProject(b, projectFilter).length > 0).length
    : subset.filter(b => b.pernahIkutKegiatan).length;

  const uniqueEl = document.getElementById('benStatUnique');
  const participEl = document.getElementById('benStatParticip');
  const everEl = document.getElementById('benStatEverJoined');

  if (uniqueEl) uniqueEl.textContent = subset.length.toLocaleString('id-ID');
  if (participEl) participEl.textContent = totalPartisipasiResmi.toLocaleString('id-ID');
  if (everEl) everEl.textContent = totalOrangPernahIkut.toLocaleString('id-ID');

  const lblUnique = document.getElementById('benStatUniqueLabel');
  const lblParticip = document.getElementById('benStatParticipLabel');
  const lblEver = document.getElementById('benStatEverJoinedLabel');

  if (lblUnique) lblUnique.textContent = 'Jumlah Unik';
  if (lblParticip) lblParticip.textContent = 'Partisipasi Resmi';
  if (lblEver) lblEver.textContent = 'Pernah Ikut Kegiatan';
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
  const q = (document.getElementById('benSearchInput')?.value || '').trim().toLowerCase();
  const gender = document.getElementById('benFilterGender')?.value || '';
  const project = document.getElementById('benFilterProject')?.value || document.getElementById('benProjectSelector')?.value || '';

  const selFilter = document.getElementById('benFilterProject');
  const selMain = document.getElementById('benProjectSelector');
  if (selFilter) selFilter.value = project;
  if (selMain) selMain.value = project;

  const lbl = document.getElementById('benActiveProjectLabel');
  if (lbl) lbl.textContent = project || 'Semua Proyek';

  const bar = document.getElementById('benProjectSelectorBar');
  if (bar) {
    bar.style.background = project ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fff';
    bar.style.borderColor = project ? '#93c5fd' : '#e2e8f0';
  }

  updateBenStats(project);

  const source = window.benCanonicalData || [];
  benFilteredData = source.filter(b => {
    const name = String(b.name || '').toLowerCase();
    const phone = String(b.phone || '').toLowerCase();
    const location = String(b.location || '').toLowerCase();
    const occupation = String(b.occupation || '').toLowerCase();
    const matchQ = !q || name.includes(q) || phone.includes(q) || location.includes(q) || occupation.includes(q);
    const matchG = !gender || b.gender === gender;
    const matchP = !project || matchBeneficiaryProject(b, project);
    return matchQ && matchG && matchP;
  });

  benCurrentPage = 1;
  renderBenTable();
};

// ── Render tabel ──────────────────────────────────────────────────────

function renderBenTable() {
  const tbody = document.getElementById('benTableBody');
  if (!tbody) return;

  const total = benFilteredData.length;
  const start = (benCurrentPage - 1) * BENPAGESIZE;
  const rows = benFilteredData.slice(start, start + BENPAGESIZE);

  const countLabel = document.getElementById('benCountLabel');
  if (countLabel) countLabel.textContent = `Menampilkan ${total ? start + 1 : 0}-${Math.min(start + BENPAGESIZE, total)} dari ${total} orang unik`;

  const activeProj = document.getElementById('benProjectSelector')?.value || '';
  if (typeof renderBenCharts === 'function') renderBenCharts(benFilteredData, activeProj);

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:28px;color:#94a3b8">
          ${(window.benCanonicalData || []).length ? 'Tidak ada data yang cocok.' : 'Belum ada penerima manfaat. Tambah atau import dari Excel.'}
        </td>
      </tr>
    `;
    renderBenPagination(0);
    return;
  }

  tbody.innerHTML = rows.map((b, i) => {
    const usia = b.birthyear ? `${new Date().getFullYear() - b.birthyear} th` : '-';
    const rowKey = encodeURIComponent(String(b.dedupKey || b.primaryId || b.id));
    const projs = b.projects || [];
    const projLabel = projs.length ? projs.map(p => `<span style="background:#eff6ff;color:#2563eb;border-radius:4px;padding:1px 6px;font-size:10px;white-space:nowrap">${esc(p)}</span>`).join(' ') : `<span style="color:#94a3b8">-</span>`;
    const officialCount = Number(b.totalPartisipasiResmi || 0);
    const logCount = Number(b.totalLogBebas || 0);

    return `
      <tr>
        <td style="color:#94a3b8;font-size:12px">${start + i + 1}</td>
        <td><div style="font-weight:600;font-size:13px;color:#0f172a">${esc(b.name || '-')}</div><div style="font-size:11px;color:#94a3b8">${esc(b.phone || '-')}</div></td>
        <td><span class="badge ${b.gender === 'Laki-laki' ? 'badge-output' : 'badge-outcome'}" style="font-size:10px">${esc(b.gender || '-')}</span></td>
        <td style="font-size:12px;color:#475569">${usia}</td>
        <td style="font-size:12px;color:#475569">${esc(b.location || '-')}</td>
        <td style="font-size:12px;color:#475569">${esc(b.occupation || '-')}</td>
        <td><div style="font-size:12px;font-weight:700;color:#2563eb">${officialCount}x resmi</div><div style="font-size:10px;color:${logCount ? '#92400e' : '#94a3b8'}">${logCount ? `+${logCount} log bebas` : 'tanpa log bebas'}</div></td>
        <td style="max-width:220px">${projLabel}</td>
        <td>
          <button class="btn-secondary btn-sm" style="margin-right:4px" onclick="openBenDetail('${rowKey}')">Detail</button>
          <button class="btn-secondary btn-sm" style="margin-right:4px;color:#d97706;border-color:#fde68a" onclick="openEditBenModal('${rowKey}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteBeneficiary('${rowKey}')">Hapus</button>
        </td>
      </tr>
    `;
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

// ── Populate filter proyek ────────────────────────────────────────────
window.populateBenProjectFilter = async function () {
  const _client = window.client || client;
  const { data } = await _client.from('projects').select('name').eq('archived', false).order('name');
  const sel = document.getElementById('benFilterProject');
  if (!sel || !data) return;
  sel.innerHTML = '<option value="">Semua Proyek</option>' +
    (data || []).map(p => `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`).join('');
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
  if (!name) { showBenFormMsg('Nama wajib diisi.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = document.getElementById('benFormId').value ? 'Update' : 'Simpan'; } return; }

  const payload = {
    name,
    phone       : normalizeBenPhone(phone) || null,
    gender      : document.getElementById('benF-gender').value || null,
    birth_year  : parseInt(document.getElementById('benF-birthyear').value) || null,
    location    : document.getElementById('benF-location').value.trim() || null,
    occupation  : document.getElementById('benF-occupation').value.trim() || null,
    email       : document.getElementById('benF-email').value.trim() || null,
    note        : document.getElementById('benF-note').value.trim() || null,
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
        .from('beneficiaries')
        .insert(payload)
        .select('id').single();
      error = errIns;
      benId = inserted?.id;
    }
  }

  if (error) { showBenFormMsg('❌ ' + error.message, 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = document.getElementById('benFormId').value ? 'Update' : 'Simpan'; } return; }

  // Jika ada proyek dipilih, catat relasi beneficiary-proyek
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

// ── Detail beneficiary + riwayat kegiatan ─────────────────────────────

window.openBenDetail = async function (ref) {
  const ben = getCanonicalBeneficiary(ref) || benAllData.find(b => String(b.id) === String(ref));
  if (!ben) return;

  const overlay = document.getElementById('benDetailOverlay');
  overlay.classList.remove('hidden');

  document.getElementById('benDetailName').textContent = ben.name || '-';
  document.getElementById('benDetailMeta').textContent = [ben.gender, ben.birthyear ? `${new Date().getFullYear() - ben.birthyear} tahun` : null, ben.location, ben.occupation].filter(Boolean).join(' • ');

  const linked = (ben.participations || []).map(p => ({ ...p, type: 'linked' }));
  const free = (ben.activityLogs || []).map(l => ({ ...l, type: 'log' }));
  const list = [...linked, ...free].sort((a, b) => String(b.attendeddate || '').localeCompare(String(a.attendeddate || '')));
  const allProjects = new Set(list.map(x => x.projectname).filter(Boolean));

  document.getElementById('benDetailStats').innerHTML = `
    <span style="background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">${linked.length} partisipasi resmi</span>
    <span style="background:#fffbeb;color:#92400e;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">${free.length} log bebas</span>
    <span style="background:#f0fdf4;color:#15803d;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">${allProjects.size} proyek</span>
  `;

  if (!list.length) {
    document.getElementById('benDetailHistory').innerHTML = `<div style="padding:16px;color:#94a3b8;font-size:13px">Belum ada riwayat kegiatan.</div>`;
    return;
  }

  const byProj = {};
  list.forEach(item => {
    const proj = item.projectname || 'Tanpa Proyek';
    if (!byProj[proj]) byProj[proj] = [];
    byProj[proj].push(item);
  });

  document.getElementById('benDetailHistory').innerHTML = Object.entries(byProj).map(([proj, items]) => `
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #f1f5f9">${esc(proj)} <span style="color:#94a3b8;font-weight:400">${items.length} catatan</span></div>
      ${items.map(it => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 8px;border-radius:6px;background:${it.type === 'log' ? '#fffbeb' : '#f8fafc'};margin-bottom:4px;border:1px solid ${it.type === 'log' ? '#fde68a' : 'transparent'}">
          <div>
            <div style="font-size:12px;font-weight:600;color:#334155">${esc(it.activityname || '-')}${it.type === 'log' ? '<span style="font-size:10px;background:#fef9c3;color:#92400e;border-radius:3px;padding:1px 5px;margin-left:4px">log bebas</span>' : '<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:1px 5px;margin-left:4px">resmi</span>'}</div>
            ${it.note ? `<div style="font-size:11px;color:#94a3b8">${esc(it.note)}</div>` : ''}
          </div>
          <div style="font-size:11px;color:#94a3b8;white-space:nowrap;margin-left:8px">${it.attendeddate ? new Date(it.attendeddate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
};

window.closeBenDetail = function () {
  document.getElementById('benDetailOverlay').classList.add('hidden');
};

// ── Delete beneficiary ────────────────────────────────────────────────

window.deleteBeneficiary = async function (ref) {
  const ben = getCanonicalBeneficiary(ref) || benAllData.find(x => String(x.id) === String(ref));
  if (!ben) return;

  const ids = (ben.sourceIds && ben.sourceIds.length) ? ben.sourceIds : [ben.primaryId || ben.id].filter(Boolean);
  const name = ben.name || 'data ini';
  const extra = ids.length > 1 ? ` Termasuk ${ids.length} record yang tergabung.` : '';

  if (!confirm(`Hapus ${name} dari daftar penerima manfaat?${extra} Kegiatan orang ini juga akan terhapus.`)) return;

  const client = window.client;
  const { error } = await client.from('beneficiaries').delete().in('id', ids);
  if (error) {
    alert(`Gagal hapus: ${error.message}`);
    return;
  }
  loadBeneficiaries();
};


// ── Import dari Excel ─────────────────────────────────────────────────
window.openBenImport = function () {
  document.getElementById('benImportOverlay').classList.remove('hidden');
  document.getElementById('benImportFileInput').value = '';
  document.getElementById('benImportPreview').innerHTML = '';
  document.getElementById('benImportMsg').className = 'form-msg hidden';
  document.getElementById('benImportConfirmBtn').classList.add('hidden');
  window._benImportRows = null;
};
window.closeBenImport = function () {
  document.getElementById('benImportOverlay').classList.add('hidden');
};

window.handleBenImportFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array', raw: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const rows = raw.map(r => {
        const n = {};
        Object.keys(r).forEach(k => { n[k.toLowerCase().trim().replace(/\s+/g,'_')] = String(r[k]||'').trim(); });
        return n;
      });
      previewBenImport(rows);
    } catch(err) {
      showBenImportMsg('❌ Gagal baca file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── Flat column mapping (1 sheet: Project | Aktivitas | Nama | ...) ──
const FLAT_COL_MAP = {
  project_name  : ['project','proyek','nama proyek','project name','nama_proyek','project_name'],
  activity_name : ['aktivitas','kegiatan','activity','nama kegiatan','event','nama_kegiatan','activity_name'],
  name          : ['name','nama','nama lengkap','full name','nama_lengkap','full_name'],
  phone         : ['handphone','hp','no hp','no_hp','telepon','phone','nomor_hp','handphone'],
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
  const vl = v.toLowerCase();
  if (vl.startsWith('l') || vl === 'm' || vl.includes('laki')) return 'Laki-laki';
  if (vl.startsWith('p') || vl === 'f' || vl.includes('perempuan') || vl.includes('wanita')) return 'Perempuan';
  return v;
}

function getBeneficiaryUniqueKey(r) {
  const name = String(r?.name || '').trim().toLowerCase();
  const phone = String(r?.phone || '').trim().toLowerCase();
  const gender = String(normGender(r?.gender || '') || '').trim().toLowerCase();
  if (name && phone && gender) return `${name}|${phone}|${gender}`;
  if (name && gender) return `${name}|no-phone|${gender}`;
  if (name && phone) return `${name}|${phone}|no-gender`;
  if (name) return `${name}|unverified`;
  return 'unknown|unverified';
}



function normalizeBenText(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeBenPhone(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

function normalizeBenLocation(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildBenIdentity(row) {
  return {
    name: normalizeBenText(row?.name),
    phone: normalizeBenPhone(row?.phone),
    location: normalizeBenLocation(row?.location)
  };
}

function getBeneficiaryUniqueKey(row, fallbackId = null) {
  const { name, phone, location } = buildBenIdentity(row);
  if (name && phone && location) return `npl:${name}|${phone}|${location}`;
  if (name && phone) return `np:${name}|${phone}`;
  if (name && location) return `nl:${name}|${location}`;
  if (name) return `n:${name}`;
  return fallbackId ? `id:${fallbackId}` : 'unknown';
}

function isSameBeneficiary(existing, incoming) {
  const ex = buildBenIdentity(existing);
  const inc = buildBenIdentity(incoming);

  if (!ex.name || !inc.name || ex.name !== inc.name) return false;
  if (inc.phone && inc.location) return ex.phone === inc.phone && ex.location === inc.location;
  if (inc.phone) return ex.phone === inc.phone;
  if (inc.location) return ex.location === inc.location;
  return !ex.phone && !ex.location;
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  return (arr || []).filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchBeneficiaryProject(b, projectFilter) {
  if (!projectFilter) return true;
  return (
    (b.projects || []).includes(projectFilter) ||
    (b.participations || []).some(p => p.projectname === projectFilter) ||
    (b.activityLogs || []).some(l => l.projectname === projectFilter)
  );
}

function filterParticipationsByProject(b, projectFilter) {
  if (!projectFilter) return b.participations || [];
  return (b.participations || []).filter(p => p.projectname === projectFilter);
}

function filterLogsByProject(b, projectFilter) {
  if (!projectFilter) return b.activityLogs || [];
  return (b.activityLogs || []).filter(l => l.projectname === projectFilter);
}

function buildCanonicalBeneficiaries(rows) {
  const grouped = new Map();

  (rows || []).forEach((b, idx) => {
    const key = getBeneficiaryUniqueKey(b, b.id || idx + 1);

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...b,
        id: b.id,
        primaryId: b.id,
        dedupKey: key,
        sourceIds: [b.id].filter(Boolean),
        projects: [...(b.projects || [])],
        participations: [...(b.participations || [])],
        activityLogs: [...(b.activityLogs || [])]
      });
      return;
    }

    const cur = grouped.get(key);
    cur.sourceIds = uniqBy([...(cur.sourceIds || []), b.id].filter(Boolean), x => String(x));
    cur.projects = uniqBy([...(cur.projects || []), ...(b.projects || [])].filter(Boolean), x => String(x).trim().toLowerCase());
    cur.participations = uniqBy(
      [...(cur.participations || []), ...(b.participations || [])],
      p => [p.activityid || '', p.projectname || '', p.activityname || '', p.attendeddate || ''].join('|')
    );
    cur.activityLogs = uniqBy(
      [...(cur.activityLogs || []), ...(b.activityLogs || [])],
      l => [l.projectname || '', l.activityname || '', l.attendeddate || '', l.source || '', l.note || ''].join('|')
    );

    cur.phone = cur.phone || b.phone || null;
    cur.location = cur.location || b.location || null;
    cur.gender = cur.gender || b.gender || null;
    cur.birthyear = cur.birthyear || b.birthyear || null;
    cur.occupation = cur.occupation || b.occupation || null;
    cur.email = cur.email || b.email || null;
    cur.note = cur.note || b.note || null;
  });

  return [...grouped.values()].map(b => {
    const allProjects = new Set([
      ...(b.projects || []),
      ...(b.participations || []).map(p => p.projectname).filter(Boolean),
      ...(b.activityLogs || []).map(l => l.projectname).filter(Boolean)
    ]);

    const totalPartisipasiResmi = (b.participations || []).length;
    const totalLogBebas = (b.activityLogs || []).length;

    return {
      ...b,
      id: b.primaryId || b.id,
      projects: [...allProjects],
      totalPartisipasiResmi,
      totalLogBebas,
      totalKegiatan: totalPartisipasiResmi,
      totalSemuaJejakKegiatan: totalPartisipasiResmi + totalLogBebas,
      totalProyek: allProjects.size,
      pernahIkutKegiatan: (totalPartisipasiResmi + totalLogBebas) > 0
    };
  });
}

function getCanonicalBeneficiary(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw) return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {}

  return (window.benCanonicalData || []).find(b =>
    String(b.dedupKey) === decoded ||
    String(b.primaryId) === raw ||
    String(b.id) === raw ||
    (b.sourceIds || []).map(String).includes(raw)
  ) || null;
}

async function findExistingBeneficiary(client, row) {
  const name = String(row?.name || '').trim();
  if (!name) return null;
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

// ── handleBenImportFile ───────────────────────────────────────────────
window.handleBenImportFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb      = XLSX.read(e.target.result, { type: 'array', raw: false });
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const raw     = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const rows    = raw.map(r => mapFlatRow(normalizeRow(r))).filter(r => r.name);
      window._benImportRows = rows;
      previewBenImport(rows);
    } catch(err) {
      showBenImportMsg('❌ Gagal baca file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── previewBenImport ──────────────────────────────────────────────────
function previewBenImport(rows) {
  const area = document.getElementById('benImportPreview');
  if (!rows.length) {
    area.innerHTML = '<div style="color:#ef4444;font-size:13px">Tidak ada data valid. Pastikan kolom Nama terisi.</div>';
    return;
  }
  // Hitung unik
  const uniquePeople = new Set(rows.map(r => getBeneficiaryUniqueKey(r))).size;
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

// ── runBenImport ──────────────────────────────────────────────────────
window.runBenImport = async function () {
  const rows = window._benImportRows || [];
  if (!rows.length) return;

  const btn = document.getElementById('benImportConfirmBtn');
  btn.disabled = true;
  const _client = window.client || client;

  let processed = 0;
  const total = rows.length;
  const updateProgress = () => {
    btn.textContent = `⏳ ${processed}/${total}...`;
  };
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
      name       : String(r.name || '').trim(),
      phone      : normalizeBenPhone(r.phone) || null,
      gender     : normGender(r.gender) || null,
      birth_year : parseInt(r.birth_year) || null,
      location   : r.location || null,
      occupation : r.occupation || null,
      email      : r.email || null,
      note       : r.note || null,
    };

    const cacheKey = getBeneficiaryUniqueKey(normalizedRow);
    let benId = benIdCache[cacheKey];

    if (!benId) {
      const existing = await findExistingBeneficiary(_client, normalizedRow);
      if (existing) {
        benId = existing.id;
        const merged = mergeBeneficiaryPayload(existing, normalizedRow);
        const { error: errUpd } = await _client
          .from('beneficiaries')
          .update(merged)
          .eq('id', benId);
        if (errUpd) {
          skipPart++;
          processed++;
          updateProgress();
          continue;
        }
        okBen++;
      } else {
        const { data: inserted, error: errBen } = await _client
          .from('beneficiaries')
          .insert(normalizedRow)
          .select('id')
          .single();
        if (errBen || !inserted) {
          skipPart++;
          processed++;
          updateProgress();
          continue;
        }
        benId = inserted.id;
        okBen++;
      }
      benIdCache[cacheKey] = benId;
    }

    if (benId && r.project_name) {
      await _client.from('beneficiary_projects').upsert({
        beneficiary_id : benId,
        project_name   : r.project_name,
        project_id     : projMap[(r.project_name || '').toLowerCase()] || null,
      }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
    }

    if (benId && r.activity_name) {
      const actKey = `${(r.project_name || '').toLowerCase()}|${(r.activity_name || '').toLowerCase()}`;
      const act = actMap[actKey];
      const projId = r.project_name ? (projMap[(r.project_name || '').toLowerCase()] || null) : null;

      if (act) {
        const { error: errPart } = await _client.from('activity_participants').upsert({
          activity_id    : act.id,
          activity_name  : act.title,
          project_name   : r.project_name || null,
          project_id     : projId,
          beneficiary_id : benId,
          attended_date  : parseDate(r.attended_date) || null,
          note           : r.note || null,
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
          note           : r.note || null,
        }, { onConflict: 'beneficiary_id,project_name,activity_name', ignoreDuplicates: true });
        if (!errLog) { okPart++; logPart++; } else skipPart++;
      }
    }

    processed++;
    updateProgress();
  }

  btn.disabled = false;
  btn.textContent = 'Import Sekarang';
  const uniqueBen = Object.keys(benIdCache).length;
  let msg = `${uniqueBen} penerima manfaat diproses`;
  if (okPart) msg += `, ${okPart} data aktivitas terekam`;
  if (logPart) msg += `, ${logPart} sebagai log bebas`;
  if (skipPart) msg += `, ${skipPart} gagal`;
  showBenImportMsg('✅ ' + msg + '.', 'success');

  if (logPart) {
    document.getElementById('benImportPreview').innerHTML += `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;font-size:11px;color:#92400e;margin-top:8px">
        <strong>${logPart} kegiatan tersimpan sebagai catatan bebas</strong><br>
        Nama aktivitas tidak cocok dengan sistem, namun kehadiran tetap direkam di log.
        Data ini tetap terlihat di halaman detail penerima manfaat.
      </div>`;
  }

  window._benDupDecisions = null;
  setTimeout(() => { closeBenImport(); loadBeneficiaries(); }, logPart ? 2000 : 1500);
};

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
  const { data: bens } = await _client.from('beneficiaries').select('id,name,phone,gender,location').order('name');
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
  const btn = document.getElementById('benExportBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Exporting...`;
  }

  try {
    const projFilter = document.getElementById('benProjectSelector')?.value || '';
    const source = window.benCanonicalData || [];
    const subset = projFilter ? source.filter(b => matchBeneficiaryProject(b, projFilter)) : source;

    const wb = XLSX.utils.book_new();
    const todayStr = new Date().toISOString().slice(0, 10);
    const niceDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const headers1 = ['No', 'Nama', 'No HP', 'Lokasi', 'Jenis Kelamin', 'Pekerjaan', 'Partisipasi Resmi', 'Log Bebas', 'Total Jejak Kegiatan', 'Jumlah Proyek', 'Proyek', 'Catatan'];
    const rows1 = subset.map((b, i) => {
      const official = filterParticipationsByProject(b, projFilter).length;
      const logs = filterLogsByProject(b, projFilter).length;
      const projs = projFilter ? [projFilter] : (b.projects || []);
      return [i + 1, b.name || '', b.phone || '', b.location || '', b.gender || '', b.occupation || '', official, logs, official + logs, projs.length, projs.join(', '), b.note || ''];
    });
    const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...rows1]);
    ws1['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Penerima Manfaat');

    const headers2 = ['No', 'Nama', 'No HP', 'Proyek', 'Kegiatan', 'Tanggal Hadir', 'Sumber', 'Catatan'];
    const rows2 = [];
    let no2 = 1;
    subset.forEach(b => {
      filterParticipationsByProject(b, projFilter).forEach(p => {
        rows2.push([no2++, b.name || '', b.phone || '', p.projectname || '', p.activityname || '', p.attendeddate ? new Date(p.attendeddate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '', 'Resmi', p.note || '']);
      });
      filterLogsByProject(b, projFilter).forEach(l => {
        rows2.push([no2++, b.name || '', b.phone || '', l.projectname || '', l.activityname || '', l.attendeddate ? new Date(l.attendeddate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '', 'Log Bebas', l.note || '']);
      });
    });
    const ws2 = XLSX.utils.aoa_to_sheet([headers2, ...rows2]);
    ws2['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Riwayat Kegiatan');

    const totalUnik = subset.length;
    const totalPartisipasiResmi = subset.reduce((sum, b) => sum + filterParticipationsByProject(b, projFilter).length, 0);
    const totalPernahIkut = subset.filter(b => filterParticipationsByProject(b, projFilter).length > 0 || filterLogsByProject(b, projFilter).length > 0).length;
    const statsData = [['RINGKASAN PENERIMA MANFAAT'], ['Scope', projFilter || 'Semua Proyek'], ['Tanggal Export', niceDate], [], ['Jumlah Unik', totalUnik], ['Partisipasi Resmi', totalPartisipasiResmi], ['Pernah Ikut Kegiatan', totalPernahIkut]];
    const ws3 = XLSX.utils.aoa_to_sheet(statsData);
    ws3['!cols'] = [{ wch: 28 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Statistik');

    const fname = projFilter ? `PenerimaManfaat_${projFilter.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${todayStr}.xlsx` : `PenerimaManfaat_SemuaProyek_${todayStr}.xlsx`;
    XLSX.writeFile(wb, fname);
  } catch (err) {
    alert(`Gagal export: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-file-export"></i> Export Excel`;
    }
  }
};


// ══════════════════════════════════════════════════════════════
// EDIT PENERIMA MANFAAT — openEditBenModal
// ══════════════════════════════════════════════════════════════

window.openEditBenModal = async function (ref) {
  const b = getCanonicalBeneficiary(ref) || benAllData.find(x => String(x.id) === String(ref));
  if (!b) return;

  window.resetBenModalState();
  document.getElementById('benFormOverlay').classList.remove('hidden');
  document.getElementById('benFormTitle').textContent = 'Edit Penerima Manfaat';
  document.getElementById('benFormId').value = b.primaryId || b.id || '';

  document.getElementById('benF-name').value = b.name || '';
  document.getElementById('benF-phone').value = b.phone || '';
  document.getElementById('benF-gender').value = b.gender || '';
  document.getElementById('benF-birthyear').value = b.birthyear || '';
  document.getElementById('benF-location').value = b.location || '';
  document.getElementById('benF-occupation').value = b.occupation || '';
  document.getElementById('benF-email').value = b.email || '';
  document.getElementById('benF-note').value = b.note || '';

  const projSec = document.getElementById('benFormProjectSection');
  if (projSec) {
    projSec.style.display = 'none';
    projSec.dataset.editMode = 'true';
  }

  const saveBtn = document.querySelector('#benFormOverlay .btn-primary[onclick="saveBeneficiary()"]');
  if (saveBtn) saveBtn.innerHTML = 'Update';
};


// ══════════════════════════════════════════════════════════════
// VALIDASI DUPLIKAT — cek sebelum import
// ══════════════════════════════════════════════════════════════
window.checkBenDuplicates = async function () {
  const rows = window._benImportRows || [];
  if (!rows.length) return;

  const _client = window.client || client;
  const btn = document.getElementById('benImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Cek duplikat…'; }

  // Ambil semua nama yang ada di import
  const importNames = [...new Set(rows.map(r => r.name.toLowerCase().trim()))];

  // Cari yang sudah ada di DB dengan nama sama tapi HP berbeda
  const { data: existing } = await _client.from('beneficiaries')
    .select('id,name,phone,gender,location,occupation')
    .in('name', rows.map(r => r.name));

  const existMap = {};
  (existing||[]).forEach(e => { existMap[e.name.toLowerCase()] = existMap[e.name.toLowerCase()] || []; existMap[e.name.toLowerCase()].push(e); });

  // Deteksi duplikat potensial: nama sama, HP berbeda
  const dupList = [];
  rows.forEach(r => {
    const key = r.name.toLowerCase().trim();
    const inDB = existMap[key] || [];
    inDB.forEach(db => {
      if (db.phone !== (r.phone||'') && !dupList.find(d => d.importName === r.name && d.dbId === db.id)) {
        dupList.push({
          importName  : r.name,
          importPhone : r.phone || '-',
          importLoc   : r.location || '-',
          dbId        : db.id,
          dbPhone     : db.phone || '-',
          dbLoc       : db.location || '-',
          dbGender    : db.gender || '-',
        });
      }
    });
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Import Sekarang'; }

  if (!dupList.length) {
    // Tidak ada duplikat — langsung import
    window.runBenImport();
    return;
  }

  // Tampilkan modal konfirmasi duplikat
  showDuplicateConfirm(dupList);
};

function showDuplicateConfirm(dupList) {
  // Buat overlay konfirmasi duplikat
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
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e">
          <strong>${dupList.length} orang</strong> dalam file Excel memiliki nama yang sama dengan data di sistem, namun nomor HP berbeda.
          Pilih tindakan untuk masing-masing:
        </div>
        <div style="max-height:320px;overflow-y:auto">
          ${dupList.map((d,i) => `
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px;background:#f8fafc">
              <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:8px">👤 ${_esc(d.importName)}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
                <div style="background:#eff6ff;border-radius:6px;padding:8px">
                  <div style="font-weight:700;color:#2563eb;margin-bottom:4px">📥 Data Import</div>
                  <div>HP: ${_esc(d.importPhone)}</div>
                  <div>Lokasi: ${_esc(d.importLoc)}</div>
                </div>
                <div style="background:#f0fdf4;border-radius:6px;padding:8px">
                  <div style="font-weight:700;color:#15803d;margin-bottom:4px">💾 Data di Sistem</div>
                  <div>HP: ${_esc(d.dbPhone)}</div>
                  <div>Lokasi: ${_esc(d.dbLoc)}</div>
                  <div>Gender: ${_esc(d.dbGender)}</div>
                </div>
              </div>
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
                  <input type="radio" name="dup_${i}" value="skip" checked>
                  Pakai data di sistem (lewati import)
                </label>
                <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
                  <input type="radio" name="dup_${i}" value="update">
                  Update data di sistem dengan data import
                </label>
                <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
                  <input type="radio" name="dup_${i}" value="new">
                  Simpan sebagai orang baru (beda HP)
                </label>
              </div>
            </div>`).join('')}
        </div>
        <div id="benDupMsg" class="form-msg hidden"></div>
        <div class="form-actions" style="margin-top:14px">
          <button class="btn-secondary" onclick="document.getElementById('benDupOverlay').classList.add('hidden')">Batal</button>
          <button class="btn-primary" onclick="applyDupDecisions(${JSON.stringify(dupList).replace(/</g,'\u003c')})">
            ✅ Lanjutkan Import
          </button>
        </div>
      </div>
    </div>`;

  overlay.classList.remove('hidden');
}

window.applyDupDecisions = async function (dupList) {
  const _client = window.client || client;
  // Baca pilihan user
  const decisions = dupList.map((d, i) => {
    const radio = document.querySelector(`input[name="dup_${i}"]:checked`);
    return { ...d, decision: radio?.value || 'skip' };
  });

  // Terapkan keputusan: update data di sistem jika 'update'
  for (const d of decisions) {
    if (d.decision === 'update') {
      const rowData = (window._benImportRows||[]).find(r => r.name === d.importName);
      if (rowData) {
        await _client.from('beneficiaries').update({
          phone      : rowData.phone || null,
          gender     : normGender(rowData.gender) || null,
          location   : rowData.location || null,
          occupation : rowData.occupation || null,
          birth_year : parseInt(rowData.birth_year) || null,
          note       : rowData.note || null,
        }).eq('id', d.dbId);
      }
    } else if (d.decision === 'new') {
      // Hapus constraint UNIQUE agar bisa simpan sebagai baru — force phone berbeda tetap tersimpan
      // Import tetap jalan normal untuk nama ini
    }
    // 'skip' → tidak lakukan apapun, upsert normal akan merge ke data existing
  }

  document.getElementById('benDupOverlay')?.classList.add('hidden');

  // Tandai rows yang harus di-'new' agar tidak di-merge saat upsert
  window._benDupDecisions = {};
  decisions.forEach(d => { window._benDupDecisions[d.importName] = d.decision; });

  window.runBenImport();
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
