// ============================================================
// PMIS DFW Indonesia — Impact per Project Card (v2)
// Dipanggil setelah renderCards() selesai
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

function calcProjectImpact(proj) {
  const grouped = {};
  (proj.project_indicators || []).forEach(ind => {
    const rawUnit = (ind.unit || '').trim();
    if (!rawUnit) return;
    const k    = rawUnit.toLowerCase();
    const upds = ind.indicator_updates || [];
    const actVal = upds.length
      ? Number([...upds].sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0].actual_value) || 0
      : Number(ind.actual) || 0;
    if (!grouped[k]) grouped[k] = { unitDisplay: rawUnit, total: 0, count: 0 };
    grouped[k].total += actVal;
    grouped[k].count += 1;
  });
  return grouped;
}

function buildImpactRow(proj) {
  const grouped = calcProjectImpact(proj);
  const entries = Object.entries(grouped).sort((a,b) => b[1].total - a[1].total);
  if (!entries.length) return '';
  const chips = entries.slice(0, 4).map(([k, d]) => {
    const icon  = impactIcon(k);
    const total = Number(d.total).toLocaleString('id-ID');
    return `<span style="
      display:inline-flex;align-items:center;gap:5px;
      background:#f0fdf4;border:1px solid #86efac;border-radius:8px;
      padding:3px 9px;font-size:11px;font-weight:600;color:#15803d;
      white-space:nowrap">${icon} ${total} ${d.unitDisplay}</span>`;
  }).join('');
  const more = entries.length > 4
    ? `<span style="font-size:11px;color:#94a3b8">+${entries.length - 4} lainnya</span>` : '';
  return `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;
    border-top:1px solid #f1f5f9;padding-top:8px;margin-top:6px">
    ${chips}${more}
  </div>`;
}

// Inject impact ke setiap project card setelah renderCards()
function injectImpactToCards() {
  if (!window.allProjects) return;
  window.allProjects.forEach((proj, i) => {
    const impHtml = buildImpactRow(proj);
    if (!impHtml) return;
    const cards = document.getElementById('projectCards');
    if (!cards) return;
    const allCards = cards.querySelectorAll('.proj-card');
    const card = allCards[i];
    if (!card) return;
    // Hindari duplikasi
    if (card.querySelector('.impact-row-injected')) return;
    const div = document.createElement('div');
    div.className = 'impact-row-injected';
    div.innerHTML = impHtml;
    // Sisipkan sebelum footer card
    const footer = card.querySelector('.proj-card-footer');
    if (footer) {
      card.insertBefore(div, footer);
    } else {
      card.appendChild(div);
    }
  });
}

// Patch renderCards agar auto-inject setelah render selesai
const _origRenderCards = window.renderCards;
if (typeof _origRenderCards === 'function') {
  window.renderCards = function(items) {
    _origRenderCards(items);
    setTimeout(injectImpactToCards, 50);
  };
} else {
  // Fallback: tunggu renderCards tersedia
  document.addEventListener('DOMContentLoaded', () => {
    const checkInterval = setInterval(() => {
      if (typeof window.renderCards === 'function') {
        clearInterval(checkInterval);
        const orig = window.renderCards;
        window.renderCards = function(items) {
          orig(items);
          setTimeout(injectImpactToCards, 50);
        };
      }
    }, 100);
  });
}

window.injectImpactToCards = injectImpactToCards;
window.buildImpactRow      = buildImpactRow;
window.calcProjectImpact   = calcProjectImpact;
