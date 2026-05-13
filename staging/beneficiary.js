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

  // Hitung stats dulu
  const [{ data: benData }, { data: partData }] = await Promise.all([
    _client.from('beneficiaries').select('id, name, phone, gender, birth_year, location, occupation, email, note'),
    _client.from('activity_participants').select('beneficiary_id, project_name, activity_name, attended_date'),
  ]);

  _benAllData = benData || [];
  const participants = partData || [];

  // Hitung per-beneficiary: berapa kali hadir & di proyek apa saja
  const partMap = {};
  participants.forEach(p => {
    if (!partMap[p.beneficiary_id]) partMap[p.beneficiary_id] = [];
    partMap[p.beneficiary_id].push(p);
  });

  // Hitung stats card
  const totalUnique    = _benAllData.length;
  const totalMale      = _benAllData.filter(b => b.gender === 'Laki-laki').length;
  const totalFemale    = _benAllData.filter(b => b.gender === 'Perempuan').length;
  const totalParticip  = participants.length;
  const projectsSet    = new Set(participants.map(p => p.project_name).filter(Boolean));

  document.getElementById('benStatUnique').textContent   = totalUnique.toLocaleString('id-ID');
  document.getElementById('benStatMale').textContent     = totalMale.toLocaleString('id-ID');
  document.getElementById('benStatFemale').textContent   = totalFemale.toLocaleString('id-ID');
  document.getElementById('benStatParticip').textContent = totalParticip.toLocaleString('id-ID');

  // Gabungkan data + partisipasi
  _benAllData = _benAllData.map(b => ({
    ...b,
    participations: partMap[b.id] || [],
    totalKegiatan : (partMap[b.id] || []).length,
    totalProyek   : new Set((partMap[b.id] || []).map(p => p.project_name)).size,
  }));

  _benFilteredData = [..._benAllData];
  _benCurrentPage  = 1;
  renderBenTable();
  showBenLoading(false);
};

