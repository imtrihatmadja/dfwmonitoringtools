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
  const _client = window.client || client;
  showBenLoading(true);

  const [
    { data: benData },
    { data: partData },
    { data: projData },
  ] = await Promise.all([
    _client.from('beneficiaries').select('id, name, phone, gender, birth_year, location, occupation, email, note'),
    _client.from('activity_participants').select('beneficiary_id, project_name, activity_name, attended_date'),
    _client.from('beneficiary_projects').select('beneficiary_id, project_name'),
  ]);

  _benAllData        = benData  || [];
  const participants = partData || [];
  const benProjects  = projData || [];

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
    const allProjects   = new Set([...fromProjTable, ...fromParts]);
    return {
      ...b,
      projects      : [...allProjects],
      participations: partMap[b.id] || [],
      totalKegiatan : (partMap[b.id] || []).length,
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
  showBenLoading(false);
};

// Hitung ulang stat cards berdasarkan proyek yang dipilih
function updateBenStats(projectFilter) {
  const subset = projectFilter
    ? _benAllData.filter(b => (b.projects||[]).includes(projectFilter))
    : _benAllData;
  const parts  = projectFilter
    ? subset.flatMap(b => b.participations.filter(p => p.project_name === projectFilter))
    : subset.flatMap(b => b.participations);

  document.getElementById('benStatUnique').textContent    = subset.length.toLocaleString('id-ID');
  document.getElementById('benStatMale').textContent      = subset.filter(b=>b.gender==='Laki-laki').length.toLocaleString('id-ID');
  document.getElementById('benStatFemale').textContent    = subset.filter(b=>b.gender==='Perempuan').length.toLocaleString('id-ID');
  document.getElementById('benStatParticip').textContent  = parts.length.toLocaleString('id-ID');

  // Label stat card sesuai konteks
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
    const matchP = !project || (b.projects || []).includes(project) ||
                   b.participations.some(p => p.project_name === project);
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
        <div style="font-size:12px;font-weight:600;color:#2563eb">${b.totalKegiatan}x</div>
        <div style="font-size:10px;color:#94a3b8">${b.totalProyek} proyek</div>
      </td>
      <td style="max-width:200px">${projLabel}</td>
      <td>
        <button class="btn-secondary btn-sm" style="margin-right:4px"
          onclick="openBenDetail('${b.id}')">Detail</button>
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
window.openAddBenModal = async function () {
  const _client = window.client || client;
  document.getElementById('benFormOverlay').classList.remove('hidden');
  document.getElementById('benFormTitle').textContent = 'Tambah Penerima Manfaat';
  document.getElementById('benFormId').value = '';
  document.getElementById('benFormMsg').className = 'form-msg hidden';
  // Reset semua field manual
  ['benF-name','benF-phone','benF-location','benF-occupation','benF-email','benF-note','benF-attend-note'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['benF-gender','benF-birthyear'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Reset dropdown proyek & aktivitas
  const selProj = document.getElementById('benF-project');
  const selAct  = document.getElementById('benF-activity');
  const dateEl  = document.getElementById('benF-attended-date');
  if (dateEl) dateEl.value = '';
  if (selAct)  { selAct.innerHTML = '<option value="">-- Pilih Kegiatan --</option>'; selAct.disabled = true; }

  // Load proyek aktif
  if (selProj) {
    const { data: projs } = await _client.from('projects').select('id,name').eq('archived', false).order('name');
    selProj.innerHTML = '<option value="">-- Pilih Proyek (opsional) --</option>' +
      (projs||[]).map(p => `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`).join('');
  }
};

window.loadActivitiesForBenForm = async function () {
  const _client   = window.client || client;
  const projName  = document.getElementById('benF-project')?.value;
  const selAct    = document.getElementById('benF-activity');
  if (!selAct) return;
  if (!projName) {
    selAct.innerHTML = '<option value="">-- Pilih Kegiatan --</option>';
    selAct.disabled  = true;
    return;
  }
  const { data: acts } = await _client
    .from('project_activities')
    .select('id,title')
    .eq('project_name', projName)
    .order('created_at', { ascending: true });
  selAct.innerHTML = '<option value="">-- Pilih Kegiatan (opsional) --</option>' +
    (acts||[]).map(a => `<option value="${a.id}" data-title="${_esc(a.title)}">${_esc(a.title)}</option>`).join('');
  selAct.disabled = false;
};

window.closeBenModal = function () {
  document.getElementById('benFormOverlay').classList.add('hidden');
};

window.saveBeneficiary = async function () {
  const _client = window.client || client;
  const id   = document.getElementById('benFormId').value;
  const name = document.getElementById('benF-name').value.trim();
  const phone= document.getElementById('benF-phone').value.trim();
  if (!name) { showBenFormMsg('Nama wajib diisi.', 'error'); return; }

  const payload = {
    name,
    phone       : phone || null,
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
    const { data: inserted, error: errIns } = await _client
      .from('beneficiaries')
      .upsert(payload, { onConflict: 'name,phone', ignoreDuplicates: false })
      .select('id').single();
    error = errIns;
    benId = inserted?.id;
  }

  if (error) { showBenFormMsg('❌ ' + error.message, 'error'); return; }

  // ── Jika ada proyek dipilih → catat relasi beneficiary ↔ proyek ──
  const projName = document.getElementById('benF-project')?.value;
  const actSel   = document.getElementById('benF-activity');
  const actId    = actSel?.value;
  const actTitle = actSel?.options[actSel.selectedIndex]?.getAttribute('data-title') || '';

  if (benId && projName) {
    // Lookup project_id
    const { data: projData } = await _client.from('projects').select('id').eq('name', projName).single();

    // ① Selalu catat ke beneficiary_projects (agar filter proyek bisa bekerja)
    await _client.from('beneficiary_projects').upsert({
      beneficiary_id: benId,
      project_name  : projName,
      project_id    : projData?.id || null,
    }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });

    // ② Jika ada kegiatan → catat ke activity_participants juga
    if (actId) {
      const attendedDate = document.getElementById('benF-attended-date')?.value || null;
      const attendNote   = document.getElementById('benF-attend-note')?.value.trim() || null;

      const { error: errPart } = await _client.from('activity_participants').upsert({
        activity_id   : actId,
        activity_name : actTitle,
        project_name  : projName,
        project_id    : projData?.id || null,
        beneficiary_id: benId,
        attended_date : attendedDate || null,
        note          : attendNote,
      }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });

      if (errPart) {
        showBenFormMsg('✅ Data tersimpan, tapi gagal daftarkan ke kegiatan: ' + errPart.message, 'error');
        setTimeout(() => { closeBenModal(); loadBeneficiaries(); }, 1500);
        return;
      }
    }
  }

  showBenFormMsg('✅ Tersimpan!', 'success');
  setTimeout(() => { closeBenModal(); loadBeneficiaries(); }, 800);
};

function showBenFormMsg(msg, type) {
  const el = document.getElementById('benFormMsg');
  el.textContent = msg;
  el.className = `form-msg ${type}`;
}

// ── Detail beneficiary (riwayat kegiatan) ────────────────────────────
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

  // Load riwayat partisipasi
  const { data: parts } = await _client
    .from('activity_participants')
    .select('activity_name, project_name, attended_date, note')
    .eq('beneficiary_id', id)
    .order('attended_date', { ascending: false });

  const list = parts || [];
  document.getElementById('benDetailStats').innerHTML = `
    <span style="background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
      ${list.length}x kegiatan
    </span>
    <span style="background:#f0fdf4;color:#15803d;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">
      ${new Set(list.map(p=>p.project_name)).size} proyek
    </span>`;

  if (!list.length) {
    document.getElementById('benDetailHistory').innerHTML =
      '<div style="padding:16px;color:#94a3b8;font-size:13px">Belum ada riwayat kegiatan.</div>';
    return;
  }

  // Group by proyek
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
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 8px;border-radius:6px;background:#f8fafc;margin-bottom:4px">
          <div>
            <div style="font-size:12px;font-weight:600;color:#334155">${_esc(it.activity_name||'-')}</div>
            ${it.note ? `<div style="font-size:11px;color:#94a3b8">${_esc(it.note)}</div>` : ''}
          </div>
          <div style="font-size:11px;color:#94a3b8;white-space:nowrap;margin-left:8px">
            ${it.attended_date ? new Date(it.attended_date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-'}
          </div>
        </div>`).join('')}
    </div>`).join('');
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
  const uniquePeople   = new Set(rows.map(r => `${r.name}|${r.phone}`)).size;
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

  // Progress bar
  let processed = 0;
  const total   = rows.length;
  const updateProgress = () => {
    btn.textContent = `⏳ ${processed}/${total}...`;
  };
  updateProgress();

  // Load semua proyek & aktivitas satu kali (lebih efisien)
  const [{ data: allProjs }, { data: allActs }] = await Promise.all([
    _client.from('projects').select('id, name'),
    _client.from('project_activities').select('id, title, project_name'),
  ]);

  const projMap = {};
  (allProjs || []).forEach(p => { projMap[(p.name||'').toLowerCase()] = p.id; });
  const actMap = {};
  (allActs || []).forEach(a => {
    const key = `${(a.project_name||'').toLowerCase()}|${(a.title||'').toLowerCase()}`;
    actMap[key] = a;
  });

  let okBen = 0, okPart = 0, skipPart = 0;
  const warnPart   = [];
  const benIdCache = {}; // "name|phone" → uuid

  for (const r of rows) {
    // ── STEP 1: Upsert beneficiary ────────────────────────────────
    const cacheKey = `${r.name.toLowerCase()}|${r.phone||''}`;
    let benId = benIdCache[cacheKey];

    if (!benId) {
      const payload = {
        name       : r.name,
        phone      : r.phone || null,
        gender     : normGender(r.gender) || null,
        birth_year : parseInt(r.birth_year) || null,
        location   : r.location || null,
        occupation : r.occupation || null,
        email      : r.email || null,
        note       : r.note || null,
      };
      const { data: upserted, error: errBen } = await _client
        .from('beneficiaries')
        .upsert(payload, { onConflict: 'name,phone', ignoreDuplicates: false })
        .select('id')
        .single();

      if (!errBen && upserted) {
        benId = upserted.id;
        benIdCache[cacheKey] = benId;
        okBen++;
      } else {
        // Mungkin sudah ada — coba select
        const { data: existing } = await _client
          .from('beneficiaries').select('id')
          .eq('name', r.name)
          .eq('phone', r.phone || '')
          .single();
        if (existing) { benId = existing.id; benIdCache[cacheKey] = benId; }
      }
    }

    // ── STEP 1b: Catat relasi beneficiary ↔ proyek ─────────────────
    if (benId && r.project_name) {
      await _client.from('beneficiary_projects').upsert({
        beneficiary_id: benId,
        project_name  : r.project_name,
        project_id    : projMap[r.project_name.toLowerCase()] || null,
      }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
    }

    // ── STEP 2: Insert ke activity_participants ───────────────────
    if (benId && r.project_name && r.activity_name) {
      const actKey = `${r.project_name.toLowerCase()}|${r.activity_name.toLowerCase()}`;
      const act    = actMap[actKey];

      if (!act) {
        warnPart.push(`Kegiatan "${r.activity_name}" (${r.project_name}) tidak ditemukan`);
        skipPart++;
      } else {
        const projId = projMap[r.project_name.toLowerCase()] || null;
        const { error: errPart } = await _client
          .from('activity_participants')
          .upsert({
            activity_id   : act.id,
            activity_name : act.title,
            project_name  : r.project_name,
            project_id    : projId,
            beneficiary_id: benId,
            attended_date : parseDate(r.attended_date) || null,
            note          : r.note || null,
          }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });

        if (!errPart) okPart++; else skipPart++;
      }
    } else if (benId && (!r.project_name || !r.activity_name)) {
      // Hanya data orang tanpa kegiatan — tetap tersimpan
    }

    processed++;
    updateProgress();
  }

  btn.disabled = false; btn.textContent = 'Import Sekarang';
  const uniqueBen = Object.keys(benIdCache).length;

  let msg = `🎉 ${uniqueBen} penerima manfaat tersimpan`;
  if (okPart)  msg += ` • ${okPart} partisipasi terekam`;
  if (skipPart) msg += ` • ${skipPart} dilewati`;
  showBenImportMsg(msg + '.', 'success');

  if (warnPart.length) {
    const uniqueW = [...new Set(warnPart)].slice(0, 5);
    document.getElementById('benImportPreview').innerHTML += `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 12px;font-size:11px;color:#991b1b;margin-top:8px">
        <strong>⚠️ Kegiatan tidak ditemukan (${warnPart.length} baris):</strong><br>
        ${uniqueW.map(w=>`• ${_esc(w)}`).join('<br>')}
        ${warnPart.length > 5 ? `<br>… dan ${warnPart.length-5} lainnya` : ''}
        <br><small style="margin-top:4px;display:block">Pastikan Nama Proyek & Nama Kegiatan sama persis dengan yang ada di sistem.</small>
      </div>`;
  }

  setTimeout(() => { if (!warnPart.length) closeBenImport(); loadBeneficiaries(); },
    warnPart.length ? 0 : 1500);
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
