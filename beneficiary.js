// =====================================================================
// beneficiary.js — FULL REBUILD AMAN
// Fokus: import beneficiary berjalan stabil
// =====================================================================

let benRows = [];
let benFilteredRows = [];
let benCurrentPage = 1;
let benImportSession = 0;
let benImportBusy = false;

function escB(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEl(id) { return document.getElementById(id); }

function showBenMsg(msg, type = 'success') {
  const el = getEl('benImportMsg');
  if (!el) return;
  el.className = `form-msg ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideBenMsg() {
  const el = getEl('benImportMsg');
  if (!el) return;
  el.className = 'form-msg hidden';
  el.textContent = '';
}

function setBenBtnState(disabled, text) {
  const btn = getEl('benImportConfirmBtn');
  if (!btn) return;
  btn.disabled = !!disabled;
  if (text) btn.textContent = text;
  btn.classList.remove('hidden');
}

function norm(v) {
  return String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function parseDateSafe(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function mapRow(row) {
  return {
    project_name: row.project || row.project_name || row.proyek || row.nama_proyek || '',
    activity_name: row.activity || row.activity_name || row.aktivitas || row.nama_aktivitas || '',
    name: row.name || row.nama || '',
    gender: row.gender || row.jenis_kelamin || '',
    location: row.location || row.location_name || row.asal || row.lokasi || '',
    phone: row.phone || row.hp || row.handphone || row.nomor_hp || '',
    occupation: row.occupation || row.pekerjaan || '',
    birth_year: row.birth_year || row.tahun_lahir || '',
    attended_date: row.attended_date || row.tanggal_hadir || row.date || '',
    note: row.note || row.catatan || '',
    email: row.email || '',
  };
}

function rowsFromSheet(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  return raw.map(r => {
    const o = {};
    Object.keys(r).forEach(k => {
      const key = String(k).toLowerCase().trim().replace(/[\s\-\/]+/g, '_');
      o[key] = r[k];
    });
    return o;
  });
}

window.openBenImportModal = function () {
  const overlay = getEl('benFormOverlay');
  if (overlay) overlay.classList.remove('hidden');
  hideBenMsg();
};

window.closeBenImport = function () {
  const overlay = getEl('benFormOverlay');
  if (overlay) overlay.classList.add('hidden');
};

function renderBenPreview() {
  const body = getEl('benPreviewBody');
  if (!body) return;
  const rows = benRows.slice(0, 20);
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:18px;color:#94a3b8">Belum ada data.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escB(r.project_name || '-')}</td>
      <td>${escB(r.activity_name || '-')}</td>
      <td>${escB(r.name || '-')}</td>
      <td>${escB(r.gender || '-')}</td>
      <td>${escB(r.location || '-')}</td>
      <td>${escB(r.phone || '-')}</td>
      <td>${escB(r.occupation || '-')}</td>
      <td>${escB(parseDateSafe(r.attended_date) || '-')}</td>
    </tr>`).join('');
}

window.handleBenImportFile = function (file) {
  const ext = String(file.name.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showBenMsg('Format tidak didukung. Gunakan .xlsx, .xls, atau .csv', 'error');
    return;
  }
  showBenMsg('Memproses file...', 'success');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = rowsFromSheet(ws);
      benRows = raw.map(mapRow).filter(r => r.name);
      benFilteredRows = [...benRows];
      benImportSession += 1;
      renderBenPreview();
      showBenMsg(`${benRows.length} baris siap diimport.`, 'success');
      setBenBtnState(false, 'Import Sekarang');
    } catch (err) {
      showBenMsg('Gagal membaca file: ' + err.message, 'error');
      setBenBtnState(true, 'Import Sekarang');
    }
  };
  reader.readAsArrayBuffer(file);
};

