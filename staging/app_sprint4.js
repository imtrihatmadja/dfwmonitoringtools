// ===================== SPRINT 4 - STAFF WORKLOAD BINDINGS =====================
// File ini berisi binding Sprint 4 yang menghubungkan fitur Staff & Beban Kerja
// ke navigasi utama. Diload SETELAH app.js.

// --- PATCH 1: Tambahkan 'staff' ke tabTitles ---
tabTitles.staff = ["Staff & Beban Kerja", "Pantau beban tugas dan aktivitas per staff"];

// --- PATCH 2: Tambahkan handler ke switchTab ---
const _originalSwitchTab = window.switchTab;
window.switchTab = function(tab) {
    _originalSwitchTab(tab);
    if (tab === "staff") {
        loadStaffWorkload();
    }
};

// --- PATCH 3: Staff tab tama di sidebar ---
const staffNav = document.querySelector('[data-tab="staff"]');
if (staffNav) {
    staffNav.addEventListener("click", function() {
        switchTab("staff");
    });
}

console.log("Sprint 4 - Staff Workload bindings loaded.");

// --- PATCH 4: Load Staff Dropdown di Modal Aktivitas ---
async function loadStaffDropdown() {
  const selectEl = document.getElementById("act-pic");
  if (!selectEl) return;

  // Jika sudah select, tunggu sebentar agar DOM siap
  setTimeout(async () => {
    selectEl.innerHTML = "<option value=\"\">-- Pilih Staff --</option>";
    const { data, error } = await client.from("staff_roster")
      .select("staff_name")
      .eq("is_active", true)
      .order("staff_name", { ascending: true });
    if (!error && data) {
      data.forEach(staff => {
        const opt = document.createElement("option");
        opt.value = staff.staff_name;
        opt.textContent = staff.staff_name;
        selectEl.appendChild(opt);
      });
    } else {
      console.error("Error loading staff roster:", error);
      // Fallback: tetap tampilkan sebagai text input dengan error
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Gagal memuat staff";
      selectEl.appendChild(opt);
    }
  }, 100);
}

