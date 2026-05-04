// ===================== CONFIG =====================
const SUPABASE_URL      = "https://zdfxcxkgmksaeigyuibe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZnhjeGtnbWtzYWVpZ3l1aWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3Mjc0NjAsImV4cCI6MjA5MjMwMzQ2MH0.baUlaWNvN3wMKHL05E71aSxedjKvWhfVQXHGXraWyVU";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



// ===================== SUPER ADMIN =====================
const SUPER_ADMIN_EMAIL = 'admin@dfw.or.id';
function isSuperAdmin(email) {
  return (email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}
// ===================== TOAST =====================
function showToast(msg, type='info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}
// ===================== AUTH =====================
async function initAuth() {
  // Sembunyikan app shell sampai auth siap
  document.getElementById('appSidebar').style.display = 'none';
  document.getElementById('appMain').style.display    = 'none';

  const { data: { session } } = await client.auth.getSession();
  if (session) {
    await onLogin(session.user);
  } else {
    showLoginPage();
  }

  client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN'  && session) await onLogin(session.user);
    if (event === 'SIGNED_OUT')              showLoginPage();
  });
}

async function onLogin(user) {
  currentUser = user;
  // Fetch profil dari DB
  let { data: profile } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    // Auto-create profil viewer untuk user baru
    const initial = (user.email||'?')[0].toUpperCase();
    const { data: np } = await client.from('user_profiles').insert({
      user_id        : user.id,
      name           : user.email.split('@')[0],
      role           : isSuperAdmin(user.email) ? 'admin' : 'viewer',
      avatar_initial : initial,
    }).select().single();
    profile = np;
  }

  // Enforce super admin role (tanpa menyentuh kolom email di DB)
  if (isSuperAdmin(user.email) && profile && profile.role !== 'admin') {
    await client.from('user_profiles')
      .update({ role: 'admin', name: profile.name || 'Admin DFW' })
      .eq('user_id', user.id);
    profile = { ...profile, role: 'admin' };
  }

  // Gabungkan email dari auth session ke object profil (tidak disimpan ke DB)
  if (profile) profile.email = user.email;

  currentProfile = profile;
  updateSidebarUser();
  applyRoleGuards();
  hideLoginPage();
  loadProjects();
}

function updateSidebarUser() {
  if (!currentProfile) return;
  const el = (id) => document.getElementById(id);
  el('sidebarAvatar').textContent = currentProfile.avatar_initial || '?';
  el('sidebarName').textContent   = currentProfile.name || '–';
  el('sidebarRole').textContent   = ROLES[currentProfile.role] || currentProfile.role;
  // Warna avatar per role
  const colors = { admin:'#dc2626', manager:'#7c3aed', editor:'#2563eb', viewer:'#64748b' };
  el('sidebarAvatar').style.background = colors[currentProfile.role] || '#64748b';
}

function applyRoleGuards() {
  const isViewer = (currentProfile?.role || 'viewer') === 'viewer';
  // Sembunyikan tombol Tambah Proyek jika tidak bisa create
  document.querySelectorAll('[data-guard="create"]').forEach(el => {
    el.style.display = can('create') ? '' : 'none';
  });
  // Sembunyikan tab input di nav (viewer tidak bisa tambah proyek)
  const inputNav = document.querySelector('.nav-links li[data-tab="input"]');
  if (inputNav) inputNav.style.display = (!isViewer && can('create')) ? '' : 'none';
  // Bottom nav tambah
  const btnav = document.querySelector('.bottom-nav-item[data-tab="input"]');
  if (btnav) btnav.style.display = (!isViewer && can('create')) ? '' : 'none';
  const navUsers = document.getElementById('navUsers');
  if (navUsers) navUsers.style.display = (currentProfile && currentProfile.role === 'admin') ? '' : 'none';
  // Viewer: tampilkan banner read-only di header
  const viewerBanner = document.getElementById('viewerBanner');
  if (viewerBanner) viewerBanner.style.display = isViewer ? '' : 'none';
}

function showLoginPage() {
  document.getElementById('loginPage').style.display   = 'flex';
  document.getElementById('appSidebar').style.display  = 'none';
  document.getElementById('appMain').style.display     = 'none';
}

function hideLoginPage() {
  document.getElementById('loginPage').style.display   = 'none';
  document.getElementById('appSidebar').style.display  = '';
  document.getElementById('appMain').style.display     = '';
}

// Login handler
(function setupLogin() {
  const emailEl    = () => document.getElementById('loginEmail');
  const pwEl       = () => document.getElementById('loginPassword');
  const btnEl      = () => document.getElementById('loginBtn');
  const errEl      = () => document.getElementById('loginError');
  const spinnerEl  = () => document.getElementById('loginBtnSpinner');
  const btnTextEl  = () => document.getElementById('loginBtnText');

  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = emailEl().value.trim();
    const pw    = pwEl().value;
    if (!email || !pw) { showLoginError('Email dan password wajib diisi.'); return; }

    btnEl().disabled      = true;
    btnTextEl().style.display  = 'none';
    spinnerEl().style.display  = 'inline-block';
    errEl().classList.add('hidden');

    const { error } = await client.auth.signInWithPassword({ email, password: pw });

    btnEl().disabled     = false;
    btnTextEl().style.display = '';
    spinnerEl().style.display = 'none';

    if (error) showLoginError(error.message === 'Invalid login credentials'
      ? 'Email atau password salah.' : error.message);
  });

  // Enter key
  [document.getElementById('loginEmail'), document.getElementById('loginPassword')]
    .forEach(el => el && el.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    }));

  // Toggle password visibility
  const toggle = document.getElementById('loginPwToggle');
  if (toggle) toggle.addEventListener('click', () => {
    const pw = document.getElementById('loginPassword');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
})();

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Logout handler
(function setupLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', async () => {
    await client.auth.signOut();
    currentUser = null; currentProfile = null;
  });
})();


// ===================== STATE =====================
let currentProject  = null;
let indicators      = [];
// ── Auth state ──
let currentUser    = null;   // supabase auth user
let currentProfile = null;   // { id, name, role, avatar_initial }
// Role hierarchy: admin > manager > editor > viewer
const ROLES = { admin:'Admin', manager:'Manager', editor:'Editor', viewer:'Viewer' };
function can(action) {
  const r = currentProfile?.role || 'viewer';
  if (action === 'delete')  return r === 'admin';
  if (action === 'edit')    return ['admin','manager','editor'].includes(r);
  if (action === 'create')  return ['admin','manager','editor'].includes(r);
  if (action === 'approve') return ['admin','manager'].includes(r);
  if (action === 'manage_users') return r === 'admin';
  return false;
}
let allActivities   = [];
let allActNotes     = [];
let currentActId    = null;
let currentActProject = "";
let stagedFiles     = [];
let outcomes        = [];
let savedFiles      = [];
const BUCKET        = "activity-files";

// ===================== PROGRESS HELPERS =====================
function getLatestActual(ind) {
  const upds = ind.indicator_updates || [];
  return upds.length ? Number(upds[upds.length - 1].actual_value) : Number(ind.actual) || 0;
}

function calcAvgIndikator(proj) {
  const inds = proj.project_indicators || [];
  if (!inds.length) return null;
  const total = inds.reduce((a, ind) => {
    const actual = getLatestActual(ind);
    const pct    = ind.target > 0 ? Math.round(actual / ind.target * 100) : 0;
    return a + Math.min(pct, 100);
  }, 0);
  return Math.round(total / inds.length);
}

function calcAvgAktivitas(proj) {
  // Gunakan activities_summary dari loadProjects (project_name, progress, status)
  // ATAU allActivities jika sedang di halaman detail (data lebih fresh)
  const acts = (proj.activities_summary && proj.activities_summary.length)
    ? proj.activities_summary
    : (allActivities && allActivities.length && currentProject && currentProject.name === proj.name)
      ? allActivities
      : [];
  if (!acts.length) return null;
  const total = acts.reduce((a, act) => a + (Number(act.progress) || 0), 0);
  return Math.round(total / acts.length);
}

function calcOverallProgress(proj) {
  const avgInd = calcAvgIndikator(proj);
  const avgAct = calcAvgAktivitas(proj);
  if (avgInd !== null && avgAct !== null) return Math.round((avgInd + avgAct) / 2);
  if (avgInd !== null) return avgInd;
  if (avgAct !== null) return avgAct;
  return 0; // progress dihitung otomatis; tidak lagi fallback ke field manual
}

function progressColor(pct) {
  if (pct >= 85) return "#22c55e";
  if (pct >= 60) return "#3b82f6";
  if (pct >= 35) return "#f59e0b";
  return "#ef4444";
}

function progressLabel(pct) {
  if (pct >= 85) return "Sangat Baik";
  if (pct >= 60) return "Baik";
  if (pct >= 35) return "Sedang";
  return "Perlu Perhatian";
}

function formatRupiah(n) {
  if (!n && n !== 0) return "-";
  return "Rp " + Number(n).toLocaleString("id-ID");
}
function pctBudget(approved, actual) {
  if (!approved || approved <= 0) return 0;
  return Math.min(Math.round(actual / approved * 100), 999);
}


// ===================== PROGRESS HELPER (FORM) =====================
function calcProgressFromIndicatorsForm() {
  if (!indicators.length) return 0;
  const total = indicators.reduce((sum, ind) => {
    const target = Number(ind.target || 0);
    const actual = Number(ind.actual || 0);
    const pct    = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;
    return sum + pct;
  }, 0);
  return Math.round(total / indicators.length);
}


