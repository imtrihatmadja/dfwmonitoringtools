const SUPABASE_URL     = "https://zdfxcxkgmksaeigyuibe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZnhjeGtnbWtzYWVpZ3l1aWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3Mjc0NjAsImV4cCI6MjA5MjMwMzQ2MH0.baUlaWNvN3wMKHL05E71aSxedjKvWhfVQXHGXraWyVU";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== STATE =====================
let currentProject = null;   // objek proyek yang sedang dibuka di detail
let indicators     = [];     // builder step 2
let allActivities  = [];
let allActNotes    = [];
let currentActId   = null;
let currentActProject = "";
let stagedFiles    = [];
let savedFiles     = [];
const BUCKET       = "activity-files";

// ===================== TAB NAVIGATION =====================
const tabTitles = {
  dashboard: ["Dashboard", "Selamat datang, pantau semua proyek Anda"],
  projects:  ["Daftar Proyek", "Semua data proyek yang dimonitor"],
  input:     ["Tambah Proyek", "Tambah proyek baru"],
  detail:    ["Detail Proyek", ""]
};

function switchTab(tab) {
  document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));

  // penting: reset mode detail saat pindah ke tab utama
  if (tab !== "detail") {
    currentProject = null;
  }

  const li = document.querySelector(`[data-tab="${tab}"]`);
  if (li) li.classList.add("active");

  const targetTab = document.getElementById("tab-" + tab);
  if (targetTab) targetTab.classList.add("active");

  const t = tabTitles[tab];
  document.getElementById("pageTitle").textContent = t ? t[0] : "";
  document.getElementById("pageSubtitle").textContent = t ? t[1] : "";

  if (tab === "projects" || tab === "dashboard") {
    loadProjects();
  }
}

document.querySelectorAll(".nav-links li").forEach(li => {
  li.addEventListener("click", () => switchTab(li.dataset.tab));
});

window.switchTab = switchTab;

// ===================== STEP WIZARD =====================
function setStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById("form-step-" + i).classList.toggle("hidden", i !== n);
    document.getElementById("form-step-" + i).classList.toggle("active", i === n);
    const dot = document.getElementById("step-dot-" + i);
    dot.classList.toggle("active", i === n);
    dot.classList.toggle("done",   i < n);
  });
}

