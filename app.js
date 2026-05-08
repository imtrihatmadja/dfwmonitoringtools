// ===================== CONFIG =====================
const SUPABASE_URL      = "https://zdfxcxkgmksaeigyuibe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZnhjeGtnbWtzYWVpZ3l1aWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3Mjc0NjAsImV4cCI6MjA5MjMwMzQ2MH0.baUlaWNvN3wMKHL05E71aSxedjKvWhfVQXHGXraWyVU";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== STATE =====================
let currentProject  = null;
let indicators      = [];
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

  const MAX_SHOW = 3;
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
  dashboard : ["Dashboard",     "Selamat datang, pantau semua proyek Anda"],
  projects  : ["Daftar Proyek", "Semua data proyek yang dimonitor"],
  input     : ["Tambah Proyek", "Tambah proyek baru"],
  detail    : ["Detail Proyek", ""]
};

function switchTab(tab) {
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

document.getElementById("addOutcomeBtn").addEventListener("click", () => {
  outcomes.push({ text: "" });
  renderOutcomeList();
});
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
      goal            : document.getElementById("f-goal").value.trim() || null,
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

        // Simpan outcomes: hapus lama, insert baru
    await client.from("project_outcomes").delete().eq("project_name", p.name);
    const validOutcomes = outcomes.filter(oc => oc.text && oc.text.trim());
    if (validOutcomes.length) {
      await client.from("project_outcomes").insert(
        validOutcomes.map((oc, idx) => ({ project_name: p.name, outcome_text: oc.text.trim(), sort_order: idx }))
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
  document.getElementById("f-goal").value = "";
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
    container.innerHTML = `<div class="empty-state">Belum ada proyek. <a href="#" onclick="switchTab('input');return false">Tambah proyek</a></div>`;
    return;
  }
  container.innerHTML = items.map((item, i) => {
    const cls = item.status.toLowerCase().replace(/\s+/g, "-");
    const indCount = item.project_indicators.length;
    return `
      <div class="proj-card ${cls}" onclick="openProjectDetail(window.allProjects[${i}])">
        <div class="proj-card-header">
          <div class="proj-card-name">${item.name}</div>
          <span class="badge badge-${cls}">${item.status}</span>
        </div>
        <div class="proj-card-meta">${item.location}&nbsp;&nbsp;${item.owner}${item.donor ? `&nbsp;&nbsp;${item.donor}` : ""}</div>
        ${(() => {
          const ov = calcOverallProgress(item);
          const oc = progressColor(ov);
          const ol = progressLabel(ov);
          return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
            <span style="font-size:11px;color:#64748b;font-weight:600">Progress</span>
            <span style="display:flex;align-items:center;gap:5px">
              <span style="font-size:13px;font-weight:800;color:${oc}">${ov}%</span>
              <span style="font-size:10px;padding:1px 6px;border-radius:10px;background:${oc}15;color:${oc};font-weight:700">${ol}</span>
            </span>
          </div>
          <div class="progress-bar" style="height:7px;margin-bottom:2px">
            <div class="progress-fill" style="width:${ov}%;background:${oc}"></div>
          </div>`;
        })()}
        ${(item.budget_approved > 0 || item.budget_actual > 0) ? `
        <div class="proj-card-budget">
          <div class="proj-card-budget-row">
            <span class="budget-label">Anggaran Disetujui</span>
            <span class="budget-value">${formatRupiah(item.budget_approved)}</span>
          </div>
          <div class="proj-card-budget-row">
            <span class="budget-label">Realisasi</span>
            <span class="budget-value budget-actual">${formatRupiah(item.budget_actual)}
              ${item.budget_approved > 0 ? `<span class="budget-pct">${pctBudget(item.budget_approved, item.budget_actual)}%</span>` : ""}
            </span>
          </div>
          <div class="progress-bar" style="height:4px;margin-top:4px">
            <div class="progress-fill" style="width:${Math.min(pctBudget(item.budget_approved, item.budget_actual), 100)}%;background:#f59e0b"></div>
          </div>
        </div>` : ""}
                ${(item.goal || (item.project_outcomes && item.project_outcomes.length)) ? `
          <div style="border-top:1px solid #f1f5f9;margin:8px 0 6px;padding-top:8px">
            ${item.goal ? `<div style="font-size:11px;color:#475569;margin-bottom:4px;line-height:1.5"><span style="font-weight:700;color:#2563eb">🎯 Goal:</span> ${item.goal}</div>` : ""}
            ${item.project_outcomes && item.project_outcomes.length ? `
              <div style="font-size:11px;color:#475569">
                <span style="font-weight:700;color:#7c3aed">🏆 Outcomes (${item.project_outcomes.length}):</span>
                <ul style="margin:3px 0 0 14px;padding:0;line-height:1.6">
                  ${item.project_outcomes.map(o => `<li>${o.outcome_text}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          </div>
        ` : ""}
        ${renderPriorityIndicators(item, i)}
        <div class="proj-card-footer">
          <span class="ind-count">${indCount} Indikator</span>
          <span class="ind-count" style="background:#f0fdf4;color:#15803d">${item.activityCount || 0} Aktivitas</span>
        </div>
        <div class="proj-card-actions">
          <span style="font-size:11px;color:#94a3b8">${item.deadline || ""}</span>
          <button class="btn-danger btn-sm" style="margin-left:auto"
            onclick="event.stopPropagation();deleteProject('${item.id}','${item.name.replace(/'/g,"\\'")}')">Hapus</button>
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
        ${proj.goal ? `
          <div style="margin-top:8px;padding:10px 12px;background:#eff6ff;border-radius:8px;border-left:3px solid #2563eb;max-width:600px">
            <div style="font-size:11px;font-weight:700;color:#2563eb;margin-bottom:3px;letter-spacing:.4px">🎯 GOAL</div>
            <div style="font-size:13px;color:#1e3a5f;line-height:1.5">${proj.goal}</div>
          </div>
        ` : ""}
        ${proj.project_outcomes && proj.project_outcomes.length ? `
          <div style="margin-top:8px;padding:10px 12px;background:#f5f3ff;border-radius:8px;border-left:3px solid #7c3aed;max-width:600px">
            <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:5px;letter-spacing:.4px">🏆 OUTCOMES</div>
            ${proj.project_outcomes.map((o, i) => `
              <div style="font-size:13px;color:#3b0764;display:flex;gap:6px;margin-bottom:4px;line-height:1.4">
                <span style="color:#7c3aed;font-weight:700;min-width:16px">${i+1}.</span>
                <span>${o.outcome_text}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
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

        <!-- Input update kumulatif -->
        <div class="ind-kumul-box">
          <div class="ind-kumul-header">
            <span>➕ Tambah Capaian Baru</span>
            <span class="ind-kumul-hint">nilai akan dijumlahkan ke capaian saat ini</span>
          </div>
          <div class="ind-kumul-row">
            <div class="form-group" style="flex:1">
              <label>Tambahan Nilai <span style="color:#94a3b8;font-weight:400">(${ind.unit||"satuan"})</span></label>
              <input type="number" id="upd-add-${i}" min="0" placeholder="0"
                oninput="previewKumul(${i}, ${currentActual}, ${target})"
                style="font-size:14px;font-weight:600">
            </div>
            <div class="form-group" style="flex:1">
              <label>Hasil (preview)</label>
              <input type="number" id="upd-preview-${i}" value="${currentActual}" readonly
                style="background:#f1f5f9;font-weight:700;color:${pctColor}">
            </div>
          </div>
          <div class="form-group" style="margin-top:6px">
            <label>Catatan <span style="color:#94a3b8;font-weight:400">(opsional)</span></label>
            <textarea id="upd-note-${i}" rows="2"
              placeholder="Perkembangan, kendala, atau temuan lapangan…"
              style="font-size:12px"></textarea>
          </div>
          <button class="btn-ind-update" id="upd-btn-${i}"
            onclick="saveOneIndicator(${i}, '${ind.id}', ${currentActual}, ${target}, '${escHtml(ind.indicator_name)}', '${escHtml(ind.unit||"")}')">
            💾 Simpan Update
          </button>
          <div id="upd-msg-${i}" class="form-msg hidden" style="margin-top:6px;font-size:12px"></div>
        </div>

        <!-- Riwayat -->
        ${sortedUpd.length ? `
        <div class="mini-history" style="margin-top:10px">
          <div class="mini-history-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>📋 ${sortedUpd.length} Riwayat Update</span>
            <button class="btn-danger btn-sm" style="font-size:10px;padding:3px 8px"
              onclick="clearIndicatorHistory('${ind.id}')">Hapus Semua</button>
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

// ===================== FILL FORM EDIT =====================
window.fillFormEdit = function (idx) {
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
  document.getElementById("f-goal").value = item.goal || "";
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
            <div class="act-check ${checked ? "checked" : ""}"
              onclick="event.stopPropagation();toggleActDone('${act.id}',${checked})"
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
              <button class="btn-edit"   onclick="openActModal('${act.id}')">✏️</button>
              <button class="btn-remove" onclick="deleteActivity('${act.id}')">✕</button>
            </div>
          </div>
          <div class="activity-card-body" id="actbody-${act.id}">
            ${act.description ? `<p style="font-size:12px;color:#475569;margin:10px 0 6px">${act.description}</p>` : ""}
            <div class="act-note-section">
              <div class="act-note-title">Catatan</div>
              <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
                <textarea id="inline-note-${act.id}" rows="2"
                  placeholder="Tulis catatan pelaksanaan…"
                  style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;resize:vertical"></textarea>
                <button class="btn-upload" onclick="saveInlineNote('${act.id}')">＋</button>
              </div>
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
  const update = { status: wasChecked ? "Sedang Berjalan" : "Selesai" };
  if (!wasChecked) update.progress = 100;
  await client.from("project_activities").update(update).eq("id", id);
  await loadActivities(currentActProject);
  await loadProjects();
};

window.saveInlineNote = async function (actId) {
  const ta   = document.getElementById("inline-note-" + actId);
  const note = ta.value.trim();
  if (!note) { alert("Catatan tidak boleh kosong."); return; }
  await client.from("activity_notes").insert({ activity_id: actId, project_name: currentActProject, note, noted_by: "Tim" });
  ta.value = "";
  await loadActivities(currentActProject);
};

window.deleteActivity = async function (id) {
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
loadProjects();