// Render daftar indikator prioritas (<50%) untuk mini-card dashboard
function renderPriorityIndicators(item, projIndex) {
  const inds = item.project_indicators || [];
  if (!inds.length) return "";

  const lowInds = inds
    .map(ind => {
      const actual = getLatestActual(ind);
      const target = Number(ind.target) || 0;
      const pct    = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;
      return { name: ind.indicator_name, actual, target, unit: ind.unit || "", type: ind.type, pct };
    })
    .filter(x => x.pct < 50)
    .sort((a, b) => a.pct - b.pct);

  if (!lowInds.length) return `
    <div class="priority-ind-section">
      <div class="priority-ind-title">
        <span class="priority-ind-icon">✅</span>
        <span>Semua indikator ≥ 50%</span>
        <button class="priority-jump-btn" onclick="jumpToProject(${projIndex}, event)" title="Lihat Detail Proyek">Detail →</button>
      </div>
    </div>`;

  const MAX_SHOW = 2;
  const shown    = lowInds.slice(0, MAX_SHOW);
  const rest     = lowInds.length - MAX_SHOW;

  // Warna berdasarkan tier: merah <25%, kuning/oranye 25-49%
  function tierColor(pct) {
    if (pct < 25) return { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", label: "Kritis" };
    return { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", label: "Perhatian" };
  }

  // Hitung jumlah per tier untuk badge ringkasan
  const critCount = lowInds.filter(x => x.pct < 25).length;
  const warnCount = lowInds.filter(x => x.pct >= 25).length;

  return `
    <div class="priority-ind-section">
      <div class="priority-ind-title">
        <span class="priority-ind-icon">⚠️</span>
        <span>Prioritas Kerja</span>
        <span class="priority-ind-badges">
          ${critCount > 0 ? `<span class="priority-tier-badge kritis">${critCount} Kritis</span>` : ""}
          ${warnCount > 0 ? `<span class="priority-tier-badge perhatian">${warnCount} Perhatian</span>` : ""}
        </span>
        <button class="priority-jump-btn" onclick="jumpToProject(${projIndex}, event)" title="Lihat semua indikator">Detail →</button>
      </div>
      <div class="priority-ind-list">
        ${shown.map(ind => {
          const t = tierColor(ind.pct);
          return `
          <div class="priority-ind-item" style="border-left:3px solid ${t.color};background:${t.bg}">
            <div class="priority-ind-left">
              <span class="priority-tier-dot" style="background:${t.color}" title="${t.label}"></span>
              <div class="priority-ind-name" title="${escHtml(ind.name)}">${escHtml(ind.name)}</div>
            </div>
            <div class="priority-ind-right">
              <div class="priority-ind-bar-wrap">
                <div class="priority-ind-bar-fill" style="width:${ind.pct}%;background:${t.color}"></div>
              </div>
              <span class="priority-ind-pct" style="color:${t.color}">${ind.pct}%</span>
              <button class="priority-goto-btn" style="color:${t.color};border-color:${t.border}"
                onclick="jumpToIndicator(${projIndex},'${escHtml(ind.name)}',event)"
                title="Buka & scroll ke indikator ini">↗</button>
            </div>
          </div>`;
        }).join("")}
        ${rest > 0 ? `
          <button class="priority-ind-more-btn" onclick="jumpToProject(${projIndex}, event)">
            +${rest} indikator lainnya — lihat semua
          </button>` : ""}
      </div>
    </div>`;
}


// Lompat ke project detail dan scroll ke indikator spesifik
window.jumpToIndicator = async function(projIndex, indName, event) {
  if (event) event.stopPropagation();
  const proj = window.allProjects[projIndex];
  if (!proj) return;
  await openProjectDetail(proj);
  // Tunggu panel indikator selesai dirender
  setTimeout(() => {
    const inds = proj.project_indicators || [];
    const idx  = inds.findIndex(ind => ind.indicator_name === indName);
    if (idx < 0) return;
    const card = document.getElementById("ind-card-" + idx);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    // Highlight sementara
    card.classList.add("ind-card-highlight");
    setTimeout(() => card.classList.remove("ind-card-highlight"), 2000);
  }, 400);
};

// Lompat ke project detail (dari tombol "Lihat Detail")
window.jumpToProject = async function(projIndex, event) {
  if (event) event.stopPropagation();
  const proj = window.allProjects[projIndex];
  if (!proj) return;
  await openProjectDetail(proj);
};

// ===================== TAB NAVIGATION =====================
const tabTitles = {
  users     : ['Kelola Pengguna', 'Atur akses dan peran pengguna'],
  dashboard : ["Dashboard",     "Selamat datang, pantau semua proyek Anda"],
  projects  : ["Daftar Proyek", "Semua data proyek yang dimonitor"],
  input     : ["Tambah Proyek", "Tambah proyek baru"],
  detail    : ["Detail Proyek", ""]
};

function switchTab(tab) {
  // Viewer tidak bisa akses tab input (tambah proyek)
  if (tab === 'input' && (currentProfile?.role || 'viewer') === 'viewer') {
    showToast('Anda tidak memiliki izin untuk menambah proyek.', 'error');
    return;
  }
  document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
  if (tab !== "detail") currentProject = null;
  const li = document.querySelector(`[data-tab="${tab}"]`);
  if (li) li.classList.add("active");
  const targetTab = document.getElementById("tab-" + tab);
  if (targetTab) targetTab.classList.add("active");
  const t = tabTitles[tab];
  document.getElementById("pageTitle").textContent    = t ? t[0] : "";
  document.getElementById("pageSubtitle").textContent = t ? t[1] : "";
  if (tab === "projects" || tab === "dashboard") loadProjects();
  if (tab === "users") loadUsers();
  if (tab === "input") renderOutcomeList();
}
document.querySelectorAll(".nav-links li").forEach(li => {
  li.addEventListener("click", () => switchTab(li.dataset.tab));
});
window.switchTab = switchTab;

// ===================== STEP WIZARD (2 LANGKAH) =====================
function setStep(n) {
  [1, 2].forEach(i => {
    document.getElementById("form-step-" + i).classList.toggle("hidden", i !== n);
    document.getElementById("form-step-" + i).classList.toggle("active", i === n);
    const dot = document.getElementById("step-dot-" + i);
    dot.classList.toggle("active", i === n);
    dot.classList.toggle("done", i < n);
  });
}

// Step 1 → Step 2

// addOutcomeBtn — null-safe agar tidak crash jika index.html lama
(function() {
  const btn = document.getElementById("addOutcomeBtn");
  if (btn) btn.addEventListener("click", () => {
    outcomes.push({ text: "" });
    renderOutcomeList();
  });
})();
document.getElementById("toStep2Btn").addEventListener("click", () => {
  const name = document.getElementById("f-name").value.trim();
  const loc  = document.getElementById("f-location").value.trim();
  const own  = document.getElementById("f-owner").value.trim();
  if (!name || !loc || !own) {
    alert("Harap isi semua field wajib: Nama Proyek, Lokasi, dan Penanggung Jawab.");
    return;
  }
  setStep(2);
  renderIndicatorList();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Kembali ke Step 1
document.getElementById("backStep1Btn").addEventListener("click", () => setStep(1));

// ===================== INDICATOR BUILDER =====================
document.getElementById("addIndicatorBtn").addEventListener("click", () => {
  indicators.push({ id: null, name: "", type: "Output", target: "", unit: "", actual: 0, update_note: "", history: [], evidence: [] });
  renderIndicatorList();
});

function escHtml(v) {
  return (v || "").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderIndicatorList() {
  const container = document.getElementById("indicatorList");
  if (!indicators.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">Belum ada indikator. Klik <strong>Tambah Indikator</strong>.</div>`;
    return;
  }
  container.innerHTML = indicators.map((ind, i) => `
    <div class="indicator-block">
      <div class="indicator-block-header">
        <div class="indicator-block-title">
          <span class="badge badge-${(ind.type || "Output").toLowerCase()}">${ind.type || "Output"}</span>
          ${ind.name || `Indikator ${i + 1}`}
        </div>
        <button class="btn-remove" onclick="removeIndicator(${i})">✕</button>
      </div>
      <div class="indicator-input-row">
        <div class="form-group">
          <label>Nama Indikator</label>
          <input type="text" id="ind-name-${i}" value="${escHtml(ind.name)}"
            placeholder="Contoh: Nelayan terlatih"
            oninput="indicators[${i}].name=this.value;document.querySelector('#ind-name-${i}').closest('.indicator-block').querySelector('.indicator-block-title').lastChild.textContent=' '+this.value||' Indikator ${i+1}'">
        </div>
        <div class="form-group">
          <label>Tipe</label>
          <select id="ind-type-${i}" onchange="indicators[${i}].type=this.value">
            <option ${ind.type === "Output"  ? "selected" : ""}>Output</option>
            <option ${ind.type === "Outcome" ? "selected" : ""}>Outcome</option>
            <option ${ind.type === "Impact"  ? "selected" : ""}>Impact</option>
          </select>
        </div>
        <div class="form-group">
          <label>Target</label>
          <input type="number" id="ind-target-${i}" value="${ind.target}" placeholder="100"
            oninput="indicators[${i}].target=this.value">
        </div>
        <div class="form-group">
          <label>Satuan</label>
          <input type="text" id="ind-unit-${i}" value="${escHtml(ind.unit)}" placeholder="orang / kg"
            oninput="indicators[${i}].unit=this.value">
        </div>
        <div class="form-group">
          <label>Capaian Awal</label>
          <input type="number" id="ind-actual-${i}" value="${ind.actual || 0}" placeholder="0"
            oninput="indicators[${i}].actual=Number(this.value)">
        </div>
        <div class="form-group full">
          <label>Catatan Perkembangan <span style="font-weight:400;color:#94a3b8">(opsional)</span></label>
          <textarea id="ind-note-${i}" rows="2"
            placeholder="Perkembangan awal, kendala, atau temuan lapangan…"
            oninput="indicators[${i}].update_note=this.value"
            style="font-size:13px">${escHtml(ind.update_note)}</textarea>
        </div>
      </div>
      ${ind.history && ind.history.length ? `
        <div class="history-section">
          <div class="history-section-title">Histori Capaian</div>
          <div class="history-list">${renderHistoryItems(ind.history, ind.unit, ind.id)}</div>
        </div>` : ""}
    </div>
  `).join("");
}


// ===================== OUTCOME BUILDER =====================
function renderOutcomeList() {
  const container = document.getElementById('outcomeList');
  if (!container) return;
  if (!outcomes.length) {
    container.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:6px 0">Belum ada outcome. Klik &quot;+ Tambah Outcome&quot;.</div>';
    return;
  }
  container.innerHTML = outcomes.map((oc, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
      <span style="min-width:18px;padding-top:8px;font-size:12px;color:#94a3b8;font-weight:600">${i+1}.</span>
      <textarea id="oc-text-${i}" rows="2"
        placeholder="Deskripsi outcome ${i+1}..."
        oninput="outcomes[${i}].text=this.value"
        style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;resize:vertical"
      >${escHtml(oc.text)}</textarea>
      <button type="button" class="btn-remove" onclick="removeOutcome(${i})" title="Hapus"></button>
    </div>
  `).join('');
}
window.removeOutcome = function(i) {
  outcomes.splice(i, 1);
  renderOutcomeList();
};

window.removeIndicator = function (i) { indicators.splice(i, 1); renderIndicatorList(); };

function renderHistoryItems(history, unit, indicatorId) {
  if (!history || !history.length) return `<div class="history-empty">Belum ada riwayat update.</div>`;
  const clearBtn = indicatorId
    ? `<button class="btn-danger btn-sm" style="width:100%;margin-bottom:8px" onclick="clearIndicatorHistory('${indicatorId}')">Hapus Semua Riwayat</button>`
    : "";
  return clearBtn + [...history].reverse().map(h => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div class="history-content">
        <div class="history-value">Capaian <strong>${h.actual_value} ${unit || ""}</strong></div>
        ${h.note ? `<div class="history-note">${h.note}</div>` : ""}
        <div class="history-date">${new Date(h.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
      </div>
    </div>`).join("");
}

// ===================== SUBMIT (dari Step 2 langsung) =====================
document.getElementById("submitAllBtn").addEventListener("click", async () => {
  const msg = document.getElementById("formMsg");
  const btn = document.getElementById("submitAllBtn");
  msg.className = "form-msg hidden";
  btn.textContent = "Menyimpan…";
  btn.disabled = true;

  try {
    // Baca nilai terbaru dari DOM
    indicators.forEach((ind, i) => {
      const actualEl = document.getElementById("ind-actual-" + i);
      const noteEl   = document.getElementById("ind-note-"   + i);
      if (actualEl) ind.actual      = Number(actualEl.value) || 0;
      if (noteEl)   ind.update_note = noteEl.value.trim()    || null;
    });

    const p = {
      name        : document.getElementById("f-name").value.trim(),
      location    : document.getElementById("f-location").value.trim(),
      owner       : document.getElementById("f-owner").value.trim(),
      donor       : document.getElementById("f-donor").value.trim()      || null,
      start_date  : document.getElementById("f-start-date").value        || null,
      deadline    : document.getElementById("f-deadline").value          || null,
      status      : document.getElementById("f-status").value,
      progress    : calcProgressFromIndicatorsForm(),
      description     : document.getElementById("f-desc").value.trim()           || null,
      note            : document.getElementById("f-note").value.trim()            || null,
      budget_approved : Number(document.getElementById("f-budget-approved").value) || 0,
      budget_actual   : Number(document.getElementById("f-budget-actual").value)   || 0,
      goal            : (document.getElementById("f-goal") || {value:""}).value.trim() || null,
    };
    if (!p.name) throw new Error("Nama proyek wajib diisi.");

    // Simpan nilai budget_actual lama untuk cek apakah berubah
    const prevProj = (window.allProjects || []).find(x => x.name === p.name);
    const prevBudgetActual = prevProj ? (prevProj.budget_actual || 0) : -1;

    const { error: pErr } = await client.from("projects").upsert(p, { onConflict: "name" });
    if (pErr) throw new Error("Gagal simpan proyek: " + pErr.message);

    // Catat histori budget_actual jika berubah (atau pertama kali & > 0)
    if (p.budget_actual > 0 && p.budget_actual !== prevBudgetActual) {
      await client.from("budget_updates").insert({
        project_name : p.name,
        actual_value : p.budget_actual,
        note         : null,
        updated_by   : "Tim",
      });
    }

        // Simpan outcomes
    await client.from("project_outcomes").delete().eq("project_name", p.name);
    const validOutcomes = outcomes.filter(oc => oc.text && oc.text.trim());
    if (validOutcomes.length) {
      await client.from("project_outcomes").insert(
        validOutcomes.map((oc, oidx) => ({ project_name: p.name, outcome_text: oc.text.trim(), sort_order: oidx }))
      );
    }

    await client.from("project_indicators").delete().eq("project_name", p.name);

    for (let i = 0; i < indicators.length; i++) {
      const ind = indicators[i];
      if (!ind.name) continue;
      const { data: indData, error: indErr } = await client
        .from("project_indicators")
        .insert({
          project_name   : p.name,
          indicator_name : ind.name,
          type           : ind.type,
          target         : Number(ind.target) || 0,
          unit           : ind.unit   || null,
          actual         : ind.actual || 0,
        })
        .select().single();
      if (indErr) { console.warn(indErr.message); continue; }
      if (ind.actual > 0 || ind.update_note) {
        await client.from("indicator_updates").insert({
          indicator_id   : indData.id,
          project_name   : p.name,
          indicator_name : ind.name,
          actual_value   : ind.actual    || 0,
          note           : ind.update_note || null,
          updated_by     : "Tim",
        });
      }
      indicators[i].id = indData.id;
    }

    msg.textContent = "✅ Data berhasil disimpan!";
    msg.className   = "form-msg success";
    setTimeout(() => {
      msg.className = "form-msg hidden";
      resetForm(); setStep(1); switchTab("dashboard");
    }, 1800);
    await loadProjects();

  } catch (err) {
    msg.textContent = err.message;
    msg.className   = "form-msg error";
  } finally {
    btn.textContent = "💾 Simpan Proyek";
    btn.disabled    = false;
  }
});

function resetForm() {
  ["f-name","f-location","f-owner","f-donor","f-start-date","f-deadline","f-desc","f-note",
   "f-budget-approved","f-budget-actual"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("f-status").value   = "Aktif";
  const _fGoal = document.getElementById("f-goal");
  if (_fGoal) _fGoal.value = "";
  outcomes = [];
  renderOutcomeList();
  // progress dihitung otomatis
  indicators = [];
}

// ===================== LOAD PROJECTS =====================
async function loadProjects() {
  const { data: projects, error } = await client.from("projects").select().order("updated_at", { ascending: false });
  if (error) { console.error(error); return; }
  const { data: inds  } = await client.from("project_indicators").select();
  const { data: upds  } = await client.from("indicator_updates").select().order("created_at", { ascending: true });
  const { data: evids } = await client.from("indicator_evidence").select();
  const { data: actsData } = await client.from("project_activities").select("project_name,progress,status");
  const { data: budgetHist } = await client.from("budget_updates").select().order("created_at", { ascending: true });
  const { data: outcomesData } = await client.from("project_outcomes").select().order("sort_order");

  const items = projects.map(proj => ({
    ...proj,
    project_indicators: (inds || []).filter(ind => ind.project_name === proj.name).map(ind => ({
      ...ind,
      indicator_updates : (upds  || []).filter(u => u.indicator_id === ind.id),
      indicator_evidence: (evids || []).filter(e => e.indicator_id === ind.id),
    })),
    activities_summary: (actsData || []).filter(a => a.project_name === proj.name),
    activityCount: (actsData || []).filter(a => a.project_name === proj.name).length,
    budget_updates: (budgetHist || []).filter(b => b.project_name === proj.name),
    project_outcomes: (outcomesData || []).filter(o => o.project_name === proj.name),
  }));

  window.allProjects = items;
  renderStats(items);
  renderCards(items);
  renderTable(items);
  renderSidebarSubmenu(items);

  if (currentProject && document.getElementById("tab-detail").classList.contains("active")) {
    const updated = items.find(p => p.name === currentProject.name);
    if (updated) openProjectDetail(updated);
  }
}

function renderStats(items) {
  document.getElementById("totalProjects").textContent   = items.length;
  document.getElementById("activeProjects").textContent  = items.filter(x => ["Aktif","On Track"].includes(x.status)).length;
  document.getElementById("lateProjects").textContent    = items.filter(x => x.status === "Terlambat").length;
  const avg = items.length ? Math.round(items.reduce((a,b) => a + calcOverallProgress(b), 0) / items.length) : 0;
  document.getElementById("avgProgress").textContent     = avg + "%";
  document.getElementById("projectCount").textContent    = items.length + " proyek";
}

function renderCards(items) {
  const container = document.getElementById("projectCards");
  if (!items.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 24px">
      <div style="font-size:40px;margin-bottom:12px">📂</div>
      <div style="font-weight:700;color:#334155;font-size:15px;margin-bottom:6px">Belum ada proyek</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:16px">Mulai tambahkan proyek pertama Anda</div>
      <button class="btn-primary btn-sm" onclick="switchTab('input')">＋ Tambah Proyek</button>
    </div>`;
    return;
  }

  container.innerHTML = items.map((item, i) => {
    const cls  = item.status.toLowerCase().replace(/\s+/g, "-");
    const ov   = calcOverallProgress(item);
    const oc   = progressColor(ov);
    const ol   = progressLabel(ov);
    const indCount = (item.project_indicators||[]).length;
    const actCount = item.activityCount || 0;
    const outCount = (item.project_outcomes||[]).length;

    // --- Deadline ---
    let dlColor = "#94a3b8", dlText = "–";
    if (item.deadline) {
      const today = new Date(); today.setHours(0,0,0,0);
      const dl    = new Date(item.deadline);
      const diff  = Math.round((dl - today) / 86400000);
      dlColor = diff < 0 ? "#ef4444" : diff <= 14 ? "#f59e0b" : "#64748b";
      dlText  = diff < 0
        ? `${Math.abs(diff)}h lewat`
        : diff === 0 ? "Hari ini"
        : `${diff} hari`;
    }

    // --- Budget 1 baris ---
    const budgetLine = (item.budget_approved > 0)
      ? `${formatRupiah(item.budget_approved)}${item.budget_approved > 0 && item.budget_actual >= 0
          ? ` · <b style="color:#d97706">${pctBudget(item.budget_approved,item.budget_actual)}%</b>` : ""}`
      : `<span style="color:#cbd5e1">–</span>`;

    // --- Top 2 indikator risiko (<75%) ---
    const lowInds = (item.project_indicators||[])
      .map(ind => {
        const t = Number(ind.target)||0, a = Number(ind.achievement)||0;
        return { name: ind.name, pct: t>0 ? Math.round((a/t)*100) : 0 };
      })
      .filter(x => x.pct < 75)
      .slice(0, 2);

    // Selalu 2 baris indikator (isi dengan placeholder jika kurang)
    const indRows = [0,1].map(n => {
      const ind = lowInds[n];
      if (!ind) return `<div class="pcard-ind-item pcard-ind-empty"><span>–</span></div>`;
      const ic = progressColor(ind.pct);
      const barW = Math.max(ind.pct, 3);
      return `<div class="pcard-ind-item">
        <span class="pcard-ind-name">${escHtml(ind.name)}</span>
        <div class="pcard-ind-bar"><div style="width:${barW}%;background:${ic}"></div></div>
        <span class="pcard-ind-pct" style="color:${ic}">${ind.pct}%</span>
      </div>`;
    }).join("");

    // Goal: selalu 1 baris tinggi
    const goalLine = item.goal
      ? escHtml(item.goal)
      : `<span style="color:#cbd5e1">–</span>`;

    return `
    <div class="pcard pcard-${cls}" onclick="openProjectDetail(window.allProjects[${i}])">

      <!-- 1. HEADER -->
      <div class="pcard-head">
        <span class="pcard-badge pcard-badge-${cls}">${item.status}</span>
        ${can('delete') ? `<button class="pcard-del"
          onclick="event.stopPropagation();deleteProject('${item.id}','${item.name.replace(/'/g,"\\'")}')">×</button>` : '<span></span>'}
      </div>

      <!-- 2. NAMA (fixed 2 baris) -->
      <div class="pcard-name">${escHtml(item.name)}</div>

      <!-- 3. META (fixed 1 baris) -->
      <div class="pcard-meta">
        <span>📍 ${escHtml(item.location||"–")}</span>
        <span class="pcard-meta-sep">·</span>
        <span>👤 ${escHtml(item.owner||"–")}</span>
      </div>

      <!-- 4. PROGRESS (fixed height) -->
      <div class="pcard-progress-row">
        <span class="pcard-progress-label">Progress</span>
        <span class="pcard-progress-val" style="color:${oc}">
          ${ov}%
          <span class="pcard-progress-tag" style="background:${oc}18;color:${oc}">${ol}</span>
        </span>
      </div>
      <div class="pcard-bar">
        <div class="pcard-bar-fill" style="width:${ov}%;background:${oc}"></div>
      </div>

      <!-- 5. BUDGET (fixed 1 baris) -->
      <div class="pcard-budget-line">
        <span class="pcard-budget-icon">💰</span>
        <span class="pcard-budget-text">${budgetLine}</span>
      </div>

      <!-- 6. GOAL (fixed 1 baris) -->
      <div class="pcard-goal-line">
        <span class="pcard-goal-icon">🎯</span>
        <span class="pcard-goal-text">${goalLine}</span>
      </div>

      <!-- 7. INDIKATOR RISIKO (selalu 2 baris) -->
      <div class="pcard-inds">
        <div class="pcard-inds-label">⚡ Perlu Perhatian</div>
        ${indRows}
      </div>

      <!-- 8. FOOTER (chips + deadline) -->
      <div class="pcard-footer">
        <div class="pcard-chips">
          <span class="pcard-chip">📊 ${indCount}</span>
          <span class="pcard-chip pcard-chip-green">✅ ${actCount}</span>
          ${outCount ? `<span class="pcard-chip pcard-chip-purple">🏆 ${outCount}</span>` : ""}
        </div>
        <span class="pcard-deadline" style="color:${dlColor}">📅 ${dlText}</span>
      </div>

    </div>`;
  }).join("");
}


function renderTable(items) {
  const tbody = document.getElementById("projectTable");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:28px">Belum ada data.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map((item, i) => {
    const cls = item.status.toLowerCase().replace(/\s+/g, "-");
    const dt  = new Date(item.updated_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return `
      <tr style="cursor:pointer" onclick="openProjectDetail(window.allProjects[${i}])">
        <td>${i+1}</td>
        <td><strong>${item.name}</strong>${item.donor ? `<br><small style="color:#94a3b8">${item.donor}</small>` : ""}</td>
        <td>${item.location}</td>
        <td>${item.owner}</td>
        <td><span class="badge badge-${cls}">${item.status}</span></td>
        <td>
          ${(() => {
            const ov = calcOverallProgress(item);
            const oc = progressColor(ov);
            return `<div class="progress-bar" style="min-width:70px">
              <div class="progress-fill" style="width:${ov}%;background:${oc}"></div>
            </div>
            <small style="color:${oc};font-weight:700">${ov}%</small>`;
          })()}
        </td>
        <td>${item.deadline || "-"}</td>
        <td>${dt}</td>
        <td>
          <button class="btn-edit" onclick="event.stopPropagation();fillFormEdit(${i})">Edit</button>
          <button class="btn-danger btn-sm" style="margin-left:4px"
            onclick="event.stopPropagation();deleteProject(window.allProjects[${i}].id,window.allProjects[${i}].name)">Hapus</button>
        </td>
      </tr>`;
  }).join("");
}

// ===================== SEARCH =====================
document.getElementById("searchInput").addEventListener("input", function () {
  const q = this.value.toLowerCase();
  renderTable(window.allProjects.filter(x =>
    x.name.toLowerCase().includes(q) ||
    x.location.toLowerCase().includes(q) ||
    x.owner.toLowerCase().includes(q)
  ));
});

// ===================== DETAIL PROYEK =====================
window.openProjectDetail = async function (proj) {
  currentProject    = proj;
  currentActProject = proj.name;
  tabTitles.detail[1] = proj.name;
  document.getElementById("pageTitle").textContent    = "Detail Proyek";
  document.getElementById("pageSubtitle").textContent = proj.name;
  document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
  document.getElementById("tab-detail").classList.add("active");
  renderDetailHeader(proj);
  applyDetailRoleGuards(proj);
  await loadActivities(proj.name);
  renderIndicatorUpdatePanel(proj);
};



function renderDetailHeader(proj) {
  const inds    = proj.project_indicators;
  const indDone = inds.filter(ind => {
    const actual = getLatestActual(ind);
    const pct    = ind.target > 0 ? Math.round(actual / ind.target * 100) : 0;
    return pct >= 100;
  }).length;
  const cls    = proj.status.toLowerCase().replace(/\s+/g, "-");
  // Avg capaian = rata-rata % pencapaian masing-masing indikator (cap 100%)
  const avgInd = inds.length
    ? Math.round(
        inds.reduce((a, ind) => {
          const actual = getLatestActual(ind);
          const pct    = ind.target > 0 ? Math.round(actual / ind.target * 100) : 0;
          return a + Math.min(pct, 100);
        }, 0) / inds.length
      )
    : 0;
  const overall   = calcOverallProgress(proj);
  const ovColor   = progressColor(overall);
  const ovLabel   = progressLabel(overall);
  const avgActPct = calcAvgAktivitas(proj);
  const avgIndPct = calcAvgIndikator(proj);

  document.getElementById("detailHeader").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <button class="btn-secondary btn-sm" onclick="switchTab('dashboard')" style="font-size:12px">← Kembali</button>
          <button class="btn-primary btn-sm" onclick="openReportModal()" style="font-size:12px;margin-left:6px">&#128438; Cetak Laporan</button>
          <span class="badge badge-${cls}">${proj.status}</span>
        </div>
        <div class="detail-project-name">${proj.name}</div>
        <div class="detail-meta">
          <span>${proj.location}</span>
          <span>${proj.owner}</span>
          ${proj.donor    ? `<span>${proj.donor}</span>`            : ""}
          ${proj.deadline ? `<span>Deadline: ${proj.deadline}</span>` : ""}
        </div>
        ${proj.description ? `<p style="font-size:13px;color:#64748b;max-width:600px">${proj.description}</p>` : ""}
        ${proj.goal ? `<div style="margin-top:8px;padding:10px 12px;background:#eff6ff;border-radius:8px;border-left:3px solid #2563eb;max-width:600px"><div style="font-size:11px;font-weight:700;color:#2563eb;margin-bottom:3px">🎯 GOAL</div><div style="font-size:13px;color:#1e3a5f;line-height:1.5">${proj.goal}</div></div>` : ""}
        ${(proj.project_outcomes && proj.project_outcomes.length) ? `<div style="margin-top:8px;padding:10px 12px;background:#f5f3ff;border-radius:8px;border-left:3px solid #7c3aed;max-width:600px"><div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:5px">🏆 OUTCOMES</div>${proj.project_outcomes.map((o, oi) => `<div style="font-size:13px;color:#3b0764;display:flex;gap:6px;margin-bottom:4px"><span style="color:#7c3aed;font-weight:700;min-width:16px">${oi+1}.</span><span>${o.outcome_text}</span></div>`).join("")}</div>` : ""}
      </div>
      <div style="min-width:280px">
        <!-- Progress Keseluruhan (kalkulasi otomatis) -->
        <div class="overall-progress-box" style="border-color:${ovColor}20;background:${ovColor}08">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:#475569">📊 Progress Keseluruhan</span>
            <span class="overall-progress-label" style="background:${ovColor}18;color:${ovColor}">${ovLabel}</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px">
            <span style="font-size:36px;font-weight:800;color:${ovColor};line-height:1">${overall}%</span>
            <span style="font-size:11px;color:#94a3b8">rata-rata aktivitas &amp; indikator</span>
          </div>
          <div class="overall-progress-bar">
            <div class="overall-progress-fill" style="width:${overall}%;background:${ovColor}"></div>
          </div>
          <!-- Breakdown komponen -->
          <div class="overall-breakdown">
            <div class="overall-breakdown-item">
              <span class="overall-breakdown-dot" style="background:#6366f1"></span>
              <span>Aktivitas</span>
              <span style="font-weight:700;color:#6366f1">${avgActPct !== null ? avgActPct + "%" : "—"}</span>
            </div>
            <div class="overall-breakdown-sep">+</div>
            <div class="overall-breakdown-item">
              <span class="overall-breakdown-dot" style="background:#0ea5e9"></span>
              <span>Indikator</span>
              <span style="font-weight:700;color:#0ea5e9">${avgIndPct !== null ? avgIndPct + "%" : "—"}</span>
            </div>
            <div class="overall-breakdown-sep">÷ 2</div>
          </div>
        </div>
        <div class="detail-stats" style="margin-top:12px">
          <div class="detail-stat"><div class="detail-stat-label">Total Indikator</div><div class="detail-stat-value">${inds.length}</div></div>
          <div class="detail-stat"><div class="detail-stat-label">Indikator Tercapai</div><div class="detail-stat-value" style="color:#22c55e">${indDone}/${inds.length}</div></div>
          <div class="detail-stat"><div class="detail-stat-label">Avg. Indikator</div><div class="detail-stat-value" style="color:${progressColor(avgInd)}">${avgInd}%</div></div>
          <div class="detail-stat"><div class="detail-stat-label">Update Terakhir</div><div class="detail-stat-value" style="font-size:13px">${new Date(proj.updated_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</div></div>
        </div>
        ${(proj.budget_approved > 0 || proj.budget_actual > 0) ? `
        <div class="detail-budget-box">
          <div class="detail-budget-title">💰 Anggaran Proyek</div>
          <div class="detail-budget-row">
            <span>Disetujui</span>
            <strong>${formatRupiah(proj.budget_approved)}</strong>
          </div>
          <div class="detail-budget-row">
            <span>Realisasi</span>
            <strong style="color:#f59e0b">${formatRupiah(proj.budget_actual)}
              ${proj.budget_approved > 0 ? `<span class="budget-pct">${pctBudget(proj.budget_approved, proj.budget_actual)}%</span>` : ""}
            </strong>
          </div>
          <div class="progress-bar" style="height:6px;margin:6px 0 4px">
            <div class="progress-fill" style="width:${Math.min(pctBudget(proj.budget_approved, proj.budget_actual),100)}%;background:#f59e0b"></div>
          </div>
          ${proj.budget_updates && proj.budget_updates.length ? `
          <div class="detail-budget-history">
            <div class="detail-budget-history-title">Riwayat Update Realisasi</div>
            ${[...proj.budget_updates].reverse().slice(0,5).map(b => `
              <div class="mini-history-item">
                <span class="mini-history-val">${formatRupiah(b.actual_value)}</span>
                <span class="mini-history-note">${b.note || ""}</span>
                <span class="mini-history-date">${new Date(b.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
              </div>`).join("")}
            ${proj.budget_updates.length > 5 ? `<div class="mini-history-more">${proj.budget_updates.length - 5} update lainnya</div>` : ""}
          </div>` : ""}
        </div>` : ""}
      </div>
    </div>`;
}

// ===================== INDICATOR UPDATE PANEL =====================
function renderIndicatorUpdatePanel(proj) {
  const container = document.getElementById("indicatorUpdateList");
  const inds      = proj.project_indicators;
  if (!inds.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📊</div>
      <div style="font-weight:600;color:#0f172a;margin-bottom:4px">Belum ada indikator</div>
      <small style="color:#94a3b8">Edit proyek untuk menambah indikator</small>
    </div>`;
    return;
  }

  container.innerHTML = inds.map((ind, i) => {
    const sortedUpd     = ind.indicator_updates ? [...ind.indicator_updates] : [];
    const lastH         = sortedUpd.length ? sortedUpd[sortedUpd.length - 1] : null;
    const currentActual = lastH ? Number(lastH.actual_value) : Number(ind.actual) || 0;
    const target        = Number(ind.target) || 0;
    const pct           = target > 0 ? Math.min(Math.round(currentActual / target * 100), 100) : 0;
    const pctColor      = pct >= 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";
    const lastTs        = lastH
      ? new Date(lastH.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})
      : null;

    return `
      <div class="ind-update-card" id="ind-card-${i}">
        <!-- Header -->
        <div class="ind-update-header">
          <div style="flex:1;min-width:0">
            <div class="ind-update-name">${ind.indicator_name}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">
              <span class="badge badge-${(ind.type||"output").toLowerCase()}" style="font-size:10px">${ind.type}</span>
              &nbsp;Target: <strong>${target} ${ind.unit||""}</strong>
            </div>
          </div>
        </div>

        <!-- Capaian saat ini - menonjol -->
        <div class="ind-capaian-display">
          <div class="ind-capaian-main">
            <span class="ind-capaian-actual" id="ind-actual-display-${i}" style="color:${pctColor}">${currentActual}</span>
            <span class="ind-capaian-unit">${ind.unit||""}</span>
            <span class="ind-capaian-sep">/</span>
            <span class="ind-capaian-target">${target} ${ind.unit||""}</span>
          </div>
          <div class="ind-capaian-pct-badge" id="ind-pct-badge-${i}"
            style="background:${pctColor}15;color:${pctColor};border:1px solid ${pctColor}40">
            ${pct}%
          </div>
        </div>
        <div class="progress-bar" style="height:8px;margin:6px 0 4px">
          <div class="progress-fill" id="ind-bar-${i}" style="width:${pct}%;background:${pctColor}"></div>
        </div>
        <div class="ind-last-update" id="ind-ts-${i}">
          ${lastTs
            ? `🕐 Update terakhir: <strong>${lastTs}</strong>`
            : `<span style="color:#94a3b8;font-style:italic">Belum pernah diupdate</span>`}
        </div>

        <!-- Input update kumulatif: hanya untuk non-viewer -->
        \${can('edit') ? `<div class="ind-kumul-box">
          <div class="ind-kumul-header">
            <span>➕ Tambah Capaian Baru</span>
            <span class="ind-kumul-hint">nilai akan dijumlahkan ke capaian saat ini</span>
          </div>
          <div class="ind-kumul-row">
            <div class="form-group" style="flex:1">
              <label>Tambahan Nilai <span style="color:#94a3b8;font-weight:400">(\${ind.unit||"satuan"})</span></label>
              <input type="number" id="upd-add-\${i}" min="0" placeholder="0"
                oninput="previewKumul(\${i}, \${currentActual}, \${target})"
                style="font-size:14px;font-weight:600">
            </div>
            <div class="form-group" style="flex:1">
              <label>Hasil (preview)</label>
              <input type="number" id="upd-preview-\${i}" value="\${currentActual}" readonly
                style="background:#f1f5f9;font-weight:700;color:\${pctColor}">
            </div>
          </div>
          <div class="form-group" style="margin-top:6px">
            <label>Catatan <span style="color:#94a3b8;font-weight:400">(opsional)</span></label>
            <textarea id="upd-note-\${i}" rows="2"
              placeholder="Perkembangan, kendala, atau temuan lapangan…"
              style="font-size:12px"></textarea>
          </div>
          <button class="btn-ind-update" id="upd-btn-\${i}"
            onclick="saveOneIndicator(\${i}, '\${ind.id}', \${currentActual}, \${target}, '\${escHtml(ind.indicator_name)}', '\${escHtml(ind.unit||"")}')">
            💾 Simpan Update
          </button>
          <div id="upd-msg-\${i}" class="form-msg hidden" style="margin-top:6px;font-size:12px"></div>
        </div>` : `<div class="viewer-readonly-notice">&#128274; Mode Viewer — hanya dapat melihat data</div>`}

        <!-- Riwayat -->
        ${sortedUpd.length ? `
        <div class="mini-history" style="margin-top:10px">
          <div class="mini-history-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>📋 ${sortedUpd.length} Riwayat Update</span>
            ${can('delete') ? `<button class="btn-danger btn-sm" style="font-size:10px;padding:3px 8px"
              onclick="clearIndicatorHistory('${ind.id}')">Hapus Semua</button>` : ''}
          </div>
          <div class="mini-history-list">
            ${[...sortedUpd].reverse().slice(0,5).map(h=>`
              <div class="mini-history-item">
                <span class="mini-history-val" style="min-width:80px">${h.actual_value} ${ind.unit||""}</span>
                <span class="mini-history-note">${h.note||""}</span>
                <span class="mini-history-date">
                  ${new Date(h.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                </span>
              </div>`).join("")}
            ${sortedUpd.length>5?`<div class="mini-history-more">${sortedUpd.length-5} update lainnya</div>`:""}
          </div>
        </div>` : ""}
      </div>`;
  }).join("");
}


// Preview kumulatif realtime: tambahan + current = hasil
window.previewKumul = function (i, currentActual, target) {
  const addEl     = document.getElementById("upd-add-" + i);
  const prevEl    = document.getElementById("upd-preview-" + i);
  if (!addEl || !prevEl) return;
  const addVal    = parseFloat(addEl.value) || 0;
  const newTotal  = currentActual + addVal;
  const pct       = target > 0 ? Math.min(Math.round(newTotal / target * 100), 100) : 0;
  const pctColor  = pct >= 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";
  prevEl.value       = newTotal;
  prevEl.style.color = pctColor;
};

// Simpan update untuk SATU indikator (kumulatif)
window.saveOneIndicator = async function (i, indId, currentActual, target, indName, unit) {
  if (!can('edit')) { showToast('Anda tidak memiliki izin untuk mengupdate indikator.', 'error'); return; }
  const addEl   = document.getElementById("upd-add-" + i);
  const noteEl  = document.getElementById("upd-note-" + i);
  const msgEl   = document.getElementById("upd-msg-" + i);
  const btn     = document.getElementById("upd-btn-" + i);
  if (!addEl || !msgEl || !btn) return;

  const addVal  = parseFloat(addEl.value) || 0;
  const note    = noteEl ? noteEl.value.trim() || null : null;

  // Wajib ada tambahan atau catatan
  if (addVal === 0 && !note) {
    msgEl.textContent = "⚠️ Isi tambahan nilai atau catatan terlebih dahulu.";
    msgEl.className   = "form-msg error";
    msgEl.style.display = "block";
    setTimeout(() => { msgEl.className = "form-msg hidden"; msgEl.style.display = ""; }, 3000);
    return;
  }

  btn.textContent = "Menyimpan…";
  btn.disabled    = true;
  msgEl.className = "form-msg hidden";

  try {
    const newTotal = currentActual + addVal;

    // Update kolom actual di project_indicators
    await client.from("project_indicators").update({ actual: newTotal }).eq("id", indId);

    // Selalu insert ke indicator_updates (nilai sudah pasti berbeda karena kumulatif)
    await client.from("indicator_updates").insert({
      indicator_id   : indId,
      project_name   : currentProject.name,
      indicator_name : indName,
      actual_value   : newTotal,
      note,
      updated_by     : "Tim",
    });

    // Kosongkan input
    addEl.value  = "";
    if (noteEl) noteEl.value = "";

    // Tampilkan sukses
    msgEl.textContent   = `✅ Capaian diperbarui: ${currentActual} + ${addVal} = ${newTotal} ${unit}`;
    msgEl.className     = "form-msg success";
    msgEl.style.display = "block";

    // Reload dan refresh panel
    await loadProjects();
    const updated = (window.allProjects || []).find(p => p.name === currentProject.name);
    if (updated) {
      updated.activities_summary = allActivities.map(a => ({
        project_name: a.project_name, progress: a.progress, status: a.status,
      }));
      currentProject = updated;
      renderDetailHeader(currentProject);
      renderIndicatorUpdatePanel(currentProject);
    }

  } catch (err) {
    msgEl.textContent   = "❌ " + err.message;
    msgEl.className     = "form-msg error";
    msgEl.style.display = "block";
  } finally {
    btn.textContent = "💾 Simpan Update";
    btn.disabled    = false;
  }
};

// Legacy updateIndPct - kept for compatibility
window.updateIndPct = function (i, target) {
  const actual   = parseFloat(document.getElementById("upd-actual-" + i)?.value) || 0;
  const pct      = target > 0 ? Math.min(Math.round(actual / target * 100), 100) : 0;
  const el       = document.getElementById("upd-pct-" + i);
  const pctColor = pct >= 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";
  if (el) { el.value = pct; el.style.color = pctColor; el.style.fontWeight = "700"; }
};


// Edit proyek dari panel kanan
document.getElementById("editProjectBtn").addEventListener("click", () => {
  if (!currentProject) return;
  fillFormEdit(window.allProjects.findIndex(p => p.name === currentProject.name));
});

// ===================== DETAIL: ROLE GUARDS =====================
function applyDetailRoleGuards(proj) {
  const editBtn    = document.getElementById('editProjectBtn');
  const approveBtn = document.getElementById('approveProjectBtn');
  const deleteBtn  = document.getElementById('deleteProjectBtn');
  const isViewer   = (currentProfile?.role || 'viewer') === 'viewer';

  if (editBtn)    editBtn.style.display    = can('edit')    ? '' : 'none';
  if (approveBtn) {
    const alreadyApproved = proj.approved;
    approveBtn.style.display = can('approve') ? '' : 'none';
    approveBtn.textContent   = alreadyApproved ? '✔ Disetujui' : '✔ Setujui';
    approveBtn.classList.toggle('btn-approved', !!alreadyApproved);
    approveBtn.disabled = !!alreadyApproved;
  }
  if (deleteBtn)  deleteBtn.style.display  = can('delete')  ? '' : 'none';

  // === VIEWER: sembunyikan SEMUA tombol aksi ===
  const addActBtnDetail = document.getElementById('addActivityBtnDetail');
  if (addActBtnDetail) addActBtnDetail.style.display = isViewer ? 'none' : '';

  // Sembunyikan panel Tambah Proyek dari bottom nav
  const tabInputNav = document.querySelector('.nav-links li[data-tab="input"]');
  if (tabInputNav) tabInputNav.style.display = isViewer ? 'none' : (can('create') ? '' : 'none');
}

// Approve button click
document.getElementById('approveProjectBtn').addEventListener('click', async () => {
  if (!currentProject || !can('approve')) return;
  const btn = document.getElementById('approveProjectBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  const { error } = await client.from('projects')
    .update({ approved: true, approved_by: currentProfile.name, approved_at: new Date().toISOString() })
    .eq('name', currentProject.name);
  if (!error) {
    showToast('✔ Proyek berhasil disetujui', 'success');
    await loadProjects();
    // Update currentProject
    const updated = window.allProjects.find(p => p.name === currentProject.name);
    if (updated) { currentProject = updated; applyDetailRoleGuards(updated); }
  } else {
    btn.disabled = false; btn.textContent = '✔ Setujui';
    showToast('Gagal menyimpan persetujuan', 'error');
  }
});

// Delete button di detail
document.getElementById('deleteProjectBtn').addEventListener('click', () => {
  if (!currentProject || !can('delete')) return;
  deleteProject(currentProject.id, currentProject.name);
});



// ===================== FILL FORM EDIT =====================
window.fillFormEdit = function (idx) {
  if (!can('edit')) { showToast('Anda tidak memiliki izin untuk mengedit proyek.', 'error'); return; }
  const item = window.allProjects[idx];
  document.getElementById("f-name").value       = item.name;
  document.getElementById("f-location").value   = item.location;
  document.getElementById("f-owner").value      = item.owner;
  document.getElementById("f-donor").value      = item.donor       || "";
  document.getElementById("f-start-date").value = item.start_date  || "";
  document.getElementById("f-deadline").value   = item.deadline    || "";
  document.getElementById("f-status").value     = item.status;
  // progress tidak diisi manual
  document.getElementById("f-desc").value            = item.description    || "";
  document.getElementById("f-note").value            = item.note           || "";
  document.getElementById("f-budget-approved").value = item.budget_approved || "";
  document.getElementById("f-budget-actual").value   = item.budget_actual   || "";
  const _fGoalEdit = document.getElementById("f-goal");
  if (_fGoalEdit) _fGoalEdit.value = item.goal || "";
  outcomes = (item.project_outcomes || []).map(o => ({ text: o.outcome_text }));
  renderOutcomeList();
  indicators = item.project_indicators.map(ind => ({
    id          : ind.id,
    name        : ind.indicator_name,
    type        : ind.type,
    target      : ind.target,
    unit        : ind.unit,
    actual      : ind.actual || 0,
    update_note : "",
    history     : ind.indicator_updates  || [],
    evidence    : ind.indicator_evidence || [],
  }));
  document.getElementById("pageTitle").textContent    = "Edit Proyek";
  document.getElementById("pageSubtitle").textContent = item.name;
  document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
  document.querySelector("[data-tab='input']").classList.add("active");
  document.getElementById("tab-input").classList.add("active");
  setStep(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ===================== AKTIVITAS =====================
async function loadActivities(projectName) {
  const { data: acts  } = await client.from("project_activities").select().eq("project_name", projectName).order("sort_order").order("created_at");
  const { data: notes } = await client.from("activity_notes").select().eq("project_name", projectName).order("created_at", { ascending: false });
  allActivities   = acts  || [];
  allActNotes     = notes || [];
  renderActivityListDetail();
  updateFileCountBadges();
  // Refresh header progress setelah aktivitas dimuat (data activities_summary fresh)
  if (currentProject) {
    // Suntikkan activities_summary terbaru ke currentProject
    currentProject.activities_summary = allActivities.map(a => ({
      project_name: a.project_name,
      progress    : a.progress,
      status      : a.status,
    }));
    renderDetailHeader(currentProject);
  }
}

function renderActivityListDetail() {
  const container = document.getElementById("activityListDetail");
  if (!allActivities.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">Belum ada aktivitas.<br>Klik <strong>Tambah</strong> untuk menambah.</div>`;
    return;
  }
  const avg  = Math.round(allActivities.reduce((a,b) => a + b.progress, 0) / allActivities.length);
  const done = allActivities.filter(a => a.status === "Selesai").length;
  container.innerHTML = `
    <div style="background:#f0fdf4;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#15803d;font-weight:600">
      ${done}/${allActivities.length} selesai &nbsp;&nbsp; Rata-rata progress ${avg}%
    </div>
    ${allActivities.map(act => {
      const cls      = act.status.toLowerCase().replace(/\s+/g, "-");
      const notes    = allActNotes.filter(n => n.activity_id === act.id);
      const checked  = act.status === "Selesai";
      const badgeCls = cls === "selesai" ? "badge-selesai-act" : `badge-${cls}`;
      return `
        <div class="activity-card ${cls}" id="actcard-${act.id}">
          <div class="activity-card-header" onclick="toggleActBody('${act.id}')">
            <div class="act-check ${checked ? "checked" : ""} ${!can('edit') ? 'act-check-disabled' : ''}"
              onclick="event.stopPropagation();${can('edit') ? `toggleActDone('${act.id}',${checked})` : ''}"
              title="${checked ? "Tandai belum selesai" : "Tandai selesai"}">${checked ? "✓" : ""}</div>
            <div class="activity-card-info">
              <div class="activity-card-title ${checked ? "done" : ""}">${act.title}</div>
              <div class="activity-card-meta">
                ${act.pic      ? `<span>${act.pic}</span>`      : ""}
                ${act.due_date ? `<span>${act.due_date}</span>` : ""}
                <span><span class="badge ${badgeCls}" style="font-size:10px">${act.status}</span></span>
                ${notes.length ? `<span>${notes.length} 📝</span>` : ""}
                <span class="file-count-badge" id="filecount-${act.id}"></span>
              </div>
            </div>
            <div class="activity-card-progress">
              <div class="activity-card-pct">${act.progress}%</div>
              <div class="progress-bar" style="width:80px;height:5px">
                <div class="progress-fill" style="width:${act.progress}%"></div>
              </div>
            </div>
            <div class="activity-card-actions" onclick="event.stopPropagation()">
              ${can('edit') ? `<button class="btn-edit"   onclick="openActModal('${act.id}')">✏️</button>` : ''}
              ${can('delete') ? `<button class="btn-remove" onclick="deleteActivity('${act.id}')">✕</button>` : ''}
            </div>
          </div>
          <div class="activity-card-body" id="actbody-${act.id}">
            ${act.description ? `<p style="font-size:12px;color:#475569;margin:10px 0 6px">${act.description}</p>` : ""}
            <div class="act-note-section">
              <div class="act-note-title">Catatan</div>
              ${can('edit') ? `
              <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
                <textarea id="inline-note-${act.id}" rows="2"
                  placeholder="Tulis catatan pelaksanaan…"
                  style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;resize:vertical"></textarea>
                <button class="btn-upload" onclick="saveInlineNote('${act.id}')">＋</button>
              </div>` : ''}
              <div class="act-note-list" id="notelist-${act.id}">${renderActNotes(notes)}</div>
            </div>
          </div>
        </div>`;
    }).join("")}`;
}

function renderActNotes(notes) {
  if (!notes.length) return `<div class="history-empty">Belum ada catatan.</div>`;
  return notes.map(n => `
    <div class="act-note-item">
      <div class="history-dot"></div>
      <div class="act-note-content">
        <div class="act-note-text">${n.note}</div>
        <div class="act-note-date">${new Date(n.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})} — ${n.noted_by || "Tim"}</div>
      </div>
    </div>`).join("");
}

window.toggleActBody = function (id) {
  document.getElementById("actbody-" + id)?.classList.toggle("open");
};

window.toggleActDone = async function (id, wasChecked) {
  if (!can('edit')) { showToast('Anda tidak memiliki izin untuk mengubah status aktivitas.', 'error'); return; }
  const update = { status: wasChecked ? "Sedang Berjalan" : "Selesai" };
  if (!wasChecked) update.progress = 100;
  await client.from("project_activities").update(update).eq("id", id);
  await loadActivities(currentActProject);
  await loadProjects();
};

window.saveInlineNote = async function (actId) {
  if (!can('edit')) { showToast('Anda tidak memiliki izin untuk menambah catatan.', 'error'); return; }
  const ta   = document.getElementById("inline-note-" + actId);
  const note = ta.value.trim();
  if (!note) { alert("Catatan tidak boleh kosong."); return; }
  await client.from("activity_notes").insert({ activity_id: actId, project_name: currentActProject, note, noted_by: "Tim" });
  ta.value = "";
  await loadActivities(currentActProject);
};

window.deleteActivity = async function (id) {
  if (!can('delete')) { showToast('Anda tidak memiliki izin untuk menghapus aktivitas.', 'error'); return; }
  if (!confirm("Hapus aktivitas ini?")) return;
  await client.from("project_activities").delete().eq("id", id);
  await loadActivities(currentActProject);
  await loadProjects();
};

async function updateFileCountBadges() {
  if (!allActivities.length) return;
  const { data } = await client.from("activity_files").select("activity_id").in("activity_id", allActivities.map(a => a.id));
  const counts = {};
  (data || []).forEach(r => { counts[r.activity_id] = (counts[r.activity_id] || 0) + 1; });
  allActivities.forEach(act => {
    const el = document.getElementById("filecount-" + act.id);
    if (el) el.textContent = counts[act.id] ? `📎 ${counts[act.id]}` : "";
  });
}

// Tambah aktivitas dari panel detail
document.getElementById("addActivityBtnDetail").addEventListener("click", () => openActModal(null));

// ===================== MODAL AKTIVITAS =====================
window.openActModal = async function (id) {
  if (!can('edit')) { showToast('Anda tidak memiliki izin untuk mengedit aktivitas.', 'error'); return; }
  currentActId = id;
  document.getElementById("actModalTitle").textContent = id ? "Edit Aktivitas" : "Tambah Aktivitas";
  ["act-id","act-title","act-desc","act-pic","act-new-note"].forEach(x => { document.getElementById(x).value = ""; });
  document.getElementById("act-status").value       = "Belum Mulai";
  document.getElementById("act-start").value        = "";
  document.getElementById("act-due").value          = "";
  document.getElementById("act-progress").value     = 0;
  document.getElementById("act-progress-range").value = 0;
  document.getElementById("act-progress-val").textContent = "0";
  document.getElementById("actFormMsg").className   = "form-msg hidden";
  document.getElementById("actNoteList").innerHTML  = `<div class="history-empty">Belum ada catatan.</div>`;
  stagedFiles = []; savedFiles = [];
  renderStagingList(); renderSavedFiles();
  document.getElementById("actUploadProgress").textContent = "";

  if (id) {
    const act = allActivities.find(a => a.id === id);
    if (act) {
      document.getElementById("act-title").value            = act.title;
      document.getElementById("act-desc").value             = act.description || "";
      document.getElementById("act-pic").value              = act.pic || "";
      document.getElementById("act-status").value           = act.status;
      document.getElementById("act-start").value            = act.start_date || "";
      document.getElementById("act-due").value              = act.due_date   || "";
      document.getElementById("act-progress").value         = act.progress;
      document.getElementById("act-progress-range").value   = act.progress;
      document.getElementById("act-progress-val").textContent = act.progress;
      const notes = allActNotes.filter(n => n.activity_id === id);
      document.getElementById("actNoteList").innerHTML = renderActNotes(notes);
      await loadSavedFiles(id);
    }
  }
  document.getElementById("actModalOverlay").classList.remove("hidden");
};

["actModalClose","actModalClose2"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => {
    document.getElementById("actModalOverlay").classList.add("hidden");
  });
});
document.getElementById("actModalOverlay").addEventListener("click", e => {
  if (e.target === document.getElementById("actModalOverlay"))
    document.getElementById("actModalOverlay").classList.add("hidden");
});

document.getElementById("saveNoteBtn").addEventListener("click", async () => {
  const note = document.getElementById("act-new-note").value.trim();
  if (!note)          { alert("Catatan tidak boleh kosong."); return; }
  if (!currentActId)  { alert("Simpan aktivitas terlebih dahulu."); return; }
  await client.from("activity_notes").insert({ activity_id: currentActId, project_name: currentActProject, note, noted_by: "Tim" });
  document.getElementById("act-new-note").value = "";
  const { data: notes } = await client.from("activity_notes").select().eq("activity_id", currentActId).order("created_at", { ascending: false });
  allActNotes = [...allActNotes.filter(n => n.activity_id !== currentActId), ...(notes || [])];
  document.getElementById("actNoteList").innerHTML = renderActNotes(notes || []);
});

document.getElementById("saveActivityBtn").addEventListener("click", async () => {
  const msg   = document.getElementById("actFormMsg");
  const title = document.getElementById("act-title").value.trim();
  if (!title) { msg.textContent = "Judul wajib diisi."; msg.className = "form-msg error"; return; }
  const payload = {
    project_name : currentActProject,
    title,
    description  : document.getElementById("act-desc").value.trim()  || null,
    pic          : document.getElementById("act-pic").value.trim()    || null,
    status       : document.getElementById("act-status").value,
    start_date   : document.getElementById("act-start").value         || null,
    due_date     : document.getElementById("act-due").value           || null,
    progress     : Number(document.getElementById("act-progress").value) || 0,
  };
  let error;
  if (currentActId) {
    ({ error } = await client.from("project_activities").update(payload).eq("id", currentActId));
  } else {
    const { data, error: insErr } = await client.from("project_activities").insert(payload).select().single();
    error = insErr;
    if (data) currentActId = data.id;
  }
  if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }
  msg.textContent = "✅ Tersimpan!";
  msg.className   = "form-msg success";
  setTimeout(() => {
    document.getElementById("actModalOverlay").classList.add("hidden");
    msg.className = "form-msg hidden";
  }, 1200);
  await loadActivities(currentActProject);
  await loadProjects();
});

// ===================== FILE UPLOAD =====================
function getFileIcon(n) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(n) ? "🖼️"
       : /\.pdf$/i.test(n) ? "📄"
       : /\.(doc|docx)$/i.test(n) ? "📝"
       : /\.(xls|xlsx|csv)$/i.test(n) ? "📊"
       : /\.(ppt|pptx)$/i.test(n) ? "📑" : "📎";
}
function formatBytes(b) {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b/1024).toFixed(1) + " KB";
  return (b/1048576).toFixed(1) + " MB";
}
function isImage(n) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(n); }

function renderStagingList() {
  const container   = document.getElementById("actFileStagingList");
  const uploadRow   = document.getElementById("actUploadAllRow");
  if (!stagedFiles.length) { container.innerHTML = ""; uploadRow.classList.add("hidden"); return; }
  uploadRow.classList.remove("hidden");
  container.innerHTML = stagedFiles.map(sf => {
    const thumb = isImage(sf.file.name)
      ? `<img class="file-thumb" src="${URL.createObjectURL(sf.file)}" alt="">`
      : `<div class="file-thumb-placeholder">${getFileIcon(sf.file.name)}</div>`;
    const statusMap = { wait:"Menunggu", uploading:"Upload…", ok:"OK", err: sf.errMsg || "Gagal" };
    return `
      <div class="file-staging-item ${sf.status==="ok"?"uploaded":""} ${sf.status==="err"?"error-item":""}">
        ${thumb}
        <div class="file-staging-info">
          <div class="file-staging-name" title="${sf.file.name}">${sf.file.name}</div>
          <div class="file-staging-size">${formatBytes(sf.file.size)}</div>
          <div class="file-progress-bar" id="bar-${sf.id}"><div class="file-progress-fill" style="width:${sf.status==="ok"?"100":"0"}%"></div></div>
        </div>
        <span class="file-staging-status ${sf.status}">${statusMap[sf.status]}</span>
        ${sf.status !== "uploading" ? `<button class="file-remove-btn" onclick="removeStagedFile('${sf.id}')">✕</button>` : ""}
      </div>`;
  }).join("");
}

function renderSavedFiles() {
  const container = document.getElementById("actSavedFilesList");
  const titleEl   = document.getElementById("savedFilesTitle");
  if (!savedFiles.length) {
    container.innerHTML = `<div class="history-empty" style="font-size:12px">Belum ada file.</div>`;
    titleEl.style.display = "none"; return;
  }
  titleEl.style.display = "block";
  container.innerHTML = savedFiles.map(f => {
    const thumb = isImage(f.file_name)
      ? `<img class="file-thumb" src="${f.file_url}" alt="" loading="lazy">`
      : `<div class="file-thumb-placeholder">${getFileIcon(f.file_name)}</div>`;
    return `
      <div class="file-saved-item">
        ${thumb}
        <div class="file-saved-info">
          <div class="file-saved-name" title="${f.file_name}">${f.file_name}</div>
          <div class="file-saved-meta">${formatBytes(f.file_size)} — ${new Date(f.created_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</div>
        </div>
        <div class="file-saved-actions">
          <a href="${f.file_url}" target="_blank" class="file-btn-view">Lihat</a>
          <button class="file-btn-delete" onclick="deleteSavedFile('${f.id}','${f.file_url}')">✕</button>
        </div>
      </div>`;
  }).join("");
}

function addFilesToStaging(fileList) {
  Array.from(fileList).forEach(file => {
    if (file.size > 10 * 1024 * 1024) { alert(file.name + " terlalu besar (maks 10 MB)."); return; }
    stagedFiles.push({ file, id: Date.now() + Math.random().toString(36).slice(2), status: "wait", errMsg: "" });
  });
  renderStagingList();
}

document.getElementById("actFileInput").addEventListener("change", function () {
  addFilesToStaging(this.files); this.value = "";
});
const dropzone = document.getElementById("actDropzone");
dropzone.addEventListener("dragover",  e => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", ()  => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop",      e  => { e.preventDefault(); dropzone.classList.remove("dragover"); addFilesToStaging(e.dataTransfer.files); });

window.removeStagedFile = function (id) { stagedFiles = stagedFiles.filter(sf => sf.id !== id); renderStagingList(); };

document.getElementById("actUploadAllBtn").addEventListener("click", async () => {
  if (!currentActId) { alert("Simpan aktivitas terlebih dahulu."); return; }
  const pending = stagedFiles.filter(sf => sf.status === "wait" || sf.status === "err");
  if (!pending.length) { alert("Tidak ada file yang perlu diupload."); return; }
  const btn  = document.getElementById("actUploadAllBtn");
  const prog = document.getElementById("actUploadProgress");
  btn.disabled = true;
  for (let i = 0; i < pending.length; i++) {
    const sf = pending[i];
    sf.status = "uploading"; renderStagingList();
    prog.textContent = `Upload ${i+1}/${pending.length}…`;
    const path = `${currentActId}/${Date.now()}-${sf.file.name}`;
    const { error: upErr } = await client.storage.from(BUCKET).upload(path, sf.file, { upsert: true });
    if (upErr) { sf.status = "err"; sf.errMsg = upErr.message; renderStagingList(); continue; }
    const bar = document.querySelector(`#bar-${sf.id} .file-progress-fill`);
    if (bar) bar.style.width = "100%";
    const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await client.from("activity_files").insert({
      activity_id : currentActId,
      project_name: currentActProject,
      file_name   : sf.file.name,
      file_url    : urlData.publicUrl,
      file_size   : sf.file.size,
      file_type   : sf.file.type || null,
      uploaded_by : "Tim",
    });
    sf.status = dbErr ? "err" : "ok";
    sf.errMsg = dbErr ? dbErr.message : "";
    renderStagingList();
  }
  prog.textContent = "Selesai!";
  btn.disabled = false;
  await loadSavedFiles(currentActId);
  setTimeout(() => {
    stagedFiles = stagedFiles.filter(sf => sf.status !== "ok");
    renderStagingList();
    if (!stagedFiles.length) prog.textContent = "";
  }, 2000);
  await loadActivities(currentActProject);
});

async function loadSavedFiles(actId) {
  const { data } = await client.from("activity_files").select().eq("activity_id", actId).order("created_at", { ascending: false });
  savedFiles = data || [];
  renderSavedFiles();
}

window.deleteSavedFile = async function (fileId, fileUrl) {
  if (!confirm("Hapus file ini?")) return;
  try {
    const parts = fileUrl.split(BUCKET + "/");
    if (parts[1]) await client.storage.from(BUCKET).remove([decodeURIComponent(parts[1])]);
  } catch (e) { /* abaikan error storage */ }
  await client.from("activity_files").delete().eq("id", fileId);
  await loadSavedFiles(currentActId);
  await loadActivities(currentActProject);
};

// ===================== HAPUS PROYEK =====================
window.deleteProject = async function (id, name) {
  if (!confirm(`Hapus proyek "${name}"?\nIndikator, aktivitas, dan file terkait juga akan terhapus.`)) return;
  const { data: indList } = await client.from("project_indicators").select("id").eq("project_name", name);
  const indIds = (indList || []).map(i => i.id);
  if (indIds.length) {
    await client.from("indicator_evidence").delete().in("indicator_id", indIds);
    await client.from("indicator_updates").delete().in("indicator_id", indIds);
  }
  await client.from("budget_updates").delete().eq("project_name", name);
  await client.from("project_indicators").delete().eq("project_name", name);
  const { data: actList } = await client.from("project_activities").select("id").eq("project_name", name);
  const actIds = (actList || []).map(a => a.id);
  if (actIds.length) {
    await client.from("activity_notes").delete().in("activity_id", actIds);
    const { data: files } = await client.from("activity_files").select("file_url").in("activity_id", actIds);
    if (files && files.length) {
      await client.storage.from(BUCKET).remove(files.map(f => {
        const p = f.file_url.split(BUCKET + "/");
        return p[1] ? decodeURIComponent(p[1]) : null;
      }).filter(Boolean));
    }
    await client.from("activity_files").delete().in("activity_id", actIds);
  }
  await client.from("project_activities").delete().eq("project_name", name);
  const { error } = await client.from("projects").delete().eq("id", id);
  if (error) { alert("Gagal hapus proyek: " + error.message); return; }
  if (currentProject && currentProject.name === name) { currentProject = null; switchTab("dashboard"); }
  await loadProjects();
};

// ===================== HAPUS RIWAYAT INDIKATOR =====================
window.clearIndicatorHistory = async function (indicatorId) {
  if (!can('delete')) { showToast('Anda tidak memiliki izin untuk menghapus riwayat.', 'error'); return; }
  if (!confirm("Hapus semua riwayat capaian indikator ini? Tidak bisa dikembalikan.")) return;
  const { error } = await client.from("indicator_updates").delete().eq("indicator_id", indicatorId);
  if (error) { alert("Gagal hapus riwayat: " + error.message); return; }
  await loadProjects();
};

// ===================== SIDEBAR SUBMENU =====================
function renderSidebarSubmenu(items) {
  const submenu = document.getElementById("projectSubmenu");
  if (!submenu) return;
  if (!items.length) { submenu.innerHTML = ""; return; }
  submenu.innerHTML = items.map((item, i) => {
    const cls       = item.status.toLowerCase().replace(/\s+/g, "-");
    const shortName = item.name.length > 22 ? item.name.substring(0, 22) + "…" : item.name;
    return `<li onclick="openProjectDetail(window.allProjects[${i}])">
      <span class="submenu-dot dot-${cls}"></span>
      <span class="submenu-name" title="${item.name.replace(/"/g,"&quot;")}">${shortName}</span>
    </li>`;
  }).join("");
}

// ===================== PANEL SCROLL SHADOW =====================
function initPanelScrollShadow() {
  document.querySelectorAll(".panel-scroll").forEach(el => {
    const wrap = el.closest(".panel-scroll-wrap");
    if (!wrap) return;
    const check = () => wrap.classList.toggle("at-bottom", el.scrollHeight - el.scrollTop - el.clientHeight < 10);
    el.addEventListener("scroll", check);
    check();
  });
}
(function () {
  const orig = window.switchTab;
  window.switchTab = function (tab) {
    orig(tab);
    if (tab === "detail") setTimeout(initPanelScrollShadow, 300);
  };
})();

// ===================== OBSERVER BADGE COUNTER =====================
(function () {
  const observer = new MutationObserver(() => {
    const list    = document.getElementById("activityListDetail");
    const counter = document.getElementById("activityCount");
    if (list && counter) counter.textContent = list.querySelectorAll(".activity-card").length + " aktivitas";
    const indList    = document.getElementById("indicatorUpdateList");
    const indCounter = document.getElementById("indCount");
    if (indList && indCounter) indCounter.textContent = indList.querySelectorAll(".ind-update-card").length + " indikator";
    setTimeout(initPanelScrollShadow, 100);
  });
  document.addEventListener("DOMContentLoaded", () => {
    const actList = document.getElementById("activityListDetail");
    const indList = document.getElementById("indicatorUpdateList");
    if (actList) observer.observe(actList, { childList: true, subtree: true });
    if (indList) observer.observe(indList, { childList: true, subtree: true });
    initPanelScrollShadow();
  });
})();

// ===================== REALTIME + INIT =====================
client.channel("projects-rt")
  .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, loadProjects)
  .subscribe();

document.getElementById("refreshBtn").addEventListener("click", loadProjects);

setStep(1);
initAuth();

// ===================== MOBILE: SIDEBAR TOGGLE =====================
(function () {
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar   = document.querySelector('.sidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  if (!hamburger || !sidebar || !overlay) return;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    hamburger.classList.add('active');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);

  // Tutup sidebar otomatis saat nav item diklik di mobile
  document.querySelectorAll('.nav-links li[data-tab], .nav-submenu li[data-tab]').forEach(li => {
    li.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });
})();

// ===================== MOBILE: BOTTOM NAV =====================
(function () {
  const items = document.querySelectorAll('.bottom-nav-item[data-tab]');
  items.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'detail' && !window.currentProject) return;
      window.switchTab(tab);
    });
  });

  // Sync bottom nav active state dengan switchTab
  const origSwitchTab = window.switchTab;
  window.switchTab = function(tab) {
    origSwitchTab(tab);
    items.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    // Tampilkan tombol Detail di bottom nav jika ada proyek aktif
    const detailBtn = document.getElementById('bottomNavDetail');
    if (detailBtn) {
      detailBtn.style.display = (tab === 'detail' && window.currentProject) ? 'flex' : 'none';
    }
  };
})();