// Override openActModal untuk trigger load dropdown
const _originalOpenActModal = window.openActModal;
window.openActModal = function (id) {
  if (_originalOpenActModal) {
    _originalOpenActModal(id);
  }
// --- PATCH 5: Sub-Aktivitas (Tasks) di Modal Aktivitas ---

// Variabel state untuk sub-aktivitas
let currentSubActivityId = null;
let currentSubActivityList = [];

// Fungsi load sub-aktivitas dari Supabase
async function loadSubActivities(activityId) {
  currentSubActivityId = activityId;
  const listContainer = document.getElementById("sub-activity-list");
  const addBtn = document.getElementById("add-sub-activity-btn");
  
  if (!listContainer) return;
  if (!activityId) { listContainer.innerHTML = "<p style='color:#aaa;'>Tambah aktivitas dulu untuk menambahkan sub-aktivitas.</p>"); return; }
  
  listContainer.innerHTML = "<p>Memuat...</p>";
  addBtn.disabled = true;
  
  const { data, error } = await client
    .from("project_tasks")
    .select("*")
    .eq("activity_id", activityId)
    .order("sort_order", { ascending: true });
    
  if (error || !data || data.length === 0) {
    listContainer.innerHTML = "<p style='color:#aaa;'>Belum ada sub-aktivitas.</p>";
    addBtn.disabled = false;
    return;
  }
  
  currentSubActivityList = data;
  listContainer.innerHTML = data.map((task, idx) => {
    const statusColor = task.status === 'Selesai' ? '#22c55e' : (task.status === 'Sedang Dikerjakan' ? '#eab308' : '#6b7280');
    const priorityColor = task.priority === 'High' ? '#ef4444' : (task.priority === 'Normal' ? '#eab308' : '#22c55e');
    return `<div class="sub-task-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
      <div style="flex:1;">
        <div style="font-weight:600;">${idx+1}. ${esc(task.title)}</div>
        <div style="font-size:0.85em;color:#666;">
          <span style="background:${priorityColor};color:white;padding:2px 6px;border-radius:4px;font-size:0.75em;">${task.priority}</span>
          <span style="margin:0 6px;"></span>
          <span style="color:${statusColor};border:1px solid ${statusColor};padding:2px 6px;border-radius:4px;font-size:0.75em;">${task.status}</span>
          <span style="margin:0 6px;"></span>
          <span>PIC: ${esc(task.pic)}</span>
          ${task.due_date ? `<span style="margin-left:6px;font-size:0.8em;">| ${fmtDate(task.due_date)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button type="button" onclick="editSubActivity('${task.id}')" class="small-btn" style="padding:4px 8px;font-size:0.8em;">Edit</button>
        <button type="button" onclick="deleteSubActivity('${task.id}');return false;" class="small-btn" style="padding:4px 8px;font-size:0.8em;background:#ef4444;color:white;">Hapus</button>
      </div>
    </div>`;
  }).join("");
  addBtn.disabled = false;
}

// Fungsi buka modal sub-aktivitas
window.openSubActivityModal = function(activityId) {
  document.getElementById("subActivityModalOverlay").classList.remove("hidden");
  loadSubActivities(activityId);
};

// Fungsi tutup modal sub-aktivitas
window.closeSubActivityModal = function() {
  document.getElementById("subActivityModalOverlay").classList.add("hidden");
  clearSubActivityForm();
};

// Bersihkan form sub-aktivitas
function clearSubActivityForm() {
  document.getElementById("sub-task-id").value = "";
  document.getElementById("sub-task-title").value = "";
  document.getElementById("sub-task-desc").value = "";
  document.getElementById("sub-task-pic").value = "";
  document.getElementById("sub-task-status").value = "Belum Mulai";
  document.getElementById("sub-task-priority").value = "Normal";
  document.getElementById("sub-task-due").value = "";
  currentSubActivityId = null;
}

// Edit sub-aktivitas (populate form)
window.editSubActivity = async function(taskId) {
  const { data, error } = await client
    .from("project_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (error || !data) { alert("Gagal memuat sub-aktivitas"); return; }
  document.getElementById("sub-task-id").value = data.id;
  document.getElementById("sub-task-title").value = data.title || "";
  document.getElementById("sub-task-desc").value = data.description || "";
  document.getElementById("sub-task-pic").value = data.pic || "";
  document.getElementById("sub-task-status").value = data.status || "Belum Mulai";
  document.getElementById("sub-task-priority").value = data.priority || "Normal";
  document.getElementById("sub-task-due").value = data.due_date || "";
  document.getElementById("saveSubActivityBtn").textContent = "Update Sub-Aktivitas";
};

// Hapus sub-aktivitas
window.deleteSubActivity = async function(taskId) {
  if (!confirm("Hapus sub-aktivitas ini?")) return;
  const { error } = await client.from("project_tasks").delete().eq("id", taskId);
  if (error) { alert("Gagal menghapus: " + error.message); return; }
  alert("Sub-aktivitas dihapus!");
  loadSubActivities(currentSubActivityId);
};

// Simpan/Update sub-aktivitas
document.getElementById("saveSubActivityBtn").addEventListener("click", async () => {
  const taskId = document.getElementById("sub-task-id").value;
  const activityId = currentSubActivityId;
  const title = document.getElementById("sub-task-title").value.trim();
  const desc = document.getElementById("sub-task-desc").value.trim();
  const pic = document.getElementById("sub-task-pic").value;
  const status = document.getElementById("sub-task-status").value;
  const priority = document.getElementById("sub-task-priority").value;
  const dueDate = document.getElementById("sub-task-due").value || null;
  
  if (!activityId) { alert("Error: Activity ID tidak tersedia"); return; }
  if (!title) { alert("Judul sub-aktivitas wajib diisi"); return; }
  
  const payload = { activity_id: activityId, title, description: desc, pic, status, priority, due_date: dueDate };
  
  let result;
  if (taskId) {
    result = await client.from("project_tasks").update(payload).eq("id", taskId);
  } else {
    payload.sort_order = await client.from("project_tasks").select("id", { count: 'exact' }).eq("activity_id", activityId).then(r => (r.data?.length || 0) + 1);
    result = await client.from("project_tasks").insert(payload);
  }
  
  if (result.error) { alert("Gagal menyimpan: " + result.error.message); return; }
  alert(taskId ? "Sub-aktivitas updated!" : "Sub-aktivitas ditambahkan!");
  clearSubActivityForm();
  document.getElementById("saveSubActivityBtn").textContent = "Tambah Sub-Aktivitas";
  loadSubActivities(activityId);
});

// Tambah sub-aktivitas button
document.getElementById("add-sub-activity-btn")?.addEventListener("click", () => {
  clearSubActivityForm();
  document.getElementById("saveSubActivityBtn").textContent = "Tambah Sub-Aktivitas";
});

// Override closeActModal untuk refresh jika ada perubahan
const _originalCloseActModal = window.closeActModal;
// closeActModal direload activities otomatis oleh app.js, jadi tidak perlu override disini

// tambah button ke activity detail view - akan di-inject saat render
// Button ini akan ditambahkan ke index.html HTML structure
console.log("Sprint 4 - PATCH 5: Sub-Activity bindings loaded.");
  // Setelah modal terbuka, load dropdown staff
  loadStaffDropdown();
};
