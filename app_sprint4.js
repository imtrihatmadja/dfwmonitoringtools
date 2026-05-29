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

// ==================== PATCH FINAL SUB-AKTIVITAS INLINE ====================
(function () {
  function escHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function loadStaffOptionsForSubActivity() {
    const selectEl = document.getElementById("sub-task-pic");
    if (!selectEl) return;

    selectEl.innerHTML = '<option value="">-- Belum Ditentukan --</option>';

    try {
      const { data, error } = await client
        .from("staff_roster")
        .select("staff_name")
        .eq("is_active", true)
        .order("staff_name", { ascending: true });

      if (error) throw error;

      (data || []).forEach((staff) => {
        const opt = document.createElement("option");
        opt.value = staff.staff_name;
        opt.textContent = staff.staff_name;
        selectEl.appendChild(opt);
      });
    } catch (e) {
      console.error("loadStaffOptionsForSubActivity error:", e);
    }
  }

  function renderSubActivityItems(items) {
    if (!items || !items.length) {
      return `
        <div class="history-empty" style="font-size:12px;color:#94a3b8;">
          Belum ada sub-aktivitas.
        </div>
      `;
    }

    return items
      .map((item) => {
        const statusColor =
          item.status === "Selesai"
            ? "#16a34a"
            : item.status === "Sedang Dikerjakan"
            ? "#2563eb"
            : "#f59e0b";

        const priorityColor =
          item.priority === "High"
            ? "#dc2626"
            : item.priority === "Normal"
            ? "#d97706"
            : "#64748b";

        return `
          <div style="border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
              <div style="font-size:13px;font-weight:700;color:#0f172a;">
                ${escHtml(item.title || "Tanpa Judul")}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${statusColor}18;color:${statusColor};font-weight:700;">
                  ${escHtml(item.status || "-")}
                </span>
                <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${priorityColor}18;color:${priorityColor};font-weight:700;">
                  ${escHtml(item.priority || "-")}
                </span>
              </div>
            </div>

            ${
              item.description
                ? `
              <div style="font-size:12px;color:#475569;line-height:1.5;margin-top:6px;">
                ${escHtml(item.description)}
              </div>
            `
                : ""
            }

            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#64748b;">
              <span><strong>PIC:</strong> ${escHtml(item.pic || "-")}</span>
              <span><strong>Deadline:</strong> ${escHtml(item.due_date || "-")}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function fetchSubActivities(actId) {
    const { data, error } = await client
      .from("sub_activities")
      .select("*")
      .eq("activity_id", actId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  window.closeSubActivityModal = function () {
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.add("hidden");
  };

  window.openSubActivityModal = async function (actId) {
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
    if (statusEl) statusEl.value = "Belum Mulai";
    if (priorityEl) priorityEl.value = "Low";
    if (dueEl) dueEl.value = "";

    await loadStaffOptionsForSubActivity();

    if (picEl) picEl.value = "";

    await window.loadSubActivities(actId);

    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.remove("hidden");
  };

  window.loadSubActivities = async function (actId) {
    const listEl = document.getElementById("sub-activity-list");
    if (!actId || !listEl) return;

    listEl.innerHTML = `
      <div class="history-empty" style="font-size:12px;color:#94a3b8;">
        Memuat sub-aktivitas...
      </div>
    `;

    try {
      const items = await fetchSubActivities(actId);
      listEl.innerHTML = renderSubActivityItems(items);
    } catch (e) {
      console.error("loadSubActivities error:", e);
      listEl.innerHTML = `
        <div class="history-empty" style="font-size:12px;color:#dc2626;">
          Gagal memuat sub-aktivitas.
        </div>
      `;
    }
  };

  window.renderSubActivitiesInline = async function (actId) {
    const listEl = document.getElementById(`sub-inline-${actId}`);
    if (!actId || !listEl) return;

    listEl.innerHTML = `
      <div class="history-empty" style="font-size:12px;color:#94a3b8;">
        Memuat sub-aktivitas...
      </div>
    `;

    try {
      const items = await fetchSubActivities(actId);
      listEl.innerHTML = renderSubActivityItems(items);
    } catch (e) {
      console.error("renderSubActivitiesInline error:", e);
      listEl.innerHTML = `
        <div class="history-empty" style="font-size:12px;color:#dc2626;">
          Gagal memuat sub-aktivitas.
        </div>
      `;
    }
  };

  window.refreshAllSubActivitiesInline = async function () {
    if (!Array.isArray(window.allActivities) || !window.allActivities.length) return;

    for (const act of window.allActivities) {
      await window.renderSubActivitiesInline(act.id);
    }
  };

  function ensureInlineContainer(actId) {
    const bodyEl = document.getElementById(`actbody-${actId}`);
    if (!bodyEl) return;

    if (document.getElementById(`sub-inline-wrap-${actId}`)) return;

    const wrap = document.createElement("div");
    wrap.id = `sub-inline-wrap-${actId}`;
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
      <div class="act-note-title" style="margin-bottom:8px;">Sub-Aktivitas</div>
      <div id="sub-inline-${actId}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">
        <div class="history-empty" style="font-size:12px;color:#94a3b8;">
          Memuat sub-aktivitas...
        </div>
      </div>
    `;

    bodyEl.appendChild(wrap);
  }

  function ensureAllInlineContainers() {
    if (!Array.isArray(window.allActivities) || !window.allActivities.length) return;
    window.allActivities.forEach((act) => ensureInlineContainer(act.id));
  }

  function ensureSubActivityButtons() {
    document.querySelectorAll(".activity-card").forEach((card) => {
      const actId = (card.id || "").replace("actcard-", "");
      if (!actId) return;

      const actionsDiv = card.querySelector(".activity-card-actions");
      if (!actionsDiv) return;

      if (actionsDiv.querySelector(".btn-sub-activity")) return;

      const btn = document.createElement("button");
      btn.className = "btn-secondary btn-sm btn-sub-activity";
      btn.style.fontSize = "11px";
      btn.style.padding = "4px 8px";
      btn.innerHTML = '<i class="fa-solid fa-clone"></i> Sub-Aktivitas';
      btn.onclick = function (event) {
        event.stopPropagation();
        window.openSubActivityModal(actId);
      };

      actionsDiv.appendChild(btn);
    });
  }

  window.saveSubActivity = async function () {
    const actIdEl = document.getElementById("sub-task-id");
    const titleEl = document.getElementById("sub-task-title");
    const descEl = document.getElementById("sub-task-desc");
    const picEl = document.getElementById("sub-task-pic");
    const statusEl = document.getElementById("sub-task-status");
    const priorityEl = document.getElementById("sub-task-priority");
    const dueEl = document.getElementById("sub-task-due");

    if (!actIdEl || !actIdEl.value) {
      alert("ID aktivitas utama tidak ditemukan. Tutup modal lalu buka lagi.");
      return;
    }

    if (!titleEl || !titleEl.value.trim()) {
      alert("Judul Sub-Aktivitas wajib diisi.");
      return;
    }

    const payload = {
      activity_id: actIdEl.value,
      title: titleEl.value.trim(),
      description: descEl ? (descEl.value.trim() || null) : null,
      pic: picEl ? (picEl.value || null) : null,
      status: statusEl ? statusEl.value : "Belum Mulai",
      priority: priorityEl ? priorityEl.value : "Low",
      due_date: dueEl ? (dueEl.value || null) : null
    };

    try {
      const { error } = await client
        .from("sub_activities")
        .insert(payload);

      if (error) {
        console.error("saveSubActivity insert error:", error);
        alert("Gagal menyimpan sub-aktivitas: " + (error.message || "unknown error"));
        return;
      }

      if (titleEl) titleEl.value = "";
      if (descEl) descEl.value = "";
      if (picEl) picEl.value = "";
      if (statusEl) statusEl.value = "Belum Mulai";
      if (priorityEl) priorityEl.value = "Low";
      if (dueEl) dueEl.value = "";

      await window.loadSubActivities(actIdEl.value);
      await window.renderSubActivitiesInline(actIdEl.value);
    } catch (e) {
      console.error("saveSubActivity exception:", e);
      alert("Terjadi kesalahan saat menyimpan: " + e.message);
    }
  };

  const originalRenderActivityListDetail = window.renderActivityListDetail;
  if (typeof originalRenderActivityListDetail === "function") {
    window.renderActivityListDetail = function (...args) {
      originalRenderActivityListDetail.apply(this, args);

      setTimeout(async function () {
        ensureSubActivityButtons();
        ensureAllInlineContainers();
        await window.refreshAllSubActivitiesInline();
      }, 80);
    };
  }

  setTimeout(async function () {
    ensureSubActivityButtons();
    ensureAllInlineContainers();
    await window.refreshAllSubActivitiesInline();
  }, 300);
})();

// ==================== FIX DUPLIKAT TOMBOL SUB-AKTIVITAS ====================
(function () {
  function cleanupDuplicateSubActivityButtons() {
    document.querySelectorAll('.activity-card').forEach(function (card) {
      const buttons = card.querySelectorAll('.btn-sub-activity');
      if (!buttons || buttons.length <= 1) return;

      buttons.forEach(function (btn, idx) {
        if (idx > 0) btn.remove();
      });
    });
  }

  const originalRenderActivityListDetailForCleanup = window.renderActivityListDetail;

  if (typeof originalRenderActivityListDetailForCleanup === 'function') {
    window.renderActivityListDetail = function (...args) {
      originalRenderActivityListDetailForCleanup.apply(this, args);

      setTimeout(function () {
        cleanupDuplicateSubActivityButtons();
      }, 50);
    };
  }

  setTimeout(function () {
    cleanupDuplicateSubActivityButtons();
  }, 300);
})();