// ===================== USER MANAGEMENT MODULE =====================
let allUsers = [];

async function loadUsers() {
  const tbody = document.getElementById('usersTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Memuat...</td></tr>';
  const { data, error } = await client.from('user_profiles').select('*').order('created_at', { ascending: true });
  if (error) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:20px">Gagal memuat: ${error.message}</td></tr>`; return; }
  allUsers = data || [];
  renderUsersTable(allUsers);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTable');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:28px">Belum ada pengguna.</td></tr>';
    return;
  }
  const colors = { admin:'#dc2626', manager:'#7c3aed', editor:'#2563eb', viewer:'#64748b' };
  tbody.innerHTML = users.map((u, i) => {
    const isSuper = isSuperAdmin(u.email);
    const isMe    = currentProfile && currentProfile.id === u.id;
    const bg      = colors[u.role] || '#64748b';
    const init    = (u.avatar_initial || (u.name||'?')[0]).toUpperCase();
    const joined  = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
    const emailTxt = u.email ? escHtml(u.email) : '<em style="color:#94a3b8">–</em>';
    const roleCell = isSuper
      ? `<span class="superadmin-lock">&#128274; Super Admin</span>`
      : `<select class="role-select-inline" onchange="changeUserRole('${u.id}',this.value,this)">
           <option value="admin"   ${u.role==='admin'  ?'selected':''}>Admin</option>
           <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
           <option value="editor"  ${u.role==='editor' ?'selected':''}>Editor</option>
           <option value="viewer"  ${u.role==='viewer' ?'selected':''}>Viewer</option>
         </select>`;
    const actCell = isSuper
      ? `<button class="btn-edit" onclick="openEditUserModal('${u.id}')">Edit</button>`
      : isMe
        ? `<button class="btn-edit" onclick="openEditUserModal('${u.id}')">Edit</button>`
        : `<button class="btn-edit" onclick="openEditUserModal('${u.id}')">Edit</button>
           <button class="btn-danger" style="margin-left:4px" onclick="deleteUser('${u.id}','${escHtml(u.name||'')}')">Hapus</button>`;
    return `<tr class="${isSuper?'super-admin-row':''}">
      <td>${i+1}</td>
      <td><div class="user-table-cell">
        <div class="user-table-avatar" style="background:${bg}">${init}</div>
        <div><div class="user-table-name">${escHtml(u.name||'')}${isMe?'<span class="me-badge">Saya</span>':''}</div></div>
      </div></td>
      <td style="font-size:12px;color:#475569">${emailTxt}</td>
      <td>${roleCell}</td>
      <td style="font-size:12px;color:#64748b">${joined}</td>
      <td>${actCell}</td>
    </tr>`;
  }).join('');
}

