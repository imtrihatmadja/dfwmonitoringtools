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
    // Set the act-id in the hidden input
    const subTaskIdEl = document.getElementById("sub-task-id");
    if (subTaskIdEl) subTaskIdEl.value = actId || "";

    // Load staff dropdown for sub-task PIC
    await loadStaffDropdownForSubTask();

    // Show the modal
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.remove("hidden");
};
