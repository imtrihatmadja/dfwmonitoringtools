// ============================================================
// IMPACT PER PROJECT — inject dampak ke setiap project card
// ============================================================

function impactIcon(unit) {
  const u = (unit || '').toLowerCase();
  if (['orang','jiwa','nelayan','peserta','benefisiari','perempuan',
       'laki-laki','anak','pekerja','buruh','anggota','komunitas',
       'keluarga','rumah tangga'].some(k => u.includes(k))) return '👥';
  if (['dokumen','laporan','modul','publikasi','buku','panduan',
       'kebijakan','regulasi','peraturan'].some(k => u.includes(k))) return '📄';
  if (['kapal','perahu','alat','unit'].some(k => u.includes(k))) return '🚢';
  if (['hektar','ha','km','wilayah','lokasi','desa','kawasan','area'].some(k => u.includes(k))) return '🗺️';
  if (['kegiatan','event','pelatihan','workshop','pertemuan','sosialisasi'].some(k => u.includes(k))) return '📅';
  if (['kg','ton','gram','kwintal'].some(k => u.includes(k))) return '⚖️';
  if (['mou','perjanjian','kontrak','kesepakatan'].some(k => u.includes(k))) return '🤝';
  return '🎯';
}

// Hitung dampak per proyek dari project_indicators yang sudah ada di allProjects
function calcProjectImpact(proj) {
  const inds = proj.project_indicators || [];
  const grouped = {};

  inds.forEach(ind => {
    const rawUnit = (ind.unit || '').trim();
    if (!rawUnit) return;
    const unitKey = rawUnit.toLowerCase();

    const upds   = ind.indicator_updates || [];
    const actVal = upds.length
      ? Number([...upds].sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        )[0].actual_value) || 0
      : Number(ind.actual) || 0;

    if (!grouped[unitKey]) {
      grouped[unitKey] = { unitDisplay: rawUnit, total: 0, count: 0 };
    }
    grouped[unitKey].total += actVal;
    grouped[unitKey].count += 1;
  });

  return grouped;
}

// Buat HTML impact row untuk 1 proyek
function buildImpactRow(proj) {
  const grouped = calcProjectImpact(proj);
  const entries = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);
  if (!entries.length) return '';

  const chips = entries.map(([unitKey, d]) => {
    const icon  = impactIcon(unitKey);
    const total = Number(d.total).toLocaleString('id-ID');
    return `<span class="impact-chip" title="${d.count} indikator berkontribusi">
      <span class="impact-chip-icon">${icon}</span>
      <span class="impact-chip-val">${total}</span>
      <span class="impact-chip-unit">${d.unitDisplay}</span>
    </span>`;
  }).join('');

  return `<div class="impact-row">
    <span class="impact-row-label">🌍 Dampak:</span>
    <div class="impact-chips">${chips}</div>
  </div>`;
}

// Inject impact row ke setiap card
function injectImpactToCards() {
  if (!window.allProjects || !window.allProjects.length) return;

  document.querySelectorAll('#projectCards .proj-card').forEach(card => {
    if (card.querySelector('.impact-row')) return; // sudah ada, skip

    const nameEl = card.querySelector('.proj-card-name');
    if (!nameEl) return;

    const proj = window.allProjects.find(p => p.name === nameEl.textContent.trim());
    if (!proj) return;

    const html = buildImpactRow(proj);
    if (!html) return;

    // Sisipkan sebelum footer card, atau di akhir card
    const footer = card.querySelector('.proj-card-footer');
    if (footer) footer.insertAdjacentHTML('beforebegin', html);
    else card.insertAdjacentHTML('beforeend', html);
  });
}

// Observer: auto inject setiap kali #projectCards dirender ulang
(function initImpactObserver() {
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('projectCards');
    if (!container) return;

    // Watch projectCards childList changes
    new MutationObserver(() => {
      setTimeout(injectImpactToCards, 60);
    }).observe(container, { childList: true });

    // Watch saat tab dashboard aktif
    const dashTab = document.getElementById('tab-dashboard');
    if (dashTab) {
      new MutationObserver(() => {
        if (dashTab.classList.contains('active'))
          setTimeout(injectImpactToCards, 120);
      }).observe(dashTab, { attributes: true, attributeFilter: ['class'] });
    }
  });
})();