window.changeUserRole = async function(profileId, newRole, sel) {
  const u = allUsers.find(x => x.id === profileId);
  if (!u) return;
  if (isSuperAdmin(u.email)) { showToast('Role Super Admin tidak dapat diubah.','error'); sel.value=u.role; return; }
  sel.disabled = true;
  const { error } = await client.from('user_profiles').update({ role: newRole }).eq('id', profileId);
  sel.disabled = false;
  if (error) { showToast('Gagal: '+error.message,'error'); sel.value=u.role; }
  else { u.role=newRole; showToast('Role berhasil diperbarui.','success'); }
};

function openAddUserModal() {
  document.getElementById('userModalTitle').textContent = 'Tambah Pengguna';
  document.getElementById('um-name').value  = '';
  document.getElementById('um-email').value = '';
  document.getElementById('um-email').readOnly = false;
  document.getElementById('um-role').value  = 'viewer';
  document.getElementById('um-role').disabled = false;
  document.getElementById('um-userid').value = '';
  document.getElementById('userModalMsg').className = 'form-msg hidden';
  document.getElementById('userModalOverlay').classList.remove('hidden');
}
window.openEditUserModal = function(profileId) {
  const u = allUsers.find(x => x.id === profileId); if (!u) return;
  const isSuper = isSuperAdmin(u.email);
  document.getElementById('userModalTitle').textContent = 'Edit Pengguna';
  document.getElementById('um-name').value  = u.name  || '';
  document.getElementById('um-email').value = u.email || '';
  document.getElementById('um-email').readOnly = isSuper;
  document.getElementById('um-role').value  = u.role  || 'viewer';
  document.getElementById('um-role').disabled = isSuper;
  document.getElementById('um-userid').value = u.id;
  document.getElementById('userModalMsg').className = 'form-msg hidden';
  document.getElementById('userModalOverlay').classList.remove('hidden');
};
function closeUserModal() {
  document.getElementById('userModalOverlay').classList.add('hidden');
  document.getElementById('um-role').disabled = false;
  document.getElementById('um-email').readOnly = false;
}
function showUserModalMsg(txt, type) {
  const el = document.getElementById('userModalMsg');
  el.textContent = txt; el.className = `form-msg ${type}`;
}
async function saveUser() {
  const name  = document.getElementById('um-name').value.trim();
  const email = document.getElementById('um-email').value.trim().toLowerCase();
  const role  = document.getElementById('um-role').value;
  const uid   = document.getElementById('um-userid').value;
  const btn   = document.getElementById('saveUserBtn');
  if (!name)  { showUserModalMsg('Nama wajib diisi.','error'); return; }
  if (!email) { showUserModalMsg('Email wajib diisi.','error'); return; }
  if (uid) {
    const ex = allUsers.find(x=>x.id===uid);
    if (ex && isSuperAdmin(ex.email)) {
      if (email!==ex.email) { showUserModalMsg('Email Super Admin tidak dapat diubah.','error'); return; }
      if (role!==ex.role)   { showUserModalMsg('Role Super Admin tidak dapat diubah.','error'); return; }
    }
  }
  btn.disabled=true; btn.textContent='Menyimpan...';
  try {
    if (uid) {
      const upd = { name };
      if (!isSuperAdmin(email)) { upd.role = role; }
      const { error } = await client.from('user_profiles').update(upd).eq('id',uid);
      if (error) throw new Error(error.message);
      showToast('Profil berhasil diperbarui.','success');
    } else {
      const { data: authId, error: rpcErr } = await client.rpc('get_user_id_by_email', { p_email: email });
      if (rpcErr||!authId) throw new Error('Email tidak ditemukan di Supabase Auth.\nDaftarkan dulu: Supabase → Authentication → Users → Invite User');
      const { data: exists } = await client.from('user_profiles').select('id').eq('user_id',authId).maybeSingle();
      if (exists) throw new Error('Pengguna dengan email ini sudah terdaftar.');
      const { error: insErr } = await client.from('user_profiles').insert({ user_id:authId, name, role, avatar_initial:name[0].toUpperCase() });
      if (insErr) throw new Error(insErr.message);
      showToast('Pengguna berhasil ditambahkan.','success');
    }
    closeUserModal(); await loadUsers();
  } catch(err) { showUserModalMsg(err.message,'error'); }
  finally { btn.disabled=false; btn.textContent='Simpan'; }
}
window.deleteUser = async function(profileId, userName) {
  const u = allUsers.find(x=>x.id===profileId); if (!u) return;
  if (isSuperAdmin(u.email)) { showToast('Super Admin tidak dapat dihapus.','error'); return; }
  if (currentProfile&&currentProfile.id===profileId) { showToast('Tidak dapat menghapus akun sendiri.','error'); return; }
  if (!confirm(`Hapus pengguna "${userName}"?\nTindakan ini tidak dapat dibatalkan.`)) return;
  const { error } = await client.from('user_profiles').delete().eq('id',profileId);
  if (error) showToast('Gagal: '+error.message,'error');
  else { showToast(`"${userName}" berhasil dihapus.`,'success'); await loadUsers(); }
};
document.addEventListener('DOMContentLoaded', () => {
  const $id = id => document.getElementById(id);
  const addBtn=$id('addUserBtn'), closeBtn=$id('userModalClose'), cancelBtn=$id('userModalCancel'), saveBtn=$id('saveUserBtn'), overlay=$id('userModalOverlay');
  if (addBtn)    addBtn.addEventListener('click', openAddUserModal);
  if (closeBtn)  closeBtn.addEventListener('click', closeUserModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeUserModal);
  if (saveBtn)   saveBtn.addEventListener('click', saveUser);
  if (overlay)   overlay.addEventListener('click', e => { if(e.target===overlay) closeUserModal(); });
});
// ===================== END USER MANAGEMENT MODULE =====================


