// ==================== SPRINT 4 - STAFF WORKLOAD BINDINGS ====================
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

// --- PATCH 8: Open Sub-Aktivitas Modal ---
window.openSubActivityModal = async function(actId) {
    // Reset form fields
    const idEl = document.getElementById("sub-task-id");
    const titleEl = document.getElementById("sub-task-title");
    const descEl = document.getElementById("sub-task-desc");
    const picEl = document.getElementById("sub-task-pic");
    const statusEl = document.getElementById("sub-task-status");
    const priorityEl = document.getElementById("sub-task-priority");
    const dueEl = document.getElementById("sub-task-due");

    if (idEl) idEl.value = actId || "";
    if (titleEl) titleEl.value = "";
    if (descEl) descEl.value = "";
    if (picEl) picEl.value = "";
    if (statusEl) statusEl.value = "Belum Mulai";
    if (priorityEl) priorityEl.value = "Low";
    if (dueEl) dueEl.value = "";

    // Load staff dropdown for sub-task PIC
    const staffSelect = document.getElementById("sub-task-pic");
    if (staffSelect) {
        staffSelect.innerHTML = "<option value=\"\">-- Belum Ditentukan --</option>";
        try {
            const { data, error } = await client
                .from("staff_roster")
                .select("staff_name")
                .eq("is_active", true)
                .order("staff_name", { ascending: true });
            if (!error && data) {
                data.forEach(function(staff) {
                    const opt = document.createElement("option");
                    opt.value = staff.staff_name;
                    opt.textContent = staff.staff_name;
                    staffSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("openSubActivityModal: failed to load staff:", e);
        }
    }

    // Load existing sub-activities list
    await window.loadSubActivities(actId);

    // Show the modal
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.remove("hidden");
};

window.closeSubActivityModal = function() {
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.add("hidden");
};

// --- PATCH 9: Save Sub-Aktivitas ---
window.saveSubActivity = async function() {
    const actIdEl = document.getElementById("sub-task-id");
    const titleEl = document.getElementById("sub-task-title");
    const descEl = document.getElementById("sub-task-desc");
    const picEl = document.getElementById("sub-task-pic");
    const statusEl = document.getElementById("sub-task-status");
    const priorityEl = document.getElementById("sub-task-priority");
    const dueEl = document.getElementById("sub-task-due");

    if (!actIdEl || !actIdEl.value) {
        alert("Parent activity ID missing. Please close and reopen the modal.");
        return;
    }
    if (!titleEl || !titleEl.value.trim()) {
        alert("Judul Sub-Aktivitas wajib diisi.");
        return;
    }

    const payload = {
                activity_id: actIdEl.value,
        title: titleEl.value.trim(),
        description: descEl ? (descEl.value || null) : null,
        pic: picEl ? (picEl.value || null) : null,
        status: statusEl ? statusEl.value : "Belum Mulai",
        priority: priorityEl ? priorityEl.value : "Low",
        due_date: dueEl ? (dueEl.value || null) : null
    };

    try {
        const { data, error } = await client
            .from("sub_activities")
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error("saveSubActivity: insert error:", error);
            alert("Gagal menyimpan sub-aktivitas: " + (error.message || "unknown"));
            return;
        }

        // Clear form
        if (titleEl) titleEl.value = "";
        if (descEl) descEl.value = "";
        if (picEl) picEl.value = "";

        // Reload list
        await window.loadSubActivities(actIdEl.value);
        console.log("saveSubActivity: saved title=", data.title, "id=", data.id);
    } catch (e) {
        console.error("saveSubActivity: exception:", e);
        alert("Terjadi kesalahan saat menyimpan: " + e.message);
    }
};

// --- PATCH 10: Load Sub-Aktivitas List ---
window.loadSubActivities = async function(actId) {
    if (!actId) {
        console.warn("loadSubActivities: missing actId");
        return;
    }
    const listEl = document.getElementById('sub-activity-list');
    if (!listEl) {
        console.warn("loadSubActivities: subActivityList element not found");
        return;
    }

    try {
        const { data, error } = await client
            .from("sub_activities")
            .select("*")
            .eq("activity_id", actId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("loadSubActivities: query error:", error);
            listEl.innerHTML = "<p>Error loading sub-activities.</p>";
            return;
        }

        if (!data || data.length === 0) {
            listEl.innerHTML = "<p>Belum ada sub-aktivitas. Klik \"Tambah Baru\" untuk menambah.</p>";
            return;
        }

        let html = "";
        data.forEach(function(item) {
            html += "<p>";
            html += " <strong>" + (item.title || "Tanpa Judul") + "</strong> <br>";
            html += " Status: " + (item.status || "-") + " | Penanggung Jawab: " + (item.pic || "-") + " | Prioritas: " + (item.priority || "-") + "";
            html += "</p>";
        });
        listEl.innerHTML = html;
        console.log("loadSubActivities: loaded", data.length, "items for activity_id=", actId);
    } catch (e) {
        console.error("loadSubActivities: exception:", e);
        if (listEl) listEl.innerHTML = "<p>Error: " + e.message + "</p>";
    }
};

// --- PATCH 11: Add Sub-Aktivitas button to activity cards ---
(function injectSubActivityButtons() {
    try {
        var origRender = window.renderActivityListDetail;
        if (!origRender) {
            console.warn("PATCH 11: renderActivityListDetail not found on window");
            return;
        }
        window.renderActivityListDetail = function() {
            origRender();
            // Run after DOM is updated
            setTimeout(function() {
                document.querySelectorAll(".activity-actions").forEach(function(actionsDiv) {
                    // Check if Sub-Aktivitas button already exists
                    if (actionsDiv.querySelector(".btn-sub-activity")) return;

                    // Extract act-id from parent card
                    var actId = null;
                    var card = actionsDiv.closest(".activity-card");
                    if (card) actId = card.id.replace("actcard-", "");
                    if (!actId) return;

                    var btn = document.createElement("button");
                    btn.className = "btn-sm btn-sub-activity";
                    btn.textContent = "Sub-Aktivitas";
                    btn.onclick = function() { openSubActivityModal(actId); };
                    actionsDiv.appendChild(btn);
                });
            }, 10);
        };
        console.log("PATCH 11: Sub-Aktivitas button injected into renderActivityListDetail.");
    } catch (e) {
        console.error("PATCH 11: exception:", e);
    }
})();
