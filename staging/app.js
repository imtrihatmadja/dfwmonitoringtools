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
  if (upds.length) return Number(upds[upds.length - 1].actual_value);  
  return Number(ind.actual) || 0;  
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
  return 0;  
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

// ===================== RENDER PRIORITY INDICATORS =====================  
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

  function tierColor(pct) {  
    if (pct < 25) return { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", label: "Kritis" };  
    return { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", label: "Perhatian" };  
  }  

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

// ===================== JUMP TO INDICATOR / PROJECT =====================  
window.jumpToIndicator = async function(projIndex, indName, event) {  
  if (event) event.stopPropagation();  
  const proj = window.allProjects[projIndex];  
  if (!proj) return;  
  await openProjectDetail(proj);  
  setTimeout(() => {  
    const inds = proj.project_indicators || [];  
    const idx  = inds.findIndex(ind => ind.indicator_name === indName);  
    if (idx < 0) return;  
    const card = document.getElementById("ind-card-" + idx);  
    if (!card) return;  
    card.scrollIntoView({ behavior: "smooth", block: "center" });  
    card.classList.add("ind-card-highlight");  
    setTimeout(() => card.classList.remove("ind-card-highlight"), 2000);  
  }, 400);  
};  

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

// ===================== STEP WIZARD =====================  
function setStep(n) {  
  [1, 2].forEach(i => {  
    document.getElementById("form-step-" + i).classList.toggle("hidden", i !== n);  
    document.getElementById("form-step-" + i).classList.toggle("active", i === n);  
    const dot = document.getElementById("step-dot-" + i);  
    dot.classList.toggle("active", i === n);  
    dot.classList.toggle("done", i < n);  
  });  
}  

// ===================== FORM EVENTS =====================  
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

// Kembali ke Step 1 — baca dulu nilai DOM indikator  
document.getElementById("backStep1Btn").addEventListener("click", () => {  
  indicators.forEach((_, i) => readIndicatorFromDOM(i));  
  setStep(1);  
});  

// Tombol Tambah Indikator — baca dulu nilai DOM yang sudah diisi  
document.getElementById("addIndicatorBtn").addEventListener("click", () => {  
  indicators.forEach((_, i) => readIndicatorFromDOM(i));  
  indicators.push({ id: null, name: "", type: "Output", target: "", unit: "", actual: 0, update_note: "", history: [], evidence: [] });  
  renderIndicatorList();  
});  

// ===================== ESCAPE HTML =====================  
function escHtml(v) {  
  return (v || "").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");  
}  

// Fungsi helper untuk baca nilai dari DOM ke array indicators  
function readIndicatorFromDOM(i) {  
  const nameEl   = document.getElementById("ind-name-" + i);  
  const typeEl   = document.getElementById("ind-type-" + i);  
  const targetEl = document.getElementById("ind-target-" + i);  
  const unitEl   = document.getElementById("ind-unit-" + i);  
  const actualEl = document.getElementById("ind-actual-" + i);  
  const noteEl   = document.getElementById("ind-note-" + i);  
  
  if (nameEl)   indicators[i].name        = nameEl.value;  
  if (typeEl)   indicators[i].type        = typeEl.value;  
  if (targetEl) indicators[i].target      = targetEl.value;  
  if (unitEl)   indicators[i].unit        = unitEl.value;  
  if (actualEl) indicators[i].actual      = Number(actualEl.value) || 0;  
  if (noteEl)   indicators[i].update_note = noteEl.value;  
}  

// ===================== RENDER INDICATOR LIST =====================  
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

// ===================== SUBMIT — ★ PERBAIKAN UTAMA ★ =====================  
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

    const prevProj = (window.allProjects || []).find(x => x.name === p.name);  
    const prevBudgetActual = prevProj ? (prevProj.budget_actual || 0) : -1;  

    // Simpan / update proyek  
    const { error: pErr } = await client.from("projects").upsert(p, { onConflict: "name" });  
    if (pErr) throw new Error("Gagal simpan proyek: " + pErr.message);  

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
        validOutcomes.map((oc, idx) => ({ project_name: p.name, outcome_text: oc.text.trim(), sort_order: idx }))  
      );  
    }  

    // ★★★ PERBAIKAN UTAMA ★★★  
    // Jangan delete semua indikator. Sebaliknya:  
    // 1. Update indikator yang sudah ada (punya ID)  
    // 2. Insert indikator baru (tidak punya ID)  
    // 3. Hapus indikator yang sudah tidak ada di form (tidak perlu, kita skip dulu)  

    // Ambil daftar ID indikator yang sudah ada di database untuk proyek ini  
    const { data: existingInds } = await client  
      .from("project_indicators")  
      .select("id")  
      .eq("project_name", p.name);  
    
    const existingIds = new Set((existingInds || []).map(r => r.id));  
    const formIds = new Set(indicators.filter(ind => ind.id).map(ind => ind.id));  

    // Update atau insert setiap indikator dari form  
    for (let i = 0; i < indicators.length; i++) {  
      const ind = indicators[i];  
      if (!ind.name) continue;  

      if (ind.id && existingIds.has(ind.id)) {  
        // ★ Indikator sudah ada — UPDATE saja  
        const { error: updErr } = await client  
          .from("project_indicators")  
          .update({  
            indicator_name : ind.name,  
            type           : ind.type,  
            target         : Number(ind.target) || 0,  
            unit           : ind.unit || null,  
            actual         : ind.actual || 0,  
          })  
          .eq("id", ind.id);  
        
        if (updErr) {  
          console.warn("Gagal update indikator:", updErr.message);  
        } else {  
          // Catat update jika ada perubahan  
          if (ind.actual > 0 || ind.update_note) {  
            // Cek apakah sudah ada update dengan nilai yang sama persis  
            const { data: lastUpd } = await client  
              .from("indicator_updates")  
              .select("actual_value, note")  
              .eq("indicator_id", ind.id)  
              .order("created_at", { ascending: false })  
              .limit(1);  

            const needsInsert = !lastUpd || !lastUpd.length ||  
              Number(lastUpd[0].actual_value) !== ind.actual ||  
              (lastUpd[0].note || null) !== (ind.update_note || null);  

            if (needsInsert) {  
              await client.from("indicator_updates").insert({  
                indicator_id   : ind.id,  
                project_name   : p.name,  
                indicator_name : ind.name,  
                actual_value   : ind.actual || 0,  
                note           : ind.update_note || null,  
                updated_by     : "Tim",  
              });  
            }  
          }  
        }  
      } else {  
        // ★ Indikator BARU — INSERT  
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
        
        if (indErr) {  
          console.warn("Gagal insert indikator:", indErr.message);  
          continue;  
        }  
        
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
    }  

    // ★ Hapus indikator yang ada di DB tapi tidak ada di form  
    const idsToDelete = [...existingIds].filter(id => !formIds.has(id));  
    for (const id of idsToDelete) {  
      await client.from("indicator_updates").delete().eq("indicator_id", id);  
      await client.from("indicator_evidence").delete().eq("indicator_id", id);  
      await client.from("project_indicators").delete().eq("id", id);  
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

  // Mapping indikator: pastikan actual paling akurat dari history terbaru  
  const items = projects.map(proj => {  
    const projectIndicators = (inds || []).filter(ind => ind.project_name === proj.name).map(ind => {  
      const updates = (upds || []).filter(u => u.indicator_id === ind.id);  
      const lastUpd = updates.length ? updates[updates.length - 1] : null;  
      const latestActual = lastUpd ? Number(lastUpd.actual_value) : (Number(ind.actual) || 0);  
      
      return {  
        ...ind,  
        actual: latestActual,  
        indicator_updates : updates,  
        indicator_evidence: (evids || []).filter(e => e.indicator_id === ind.id),  
      };  
    });  

    return {  
      ...proj,  
      project_indicators: projectIndicators,  
      activities_summary: (actsData || []).filter(a => a.project_name === proj.name),  
      activityCount: (actsData || []).filter(a => a.project_name === proj.name).length,  
      budget_updates: (budgetHist || []).filter(b => b.project_name === proj.name),  
      project_outcomes: (outcomesData || []).filter(o => o.project_name === proj.name),  
    };  
  });  

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

// ===================== RENDER DETAIL HEADER =====================  
function renderDetailHeader(proj) {  
  const inds    = proj.project_indicators;  
  const indDone = inds.filter(ind => {  
    const actual = getLatestActual(ind);  
    const pct    = ind.target > 0 ? Math.round(actual / ind.target * 100) : 0;  
    return pct >= 100;  
  }).length;  
  const cls    = proj.status.toLowerCase().replace(/\s+/g, "-");  
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
    // Gunakan nilai dari history terbaru, atau kolom actual yang sudah disinkronkan  
    const currentActual = lastH ? Number(lastH.actual_value) : (Number(ind.actual) || 0);  
    const target        = Number(ind.target) || 0;  
    const pct           = target > 0 ? Math.min(Math.round(currentActual / target * 100), 100) : 0;  
    const pctColor      = pct >= 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";  
    const lastTs        = lastH  
      ? new Date(lastH.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})  
      : null;  

    return `  
      <div class="ind-update-card" id="ind-card-${i}">  
        <div class="ind-update-header">  
          <div style="flex:1;min-width:0">  
            <div class="ind-update-name">${ind.indicator_name}</div>  
            <div style="font-size:11px;color:#64748b;margin-top:2px">  
              <span class="badge badge-${(ind.type||"output").toLowerCase()}" style="font-size:10px">${ind.type}</span>  
              &nbsp;Target: <strong>${target} ${ind.unit||""}</strong>  
            </div>  
          </div>  
        </div>  

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

// ===================== PREVIEW KUMULATIF & SAVE ONE INDICATOR =====================  
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

window.saveOneIndicator = async function (i, indId, currentActual, target, indName, unit) {  
  const addEl   = document.getElementById("upd-add-" + i);  
  const noteEl  = document.getElementById("upd-note-" + i);  
  const msgEl   = document.getElementById("upd-msg-" + i);  
  const btn     = document.getElementById("upd-btn-" + i);  
  if (!addEl || !msgEl || !btn) return;  

  const addVal  = parseFloat(addEl.value) || 0;  
  const note    = noteEl ? noteEl.value.trim() || null : null;  

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

    await client.from("project_indicators").update({ actual: newTotal }).eq("id", indId);  

    await client.from("indicator_updates").insert({  
      indicator_id   : indId,  
      project_name   : currentProject.name,  
      indicator_name : indName,  
      actual_value   : newTotal,  
      note,  
      updated_by     : "Tim",  
    });  

    addEl.value  = "";  
    if (noteEl) noteEl.value = "";  

    msgEl.textContent   = `✅ Capaian diperbarui: ${currentActual} + ${addVal} = ${newTotal} ${unit}`;  
    msgEl.className     = "form-msg success";  
    msgEl.style.display = "block";  

    await loadProjects();  

  } catch (err) {  
    msgEl.textContent   = "❌ " + err.message;  
    msgEl.className     = "form-msg error";  
    msgEl.style.display = "block";  
  } finally {  
    btn.textContent = "💾 Simpan Update";  
    btn.disabled    = false;  
  }  
};  

// ===================== EDIT PROYEK =====================  
document.getElementById("editProjectBtn").addEventListener("click", () => {  
  if (!currentProject) return;  
  fillFormEdit(window.allProjects.findIndex(p => p.name === currentProject.name));  
});  

// Fill Form Edit — ambil actual dari history terbaru  
window.fillFormEdit = function (idx) {  
  const item = window.allProjects[idx];  
  document.getElementById("f-name").value       = item.name;  
  document.getElementById("f-location").value   = item.location;  
  document.getElementById("f-owner").value      = item.owner;  
  document.getElementById("f-donor").value      = item.donor       || "";  
  document.getElementById("f-start-date").value = item.start_date  || "";  
  document.getElementById("f-deadline").value   = item.deadline    || "";  
  document.getElementById("f-status").value     = item.status;  
  document.getElementById("f-desc").value            = item.description    || "";  
  document.getElementById("f-note").value            = item.note           || "";  
  document.getElementById("f-budget-approved").value = item.budget_approved || "";  
  document.getElementById("f-budget-actual").value   = item.budget_actual   || "";  
  document.getElementById("f-goal").value = item.goal || "";  
  outcomes = (item.project_outcomes || []).map(o => ({ text: o.outcome_text }));  
  renderOutcomeList();  
  
  // Ambil actual dari history terbaru untuk setiap indikator  
  indicators = item.project_indicators.map(ind => {  
    const updates = ind.indicator_updates || [];  
    const lastUpd = updates.length ? updates[updates.length - 1] : null;  
    const latestActual = lastUpd ? Number(lastUpd.actual_value) : (Number(ind.actual) || 0);  
    
    return {  
      id          : ind.id,  
      name        : ind.indicator_name,  
      type        : ind.type,  
      target      : ind.target,  
      unit        : ind.unit,  
      actual      : latestActual, // pakai nilai dari history  
      update_note : "",  
      history     : ind.indicator_updates || [],  
      evidence    : ind.indicator_evidence || [],  
    };  
  });  
  
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
  if (currentProject) {  
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