window.downloadBenTemplate = function () {
  const wb = XLSX.utils.book_new();
  const headers = ['Project', 'Aktivitas', 'Nama', 'Jenis Kelamin', 'Asal', 'Handphone', 'Pekerjaan', 'Tahun Lahir', 'Tanggal Hadir', 'Catatan'];
  const rows = [
    headers,
    ['Project A', 'Workshop', 'Ahmad Fauzi', 'Laki-laki', 'Bali', '08123456789', 'Nelayan', '1985', '2026-05-01', ''],
    ['Project A', 'Workshop', 'Siti Rahma', 'Perempuan', 'NTB', '08123456780', 'Pengolah Ikan', '1990', '2026-05-01', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Penerima Manfaat');
  XLSX.writeFile(wb, 'Template_Penerima_Manfaat_PIMS.xlsx');
};

window.runBenImport = async function () {
  if (benImportBusy) return;
  const rows = benRows || [];
  if (!rows.length) {
    showBenMsg('Tidak ada data untuk diimport.', 'error');
    return;
  }

  benImportBusy = true;
  const btn = getEl('benImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = `Mengimport 0/${rows.length}`; }

  try {
    const client = window.client;
    if (!client) throw new Error('Supabase client belum siap');

    let imported = 0;
    let failed = 0;

    const { data: projects } = await client.from('projects').select('id, name');
    const { data: activities } = await client.from('project_activities').select('id, title, project_name');

    const projMap = {};
    (projects || []).forEach(p => projMap[norm(p.name)] = p.id);
    const actMap = {};
    (activities || []).forEach(a => {
      actMap[`${norm(a.project_name)}|${norm(a.title)}`] = a;
    });

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const payload = {
        name: r.name,
        phone: r.phone || null,
        gender: r.gender || null,
        birth_year: parseInt(r.birth_year) || null,
        location: r.location || null,
        occupation: r.occupation || null,
        email: r.email || null,
        note: r.note || null,
      };

      const { data: ben, error: benErr } = await client
        .from('beneficiaries')
        .insert(payload)
        .select('id')
        .single();

      if (benErr || !ben) {
        failed += 1;
        continue;
      }

      imported += 1;

      if (r.project_name) {
        await client.from('beneficiary_projects').upsert({
          beneficiary_id: ben.id,
          project_name: r.project_name,
          project_id: projMap[norm(r.project_name)] || null,
        }, { onConflict: 'beneficiary_id,project_name', ignoreDuplicates: true });
      }

      if (r.activity_name) {
        const actKey = `${norm(r.project_name)}|${norm(r.activity_name)}`;
        const act = actMap[actKey];
        const projId = projMap[norm(r.project_name)] || null;
        if (act) {
          await client.from('activity_participants').upsert({
            activity_id: act.id,
            activity_name: act.title,
            project_name: r.project_name || null,
            project_id: projId,
            beneficiary_id: ben.id,
            attended_date: parseDateSafe(r.attended_date),
            note: r.note || null,
          }, { onConflict: 'activity_id,beneficiary_id', ignoreDuplicates: true });
        } else {
          await client.from('beneficiary_activity_log').upsert({
            beneficiary_id: ben.id,
            project_name: r.project_name || null,
            project_id: projId,
            activity_name: r.activity_name,
            attended_date: parseDateSafe(r.attended_date),
            source: 'import',
            note: r.note || null,
          }, { onConflict: 'beneficiary_id,project_name,activity_name', ignoreDuplicates: true });
        }
      }

      if (btn) btn.textContent = `Mengimport ${i + 1}/${rows.length}`;
    }

    showBenMsg(`Import selesai: ${imported} berhasil${failed ? `, ${failed} gagal` : ''}.`, failed ? 'error' : 'success');
    setTimeout(() => {
      closeBenImport();
      if (typeof loadBeneficiaries === 'function') loadBeneficiaries();
    }, 1200);
  } catch (err) {
    showBenMsg('Import gagal: ' + err.message, 'error');
  } finally {
    benImportBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Import Sekarang'; }
  }
};

window.loadBeneficiaries = window.loadBeneficiaries || function () {};

document.addEventListener('DOMContentLoaded', () => {
  const overlay = getEl('benFormOverlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeBenImport();
    });
  }
  const fileInput = getEl('importFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleBenImportFile(e.target.files[0]);
    });
  }
  const drop = getEl('importDropzone');
  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleBenImportFile(f);
    });
  }
  const btn = getEl('benImportConfirmBtn');
  if (btn) {
    btn.onclick = () => window.runBenImport();
  }
});