// ── Filter & Search ───────────────────────────────────────────────────
window.filterBeneficiaries = function () {
  const q       = (document.getElementById('benSearchInput')?.value || '').toLowerCase();
  const gender  = document.getElementById('benFilterGender')?.value || '';
  const project = document.getElementById('benFilterProject')?.value || '';

  _benFilteredData = _benAllData.filter(b => {
    const matchQ = !q ||
      (b.name||'').toLowerCase().includes(q) ||
      (b.phone||'').toLowerCase().includes(q) ||
      (b.location||'').toLowerCase().includes(q) ||
      (b.occupation||'').toLowerCase().includes(q);
    const matchG = !gender || b.gender === gender;
    const matchP = !project || b.participations.some(p => p.project_name === project);
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
    const projs = [...new Set(b.participations.map(p => p.project_name))].filter(Boolean);
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
window.openAddBenModal = function () {
  document.getElementById('benFormOverlay').classList.remove('hidden');
  document.getElementById('benFormTitle').textContent = 'Tambah Penerima Manfaat';
  document.getElementById('benForm').reset();
  document.getElementById('benFormId').value = '';
  document.getElementById('benFormMsg').className = 'form-msg hidden';
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

  let error;
  if (id) {
    ({ error } = await _client.from('beneficiaries').update(payload).eq('id', id));
  } else {
    ({ error } = await _client.from('beneficiaries').insert(payload));
  }

  if (error) { showBenFormMsg('❌ ' + error.message, 'error'); return; }
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

const BEN_COL_MAP = {
  name       : ['name','nama','nama_lengkap','full_name'],
  phone      : ['phone','telepon','no_hp','hp','nomor_hp','no_telepon','handphone'],
  gender     : ['gender','jenis_kelamin','kelamin','sex'],
  birth_year : ['birth_year','tahun_lahir','thn_lahir','lahir','year_of_birth'],
  location   : ['location','lokasi','alamat','desa','kecamatan','domisili'],
  occupation : ['occupation','pekerjaan','profesi','job'],
  email      : ['email','e_mail','surel'],
  note       : ['note','catatan','keterangan'],
};

function resolveBenField(row, aliases) {
  for (const a of aliases) if (row[a] !== undefined && row[a] !== '') return row[a];
  return '';
}
function mapBenRow(row) {
  const r = {};
  Object.keys(BEN_COL_MAP).forEach(f => { r[f] = resolveBenField(row, BEN_COL_MAP[f]); });
  return r;
}
function normGender(v) {
  if (!v) return null;
  const vl = v.toLowerCase();
  if (vl.startsWith('l') || vl === 'm' || vl.includes('laki')) return 'Laki-laki';
  if (vl.startsWith('p') || vl === 'f' || vl.includes('perempuan') || vl.includes('wanita')) return 'Perempuan';
  return v;
}

function previewBenImport(rows) {
  const mapped  = rows.map(r => mapBenRow(r)).filter(r => r.name);
  const noName  = rows.length - mapped.length;
  window._benImportRows = mapped;

  const area = document.getElementById('benImportPreview');
  if (!mapped.length) {
    area.innerHTML = '<div style="color:#ef4444;font-size:13px">Tidak ada data valid ditemukan.</div>';
    return;
  }

  area.innerHTML = `
    <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:8px">
      👤 Preview <span style="color:#64748b;font-weight:400">(${mapped.length} orang${noName ? ', '+noName+' baris dilewati (tanpa nama)' : ''})</span>
    </div>
    <div class="table-wrap" style="max-height:240px;overflow-y:auto">
      <table style="font-size:12px">
        <thead><tr><th>#</th><th>Nama</th><th>No HP</th><th>Gender</th><th>Thn Lahir</th><th>Lokasi</th><th>Pekerjaan</th></tr></thead>
        <tbody>${mapped.map((r,i) => `
          <tr>
            <td style="color:#94a3b8">${i+1}</td>
            <td style="font-weight:600">${_esc(r.name)}</td>
            <td style="color:#475569">${_esc(r.phone||'-')}</td>
            <td>${r.gender ? normGender(r.gender) : '-'}</td>
            <td style="color:#475569">${r.birth_year||'-'}</td>
            <td style="color:#475569">${_esc(r.location||'-')}</td>
            <td style="color:#475569">${_esc(r.occupation||'-')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  showBenImportMsg(`✅ ${mapped.length} penerima manfaat siap diimport.`, 'success');
  document.getElementById('benImportConfirmBtn').classList.remove('hidden');
}

window.runBenImport = async function () {
  const rows = window._benImportRows;
  if (!rows?.length) return;
  const btn = document.getElementById('benImportConfirmBtn');
  btn.disabled = true; btn.textContent = '⏳ Mengimport...';
  const _client = window.client || client;
  let ok = 0, skip = 0;

  for (const r of rows) {
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
    const { error } = await _client
      .from('beneficiaries')
      .upsert(payload, { onConflict: 'name,phone', ignoreDuplicates: true });
    if (error) skip++; else ok++;
  }

  btn.disabled = false; btn.textContent = 'Import Sekarang';
  showBenImportMsg(`🎉 ${ok} berhasil${skip ? ', '+skip+' dilewati (duplikat).' : '.'}`, 'success');
  setTimeout(() => { closeBenImport(); loadBeneficiaries(); }, 1500);
};

function showBenImportMsg(msg, type) {
  const el = document.getElementById('benImportMsg');
  el.textContent = msg; el.className = `form-msg ${type}`; el.classList.remove('hidden');
}

// ── Download template beneficiary ─────────────────────────────────────
window.downloadBenTemplate = function () {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Nama*','No HP','Jenis Kelamin','Tahun Lahir','Lokasi/Desa','Pekerjaan','Email','Catatan'],
    ['Ahmad Fauzi','081234567890','Laki-laki','1985','Bali / Jembrana','Nelayan','',''],
    ['Siti Rahma','082345678901','Perempuan','1990','Sulawesi Utara / Manado','Pengolah Ikan','siti@gmail.com',''],
    ['Budi Santoso','083456789012','Laki-laki','1978','Kalimantan Timur / Balikpapan','Nelayan','','Anggota KUB'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [25,18,15,12,25,20,25,20].map(w=>({wch:w}));
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
  const lower = q.toLowerCase();
  const list  = (window._benPickerAll || []).filter(b =>
    !q || (b.name||'').toLowerCase().includes(lower) || (b.phone||'').includes(lower)
  );
  const container = document.getElementById('benPickerList');
  if (!list.length) {
    container.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:13px">Tidak ada hasil.</div>';
    return;
  }
  container.innerHTML = list.map(b => {
    const already = window._benPickerExisting?.has(b.id);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;margin-bottom:3px;background:${already?'#f0fdf4':'#f8fafc'}">
      <div>
        <div style="font-weight:600;font-size:12px;color:#0f172a">${_esc(b.name)}</div>
        <div style="font-size:11px;color:#94a3b8">${_esc(b.phone||'')}${b.location?' · '+_esc(b.location):''}</div>
      </div>
      ${already
        ? `<span style="font-size:11px;color:#15803d;font-weight:600">✓ Sudah hadir</span>`
        : `<button class="btn-primary btn-sm" onclick="addParticipant('${b.id}','${_esc(b.name).replace(/'/g,"\\\\'")}')">+ Tambah</button>`}
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

  const { error } = await _client.from('activity_participants').insert({
    activity_id   : actId,
    activity_name : actName,
    project_name  : projName,
    project_id    : projData?.id || null,
    beneficiary_id: benId,
    attended_date : new Date().toISOString().split('T')[0],
  });

  if (error && !error.message.includes('unique')) {
    alert('Gagal tambah: ' + error.message); return;
  }
  window._benPickerExisting?.add(benId);
  renderBenPicker(document.getElementById('benPickerSearch').value);

  // Update badge jumlah peserta di modal aktivitas
  if (typeof refreshParticipantBadge === 'function') refreshParticipantBadge(actId);
};
