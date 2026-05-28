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

// --- PATCH 3: Staff tab tampil di sidebar ---
const staffNav = document.querySelector('[data-tab="staff"]');
if (staffNav) {
    staffNav.addEventListener("click", function() {
        switchTab("staff");
    });
}
console.log("Sprint 4 - Staff Workload bindings loaded.");

// --- PATCH 4: Load Staff Dropdown di Modal Aktivitas ---
async function _loadStaffToSelect(selectElId) {
    const selectEl = document.getElementById(selectElId);
    if (!selectEl) {
        console.log("_loadStaffToSelect: element not found:", selectElId);
        return;
    }
    const placeholder = selectElId === "sub-task-pic" ? "-- Belum Ditentukan --" : "-- Pilih Staff --";
    selectEl.innerHTML = '<option value="">' + placeholder + '</option>';
    try {
        const { data, error } = await client.from("staff_roster")
            .select("staff_name")
            .eq("is_active", true)
            .order("staff_name", { ascending: true });
        if (error) {
            console.error("_loadStaffToSelect: query error:", error);
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Error loading staff";
            selectEl.appendChild(opt);
            return;
        }
        if (!data || data.length === 0) {
            console.log("_loadStaffToSelect: no staff data returned");
            return;
        }
        console.log("_loadStaffToSelect: loaded", data.length, "staff");
        data.forEach(function(staff) {
            const opt = document.createElement("option");
            opt.value = staff.staff_name;
            opt.textContent = staff.staff_name;
            selectEl.appendChild(opt);
        });
    } catch (e) {
        console.error("_loadStaffToSelect: exception:", e);
    }
}

async function loadStaffDropdown() {
    await _loadStaffToSelect("act-pic");
}

async function loadStaffDropdownForSubTask() {
    await _loadStaffToSelect("sub-task-pic");
}

// --- PATCH 5: Hook ke openActModal untuk load staff dropdown ---
const _originalOpenActModal = window.openActModal;
window.openActModal = async function(id) {
    await _originalOpenActModal(id);
    await loadStaffDropdown();
    if (id) {
        const act = allActivities.find(function(a) { return a.id === id; });
        if (act && act.pic) {
            const selectEl = document.getElementById("act-pic");
            if (selectEl) selectEl.value = act.pic;
        }
    }
};

// --- PATCH 6: Hook ke Sub-Aktivitas button untuk buka modal & load staff ---
const subActBtn = document.getElementById("add-sub-activity-btn");
if (subActBtn) {
    subActBtn.addEventListener("click", async function(e) {
        e.preventDefault();
        await loadStaffDropdownForSubTask();
        const modal = document.getElementById("subActivityModalOverlay");
        if (modal) modal.classList.remove("hidden");
    });
}

// --- PATCH 7: Tutup Sub-Aktivitas modal ---
window.closeSubActivityModal = function() {
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.add("hidden");
    
};
console.log("Sprint 4 - Staff dropdown & Sub-Aktivitas hooks loaded.");


// --- PATCH 8: Fungsi openSubActivityModal ---
window.openSubActivityModal = async function(actId) {
    // --- PATCH 9: Simpan Sub-Aktivitas ke Supabase ---
window.saveSubActivity = async function() {
    const actId = document.getElementById("sub-task-id");
    const titleEl = document.getElementById("sub-task-title");
    const descEl = document.getElementById("sub-task-desc");
    const picEl = document.getElementById("sub-task-pic");
    const statusEl = document.getElementById("sub-task-status");
    const priorityEl = document.getElementById("sub-task-priority");
    const dueEl = document.getElementById("sub-task-due");

    if (!actId || !actId.value) {
        console.error("saveSubActivity: missing activity_id");
        alert("Error: activity_id tidak ditemukan");
        return;
    }
    const payload = {
        activity_id: actId.value,
        title: (titleEl && titleEl.value) ? titleEl.value.trim() : "",
        description: (descEl && descEl.value) ? descEl.value.trim() : null,
        pic: (picEl && picEl.value) ? picEl.value : null,
        status: (statusEl && statusEl.value) ? statusEl.value : "Belum Mulai",
        priority: (priorityEl && priorityEl.value) ? priorityEl.value : "Low",
        due_date: (dueEl && dueEl.value) ? dueEl.value : null
    };

    if (!payload.title) {
        console.error("saveSubActivity: title is empty");
        alert("Judul Sub-Aktivitas wajib diisi");
        return;
    }

    console.log("saveSubActivity: inserting:", payload);
    try {
        const { data, error } = await client
            .from("sub_activities")
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error("saveSubActivity: insert error:", error);
            alert("Gagal menyimpan sub-aktivitas: " + (error.message || "Unknown error"));
            return;
        }

        console.log("saveSubActivity: saved, id:", data.id);
        alert("Sub-Aktivitas berhasil disimpan");

        // Clear form
        if (titleEl) titleEl.value = "";
        if (descEl) descEl.value = "";
        if (picEl) picEl.value = "";
        if (statusEl) statusEl.value = "Belum Mulai";
        if (priorityEl) priorityEl.value = "Low";
        if (dueEl) dueEl.value = "";

        // Reload sub-activity list
        await window.loadSubActivities(actId.value);

        // Close modal
        window.closeSubActivityModal();
    } catch (e) {
        console.error("saveSubActivity: exception:", e);
        alert("Terjadi kesalahan saat menyimpan");
    }
};