// ===================== GENERATE REPORT MODULE =====================
function openReportModal() {
  if (!currentProject) { showToast('Buka detail proyek terlebih dahulu.','error'); return; }
  document.getElementById('reportLangModal').classList.remove('hidden');
}

window.generateReport = async function(lang) {
  document.getElementById('reportLangModal').classList.add('hidden');
  if (!currentProject) return;
  const proj = currentProject;
  showToast(lang==='id'?'Membuat laporan...':'Generating report...','success');

  const [{ data: acts },{ data: notes },{ data: indUpds },{ data: budgets },{ data: projOutcomes }] = await Promise.all([
    client.from('project_activities').select('*').eq('project_name',proj.name).order('sort_order').order('created_at'),
    client.from('activity_notes').select('*').eq('project_name',proj.name).order('created_at',{ascending:false}),
    client.from('indicator_updates').select('*').eq('project_name',proj.name).order('created_at',{ascending:false}),
    client.from('budget_updates').select('*').eq('project_name',proj.name).order('created_at',{ascending:false}),
    client.from('project_outcomes').select('*').eq('project_name',proj.name).order('sort_order'),
  ]);

  const html = buildReportHTML(proj, acts||[], notes||[], indUpds||[], budgets||[], projOutcomes||[], lang);
  const win = window.open('','_blank','width=1000,height=800');
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(()=>{ win.focus(); win.print(); }, 600);
};

