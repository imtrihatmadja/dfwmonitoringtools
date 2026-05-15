// =====================================================================
// import.js — Fitur Import Excel/CSV ke Supabase
// PMIS DFW Indonesia | v1.0
// Bergantung pada: SheetJS (xlsx) CDN, window.client dari app.js
// =====================================================================

// ── Buka modal import ────────────────────────────────────────────────
window.openImportModal = function () {
  document.getElementById('importModalOverlay').classList.remove('hidden');
  resetImportModal();
};
window.closeImportModal = function () {
  document.getElementById('importModalOverlay').classList.add('hidden');
};

function resetImportModal() {
  document.getElementById('importFileInput').value = '';
  document.getElementById('importPreviewArea').innerHTML = '';
  document.getElementById('importStatusMsg').textContent = '';
  document.getElementById('importStatusMsg').className = 'form-msg hidden';
  document.getElementById('importConfirmBtn').classList.add('hidden');
  document.getElementById('importDropzone').classList.remove('dragover');
  window._importParsed = null;
}

// ── Drag & Drop ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('importDropzone');
  if (!dz) return;
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  });
  document.getElementById('importFileInput').addEventListener('change', e => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
  });
});

// ── Parse file ───────────────────────────────────────────────────────
function handleImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls','csv'].includes(ext)) {
    showImportMsg('❌ Format tidak didukung. Gunakan file .xlsx, .xls, atau .csv', 'error');
    return;
  }
  showImportMsg('⏳ Membaca file...', '');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      parseWorkbook(wb, file.name);
    } catch(err) {
      showImportMsg('❌ Gagal membaca file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseWorkbook(wb, fileName) {
  // Deteksi mode: xlsx multi-sheet atau csv single sheet
  const ext = fileName.split('.').pop().toLowerCase();
  let projectRows = [], indicatorRows = [];

  if (ext === 'csv') {
    // CSV: hanya proyek saja
    const ws   = wb.Sheets[wb.SheetNames[0]];
    projectRows = sheetToRows(ws);
  } else {
    // XLSX: cari sheet "projects" & "indicators" (case insensitive)
    const sheetNames = wb.SheetNames.map(s => s.toLowerCase());
    const projIdx  = sheetNames.findIndex(s => s.includes('proyek') || s.includes('project'));
    const indIdx   = sheetNames.findIndex(s => s.includes('indikator') || s.includes('indicator'));
    if (projIdx < 0) {
      showImportMsg('❌ Sheet "Proyek" atau "Projects" tidak ditemukan di file Excel.', 'error');
      return;
    }
    projectRows  = sheetToRows(wb.Sheets[wb.SheetNames[projIdx]]);
    if (indIdx >= 0) indicatorRows = sheetToRows(wb.Sheets[wb.SheetNames[indIdx]]);
  }

  if (!projectRows.length) {
    showImportMsg('❌ Tidak ada data proyek yang ditemukan di file.', 'error');
    return;
  }

  const { valid, errors } = validateRows(projectRows, indicatorRows);
  window._importParsed = { projectRows, indicatorRows };
  renderImportPreview(projectRows, indicatorRows, errors);

  if (errors.length) {
    showImportMsg(`⚠️ Ditemukan ${errors.length} peringatan. Periksa highlight merah di tabel preview.`, 'error');
    document.getElementById('importConfirmBtn').classList.remove('hidden');
  } else {
    showImportMsg(`✅ ${projectRows.length} proyek${indicatorRows.length ? ' + ' + indicatorRows.length + ' indikator' : ''} siap diimport.`, 'success');
    document.getElementById('importConfirmBtn').classList.remove('hidden');
  }
}

// ── Sheet → array of objects ──────────────────────────────────────────
function sheetToRows(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  if (!raw.length) return [];
  // Normalisasi key: lowercase + trim + ganti spasi/strip → underscore
  return raw.map(row => {
    const norm = {};
    Object.keys(row).forEach(k => {
      const key = k.toLowerCase().trim().replace(/[\s\-\/]+/g, '_');
      norm[key] = (row[k] !== undefined && row[k] !== null) ? String(row[k]).trim() : '';
    });
    return norm;
  });
}

// ── Alias mapping kolom ───────────────────────────────────────────────
const COL_MAP_PROJECT = {
  name:            ['name','nama_proyek','nama','project_name','judul'],
  location:        ['location','lokasi','wilayah'],
  owner:           ['owner','pic','penanggung_jawab','pelaksana','pj'],
  donor:           ['donor','funder','pemberi_dana','funding'],
  start_date:      ['start_date','tanggal_mulai','mulai','start'],
  deadline:        ['deadline','tanggal_selesai','end_date','selesai','akhir'],
  status:          ['status'],
  goal:            ['goal','tujuan','tujuan_proyek'],
  description:     ['description','deskripsi','keterangan'],
  note:            ['note','catatan'],
  budget_approved: ['budget_approved','anggaran_disetujui','anggaran','budget','pagu'],
  budget_actual:   ['budget_actual','realisasi_anggaran','realisasi','actual_budget'],
};
const COL_MAP_IND = {
  project_name:   ['project_name','nama_proyek','proyek'],
  indicator_name: ['indicator_name','nama_indikator','indikator','indicator'],
  type:           ['type','tipe','jenis'],
  target:         ['target'],
  unit:           ['unit','satuan'],
  actual:         ['actual','capaian','capaian_awal','realisasi'],
};

function resolveField(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return '';
}

function mapProjectRow(row) {
  const r = {};
  Object.keys(COL_MAP_PROJECT).forEach(field => {
    r[field] = resolveField(row, COL_MAP_PROJECT[field]);
  });
  return r;
}
function mapIndicatorRow(row) {
  const r = {};
  Object.keys(COL_MAP_IND).forEach(field => {
    r[field] = resolveField(row, COL_MAP_IND[field]);
  });
  return r;
}

// ── Validasi ──────────────────────────────────────────────────────────
function validateRows(projectRows, indicatorRows) {
  const errors = [];
  const projectNames = new Set();

  projectRows.forEach((raw, i) => {
    const r = mapProjectRow(raw);
    if (!r.name) errors.push({ sheet: 'Proyek', row: i + 2, field: 'name', msg: 'Nama Proyek wajib diisi' });
    if (!r.location) errors.push({ sheet: 'Proyek', row: i + 2, field: 'location', msg: 'Lokasi wajib diisi' });
    if (!r.owner) errors.push({ sheet: 'Proyek', row: i + 2, field: 'owner', msg: 'Penanggung Jawab wajib diisi' });
    if (r.name) projectNames.add(r.name.toLowerCase());
  });

  indicatorRows.forEach((raw, i) => {
    const r = mapIndicatorRow(raw);
    if (!r.project_name) errors.push({ sheet: 'Indikator', row: i + 2, field: 'project_name', msg: 'Nama Proyek wajib diisi' });
    else if (!projectNames.has(r.project_name.toLowerCase()))
      errors.push({ sheet: 'Indikator', row: i + 2, field: 'project_name', msg: `Proyek "${r.project_name}" tidak ada di sheet Proyek` });
    if (!r.indicator_name) errors.push({ sheet: 'Indikator', row: i + 2, field: 'indicator_name', msg: 'Nama Indikator wajib diisi' });
    if (!r.target) errors.push({ sheet: 'Indikator', row: i + 2, field: 'target', msg: 'Target wajib diisi' });
  });

  return { valid: errors.length === 0, errors };
}

// ── Render preview tabel ──────────────────────────────────────────────
function renderImportPreview(projectRows, indicatorRows, errors) {
  const errSet = new Set(errors.map(e => `${e.sheet}-${e.row}`));
  const area = document.getElementById('importPreviewArea');

  // Tabel Proyek
  const projMapped = projectRows.map(r => mapProjectRow(r));
  let html = `
    <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:8px">
      📋 Preview Proyek <span style="color:#64748b;font-weight:400">(${projMapped.length} baris)</span>
    </div>
    <div class="table-wrap" style="margin-bottom:20px;max-height:220px;overflow-y:auto">
      <table style="font-size:12px">
        <thead><tr>
          <th>#</th><th>Nama Proyek</th><th>Lokasi</th><th>PIC</th>
          <th>Donor</th><th>Status</th><th>Mulai</th><th>Deadline</th>
        </tr></thead>
        <tbody>
          ${projMapped.map((r, i) => {
            const hasErr = errSet.has(`Proyek-${i+2}`);
            return `<tr style="${hasErr ? 'background:#fef2f2' : ''}">
              <td style="color:#94a3b8">${i+1}</td>
              <td style="font-weight:600${!r.name?' color:#ef4444':''}">${r.name||'<em style="color:#ef4444">Kosong!</em>'}</td>
              <td>${r.location||'<span style="color:#f59e0b">-</span>'}</td>
              <td>${r.owner||'<span style="color:#f59e0b">-</span>'}</td>
              <td>${r.donor||'-'}</td>
              <td>${r.status||'-'}</td>
              <td>${r.start_date||'-'}</td>
              <td>${r.deadline||'-'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  // Tabel Indikator (jika ada)
  if (indicatorRows.length) {
    const indMapped = indicatorRows.map(r => mapIndicatorRow(r));
    html += `
      <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:8px">
        📊 Preview Indikator <span style="color:#64748b;font-weight:400">(${indMapped.length} baris)</span>
      </div>
      <div class="table-wrap" style="max-height:200px;overflow-y:auto">
        <table style="font-size:12px">
          <thead><tr>
            <th>#</th><th>Nama Proyek</th><th>Nama Indikator</th>
            <th>Tipe</th><th>Target</th><th>Satuan</th><th>Capaian Awal</th>
          </tr></thead>
          <tbody>
            ${indMapped.map((r, i) => {
              const hasErr = errSet.has(`Indikator-${i+2}`);
              return `<tr style="${hasErr ? 'background:#fef2f2' : ''}">
                <td style="color:#94a3b8">${i+1}</td>
                <td>${r.project_name||'<em style="color:#ef4444">Kosong!</em>'}</td>
                <td style="font-weight:600">${r.indicator_name||'<em style="color:#ef4444">Kosong!</em>'}</td>
                <td><span class="badge badge-${(r.type||'output').toLowerCase()}">${r.type||'Output'}</span></td>
                <td>${r.target||'<span style="color:#ef4444">0</span>'}</td>
                <td>${r.unit||'-'}</td>
                <td>${r.actual||'0'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // Error list
  if (errors.length) {
    html += `
      <div style="margin-top:16px;padding:12px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
        <div style="font-weight:700;font-size:12px;color:#dc2626;margin-bottom:8px">⚠️ Peringatan (${errors.length})</div>
        ${errors.map(e => `<div style="font-size:12px;color:#b91c1c;margin-bottom:3px">
          Baris ${e.row} [${e.sheet}] — ${e.msg}
        </div>`).join('')}
      </div>`;
  }

  area.innerHTML = html;
}

// ── Proses import ke Supabase ─────────────────────────────────────────
window.runImport = async function () {
  const { projectRows, indicatorRows } = window._importParsed || {};
  if (!projectRows?.length) return;

  const btn = document.getElementById('importConfirmBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Mengimport...';

  const _client = window.client || client;
  let successCount = 0, failCount = 0, failDetails = [];

  // Import proyek satu per satu
  for (let i = 0; i < projectRows.length; i++) {
    const raw = mapProjectRow(projectRows[i]);
    const payload = {
      name            : raw.name,
      location        : raw.location || '',
      owner           : raw.owner || '',
      donor           : raw.donor || null,
      start_date      : parseDate(raw.start_date),
      deadline        : parseDate(raw.deadline),
      status          : raw.status || 'Aktif',
      goal            : raw.goal || null,
      description     : raw.description || null,
      note            : raw.note || null,
      budget_approved : parseNum(raw.budget_approved),
      budget_actual   : parseNum(raw.budget_actual),
      progress        : 0,
      archived        : false,
    };

    showImportMsg(`⏳ Mengimport proyek ${i+1}/${projectRows.length}: ${payload.name}`, '');

    const { data, error } = await _client
      .from('projects')
      .upsert(payload, { onConflict: 'name' })
      .select('id').single();

    if (error) {
      failCount++;
      failDetails.push(`Baris ${i+2}: ${payload.name} — ${error.message}`);
      continue;
    }

    successCount++;
    const savedId = data?.id;

    // Import indikator untuk proyek ini
    const projInds = indicatorRows
      .map(r => mapIndicatorRow(r))
      .filter(r => r.project_name?.toLowerCase() === payload.name.toLowerCase());

    for (const ind of projInds) {
      const indPayload = {
        project_name   : payload.name,
        project_id     : savedId,
        indicator_name : ind.indicator_name,
        type           : normalizeType(ind.type),
        target         : parseNum(ind.target),
        unit           : ind.unit || null,
        actual         : parseNum(ind.actual),
      };
      await _client.from('project_indicators').upsert(indPayload, { onConflict: 'project_name,indicator_name' }).select('id');
    }
  }

  // Selesai
  btn.disabled = false;
  btn.textContent = '✅ Import Lagi';

  if (failCount === 0) {
    showImportMsg(`🎉 Berhasil import ${successCount} proyek!`, 'success');
    setTimeout(() => {
      closeImportModal();
      if (typeof loadProjects === 'function') loadProjects();
      if (typeof switchTab === 'function') switchTab('projects');
    }, 1800);
  } else {
    showImportMsg(`✅ ${successCount} berhasil, ❌ ${failCount} gagal:\n${failDetails.join('\n')}`, 'error');
  }
};

// ── Helper functions ─────────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  // Format: Date object dari SheetJS, atau string YYYY-MM-DD / DD/MM/YYYY
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-');
    return `${y}-${m}-${d}`;
  }
  return null;
}
function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0;
  return Number(String(val).replace(/[^0-9.-]/g, '')) || 0;
}
function normalizeType(val) {
  const v = (val || 'Output').toLowerCase();
  if (v.includes('outcome')) return 'Outcome';
  if (v.includes('impact'))  return 'Impact';
  return 'Output';
}
function showImportMsg(msg, type) {
  const el = document.getElementById('importStatusMsg');
  el.textContent = msg;
  el.className = type === 'error' ? 'form-msg error' :
                 type === 'success' ? 'form-msg success' : 'form-msg';
  el.classList.remove('hidden');
}

// ── Download Template Excel ───────────────────────────────────────────
window.downloadImportTemplate = function () {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Proyek
  const projData = [
    ['Nama Proyek*','Lokasi*','Penanggung Jawab*','Donor/Funder','Tanggal Mulai','Deadline',
     'Status','Tujuan Proyek','Deskripsi','Catatan','Anggaran Disetujui','Realisasi Anggaran'],
    ['Contoh: Proyek Perlindungan Nelayan','Bali','Imam Trihatmadja','UNDP',
     '2026-01-01','2026-12-31','Aktif','Meningkatkan kesejahteraan nelayan','Deskripsi proyek','','500000000','250000000'],
    ['Proyek 2','Jakarta','Nama PIC 2','EJF','2026-03-01','2026-11-30','Aktif','','','','300000000','0'],
  ];
  const wsProj = XLSX.utils.aoa_to_sheet(projData);
  wsProj['!cols'] = [30,20,25,20,15,15,15,40,40,30,20,20].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsProj, 'Proyek');

  // Sheet 2: Indikator
  const indData = [
    ['Nama Proyek*','Nama Indikator*','Tipe (Output/Outcome/Impact)*','Target*','Satuan','Capaian Awal'],
    ['Contoh: Proyek Perlindungan Nelayan','Jumlah nelayan terlatih','Output','100','Orang','0'],
    ['Contoh: Proyek Perlindungan Nelayan','Jumlah kebijakan diadvokasi','Outcome','3','Dokumen','0'],
    ['Proyek 2','Jumlah laporan monitoring','Output','12','Laporan','0'],
  ];
  const wsInd = XLSX.utils.aoa_to_sheet(indData);
  wsInd['!cols'] = [35,35,25,10,15,15].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsInd, 'Indikator');

  XLSX.writeFile(wb, 'Template_Import_PMIS_DFW.xlsx');
};
