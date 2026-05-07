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

// ============================================================
// COMPACT CARD PATCH — batasi goal/outcomes agar card tidak terlalu panjang
// ============================================================
function patchCardCompact() {
  document.querySelectorAll('#projectCards .proj-card').forEach(card => {
    if (card.dataset.compactPatched) return;
    card.dataset.compactPatched = '1';

    // ── Goal text: tambahkan class untuk line-clamp ──
    card.querySelectorAll('div[style*="font-size:11px"][style*="color:#475569"]').forEach(el => {
      if (el.textContent.includes('Goal:') || el.querySelector('span[style*="color:#2563eb"]')) {
        el.classList.add('proj-card-goal-text-wrap');
        // Tambah class ke teks setelah span
        const spans = el.querySelectorAll('span');
        if (spans.length === 1) {
          // Teks goal ada sebagai text node — wrap dengan span
          const goalSpan = el.querySelector('span');
          if (goalSpan) {
            const goalText = el.childNodes;
            el.classList.add('proj-card-goal-outer');
          }
        }
      }
    });

    // ── Outcomes ul: tambahkan class ──
    card.querySelectorAll('ul').forEach(ul => {
      ul.classList.add('proj-card-outcomes-ul');
      // Sembunyikan li ke-3 ke atas
      const items = ul.querySelectorAll('li');
      const MAX = 2;
      if (items.length > MAX) {
        items.forEach((li, i) => {
          if (i >= MAX) li.style.display = 'none';
        });
        // Tambah "lihat semua" toggle jika belum ada
        if (!ul.nextElementSibling || !ul.nextElementSibling.classList.contains('outcomes-more-btn')) {
          const moreBtn = document.createElement('button');
          moreBtn.className = 'outcomes-more-btn';
          moreBtn.textContent = `+${items.length - MAX} lainnya`;
          moreBtn.onclick = (e) => {
            e.stopPropagation();
            items.forEach(li => li.style.display = '');
            moreBtn.style.display = 'none';
          };
          ul.insertAdjacentElement('afterend', moreBtn);
        }
      }
    });
  });
}

// CSS inject untuk outcomes-more-btn (tidak bisa di style.css karena dinamis)
(function injectCompactCSS() {
  if (document.getElementById('pmis-compact-style')) return;
  const s = document.createElement('style');
  s.id = 'pmis-compact-style';
  s.textContent = `
    .proj-card-goal-outer { display: flex; gap: 4px; align-items: flex-start; }
    .proj-card-goal-outer > span:last-child {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 11px;
      color: #475569;
      line-height: 1.5;
      flex: 1;
    }
    .outcomes-more-btn {
      background: none; border: none; cursor: pointer;
      font-size: 10px; color: #2563eb; padding: 0;
      margin-top: 2px; font-weight: 600;
    }
    .outcomes-more-btn:hover { text-decoration: underline; }
  `;
  document.head.appendChild(s);
})();

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
  patchCardCompact();
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