document.getElementById("toStep2Btn").addEventListener("click", () => {
  const name = document.getElementById("f-name").value.trim();
  const loc  = document.getElementById("f-location").value.trim();
  const own  = document.getElementById("f-owner").value.trim();
  const prog = document.getElementById("f-progress").value;
  if (!name || !loc || !own || prog === "") {
    alert("Harap isi semua field wajib: Nama Proyek, Lokasi, Penanggung Jawab, dan Progress.");
    return;
  }
  setStep(2);
  renderIndicatorList();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// [toStep3Btn removed — 2-step form]

document.getElementById("backStep1Btn").addEventListener("click", () => setStep(1));
// [backStep2Btn removed — 2-step form]

// ===================== INDICATOR BUILDER =====================
document.getElementById("addIndicatorBtn").addEventListener("click", () => {
  indicators.push({ id: null, name: "", type: "Output", target: "", unit: "", actual: 0, update_note: "", history: [], evidence: [] });
  renderIndicatorList();
});

function escHtml(v) { return (v||"").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function renderIndicatorList() {
  const container = document.getElementById("indicatorList");
  if (!indicators.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">Belum ada indikator. Klik <strong>+ Tambah Indikator</strong>.</div>`;
    return;
  }
  container.innerHTML = indicators.map((ind, i) => `
    <div class="indicator-block">
      <div class="indicator-block-header">
        <div class="indicator-block-title">
          <span class="badge badge-${(ind.type||"Output").toLowerCase()}">${ind.type||"Output"}</span>
          ${ind.name || "(Indikator " + (i+1) + ")"}
        </div>
        <button class="btn-remove" onclick="removeIndicator(${i})">✕</button>
      </div>
      <div class="indicator-input-row">
        <div class="form-group">
          <label>Nama Indikator</label>
          <input type="text" id="ind-name-${i}" value="${escHtml(ind.name)}" placeholder="Contoh: Nelayan terlatih"
            oninput="indicators[${i}].name=this.value" />
        </div>
        <div class="form-group">
          <label>Tipe</label>
          <select id="ind-type-${i}" onchange="indicators[${i}].type=this.value">
            <option ${ind.type==="Output"?"selected":""}>Output</option>
            <option ${ind.type==="Outcome"?"selected":""}>Outcome</option>
            <option ${ind.type==="Impact"?"selected":""}>Impact</option>
          </select>
        </div>
        <div class="form-group">
          <label>Target</label>
          <input type="number" id="ind-target-${i}" value="${ind.target}" placeholder="100"
            oninput="indicators[${i}].target=this.value" />
        </div>
        <div class="form-group">
          <label>Satuan</label>
          <input type="text" id="ind-unit-${i}" value="${escHtml(ind.unit)}" placeholder="orang / kg"
            oninput="indicators[${i}].unit=this.value" />
        </div>
      </div>
      <div class="history-section">
        <div class="history-section-title">📅 Histori Capaian</div>
        <div class="history-list">${renderHistoryItems(ind.history, ind.unit, ind.id)}</div>
      </div>
    </div>`).join("");
}

window.removeIndicator = function(i) { indicators.splice(i,1); renderIndicatorList(); };

function renderHistoryItems(history, unit, indicatorId) {
  if (!history || !history.length) return `<div class="history-empty">Belum ada riwayat update.</div>`;
  const clearBtn = indicatorId ? `<button class="btn-danger btn-sm" style="width:100%;margin-bottom:8px" onclick="clearIndicatorHistory('${indicatorId}')">🗑️ Hapus Semua Riwayat</button>` : '';
  return clearBtn + history.slice().reverse().map(h => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div class="history-content">
        <div class="history-value">Capaian: <strong>${h.actual_value} ${unit||""}</strong></div>
        ${h.note ? `<div class="history-note">📝 ${h.note}</div>` : ""}
        <div class="history-date">🕐 ${new Date(h.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
      </div>
    </div>`).join("");
}

// ===================== ACHIEVEMENT (Step 3) =====================
function renderAchievementList() {
  const container = document.getElementById("achievementList");
  container.innerHTML = indicators.map((ind, i) => {
    const pct = ind.target && ind.actual ? Math.min(Math.round((ind.actual/ind.target)*100),100) : 0;
    const lastH = ind.history && ind.history.length ? ind.history[ind.history.length-1] : null;
    return `
      <div class="achievement-card">
        <div class="achievement-header">
          <div>
            <div class="indicator-name">${ind.name || "(Indikator "+(i+1)+")"}</div>
            <span class="badge badge-${(ind.type||"output").toLowerCase()}" style="font-size:11px">${ind.type}</span>
          </div>
          <div class="target-info">Target: <strong>${ind.target||"—"} ${ind.unit||""}</strong>
            ${lastH ? `<br><span style="font-size:11px;color:#94a3b8">Update terakhir: ${new Date(lastH.created_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</span>` : ""}
          </div>
        </div>
        <div class="achievement-inputs">
          <div class="form-group">
            <label>Capaian Aktual</label>
            <input type="number" id="actual-${i}" value="${ind.actual||""}" placeholder="0"
              oninput="indicators[${i}].actual=Number(this.value);updatePreview(${i})" />
          </div>
          <div class="form-group">
            <label>% Capaian</label>
            <input type="number" id="pct-${i}" value="${pct||""}" placeholder="auto" readonly style="background:#f8fafc" />
            <div class="progress-preview"><div class="progress-preview-fill" id="prev-${i}" style="width:${pct}%"></div></div>
          </div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label>📝 Catatan Perkembangan</label>
          <textarea id="ind-note-${i}" rows="2" placeholder="Tulis perkembangan, kendala, atau temuan lapangan..."
            oninput="indicators[${i}].update_note=this.value" style="font-size:13px">${ind.update_note||""}</textarea>
        </div>
        ${ind.history && ind.history.length ? `
        <div class="mini-history">
          <div class="mini-history-title">🕐 Riwayat (${ind.history.length} update)</div>
          <div class="mini-history-list">
            ${ind.history.slice().reverse().slice(0,3).map(h => `
              <div class="mini-history-item">
                <span class="mini-history-val">${h.actual_value} ${ind.unit||""}</span>
                <span class="mini-history-note">${h.note ? "— "+h.note : ""}</span>
                <span class="mini-history-date">${new Date(h.created_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</span>
              </div>`).join("")}
            ${ind.history.length > 3 ? `<div class="mini-history-more">+${ind.history.length-3} update lainnya</div>` : ""}
          </div>
        </div>` : ""}
      </div>`;
  }).join("");
}

window.updatePreview = function(i) {
  const actual = parseFloat(indicators[i].actual) || 0;
  const target = parseFloat(indicators[i].target) || 0;
  const pct = target > 0 ? Math.min(Math.round((actual/target)*100),100) : 0;
  const pctEl  = document.getElementById("pct-"+i);
  const prevEl = document.getElementById("prev-"+i);
  if (pctEl)  pctEl.value      = pct;
  if (prevEl) prevEl.style.width = pct + "%";
};

// ===================== SUBMIT =====================
document.getElementById("submitAllBtn").addEventListener("click", async () => {
  const msg = document.getElementById("formMsg");
  const btn = document.getElementById("submitAllBtn");
  msg.className = "form-msg hidden";
  btn.textContent = "⏳ Menyimpan..."; btn.disabled = true;

  try {
    indicators.forEach((ind, i) => {
      const actualEl = document.getElementById("actual-"+i);
      const noteEl   = document.getElementById("ind-note-"+i);
      if (actualEl) ind.actual      = Number(actualEl.value) || 0;
      if (noteEl)   ind.update_note = noteEl.value.trim() || null;
    });

    const p = {
      name:        document.getElementById("f-name").value.trim(),
      location:    document.getElementById("f-location").value.trim(),
      owner:       document.getElementById("f-owner").value.trim(),
      donor:       document.getElementById("f-donor").value.trim() || null,
      start_date:  document.getElementById("f-start-date").value || null,
      deadline:    document.getElementById("f-deadline").value || null,
      status:      document.getElementById("f-status").value,
      progress:    Number(document.getElementById("f-progress").value) || 0,
      description: document.getElementById("f-desc").value.trim() || null,
      note:        document.getElementById("f-note").value.trim() || null
    };
    if (!p.name) throw new Error("Nama proyek wajib diisi.");

    const { error: pErr } = await client.from("projects").upsert(p, { onConflict: "name" });
    if (pErr) throw new Error("Gagal simpan proyek: " + pErr.message);

    await client.from("project_indicators").delete().eq("project_name", p.name);

    for (let i = 0; i < indicators.length; i++) {
      const ind = indicators[i];
      if (!ind.name) continue;
      const { data: indData, error: indErr } = await client.from("project_indicators").insert({
        project_name: p.name, indicator_name: ind.name, type: ind.type,
        target: Number(ind.target)||0, unit: ind.unit||null, actual: ind.actual||0
      }).select().single();
      if (indErr) { console.warn(indErr.message); continue; }
      if (ind.actual > 0 || ind.update_note) {
        await client.from("indicator_updates").insert({
          indicator_id: indData.id, project_name: p.name, indicator_name: ind.name,
          actual_value: ind.actual||0, note: ind.update_note||null, updated_by: "Tim"
        });
      }
      indicators[i].id = indData.id;
    }

    msg.textContent = "✅ Data berhasil disimpan!";
    msg.className = "form-msg success";
    setTimeout(() => {
      msg.className = "form-msg hidden";
      resetForm();
      setStep(1);
      switchTab("dashboard");
    }, 1800);
    await loadProjects();

  } catch(err) {
    msg.textContent = "❌ " + err.message;
    msg.className = "form-msg error";
  } finally {
    btn.textContent = "💾 Simpan Semua Data"; btn.disabled = false;
  }
});

function resetForm() {
  ["f-name","f-location","f-owner","f-donor","f-start-date","f-deadline","f-desc","f-note"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("f-status").value   = "Aktif";
  document.getElementById("f-progress").value = "";
  indicators = [];
}

// ===================== LOAD PROJECTS =====================
async function loadProjects() {
  const { data: projects, error } = await client.from("projects").select("*").order("updated_at", { ascending: false });
  if (error) { console.error(error); return; }
  const { data: inds }  = await client.from("project_indicators").select("*");
  const { data: upds }  = await client.from("indicator_updates").select("*").order("created_at", { ascending: true });
  const { data: evids } = await client.from("indicator_evidence").select("*");
  const { data: actsCnt } = await client.from("project_activities").select("project_name");

  const items = (projects||[]).map(proj => ({
    ...proj,
    project_indicators: (inds||[]).filter(ind => ind.project_name === proj.name).map(ind => ({
      ...ind,
      indicator_updates:  (upds||[]).filter(u => u.indicator_id === ind.id),
      indicator_evidence: (evids||[]).filter(e => e.indicator_id === ind.id)
    })),
    activityCount: (actsCnt||[]).filter(a => a.project_name === proj.name).length
  }));

  window._allProjects = items;
  renderStats(items);
  renderCards(items);
  renderTable(items);
  renderSidebarSubmenu(items);

  // Update detail panel jika sedang terbuka
  if (currentProject && document.getElementById("tab-detail").classList.contains("active")) {
  const updated = items.find(p => p.name === currentProject.name);
  if (updated) openProjectDetail(updated);
}
}

function renderStats(items) {
  document.getElementById("totalProjects").textContent   = items.length;
  document.getElementById("activeProjects").textContent  = items.filter(x => ["Aktif","On Track"].includes(x.status)).length;
  document.getElementById("lateProjects").textContent    = items.filter(x => x.status === "Terlambat").length;
  const avg = items.length ? Math.round(items.reduce((a,b)=>a+(b.progress||0),0)/items.length) : 0;
  document.getElementById("avgProgress").textContent     = avg + "%";
  document.getElementById("projectCount").textContent    = `(${items.length} proyek)`;
}

function renderCards(items) {
  const container = document.getElementById("projectCards");
  if (!items.length) { container.innerHTML = `<div class="empty-state">Belum ada proyek. <a href="#" onclick="switchTab('input');return false">Tambah proyek →</a></div>`; return; }
  container.innerHTML = items.map((item, i) => {
    const cls = item.status.toLowerCase().replace(/ /g,"-");
    const indCount = (item.project_indicators||[]).length;
    return `
      <div class="proj-card ${cls}" onclick="openProjectDetail(window._allProjects[${i}])">
        <div class="proj-card-header">
          <div class="proj-card-name">${item.name}</div>
          <span class="badge badge-${cls}">${item.status}</span>
        </div>
        <div class="proj-card-meta">📍 ${item.location} &nbsp;|&nbsp; 👤 ${item.owner}${item.donor?" &nbsp;|&nbsp; 🏛️ "+item.donor:""}</div>
        <div class="progress-label"><span>Progress</span><span>${item.progress}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${item.progress}%"></div></div>
        <div class="proj-card-footer">
          <span class="ind-count">📊 ${indCount} Indikator</span>
          <span class="ind-count" style="background:#f0fdf4;color:#15803d">✅ ${item.activityCount||0} Aktivitas</span>
        </div>
        <div class="proj-card-actions">
          <span style="font-size:11px;color:#94a3b8">${item.deadline ? "📅 "+item.deadline : ""}</span>
          <button class="btn-danger btn-sm" style="margin-left:auto" onclick="event.stopPropagation();deleteProject('${item.id}','${item.name.replace(/'/g,'\\\'')}')">🗑️ Hapus</button>
        </div>
      </div>`;
  }).join("");
}

function renderTable(items) {
  const tbody = document.getElementById("projectTable");
  if (!items.length) { tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:28px">Belum ada data.</td></tr>`; return; }
  tbody.innerHTML = items.map((item, i) => {
    const cls = item.status.toLowerCase().replace(/ /g,"-");
    const dt  = new Date(item.updated_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return `<tr style="cursor:pointer" onclick="openProjectDetail(window._allProjects[${i}])">
      <td>${i+1}</td>
      <td><strong>${item.name}</strong>${item.donor?`<br><small style="color:#94a3b8">${item.donor}</small>`:""}</td>
      <td>${item.location}</td><td>${item.owner}</td>
      <td><span class="badge badge-${cls}">${item.status}</span></td>
      <td>
        <div class="progress-bar" style="min-width:70px"><div class="progress-fill" style="width:${item.progress}%"></div></div>
        <small>${item.progress}%</small>
      </td>
      <td>${item.deadline||"-"}</td>
      <td>${dt}</td>
      <td><button class="btn-edit" onclick="event.stopPropagation();fillFormEdit(${i})">✏️ Edit</button>
      <button class="btn-danger btn-sm" style="margin-left:4px" onclick="event.stopPropagation();deleteProject(window._allProjects[${i}].id,window._allProjects[${i}].name)">🗑️</button></td>
    </tr>`;
  }).join("");
}

// ===================== SEARCH =====================
document.getElementById("searchInput").addEventListener("input", function() {
  const q = this.value.toLowerCase();
  renderTable((window._allProjects||[]).filter(x =>
    x.name.toLowerCase().includes(q) || x.location.toLowerCase().includes(q) || x.owner.toLowerCase().includes(q)
  ));
});

// ===================== DETAIL PROYEK =====================
window.openProjectDetail = async function(proj) {
  currentProject    = proj;
  currentActProject = proj.name;

  // Update page subtitle
  tabTitles.detail[1] = proj.name;
  document.getElementById("pageTitle").textContent    = "Detail Proyek";
  document.getElementById("pageSubtitle").textContent = proj.name;

  // Sembunyikan semua tab, tampilkan detail
  document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
  document.getElementById("tab-detail").classList.add("active");

  renderDetailHeader(proj);
  await loadActivities(proj.name);
  renderIndicatorUpdatePanel(proj);
};

function renderDetailHeader(proj) {
  const inds = proj.project_indicators || [];
  const indDone = inds.filter(ind => {
    const pct = ind.target > 0 ? Math.round((ind.actual/ind.target)*100) : 0;
    return pct >= 100;
  }).length;
  const cls = proj.status.toLowerCase().replace(/ /g,"-");
  const avgInd = inds.length
    ? Math.round(inds.reduce((a,ind) => a + Math.min(ind.target > 0 ? Math.round((ind.actual/ind.target)*100) : 0, 100), 0) / inds.length)
    : 0;

  // ── Indikator di bawah 50% capaian ──────────────────────────────────────
  const indBawah50 = inds.reduce(function(acc, ind, idx) {
    var actual = (ind.indicator_updates && ind.indicator_updates.length)
      ? Number(ind.indicator_updates[ind.indicator_updates.length - 1].actual_value)
      : Number(ind.actual) || 0;
    var pct = ind.target > 0 ? Math.round(actual / ind.target * 100) : 0;
    if (pct < 50) acc.push({ name: ind.indicator_name, actual: actual, target: ind.target, unit: ind.unit||"", pct: pct, idx: idx });
    return acc;
  }, []);

  // Pre-compute HTML (hindari triple-nested template literal)
  var indBawah50HTML = "";
  if (indBawah50.length > 0) {
    var alertItems = indBawah50.map(function(ind) {
      var barColor = ind.pct >= 35 ? "#f59e0b" : "#ef4444";
      return '<div class="ind-alert-item" onclick="scrollToIndicator(' + ind.idx + ')" title="Klik untuk update">' +
        '<div class="ind-alert-item-header">' +
          '<span class="ind-alert-name">' + ind.name + '</span>' +
          '<span class="ind-alert-pct" style="color:' + barColor + '">' + ind.pct + '%</span>' +
        '</div>' +
        '<div class="ind-alert-progress">' +
          '<div class="ind-alert-fill" style="width:' + ind.pct + '%;background:' + barColor + '"></div>' +
        '</div>' +
        '<div class="ind-alert-meta">' + ind.actual + ' / ' + ind.target + ' ' + ind.unit +
          '<span class="ind-alert-goto"> → Klik untuk update</span>' +
        '</div>' +
      '</div>';
    }).join("");
    indBawah50HTML =
      '<div class="ind-alert-box">' +
        '<div class="ind-alert-title">' +
          '<span class="ind-alert-icon">⚠️</span>' +
          'Indikator Perlu Perhatian' +
          '<span class="ind-alert-badge">' + indBawah50.length + ' indikator &lt; 50%</span>' +
        '</div>' +
        '<div class="ind-alert-list">' + alertItems + '</div>' +
      '</div>';
  }

  document.getElementById("detailHeader").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <button class="btn-secondary btn-sm" onclick="switchTab('dashboard')" style="font-size:12px">← Kembali</button>
          <span class="badge badge-${cls}">${proj.status}</span>
        </div>
        <div class="detail-project-name">${proj.name}</div>
        <div class="detail-meta">
          <span>📍 ${proj.location}</span>
          <span>👤 ${proj.owner}</span>
          ${proj.donor ? `<span>🏛️ ${proj.donor}</span>` : ""}
          ${proj.deadline ? `<span>📅 Deadline: ${proj.deadline}</span>` : ""}
        </div>
        ${proj.description ? `<p style="font-size:13px;color:#64748b;max-width:600px">${proj.description}</p>` : ""}
      </div>
    </div>
    <div class="progress-label" style="margin-bottom:4px"><span style="font-weight:600">Progress Keseluruhan</span><span style="font-weight:700;color:#2563eb">${proj.progress}%</span></div>
    <div class="progress-bar" style="height:10px;margin-bottom:16px"><div class="progress-fill" style="width:${proj.progress}%"></div></div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="detail-stat-label">Total Indikator</div><div class="detail-stat-value">${inds.length}</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Indikator Tercapai</div><div class="detail-stat-value" style="color:#22c55e">${indDone}/${inds.length}</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Avg. Capaian</div><div class="detail-stat-value">${avgInd}%</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Update Terakhir</div><div class="detail-stat-value" style="font-size:13px">${new Date(proj.updated_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</div></div>
    </div>
    ${indBawah50HTML}`;
}

// ===================== INDICATOR UPDATE PANEL (kanan) =====================
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
    const safeId   = String(ind.id).replace(/'/g, "\\'");
    const safeName = (ind.indicator_name||"").replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeUnit = (ind.unit||"").replace(/'/g, "\\'");
    const lastTsHtml = lastTs
      ? `<div class="ind-last-update">Update terakhir <strong>${lastTs}</strong></div>`
      : `<span style="color:#94a3b8;font-style:italic;font-size:11px">Belum pernah diupdate</span>`;
    const historyHtml = sortedUpd.length
      ? (function() {
          const rows = [...sortedUpd].reverse().slice(0, 5).map(h =>
            '<div class="mini-history-item">' +
            '<span class="mini-history-val" style="min-width:80px">' + h.actual_value + ' ' + (ind.unit||"") + '</span>' +
            '<span class="mini-history-note">' + (h.note||"") + '</span>' +
            '<span class="mini-history-date">' + new Date(h.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) + '</span>' +
            '</div>'
          ).join("");
          const more = sortedUpd.length > 5 ? '<div class="mini-history-more">' + (sortedUpd.length - 5) + ' update lainnya</div>' : "";
          return '<div class="mini-history" style="margin-top:10px">' +
            '<div class="mini-history-title" style="display:flex;justify-content:space-between;align-items:center">' +
            '<span>' + sortedUpd.length + ' Riwayat Update</span>' +
            '<button class="btn-danger btn-sm" style="font-size:10px;padding:3px 8px" onclick="clearIndicatorHistory(\'' + safeId + '\')">Hapus Semua</button>' +
            '</div><div class="mini-history-list">' + rows + '</div>' + more + '</div>';
        })()
      : "";

    return `<div class="ind-update-card" id="ind-card-${i}">
      <div class="ind-update-header">
        <div style="flex:1;min-width:0">
          <div class="ind-update-name">${ind.indicator_name}</div>
          <div><span class="badge badge-${(ind.type||"output").toLowerCase()}">${ind.type||"Output"}</span></div>
        </div>
      </div>
      <div class="ind-capaian-display">
        <div class="ind-capaian-main">
          <span class="ind-capaian-actual" style="color:${pctColor}">${currentActual}</span>
          <span class="ind-capaian-unit">&nbsp;${ind.unit||""}</span>
          <span class="ind-capaian-sep">&nbsp;/&nbsp;</span>
          <span class="ind-capaian-target">${target}&nbsp;${ind.unit||""}</span>
        </div>
        <div class="ind-capaian-pct-badge" style="background:${pctColor}18;color:${pctColor};border:1px solid ${pctColor}40">${pct}%</div>
      </div>
      <div class="progress-bar" style="height:8px;margin:4px 0 6px">
        <div class="progress-fill" style="width:${pct}%;background:${pctColor}"></div>
      </div>
      ${lastTsHtml}
      <div class="ind-kumul-box">
        <div class="ind-kumul-title">➕ Tambah Capaian Baru</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div class="form-group" style="margin:0">
            <label style="font-size:11px">Tambahan Nilai</label>
            <input type="number" id="upd-add-${i}" placeholder="0" min="0"
              oninput="previewKumul(${i},${currentActual},${target})"
              style="padding:7px 10px;font-size:13px;border:1px solid #e2e8f0;border-radius:7px;width:100%">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:11px">Preview Total</label>
            <input type="text" id="upd-preview-${i}" readonly
              value="${currentActual} ${ind.unit||""}"
              style="padding:7px 10px;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;width:100%;font-weight:700;color:${pctColor}">
          </div>
        </div>
        <div class="form-group" style="margin:0 0 8px">
          <label style="font-size:11px">Catatan <span style="font-weight:400;color:#94a3b8">(opsional)</span></label>
          <textarea id="upd-note-${i}" rows="2"
            placeholder="Perkembangan, kendala, atau temuan lapangan"
            style="padding:7px 10px;font-size:12px;border:1px solid #e2e8f0;border-radius:7px;width:100%;resize:vertical"></textarea>
        </div>
        <div id="upd-msg-${i}" class="form-msg hidden" style="margin-bottom:6px"></div>
        <button class="btn-ind-update"
          onclick="saveOneIndicator(${i},'${safeId}',${currentActual},${target},'${safeName}','${safeUnit}')">
          💾 Simpan Update
        </button>
      </div>
      ${historyHtml}
    </div>`;
  }).join("");
}

window.previewKumul = function(i, currentActual, target) {
  const addEl    = document.getElementById("upd-add-" + i);
  const prevEl   = document.getElementById("upd-preview-" + i);
  if (!addEl || !prevEl) return;
  const addVal   = parseFloat(addEl.value) || 0;
  const newTotal = currentActual + addVal;
  const pct      = target > 0 ? Math.min(Math.round(newTotal / target * 100), 100) : 0;
  const pctColor = pct >= 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";
  prevEl.value       = String(newTotal);
  prevEl.style.color = pctColor;
};

window.saveOneIndicator = async function(i, indId, currentActual, target, indName, unit) {
  const addEl  = document.getElementById("upd-add-"  + i);
  const noteEl = document.getElementById("upd-note-" + i);
  const msgEl  = document.getElementById("upd-msg-"  + i);
  const btn    = document.querySelector("[onclick*=\"saveOneIndicator(" + i + ",\"]");

  const addVal = parseFloat(addEl ? addEl.value : 0) || 0;
  const note   = noteEl ? noteEl.value.trim() || null : null;

  if (addVal === 0 && !note) {
    if (msgEl) {
      msgEl.textContent = "⚠️ Isi tambahan nilai atau catatan terlebih dahulu.";
      msgEl.className   = "form-msg";
      msgEl.style.cssText = "background:#fef9c3;color:#92400e;border:1px solid #fde68a";
      setTimeout(function() { msgEl.className = "form-msg hidden"; msgEl.style.cssText = ""; }, 3000);
    }
    return;
  }

  const newTotal = currentActual + addVal;
  if (btn) { btn.textContent = "Menyimpan…"; btn.disabled = true; }

  try {
    await client.from("project_indicators").update({ actual: newTotal }).eq("id", indId);
    await client.from("indicator_updates").insert({
      indicator_id   : indId,
      project_name   : currentProject.name,
      indicator_name : indName,
      actual_value   : newTotal,
      note           : note,
      updated_by     : "Tim",
    });
    if (addEl)  addEl.value  = "";
    if (noteEl) noteEl.value = "";
    if (msgEl) {
      msgEl.textContent = "✅ Berhasil: " + currentActual + " + " + addVal + " = " + newTotal + " " + unit;
      msgEl.className   = "form-msg success";
      setTimeout(function() { msgEl.className = "form-msg hidden"; }, 3500);
    }
    await loadProjects();
    if (currentProject) {
      const updated = (window.allProjects || []).find(function(p) { return p.name === currentProject.name; });
      if (updated) {
        updated.activities_summary = allActivities.map(function(a) {
          return { project_name: a.project_name, progress: a.progress, status: a.status };
        });
        currentProject = updated;
        renderDetailHeader(currentProject);
        renderIndicatorUpdatePanel(currentProject);
      }
    }
  } catch(err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = "form-msg error"; }
  } finally {
    if (btn) { btn.textContent = "💾 Simpan Update"; btn.disabled = false; }
  }
};

window.scrollToIndicator = function(idx) {
  const card       = document.getElementById("ind-card-" + idx);
  const scrollArea = document.getElementById("indScrollArea");
  if (!card || !scrollArea) return;
  scrollArea.scrollTo({ top: card.offsetTop - scrollArea.offsetTop - 12, behavior: "smooth" });
  card.classList.add("ind-card-highlight");
  setTimeout(function() { card.classList.remove("ind-card-highlight"); }, 2200);
  setTimeout(function() {
    const input = document.getElementById("upd-add-" + idx);
    if (input) { input.focus(); input.select(); }
  }, 500);
};


// ---- Edit proyek dari tombol di panel kanan ----
document.getElementById("editProjectBtn").addEventListener("click", () => {
  if (!currentProject) return;
  fillFormEdit(window._allProjects.findIndex(p => p.name === currentProject.name));
});

// ===================== FILL FORM EDIT =====================
window.fillFormEdit = function(idx) {
  const item = window._allProjects[idx];
  document.getElementById("f-name").value       = item.name;
  document.getElementById("f-location").value   = item.location;
  document.getElementById("f-owner").value      = item.owner;
  document.getElementById("f-donor").value      = item.donor || "";
  document.getElementById("f-start-date").value = item.start_date || "";
  document.getElementById("f-deadline").value   = item.deadline || "";
  document.getElementById("f-status").value     = item.status;
  document.getElementById("f-progress").value   = item.progress;
  document.getElementById("f-desc").value       = item.description || "";
  document.getElementById("f-note").value       = item.note || "";

  indicators = (item.project_indicators||[]).map(ind => ({
    id:          ind.id,
    name:        ind.indicator_name,
    type:        ind.type,
    target:      ind.target,
    unit:        ind.unit || "",
    actual:      ind.actual || 0,
    update_note: "",
    history:     ind.indicator_updates  || [],
    evidence:    ind.indicator_evidence || []
  }));

  document.getElementById("pageTitle").textContent    = "Edit Proyek";
  document.getElementById("pageSubtitle").textContent = item.name;
  document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
  document.querySelector('[data-tab="input"]').classList.add("active");
  document.getElementById("tab-input").classList.add("active");
  setStep(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ===================== AKTIVITAS =====================
async function loadActivities(projectName) {
  const { data: acts }  = await client.from("project_activities").select("*").eq("project_name", projectName).order("sort_order").order("created_at");
  const { data: notes } = await client.from("activity_notes").select("*").eq("project_name", projectName).order("created_at", { ascending: false });
  allActivities = acts  || [];
  allActNotes   = notes || [];
  renderActivityListDetail();
  updateFileCountBadges();
}

function renderActivityListDetail() {
  const container = document.getElementById("activityListDetail");
  if (!allActivities.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">Belum ada aktivitas.<br>Klik <strong>+ Tambah</strong> untuk menambah.</div>`;
    return;
  }

  const avg  = Math.round(allActivities.reduce((a,b)=>a+(b.progress||0),0)/allActivities.length);
  const done = allActivities.filter(a=>a.status==="Selesai").length;

  container.innerHTML = `
    <div style="background:#f0fdf4;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#15803d;font-weight:600">
      ✅ ${done}/${allActivities.length} selesai &nbsp;|&nbsp; Rata-rata progress: ${avg}%
    </div>
    ` + allActivities.map((act, i) => {
    const cls     = act.status.toLowerCase().replace(/ /g,"-");
    const notes   = allActNotes.filter(n => n.activity_id === act.id);
    const checked = act.status === "Selesai";
    const badgeCls = cls === "selesai" ? "badge-selesai-act" : "badge-" + cls;
    return `
      <div class="activity-card ${cls}" id="actcard-${act.id}">
        <div class="activity-card-header" onclick="toggleActBody('${act.id}')">
          <div class="act-check ${checked?"checked":""}"
            onclick="event.stopPropagation();toggleActDone('${act.id}',${checked})"
            title="${checked?"Tandai belum selesai":"Tandai selesai"}">${checked?"✓":""}</div>
          <div class="activity-card-info">
            <div class="activity-card-title ${checked?"done":""}">${act.title}</div>
            <div class="activity-card-meta">
              ${act.pic?`<span>👤 ${act.pic}</span>`:""}
              ${act.due_date?`<span>📅 ${act.due_date}</span>`:""}
              <span><span class="badge ${badgeCls}" style="font-size:10px">${act.status}</span></span>
              ${notes.length?`<span>💬 ${notes.length}</span>`:""}
              <span class="file-count-badge" id="filecount-${act.id}"></span>
            </div>
          </div>
          <div class="activity-card-progress">
            <div class="activity-card-pct">${act.progress}%</div>
            <div class="progress-bar" style="width:80px;height:5px"><div class="progress-fill" style="width:${act.progress}%"></div></div>
          </div>
          <div class="activity-card-actions" onclick="event.stopPropagation()">
            <button class="btn-edit" onclick="openActModal('${act.id}')">✏️</button>
            <button class="btn-remove" onclick="deleteActivity('${act.id}')">✕</button>
          </div>
        </div>
        <div class="activity-card-body" id="actbody-${act.id}">
          ${act.description?`<p style="font-size:12px;color:#475569;margin:10px 0 6px">${act.description}</p>`:""}
          <div class="act-note-section">
            <div class="act-note-title">📝 Catatan</div>
            <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
              <textarea id="inline-note-${act.id}" rows="2" placeholder="Tulis catatan pelaksanaan..."
                style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;resize:vertical"></textarea>
              <button class="btn-upload" onclick="saveInlineNote('${act.id}')">💬</button>
            </div>
            <div class="act-note-list" id="notelist-${act.id}">${renderActNotes(notes)}</div>
          </div>
        </div>
      </div>`;
  }).join("");
}

function renderActNotes(notes) {
  if (!notes.length) return `<div class="history-empty">Belum ada catatan.</div>`;
  return notes.map(n => `
    <div class="act-note-item">
      <div class="history-dot"></div>
      <div class="act-note-content">
        <div class="act-note-text">${n.note}</div>
        <div class="act-note-date">🕐 ${new Date(n.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})} — ${n.noted_by||"Tim"}</div>
      </div>
    </div>`).join("");
}

window.toggleActBody = function(id) {
  const body = document.getElementById("actbody-"+id);
  if (body) body.classList.toggle("open");
};

window.toggleActDone = async function(id, wasChecked) {
  const update = { status: wasChecked ? "Sedang Berjalan" : "Selesai" };
  if (!wasChecked) update.progress = 100;
  await client.from("project_activities").update(update).eq("id", id);
  await loadActivities(currentActProject);
};

window.saveInlineNote = async function(actId) {
  const ta = document.getElementById("inline-note-"+actId);
  const note = ta.value.trim();
  if (!note) { alert("Catatan tidak boleh kosong."); return; }
  await client.from("activity_notes").insert({ activity_id: actId, project_name: currentActProject, note, noted_by: "Tim" });
  ta.value = "";
  await loadActivities(currentActProject);
};

window.deleteActivity = async function(id) {
  if (!confirm("Hapus aktivitas ini?")) return;
  await client.from("project_activities").delete().eq("id", id);
  await loadActivities(currentActProject);
};

async function updateFileCountBadges() {
  if (!allActivities.length) return;
  const { data } = await client.from("activity_files").select("activity_id").in("activity_id", allActivities.map(a=>a.id));
  const counts = {};
  (data||[]).forEach(r => { counts[r.activity_id] = (counts[r.activity_id]||0)+1; });
  allActivities.forEach(act => {
    const el = document.getElementById("filecount-"+act.id);
    if (el) el.textContent = counts[act.id] ? `📎 ${counts[act.id]}` : "";
  });
}

// ---- Tambah aktivitas dari panel detail ----
document.getElementById("addActivityBtnDetail").addEventListener("click", () => openActModal(null));

// ===================== MODAL AKTIVITAS =====================
window.openActModal = async function(id) {
  currentActId = id;
  document.getElementById("actModalTitle").textContent = id ? "✏️ Edit Aktivitas" : "➕ Tambah Aktivitas";
  document.getElementById("act-id").value       = id || "";
  document.getElementById("act-title").value    = "";
  document.getElementById("act-desc").value     = "";
  document.getElementById("act-pic").value      = "";
  document.getElementById("act-status").value   = "Belum Mulai";
  document.getElementById("act-start").value    = "";
  document.getElementById("act-due").value      = "";
  document.getElementById("act-progress").value = "0";
  document.getElementById("act-progress-range").value = "0";
  document.getElementById("act-progress-val").textContent = "0%";
  document.getElementById("actFormMsg").className = "form-msg hidden";
  document.getElementById("actNoteList").innerHTML = `<div class="history-empty">Belum ada catatan.</div>`;
  stagedFiles = []; savedFiles = [];
  renderStagingList(); renderSavedFiles();
  document.getElementById("actUploadProgress").textContent = "";

  if (id) {
    const act = allActivities.find(a => a.id === id);
    if (act) {
      document.getElementById("act-title").value   = act.title;
      document.getElementById("act-desc").value    = act.description || "";
      document.getElementById("act-pic").value     = act.pic || "";
      document.getElementById("act-status").value  = act.status;
      document.getElementById("act-start").value   = act.start_date || "";
      document.getElementById("act-due").value     = act.due_date || "";
      document.getElementById("act-progress").value = act.progress;
      document.getElementById("act-progress-range").value = act.progress;
      document.getElementById("act-progress-val").textContent = act.progress + "%";
    }
    const notes = allActNotes.filter(n => n.activity_id === id);
    document.getElementById("actNoteList").innerHTML = renderActNotes(notes);
    await loadSavedFiles(id);
  }
  document.getElementById("actModalOverlay").classList.remove("hidden");
};

["actModalClose","actModalClose2"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => document.getElementById("actModalOverlay").classList.add("hidden"));
});
document.getElementById("actModalOverlay").addEventListener("click", e => {
  if (e.target === document.getElementById("actModalOverlay")) document.getElementById("actModalOverlay").classList.add("hidden");
});

document.getElementById("saveNoteBtn").addEventListener("click", async () => {
  const note = document.getElementById("act-new-note").value.trim();
  if (!note) { alert("Catatan tidak boleh kosong."); return; }
  if (!currentActId) { alert("Simpan aktivitas terlebih dahulu."); return; }
  await client.from("activity_notes").insert({ activity_id: currentActId, project_name: currentActProject, note, noted_by: "Tim" });
  document.getElementById("act-new-note").value = "";
  const { data: notes } = await client.from("activity_notes").select("*").eq("activity_id", currentActId).order("created_at", { ascending: false });
  allActNotes = [...allActNotes.filter(n=>n.activity_id !== currentActId), ...(notes||[])];
  document.getElementById("actNoteList").innerHTML = renderActNotes(notes||[]);
});

document.getElementById("saveActivityBtn").addEventListener("click", async () => {
  const msg   = document.getElementById("actFormMsg");
  const title = document.getElementById("act-title").value.trim();
  if (!title) { msg.textContent = "❌ Judul wajib diisi."; msg.className = "form-msg error"; return; }
  const payload = {
    project_name: currentActProject,
    title,
    description: document.getElementById("act-desc").value.trim() || null,
    pic:         document.getElementById("act-pic").value.trim()  || null,
    status:      document.getElementById("act-status").value,
    start_date:  document.getElementById("act-start").value || null,
    due_date:    document.getElementById("act-due").value   || null,
    progress:    Number(document.getElementById("act-progress").value) || 0
  };
  let error;
  if (currentActId) {
    ({ error } = await client.from("project_activities").update(payload).eq("id", currentActId));
  } else {
    const { data, error: insErr } = await client.from("project_activities").insert(payload).select().single();
    error = insErr;
    if (data) currentActId = data.id;
  }
  if (error) { msg.textContent = "❌ " + error.message; msg.className = "form-msg error"; return; }
  msg.textContent = "✅ Tersimpan!"; msg.className = "form-msg success";
  setTimeout(() => { document.getElementById("actModalOverlay").classList.add("hidden"); msg.className = "form-msg hidden"; }, 1200);
  await loadActivities(currentActProject);
});

// ===================== FILE UPLOAD =====================
function getFileIcon(n){return /\.(jpg|jpeg|png|gif|webp)$/i.test(n)?"🖼️":/\.pdf$/i.test(n)?"📄":/\.(doc|docx)$/i.test(n)?"📝":/\.(xls|xlsx|csv)$/i.test(n)?"📊":/\.(ppt|pptx)$/i.test(n)?"📑":"📂"}
function formatBytes(b){if(!b)return "";if(b<1024)return b+" B";if(b<1048576)return (b/1024).toFixed(1)+" KB";return (b/1048576).toFixed(1)+" MB"}
function isImage(n){return /\.(jpg|jpeg|png|gif|webp)$/i.test(n)}

function renderStagingList() {
  const container  = document.getElementById("actFileStagingList");
  const uploadRow  = document.getElementById("actUploadAllRow");
  if (!stagedFiles.length) { container.innerHTML=""; uploadRow.classList.add("hidden"); return; }
  uploadRow.classList.remove("hidden");
  container.innerHTML = stagedFiles.map(sf => {
    const thumb = isImage(sf.file.name) ? `<img class="file-thumb" src="${URL.createObjectURL(sf.file)}" alt="" />` : `<div class="file-thumb-placeholder">${getFileIcon(sf.file.name)}</div>`;
    const statusMap = { wait:"⏳ Menunggu", uploading:"🔄 Upload...", ok:"✅ OK", err:"❌ "+(sf.errMsg||"Gagal") };
    const statusCls = { wait:"wait", uploading:"uploading", ok:"ok", err:"err" };
    return `
      <div class="file-staging-item ${sf.status==="ok"?"uploaded":sf.status==="err"?"error-item":""}">
        ${thumb}
        <div class="file-staging-info">
          <div class="file-staging-name" title="${sf.file.name}">${sf.file.name}</div>
          <div class="file-staging-size">${formatBytes(sf.file.size)}</div>
          <div class="file-progress-bar" id="bar-${sf.id}"><div class="file-progress-fill" style="width:${sf.status==="ok"?100:0}%"></div></div>
        </div>
        <span class="file-staging-status ${statusCls[sf.status]}">${statusMap[sf.status]}</span>
        ${sf.status!=="uploading"?`<button class="file-remove-btn" onclick="removeStagedFile('${sf.id}')">✕</button>`:""}
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
    const thumb = isImage(f.file_name) ? `<img class="file-thumb" src="${f.file_url}" alt="" loading="lazy" />` : `<div class="file-thumb-placeholder">${getFileIcon(f.file_name)}</div>`;
    return `
      <div class="file-saved-item">
        ${thumb}
        <div class="file-saved-info">
          <div class="file-saved-name" title="${f.file_name}">${f.file_name}</div>
          <div class="file-saved-meta">${formatBytes(f.file_size)} | ${new Date(f.created_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</div>
        </div>
        <div class="file-saved-actions">
          <a href="${f.file_url}" target="_blank" class="file-btn-view">👁️ Lihat</a>
          <button class="file-btn-delete" onclick="deleteSavedFile('${f.id}','${f.file_url}')">🗑️</button>
        </div>
      </div>`;
  }).join("");
}

function addFilesToStaging(fileList) {
  Array.from(fileList).forEach(file => {
    if (file.size > 10*1024*1024) { alert(`"${file.name}" terlalu besar (maks 10MB).`); return; }
    stagedFiles.push({ file, id: Date.now()+"_"+Math.random().toString(36).slice(2), status:"wait", errMsg:"" });
  });
  renderStagingList();
}

document.getElementById("actFileInput").addEventListener("change", function(){ addFilesToStaging(this.files); this.value=""; });
const dropzone = document.getElementById("actDropzone");
dropzone.addEventListener("dragover",  e => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop",      e => { e.preventDefault(); dropzone.classList.remove("dragover"); addFilesToStaging(e.dataTransfer.files); });
window.removeStagedFile = function(id){ stagedFiles=stagedFiles.filter(sf=>sf.id!==id); renderStagingList(); };

document.getElementById("actUploadAllBtn").addEventListener("click", async () => {
  if (!currentActId) { alert("Simpan aktivitas terlebih dahulu."); return; }
  const pending = stagedFiles.filter(sf=>sf.status==="wait"||sf.status==="err");
  if (!pending.length) { alert("Tidak ada file yang perlu diupload."); return; }
  const btn  = document.getElementById("actUploadAllBtn");
  const prog = document.getElementById("actUploadProgress");
  btn.disabled = true;
  for (let i=0; i<pending.length; i++) {
    const sf = pending[i]; sf.status="uploading"; renderStagingList();
    prog.textContent = `Upload ${i+1}/${pending.length}...`;
    const path = `${currentActId}/${Date.now()}_${sf.file.name}`;
    const { error: upErr } = await client.storage.from(BUCKET).upload(path, sf.file, { upsert:true });
    if (upErr) { sf.status="err"; sf.errMsg=upErr.message; renderStagingList(); continue; }
    const bar = document.querySelector(`#bar-${sf.id} .file-progress-fill`);
    if (bar) bar.style.width="100%";
    const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await client.from("activity_files").insert({ activity_id:currentActId, project_name:currentActProject, file_name:sf.file.name, file_url:urlData.publicUrl, file_size:sf.file.size, file_type:sf.file.type||null, uploaded_by:"Tim" });
    sf.status = dbErr ? "err" : "ok"; sf.errMsg = dbErr ? dbErr.message : "";
    renderStagingList();
  }
  prog.textContent = "✅ Selesai!"; btn.disabled=false;
  await loadSavedFiles(currentActId);
  setTimeout(() => { stagedFiles=stagedFiles.filter(sf=>sf.status!=="ok"); renderStagingList(); if(!stagedFiles.length) prog.textContent=""; }, 2000);
  await loadActivities(currentActProject);
});

async function loadSavedFiles(actId) {
  const { data } = await client.from("activity_files").select("*").eq("activity_id",actId).order("created_at",{ascending:false});
  savedFiles = data||[];
  renderSavedFiles();
}

window.deleteSavedFile = async function(fileId, fileUrl) {
  if (!confirm("Hapus file ini?")) return;
  try { const parts=fileUrl.split("/"+BUCKET+"/"); if(parts[1]) await client.storage.from(BUCKET).remove([decodeURIComponent(parts[1])]); } catch(e){}
  await client.from("activity_files").delete().eq("id",fileId);
  await loadSavedFiles(currentActId);
  await loadActivities(currentActProject);
};

// ===================== REALTIME & INIT =====================
client.channel("projects-rt")
  .on("postgres_changes",{event:"*",schema:"public",table:"projects"},()=>loadProjects())
  .subscribe();

document.getElementById("refreshBtn").addEventListener("click", loadProjects);
setStep(1);
loadProjects();



// ============================================================
//  HAPUS PROYEK
// ============================================================
window.deleteProject = async function(id, name) {
  if (!confirm('Hapus proyek "' + name + '"?\nSemua indikator, aktivitas, dan file terkait juga akan terhapus.')) return;
  // Hapus data terkait secara berurutan
  const { data: indicators } = await client.from('project_indicators').select('id').eq('project_name', name);
  const indIds = (indicators||[]).map(i => i.id);
  if (indIds.length) {
    await client.from('indicator_evidence').delete().in('indicator_id', indIds);
    await client.from('indicator_updates').delete().in('indicator_id', indIds);
  }
  await client.from('project_indicators').delete().eq('project_name', name);
  const { data: activities } = await client.from('project_activities').select('id').eq('project_name', name);
  const actIds = (activities||[]).map(a => a.id);
  if (actIds.length) {
    await client.from('activity_notes').delete().in('activity_id', actIds);
    // Hapus file dari storage
    const { data: files } = await client.from('activity_files').select('file_path').in('activity_id', actIds);
    if (files && files.length) {
      await client.storage.from('activity-files').remove(files.map(f => f.file_path));
    }
    await client.from('activity_files').delete().in('activity_id', actIds);
  }
  await client.from('project_activities').delete().eq('project_name', name);
  const { error } = await client.from('projects').delete().eq('id', id);
  if (error) { alert('Gagal hapus proyek: ' + error.message); return; }
  if (currentProject && currentProject.name === name) {
    currentProject = null;
    switchTab('dashboard');
  }
  await loadProjects();
};

// ============================================================
//  CLEAR RIWAYAT INDIKATOR
// ============================================================
window.clearIndicatorHistory = async function(indicatorId) {
  if (!confirm('Hapus semua riwayat capaian indikator ini?\nData tidak bisa dikembalikan.')) return;
  const { error } = await client.from('indicator_updates').delete().eq('indicator_id', indicatorId);
  if (error) { alert('Gagal hapus riwayat: ' + error.message); return; }

  // Reload data terbaru
  const { data: projects } = await client.from('projects').select('*').order('updated_at', { ascending: false });
  const { data: inds }     = await client.from('project_indicators').select('*');
  const { data: upds }     = await client.from('indicator_updates').select('*').order('created_at', { ascending: true });
  const { data: evids }    = await client.from('indicator_evidence').select('*');
  const { data: actsCnt }  = await client.from('project_activities').select('project_name');

  const items = (projects||[]).map(proj => ({
    ...proj,
    project_indicators: (inds||[]).filter(ind => ind.project_name === proj.name).map(ind => ({
      ...ind,
      indicator_updates:  (upds||[]).filter(u => u.indicator_id === ind.id),
      indicator_evidence: (evids||[]).filter(e => e.indicator_id === ind.id)
    })),
    activityCount: (actsCnt||[]).filter(a => a.project_name === proj.name).length
  }));

  window._allProjects = items;
  renderStats(items);
  renderCards(items);
  renderTable(items);
  renderSidebarSubmenu(items);

  // Re-render panel detail yang sedang terbuka
  if (currentProject) {
    const updated = items.find(p => p.name === currentProject.name);
    if (updated) {
      currentProject = updated;
      renderIndicatorUpdatePanel(updated);
    }
  }
};

// ============================================================
//  SIDEBAR SUBMENU PROYEK
// ============================================================
function renderSidebarSubmenu(items) {
  const submenu = document.getElementById('projectSubmenu');
  if (!submenu) return;
  if (!items.length) { submenu.innerHTML = ''; return; }
  submenu.innerHTML = items.map((item, i) => {
    const cls = item.status.toLowerCase().replace(/ /g, '-');
    const shortName = item.name.length > 22 ? item.name.substring(0, 22) + '…' : item.name;
    return '<li onclick="openProjectDetail(window._allProjects[' + i + '])">' +
           '<span class="submenu-dot dot-' + cls + '"></span>' +
           '<span class="submenu-name" title="' + item.name.replace(/"/g,'&quot;') + '">' + shortName + '</span>' +
           '</li>';
  }).join('');
}

// ============================================================
//  PANEL SCROLL — patch tambahan untuk split view
// ============================================================
function initPanelScrollShadow() {
  document.querySelectorAll('.panel-scroll').forEach(function(el) {
    var wrap = el.closest('.panel-scroll-wrap');
    if (!wrap) return;
    function check() {
      wrap.classList.toggle('at-bottom', el.scrollHeight - el.scrollTop - el.clientHeight < 10);
    }
    el.addEventListener('scroll', check);
    check();
  });
}

function scrollToNewActivity() {
  var area = document.getElementById('actScrollArea');
  if (area) setTimeout(function(){ area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' }); }, 150);
}

// Jalankan scroll shadow setiap kali tab detail dibuka
(function() {
  var _orig = window.switchTab;
  window.switchTab = function(tab) {
    _orig(tab);
    if (tab === 'detail') setTimeout(initPanelScrollShadow, 300);
  };
})();

// Observer: update badge counter otomatis saat activity list berubah
(function() {
  var observer = new MutationObserver(function() {
    var list = document.getElementById('activityListDetail');
    var counter = document.getElementById('activityCount');
    if (list && counter) {
      var count = list.querySelectorAll('.activity-card').length;
      counter.textContent = count + ' aktivitas';
    }
    var indList = document.getElementById('indicatorUpdateList');
    var indCounter = document.getElementById('indCount');
    if (indList && indCounter) {
      var indCount = indList.querySelectorAll('.ind-update-card, .achievement-card').length;
      indCounter.textContent = indCount + ' indikator';
    }
    setTimeout(initPanelScrollShadow, 100);
  });
  document.addEventListener('DOMContentLoaded', function() {
    var actList = document.getElementById('activityListDetail');
    var indList = document.getElementById('indicatorUpdateList');
    if (actList) observer.observe(actList, { childList: true, subtree: true });
    if (indList) observer.observe(indList, { childList: true, subtree: true });
    initPanelScrollShadow();
  });
})();
