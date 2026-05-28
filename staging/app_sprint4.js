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
async function _loadStaffToSelect(selectElId) {
    const selectEl = document.getElementById(selectElId);
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">-- Pilih Staff --</option>';
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
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Gagal memuat staff";
        selectEl.appendChild(opt);
    }
}

async function loadStaffDropdown() {
    await _loadStaffToSelect("act-pic");
}

async function loadStaffDropdownForSubTask() {
    await _loadStaffToSelect("sub-task-pic");
}