const saveBtn = document.getElementById("saveSubActivityBtn");
if (saveBtn) {
    saveBtn.addEventListener("click", window.saveSubActivity);
}

// --- PATCH 10: Load Daftar Sub-Aktivitas dari Supabase ---
window.loadSubActivities = async function(actId) {
    const listEl = document.getElementById("sub-activity-list");
    if (!listEl) {
        console.log("loadSubActivities: list element not found");
        return;
    }
    if (!actId) {
        actId = (document.getElementById("sub-task-id") || {}).value;
    }
    if (!actId) {
        listEl.innerHTML = '<p style="color:#888;padding:10px">Tidak ada sub-aktivitas.</p>';
        return;
    }

    listEl.innerHTML = '<p style="color:#888;padding:10px">Memuat sub-aktivitas...</p>';
    try {
        const { data, error } = await client
            .from("sub_activities")
            .select("*")
            .eq("activity_id", actId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("loadSubActivities: query error:", error);
            listEl.innerHTML = '<p style="color:#d93025;padding:10px">Gagal memuat sub-aktivitas.</p>';
            return;
        }

        if (!data || data.length === 0) {
            listEl.innerHTML = '<p style="color:#888;padding:10px">Belum ada sub-aktivitas. Klik "+ Tambah Baru" untuk menambah.</p>';
            return;
        }

        console.log("loadSubActivities: loaded", data.length, "sub-activities");

        let html = '';
        data.forEach(function(sa) {
            var statusColor = "#888";
            if (sa.status === "Sedang Berjalan") statusColor = "#f59e0b";
            else if (sa.status === "Selesai") statusColor = "#10b981";
            else if (sa.status === "Belum Mulai") statusColor = "#6b7280";

            var priorityColor = "#6b7280";
            if (sa.priority === "High") priorityColor = "#ef4444";
            else if (sa.priority === "Medium") priorityColor = "#f59e0b";
            else if (sa.priority === "Low") priorityColor = "#10b981";

            html += '<div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px;padding:12px;">';
            html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">';
            html += '<span style="font-weight:600;font-size:14px;">' + (sa.title || "Tanpa Judul") + '</span>';
            html += '<span style="font-size:12px;color:' + statusColor + ';padding:2px 8px;border-radius:12px;background:' + statusColor + '22;">' + (sa.status || "Belum Mulai") + '</span>';
            html += '</div>';
            if (sa.description) {
                html += '<p style="font-size:13px;color:#6b7280;margin:4px 0 8px 0;">' + sa.description + '</p>';
            }
            html += '<div style="display:flex;gap:12px;font-size:12px;">';
            if (sa.pic) {
                html += '<span style="color:#6b7280;">PIC: <strong>' + sa.pic + '</strong></span>';
            }
            html += '<span style="color:' + priorityColor + ';">Prioritas: ' + (sa.priority || "Low") + '</span>';
            if (sa.due_date) {
                html += '<span style="color:#6b7280;">Jatuh Tempo: ' + sa.due_date + '</span>';
            }
            html += '</div>';
            html += '</div>';
        });

        listEl.innerHTML = html;
    } catch (e) {
        console.error("loadSubActivities: exception:", e);
        listEl.innerHTML = '<p style="color:#d93025;padding:10px">Error: ' + e.message + '</p>';
    }
};
    // Set the act-id in the hidden input
    const subTaskIdEl = document.getElementById("sub-task-id");
    if (subTaskIdEl) subTaskIdEl.value = actId || "";

    // Load staff dropdown for sub-task PIC
    await loadStaffDropdownForSubTask();

    // Show the modal
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.remove("hidden");
};