function buildReportHTML(proj, activities, actNotes, allIndUpds, budgetUpds, projOutcomes, lang) {
  const ID = lang==='id';
  const L = {
    reportTitle: ID?'LAPORAN PROYEK':'PROJECT REPORT',
    s1: ID?'1. RINGKASAN EKSEKUTIF':'1. EXECUTIVE SUMMARY',
    s2: ID?'2. CAPAIAN INDIKATOR':'2. INDICATOR ACHIEVEMENT',
    s3: ID?'3. DAFTAR AKTIVITAS':'3. ACTIVITY LIST',
    s4: ID?'4. REALISASI ANGGARAN':'4. BUDGET REALIZATION',
    s5: ID?'5. OUTCOMES / HASIL':'5. OUTCOMES / RESULTS',
    s6: ID?'6. NARASI & PEMBELAJARAN':'6. NARRATIVE & LEARNING',
    s7: ID?'7. TANDA TANGAN':'7. SIGNATURES',
    projectName:  ID?'Nama Proyek':'Project Name',
    location:     ID?'Lokasi':'Location',
    owner:        ID?'Pelaksana':'Implementing Org.',
    donor:        ID?'Donor / Mitra':'Donor / Partner',
    startDate:    ID?'Tanggal Mulai':'Start Date',
    deadline:     ID?'Tenggat Waktu':'Deadline',
    status:       ID?'Status':'Status',
    printedOn:    ID?'Dicetak pada':'Printed on',
    overallProg:  ID?'Progres Keseluruhan':'Overall Progress',
    budgetAppr:   ID?'Anggaran Disetujui':'Approved Budget',
    budgetReal:   ID?'Realisasi Anggaran':'Budget Realization',
    absorption:   ID?'Penyerapan':'Absorption',
    indCount:     ID?'Indikator':'Indicators',
    achieved:     ID?'tercapai':'achieved',
    indName:      ID?'Indikator':'Indicator',
    type:         ID?'Jenis':'Type',
    target:       ID?'Target':'Target',
    actual:       ID?'Realisasi':'Actual',
    pct:          ID?'Capaian':'Achievement',
    lastNote:     ID?'Catatan Terakhir':'Latest Note',
    actName:      ID?'Aktivitas':'Activity',
    pic:          ID?'PIC':'PIC',
    actStatus:    ID?'Status':'Status',
    actProg:      ID?'Progres':'Progress',
    startDt:      ID?'Mulai':'Start',
    dueDt:        ID?'Selesai':'Due',
    actNotes:     ID?'Catatan':'Notes',
    budgetDate:   ID?'Tanggal':'Date',
    budgetVal:    ID?'Jumlah':'Amount',
    budgetNote:   ID?'Keterangan':'Note',
    budgetBy:     ID?'Input Oleh':'By',
    highlights:   ID?'&#9989; Capaian Utama Periode Ini':'&#9989; Key Achievements',
    challenges:   ID?'&#9888; Kendala yang Dihadapi':'&#9888; Challenges Encountered',
    followUp:     ID?'&#128204; Rencana Tindak Lanjut':'&#128204; Follow-up Plan',
    lessons:      ID?'&#128218; Pembelajaran (Lessons Learned)':'&#128218; Lessons Learned',
    sigExec:      ID?'Pelaksana Program':'Program Officer',
    sigSup:       ID?'Supervisor':'Supervisor',
    sigMgr:       ID?'Manajer Program':'Program Manager',
    sigDate:      ID?'Tanggal':'Date',
    sigName:      ID?'Nama & Tanda Tangan':'Name & Signature',
    noData:       ID?'Tidak ada data':'No data available',
    desc:         ID?'Deskripsi Proyek':'Project Description',
    statusAchieved: ID?'Tercapai':'Achieved',
    statusProgress: ID?'Dalam Proses':'In Progress',
    statusAttention:ID?'Perlu Perhatian':'Needs Attention',
  };

  const today   = new Date().toLocaleDateString(ID?'id-ID':'en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const fmtDate = d => d?new Date(d).toLocaleDateString(ID?'id-ID':'en-GB',{day:'2-digit',month:'short',year:'numeric'}):'-';
  const fmtMoney= n => n?'Rp '+Number(n).toLocaleString('id-ID'):'-';
  const esc     = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const pBar    = (p,c='#2563eb') => `<div style="background:#e2e8f0;border-radius:4px;height:10px;width:100%;margin:4px 0"><div style="background:${c};height:10px;border-radius:4px;width:${Math.min(100,p)}%"></div></div><div style="font-size:10px;color:#64748b;text-align:right">${p}%</div>`;
  const mkList  = arr => arr.length ? `<ul style="margin:0;padding-left:18px;line-height:2">${arr.map(i=>`<li style="font-size:10.5pt">${i}</li>`).join('')}</ul>` : `<p style="color:#94a3b8;font-style:italic;font-size:10.5pt">${L.noData}</p>`;

  const inds        = proj.project_indicators || [];
  const overall     = calcOverallProgress(proj);
  const budgetPct   = proj.budget_approved>0?Math.min(100,Math.round(proj.budget_actual/proj.budget_approved*100)):0;
  const achievedInds= inds.filter(ind=>{ const a=getLatestActual(ind); return ind.target>0&&a/ind.target>=1; });

  // ---- Indicator rows ----
  const indRows = inds.map(ind => {
    const actual = getLatestActual(ind);
    const pct    = ind.target>0?Math.min(100,Math.round(actual/ind.target*100)):0;
    const color  = pct>=100?'#16a34a':pct>=60?'#d97706':'#dc2626';
    const lUpd   = allIndUpds.filter(u=>u.indicator_id===ind.id)[0];
    const stLabel= pct>=100?L.statusAchieved:pct>=60?L.statusProgress:L.statusAttention;
    return `<tr><td>${esc(ind.indicator_name)}</td><td>${esc(ind.type||'Output')}</td>
      <td style="text-align:right">${ind.target} ${esc(ind.unit||'')}</td>
      <td style="text-align:right">${actual} ${esc(ind.unit||'')}</td>
      <td style="text-align:center"><strong style="color:${color}">${pct}%</strong></td>
      <td style="text-align:center"><span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${stLabel}</span></td>
      <td style="font-size:10px;color:#64748b">${lUpd&&lUpd.note?esc(lUpd.note):'-'}</td></tr>`;
  }).join('');

  // ---- Activity rows ----
  const actRows = activities.map(act => {
    const aNotes = actNotes.filter(n=>n.activity_id===act.id).slice(0,2).map(n=>`• ${esc(n.note)}`).join('<br>');
    const sc2    = act.status==='Selesai'||act.status==='Completed'?'#16a34a':act.status==='Terhambat'||act.status==='Blocked'?'#dc2626':act.status==='Berjalan'||act.status==='In Progress'?'#2563eb':'#64748b';
    return `<tr><td>${esc(act.title)}</td><td>${esc(act.pic||'-')}</td>
      <td style="text-align:center"><span style="background:${sc2};color:#fff;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">${esc(act.status)}</span></td>
      <td style="text-align:center">
        <div style="background:#e2e8f0;border-radius:3px;height:7px;width:70px;display:inline-block;vertical-align:middle"><div style="background:#2563eb;height:7px;border-radius:3px;width:${act.progress||0}%"></div></div>
        <span style="font-size:10px;margin-left:4px">${act.progress||0}%</span>
      </td>
      <td style="font-size:10px">${fmtDate(act.start_date)}</td>
      <td style="font-size:10px">${fmtDate(act.due_date)}</td>
      <td style="font-size:10px;color:#475569">${aNotes||'-'}</td></tr>`;
  }).join('');

  // ---- Budget rows ----
  const budgetRows = budgetUpds.slice(0,10).map(b=>`<tr>
    <td>${fmtDate(b.created_at)}</td>
    <td style="text-align:right;font-weight:600">${fmtMoney(b.actual_value)}</td>
    <td>${esc(b.note||'-')}</td><td>${esc(b.updated_by||'-')}</td></tr>`).join('');

  // ---- Outcome rows ----
  const outcomeRows = projOutcomes.length
    ? projOutcomes.map((o,i)=>`<tr><td>${i+1}</td><td>${esc(o.outcome_text)}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#94a3b8;text-align:center;font-style:italic">${L.noData}</td></tr>`;

  // ---- Narrative ----
  const completedActs  = activities.filter(a=>a.status==='Selesai'||a.status==='Completed'||a.progress>=100);
  const highlightItems = [
    ...completedActs.map(a=>`${esc(a.title)} <span style="color:#16a34a;font-weight:700">(${a.progress}%)</span>`),
    ...achievedInds.map(i=>`${esc(i.indicator_name)} — ${ID?'target tercapai':'target achieved'}`),
  ];
  const blockedActs    = activities.filter(a=>a.status==='Terhambat'||a.status==='Blocked');
  const lowInds        = inds.filter(ind=>{ const a=getLatestActual(ind); const p=ind.target>0?a/ind.target*100:0; return p<40&&ind.target>0; });
  const challengeItems = [
    ...blockedActs.map(a=>`${esc(a.title)} — ${ID?'aktivitas terhambat':'activity blocked'}`),
    ...lowInds.map(i=>{ const a=getLatestActual(i); const p=i.target>0?Math.round(a/i.target*100):0; return `${esc(i.indicator_name)} (${p}% ${ID?'dari target':'of target'})`; }),
  ];
  const inProgressActs = activities.filter(a=>(a.status==='Berjalan'||a.status==='In Progress')&&a.progress<100);
  const followUpItems  = inProgressActs.map(a=>`${esc(a.title)} — ${ID?'progres':'progress'} ${a.progress}%`);
  const allNotes = [
    ...actNotes.slice(0,5).map(n=>`[${ID?'Catatan Aktivitas':'Activity Note'} — ${esc(n.noted_by||'–')}] ${esc(n.note)}`),
    ...allIndUpds.filter(u=>u.note).slice(0,4).map(u=>`[${esc(u.indicator_name||'–')}] ${esc(u.note)}`),
    ...(proj.note?[`[${ID?'Catatan Proyek':'Project Note'}] ${esc(proj.note)}`]:[]),
  ];

  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8">
<title>${esc(proj.name)} — ${L.reportTitle}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:18mm 15mm 18mm 20mm}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1e293b;background:#fff;line-height:1.5}
.cover{text-align:center;padding:36px 20px 28px;border-bottom:3px solid #0f172a;margin-bottom:24px}
.cover-org{font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
.cover-title{font-size:24px;font-weight:800;color:#0f172a;margin-bottom:4px}
.cover-sub{font-size:13px;color:#2563eb;font-weight:600;margin-bottom:20px}
.cover-meta{display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 24px;text-align:left}
.cover-meta td{padding:4px 10px 4px 0;font-size:10.5px}
.cover-meta td:first-child{color:#64748b;font-weight:600;white-space:nowrap}
.cover-meta td:last-child{font-weight:700;color:#0f172a}
.section{margin-bottom:26px;page-break-inside:avoid}
.sec-title{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#fff;background:#0f172a;padding:6px 12px;border-radius:4px;margin-bottom:12px;display:block}
.exec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.exec-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:11px 13px}
.exec-card .lbl{font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:3px}
.exec-card .val{font-size:15px;font-weight:800;color:#0f172a}
.exec-card .sub{font-size:9.5px;color:#94a3b8;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
th{background:#f1f5f9;color:#475569;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.4px;padding:7px 8px;border:1px solid #e2e8f0;text-align:left}
td{padding:6px 8px;border:1px solid #e2e8f0;vertical-align:top}
tr:nth-child(even) td{background:#f8fafc}
.narr-wrap{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.narr-grid{display:grid;grid-template-columns:1fr 1fr}
.narr-cell{padding:13px 15px;border-right:1px solid #e2e8f0}
.narr-cell:last-child{border-right:none}
.narr-cell+.narr-cell{border-top:none}
.narr-border-top{border-top:1px solid #e2e8f0}
.narr-cell h4{font-size:10.5px;font-weight:700;color:#0f172a;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #e2e8f0}
.sig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:8px}
.sig-box{border:1px solid #cbd5e1;border-radius:8px;padding:11px 13px;text-align:center}
.sig-box .si-title{font-size:9.5px;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:3px}
.sig-box .si-line{border-top:1px solid #cbd5e1;margin:44px 10px 6px}
.sig-box .si-label{font-size:9.5px;color:#94a3b8}
.footer{margin-top:28px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
@media print{.section{page-break-inside:avoid}}
</style></head><body>

<div class="cover">
  <div class="cover-org">${esc(proj.owner||'DFW Indonesia')}</div>
  <div class="cover-title">${esc(proj.name)}</div>
  <div class="cover-sub">${L.reportTitle}</div>
  <div class="cover-meta"><table>
    <tr><td>${L.projectName}</td><td>${esc(proj.name)}</td></tr>
    <tr><td>${L.location}</td><td>${esc(proj.location||'-')}</td></tr>
    <tr><td>${L.owner}</td><td>${esc(proj.owner||'-')}</td></tr>
    ${proj.donor?`<tr><td>${L.donor}</td><td>${esc(proj.donor)}</td></tr>`:''}
    <tr><td>${L.startDate}</td><td>${fmtDate(proj.start_date)}</td></tr>
    <tr><td>${L.deadline}</td><td>${fmtDate(proj.deadline)}</td></tr>
    <tr><td>${L.status}</td><td><strong>${esc(proj.status)}</strong></td></tr>
    <tr><td>${L.printedOn}</td><td>${today}</td></tr>
  </table></div>
</div>

<div class="section">
  <span class="sec-title">${L.s1}</span>
  <div class="exec-grid">
    <div class="exec-card"><div class="lbl">${L.overallProg}</div><div class="val">${overall}%</div>${pBar(overall,overall>=70?'#16a34a':overall>=40?'#d97706':'#dc2626')}</div>
    <div class="exec-card"><div class="lbl">${L.budgetAppr}</div><div class="val" style="font-size:12px">${fmtMoney(proj.budget_approved)}</div><div class="sub">${L.budgetReal}: ${fmtMoney(proj.budget_actual)}</div>${pBar(budgetPct,'#7c3aed')}</div>
    <div class="exec-card"><div class="lbl">${L.indCount}</div><div class="val">${inds.length}</div><div class="sub">${achievedInds.length} ${L.achieved} · ${activities.length} ${ID?'aktivitas':'activities'}</div>${pBar(inds.length?Math.round(achievedInds.length/inds.length*100):0,'#2563eb')}</div>
  </div>
  ${proj.description?`<div style="margin-top:10px;padding:9px 13px;background:#f8fafc;border-left:3px solid #2563eb;border-radius:0 6px 6px 0;font-size:10.5px;color:#475569"><strong>${L.desc}:</strong> ${esc(proj.description)}</div>`:''}
</div>

<div class="section">
  <span class="sec-title">${L.s2}</span>
  ${inds.length?`<table><thead><tr><th style="width:26%">${L.indName}</th><th>${L.type}</th><th>${L.target}</th><th>${L.actual}</th><th>${L.pct}</th><th>${L.status}</th><th style="width:22%">${L.lastNote}</th></tr></thead><tbody>${indRows}</tbody></table>`:`<p style="color:#94a3b8;font-style:italic;font-size:10.5px">${L.noData}</p>`}
</div>

<div class="section">
  <span class="sec-title">${L.s3}</span>
  ${activities.length?`<table><thead><tr><th style="width:22%">${L.actName}</th><th>${L.pic}</th><th>${L.actStatus}</th><th>${L.actProg}</th><th>${L.startDt}</th><th>${L.dueDt}</th><th style="width:22%">${L.actNotes}</th></tr></thead><tbody>${actRows}</tbody></table>`:`<p style="color:#94a3b8;font-style:italic;font-size:10.5px">${L.noData}</p>`}
</div>

<div class="section">
  <span class="sec-title">${L.s4}</span>
  <div class="exec-grid" style="margin-bottom:10px">
    <div class="exec-card"><div class="lbl">${L.budgetAppr}</div><div class="val" style="font-size:12px">${fmtMoney(proj.budget_approved)}</div></div>
    <div class="exec-card"><div class="lbl">${L.budgetReal}</div><div class="val" style="font-size:12px">${fmtMoney(proj.budget_actual)}</div></div>
    <div class="exec-card"><div class="lbl">${L.absorption}</div><div class="val">${budgetPct}%</div>${pBar(budgetPct,'#7c3aed')}</div>
  </div>
  ${budgetRows?`<table><thead><tr><th>${L.budgetDate}</th><th>${L.budgetVal}</th><th>${L.budgetNote}</th><th>${L.budgetBy}</th></tr></thead><tbody>${budgetRows}</tbody></table>`:`<p style="color:#94a3b8;font-style:italic;font-size:10.5px">${L.noData}</p>`}
</div>

<div class="section">
  <span class="sec-title">${L.s5}</span>
  <table><thead><tr><th style="width:5%">#</th><th>${ID?'Outcomes / Hasil':'Outcomes / Results'}</th></tr></thead><tbody>${outcomeRows}</tbody></table>
</div>

<div class="section">
  <span class="sec-title">${L.s6}</span>
  <div class="narr-wrap">
    <div class="narr-grid">
      <div class="narr-cell"><h4>${L.highlights}</h4>${mkList(highlightItems)}</div>
      <div class="narr-cell"><h4>${L.challenges}</h4>${mkList(challengeItems)}</div>
    </div>
    <div class="narr-grid narr-border-top">
      <div class="narr-cell"><h4>${L.followUp}</h4>${mkList(followUpItems)}</div>
      <div class="narr-cell"><h4>${L.lessons}</h4>${mkList(allNotes)}</div>
    </div>
  </div>
</div>

<div class="section">
  <span class="sec-title">${L.s7}</span>
  <div class="sig-grid">
    <div class="sig-box"><div class="si-title">${L.sigExec}</div><div class="si-line"></div><div class="si-label">${L.sigName}</div><div style="margin-top:6px;border-top:1px dashed #e2e8f0;padding-top:5px;font-size:9px;color:#94a3b8">${L.sigDate}: ____________________</div></div>
    <div class="sig-box"><div class="si-title">${L.sigSup}</div><div class="si-line"></div><div class="si-label">${L.sigName}</div><div style="margin-top:6px;border-top:1px dashed #e2e8f0;padding-top:5px;font-size:9px;color:#94a3b8">${L.sigDate}: ____________________</div></div>
    <div class="sig-box"><div class="si-title">${L.sigMgr}</div><div class="si-line"></div><div class="si-label">${L.sigName}</div><div style="margin-top:6px;border-top:1px dashed #e2e8f0;padding-top:5px;font-size:9px;color:#94a3b8">${L.sigDate}: ____________________</div></div>
  </div>
</div>

<div class="footer">
  <span>${esc(proj.name)} — ${L.reportTitle}</span>
  <span>${L.printedOn}: ${today}</span>
</div>
</body></html>`;
}
// ===================== END GENERATE REPORT MODULE =====================
