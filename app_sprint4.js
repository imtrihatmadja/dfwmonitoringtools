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

// ==================== FINAL FIX: SUB-AKTIVITAS EDIT + DELETE WORKING ====================
(function () {
  function escHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getSubEls() {
    return {
      parentIdEl: document.getElementById("sub-task-id"),
      editIdEl: document.getElementById("sub-task-edit-id"),
      titleEl: document.getElementById("sub-task-title"),
      descEl: document.getElementById("sub-task-desc"),
      picEl: document.getElementById("sub-task-pic"),
      statusEl: document.getElementById("sub-task-status"),
      priorityEl: document.getElementById("sub-task-priority"),
      dueEl: document.getElementById("sub-task-due"),
      saveBtnEl: document.getElementById("saveSubActivityBtn"),
      listEl: document.getElementById("sub-activity-list")
    };
  }

  async function loadStaffOptions(selectedValue) {
    const { picEl } = getSubEls();
    if (!picEl) return;

    picEl.innerHTML = '<option value="">-- Belum Ditentukan --</option>';

    const { data, error } = await client
      .from("staff_roster")
      .select("staff_name")
      .eq("is_active", true)
      .order("staff_name", { ascending: true });

    if (error) {
      console.error("loadStaffOptions error:", error);
      return;
    }

    (data || []).forEach(function (staff) {
      const opt = document.createElement("option");
      opt.value = staff.staff_name;
      opt.textContent = staff.staff_name;
      picEl.appendChild(opt);
    });

    if (selectedValue) picEl.value = selectedValue;
  }

  function resetSubForm(parentActivityId) {
    const {
      parentIdEl, editIdEl, titleEl, descEl, picEl,
      statusEl, priorityEl, dueEl, saveBtnEl
    } = getSubEls();

    if (parentIdEl) parentIdEl.value = parentActivityId || "";
    if (editIdEl) editIdEl.value = "";
    if (titleEl) titleEl.value = "";
    if (descEl) descEl.value = "";
    if (picEl) picEl.value = "";
    if (statusEl) statusEl.value = "Belum Mulai";
    if (priorityEl) priorityEl.value = "Low";
    if (dueEl) dueEl.value = "";
    if (saveBtnEl) saveBtnEl.textContent = "Tambah Sub-Aktivitas";
  }

  function renderSubList(items, actId) {
    if (!items || !items.length) {
      return `
        <div class="history-empty" style="font-size:12px;color:#94a3b8;">
          Belum ada sub-aktivitas.
        </div>
      `;
    }

    return items.map(function (item) {
      return `
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start;">
            <div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">
                ${escHtml(item.title || "Tanpa Judul")}
              </div>
              ${item.description ? `
                <div style="font-size:12px;color:#475569;line-height:1.5;margin-top:4px;">
                  ${escHtml(item.description)}
                </div>
              ` : ""}
              <div style="font-size:11px;color:#64748b;margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;">
                <span><strong>PIC:</strong> ${escHtml(item.pic || "-")}</span>
                <span><strong>Status:</strong> ${escHtml(item.status || "-")}</span>
                <span><strong>Prioritas:</strong> ${escHtml(item.priority || "-")}</span>
                <span><strong>Jatuh Tempo:</strong> ${escHtml(item.due_date || "-")}</span>
              </div>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button
                type="button"
                class="btn-secondary btn-sm"
                onclick="event.stopPropagation(); editSubActivity('${item.id}', '${actId}')">
                <i class="fa-solid fa-pen-to-square"></i> Edit
              </button>
              <button
                type="button"
                class="btn-danger btn-sm"
                onclick="event.stopPropagation(); deleteSubActivity('${item.id}', '${actId}')">
                <i class="fa-solid fa-trash"></i> Hapus
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.loadSubActivities = async function (actId) {
    const { listEl } = getSubEls();
    if (!actId || !listEl) return;

    listEl.innerHTML = `
      <div class="history-empty" style="font-size:12px;color:#94a3b8;">
        Memuat sub-aktivitas...
      </div>
    `;

    try {
      const { data, error } = await client
        .from("sub_activities")
        .select("*")
        .eq("activity_id", actId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      listEl.innerHTML = renderSubList(data || [], actId);
    } catch (e) {
      console.error("loadSubActivities error:", e);
      listEl.innerHTML = `
        <div class="history-empty" style="font-size:12px;color:#dc2626;">
          Gagal memuat sub-aktivitas: ${escHtml(e.message || "unknown error")}
        </div>
      `;
    }
  };

  window.openSubActivityModal = async function (actId) {
    resetSubForm(actId);
    await loadStaffOptions("");
    await window.loadSubActivities(actId);

    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.remove("hidden");
  };

  window.closeSubActivityModal = function () {
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.add("hidden");
  };

  window.editSubActivity = async function (subId, actId) {
    try {
      const { data, error } = await client
        .from("sub_activities")
        .select("*")
        .eq("id", subId)
        .single();

      if (error) throw error;
      if (!data) {
        alert("Data sub-aktivitas tidak ditemukan.");
        return;
      }

      const {
        parentIdEl, editIdEl, titleEl, descEl, picEl,
        statusEl, priorityEl, dueEl, saveBtnEl
      } = getSubEls();

      if (parentIdEl) parentIdEl.value = actId || data.activity_id || "";
      if (editIdEl) editIdEl.value = data.id || "";
      if (titleEl) titleEl.value = data.title || "";
      if (descEl) descEl.value = data.description || "";
      if (statusEl) statusEl.value = data.status || "Belum Mulai";
      if (priorityEl) priorityEl.value = data.priority || "Low";
      if (dueEl) dueEl.value = data.due_date || "";

      await loadStaffOptions(data.pic || "");
      if (picEl) picEl.value = data.pic || "";

      if (saveBtnEl) saveBtnEl.textContent = "Update Sub-Aktivitas";

      const modal = document.getElementById("subActivityModalOverlay");
      if (modal) modal.classList.remove("hidden");
    } catch (e) {
      console.error("editSubActivity error:", e);
      alert("Gagal memuat data edit: " + (e.message || "unknown error"));
    }
  };

  window.saveSubActivity = async function () {
    const {
      parentIdEl, editIdEl, titleEl, descEl, picEl,
      statusEl, priorityEl, dueEl, saveBtnEl
    } = getSubEls();

    const activityId = parentIdEl?.value || "";
    const editId = editIdEl?.value || "";
    const title = titleEl?.value?.trim() || "";

    if (!activityId) {
      alert("Parent activity ID tidak ditemukan.");
      return;
    }

    if (!title) {
      alert("Judul Sub-Aktivitas wajib diisi.");
      return;
    }

    const payload = {
      activity_id: activityId,
      title: title,
      description: descEl?.value?.trim() || null,
      pic: picEl?.value || null,
      status: statusEl?.value || "Belum Mulai",
      priority: priorityEl?.value || "Low",
      due_date: dueEl?.value || null
    };

    try {
      if (saveBtnEl) {
        saveBtnEl.disabled = true;
        saveBtnEl.textContent = editId ? "Mengupdate..." : "Menyimpan...";
      }

      let error = null;

      if (editId) {
        ({ error } = await client
          .from("sub_activities")
          .update(payload)
          .eq("id", editId));
      } else {
        ({ error } = await client
          .from("sub_activities")
          .insert(payload));
      }

      if (error) throw error;

      resetSubForm(activityId);
      await loadStaffOptions("");
      await window.loadSubActivities(activityId);

      if (typeof window.renderSubActivitiesInline === "function") {
        await window.renderSubActivitiesInline(activityId);
      }
    } catch (e) {
      console.error("saveSubActivity error:", e);
      alert("Gagal menyimpan sub-aktivitas: " + (e.message || "unknown error"));
    } finally {
      if (saveBtnEl) {
        saveBtnEl.disabled = false;
        saveBtnEl.textContent = editId ? "Update Sub-Aktivitas" : "Tambah Sub-Aktivitas";
      }
    }
  };

  window.deleteSubActivity = async function (subId, actId) {
    if (!confirm("Hapus sub-aktivitas ini?")) return;

    try {
      const { error } = await client
        .from("sub_activities")
        .delete()
        .eq("id", subId);

      if (error) throw error;

      const { editIdEl } = getSubEls();
      if (editIdEl && editIdEl.value === String(subId)) {
        resetSubForm(actId);
        await loadStaffOptions("");
      }

      await window.loadSubActivities(actId);

      if (typeof window.renderSubActivitiesInline === "function") {
        await window.renderSubActivitiesInline(actId);
      }
    } catch (e) {
      console.error("deleteSubActivity error:", e);
      alert("Gagal menghapus sub-aktivitas: " + (e.message || "unknown error"));
    }
  };
})();

// --- PATCH 11: DISABLED ---
// Tombol Sub-Aktivitas sudah dirender langsung oleh app.js.
// Jadi injector lama dinonaktifkan agar tidak membuat tombol ganda.
(function disableLegacySubActivityInjector() {
  console.log("PATCH 11 disabled: using native Sub-Aktivitas button from app.js only.");
})();


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

// ==================== FINAL FIX: SINGLE SUB-ACTIVITY BUTTON ====================
(function () {
  function keepOnlyNativeSubActivityButton() {
    const root = document.getElementById("activityListDetail");
    if (!root) return;

    root.querySelectorAll(".activity-card").forEach(function (card) {
      const buttons = Array.from(card.querySelectorAll(".btn-sub-activity"));
      if (buttons.length <= 1) return;

      const nativeBtn =
        buttons.find(function (btn) {
          return !!btn.getAttribute("onclick");
        }) || buttons[0];

      buttons.forEach(function (btn) {
        if (btn !== nativeBtn) btn.remove();
      });
    });
  }

  function bindObserver() {
    const root = document.getElementById("activityListDetail");
    if (!root) {
      setTimeout(bindObserver, 300);
      return;
    }

    keepOnlyNativeSubActivityButton();

    if (window.__subActivityButtonObserver) {
      window.__subActivityButtonObserver.disconnect();
    }

    window.__subActivityButtonObserver = new MutationObserver(function () {
      keepOnlyNativeSubActivityButton();
    });

    window.__subActivityButtonObserver.observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindObserver);
  } else {
    bindObserver();
  }

  setTimeout(bindObserver, 500);
  setTimeout(keepOnlyNativeSubActivityButton, 1000);
})();

// ==================== FINAL V2: SUB-AKTIVITAS INLINE + EDIT + HAPUS ====================
(function () {
  const SUB_ACTIVITY_MODAL_LIST_ID = "sub-activity-list";
  const SUB_ACTIVITY_SAVE_BTN_ID = "saveSubActivityBtn";

  function escHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getSubActivityFormEls() {
    return {
      actIdEl: document.getElementById("sub-task-id"),
      titleEl: document.getElementById("sub-task-title"),
      descEl: document.getElementById("sub-task-desc"),
      picEl: document.getElementById("sub-task-pic"),
      statusEl: document.getElementById("sub-task-status"),
      priorityEl: document.getElementById("sub-task-priority"),
      dueEl: document.getElementById("sub-task-due"),
      saveBtnEl: document.getElementById(SUB_ACTIVITY_SAVE_BTN_ID)
    };
  }

  function resetSubActivityForm(actId) {
    const { actIdEl, titleEl, descEl, picEl, statusEl, priorityEl, dueEl, saveBtnEl } = getSubActivityFormEls();

    if (actIdEl) actIdEl.value = actId || "";
    if (titleEl) titleEl.value = "";
    if (descEl) descEl.value = "";
    if (picEl) picEl.value = "";
    if (statusEl) statusEl.value = "Belum Mulai";
    if (priorityEl) priorityEl.value = "Low";
    if (dueEl) dueEl.value = "";

    window.currentEditingSubActivityId = null;

    if (saveBtnEl) {
      saveBtnEl.textContent = "Tambah Sub-Aktivitas";
    }
  }

  async function loadStaffOptionsForSubActivity(selectedValue) {
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

      (data || []).forEach(function (staff) {
        const opt = document.createElement("option");
        opt.value = staff.staff_name;
        opt.textContent = staff.staff_name;
        selectEl.appendChild(opt);
      });

      if (selectedValue) {
        selectEl.value = selectedValue;
      }
    } catch (e) {
      console.error("loadStaffOptionsForSubActivity error:", e);
    }
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

  async function fetchSingleSubActivity(subActivityId) {
    const { data, error } = await client
      .from("sub_activities")
      .select("*")
      .eq("id", subActivityId)
      .single();

    if (error) throw error;
    return data;
  }

  function getStatusColor(status) {
    if (status === "Selesai") return "#16a34a";
    if (status === "Sedang Dikerjakan") return "#2563eb";
    return "#f59e0b";
  }

  function getPriorityColor(priority) {
    if (priority === "High") return "#dc2626";
    if (priority === "Normal") return "#d97706";
    return "#64748b";
  }

  function renderSubActivityItems(items, actId) {
    if (!items || !items.length) {
      return `
        <div class="history-empty" style="font-size:12px;color:#94a3b8;">
          Belum ada sub-aktivitas.
        </div>
      `;
    }

    return items.map(function (item) {
      const statusColor = getStatusColor(item.status || "");
      const priorityColor = getPriorityColor(item.priority || "");

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

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <button
              type="button"
              class="btn-secondary btn-sm"
              style="font-size:11px;padding:4px 8px;"
              onclick="editSubActivity('${String(item.id).replace(/'/g, "\\'")}', '${String(actId).replace(/'/g, "\\'")}'); event.stopPropagation();">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>

            <button
              type="button"
              class="btn-danger btn-sm"
              style="font-size:11px;padding:4px 8px;"
              onclick="deleteSubActivity('${String(item.id).replace(/'/g, "\\'")}', '${String(actId).replace(/'/g, "\\'")}'); event.stopPropagation();">
              <i class="fa-solid fa-trash"></i> Hapus
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

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
    window.allActivities.forEach(function (act) {
      ensureInlineContainer(act.id);
    });
  }

  window.closeSubActivityModal = function () {
    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.add("hidden");
  };

  window.openSubActivityModal = async function (actId) {
    resetSubActivityForm(actId);
    await loadStaffOptionsForSubActivity("");
    await window.loadSubActivities(actId);

    const modal = document.getElementById("subActivityModalOverlay");
    if (modal) modal.classList.remove("hidden");
  };

  window.loadSubActivities = async function (actId) {
    const listEl = document.getElementById(SUB_ACTIVITY_MODAL_LIST_ID);
    if (!actId || !listEl) return;

    listEl.innerHTML = `
      <div class="history-empty" style="font-size:12px;color:#94a3b8;">
        Memuat sub-aktivitas...
      </div>
    `;

    try {
      const items = await fetchSubActivities(actId);
      listEl.innerHTML = renderSubActivityItems(items, actId);
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
      listEl.innerHTML = renderSubActivityItems(items, actId);
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

  window.editSubActivity = async function (subActivityId, actId) {
    try {
      const item = await fetchSingleSubActivity(subActivityId);
      if (!item) {
        alert("Data sub-aktivitas tidak ditemukan.");
        return;
      }

      window.currentEditingSubActivityId = item.id;

      const { actIdEl, titleEl, descEl, picEl, statusEl, priorityEl, dueEl, saveBtnEl } = getSubActivityFormEls();

      if (actIdEl) actIdEl.value = actId || item.activity_id || "";
      if (titleEl) titleEl.value = item.title || "";
      if (descEl) descEl.value = item.description || "";
      if (statusEl) statusEl.value = item.status || "Belum Mulai";
      if (priorityEl) priorityEl.value = item.priority || "Low";
      if (dueEl) dueEl.value = item.due_date || "";

      await loadStaffOptionsForSubActivity(item.pic || "");
      if (picEl) picEl.value = item.pic || "";

      if (saveBtnEl) {
        saveBtnEl.textContent = "Update Sub-Aktivitas";
      }

      const modal = document.getElementById("subActivityModalOverlay");
      if (modal) modal.classList.remove("hidden");
      await window.loadSubActivities(actId || item.activity_id);
    } catch (e) {
      console.error("editSubActivity error:", e);
      alert("Gagal memuat data sub-aktivitas: " + (e.message || "unknown error"));
    }
  };

  window.deleteSubActivity = async function (subActivityId, actId) {
    if (!confirm("Hapus sub-aktivitas ini?")) return;

    try {
      const { error } = await client
        .from("sub_activities")
        .delete()
        .eq("id", subActivityId);

      if (error) {
        console.error("deleteSubActivity error:", error);
        alert("Gagal menghapus sub-aktivitas: " + (error.message || "unknown error"));
        return;
      }

      if (window.currentEditingSubActivityId === subActivityId) {
        resetSubActivityForm(actId);
      }

      await window.loadSubActivities(actId);
      await window.renderSubActivitiesInline(actId);
    } catch (e) {
      console.error("deleteSubActivity exception:", e);
      alert("Terjadi kesalahan saat menghapus: " + e.message);
    }
  };

  window.saveSubActivity = async function () {
    const { actIdEl, titleEl, descEl, picEl, statusEl, priorityEl, dueEl, saveBtnEl } = getSubActivityFormEls();

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
      if (saveBtnEl) {
        saveBtnEl.disabled = true;
      }

      if (window.currentEditingSubActivityId) {
        const { error } = await client
          .from("sub_activities")
          .update(payload)
          .eq("id", window.currentEditingSubActivityId);

        if (error) {
          console.error("update sub activity error:", error);
          alert("Gagal mengupdate sub-aktivitas: " + (error.message || "unknown error"));
          return;
        }
      } else {
        const { error } = await client
          .from("sub_activities")
          .insert(payload);

        if (error) {
          console.error("insert sub activity error:", error);
          alert("Gagal menyimpan sub-aktivitas: " + (error.message || "unknown error"));
          return;
        }
      }

      const parentActId = actIdEl.value;
      resetSubActivityForm(parentActId);

      await window.loadSubActivities(parentActId);
      await window.renderSubActivitiesInline(parentActId);
    } catch (e) {
      console.error("saveSubActivity exception:", e);
      alert("Terjadi kesalahan saat menyimpan: " + e.message);
    } finally {
      if (saveBtnEl) {
        saveBtnEl.disabled = false;
      }
    }
  };

  const originalRenderActivityListDetail = window.renderActivityListDetail;
  if (typeof originalRenderActivityListDetail === "function" && !window.__subActivityInlineWrapped) {
    window.__subActivityInlineWrapped = true;

    window.renderActivityListDetail = function (...args) {
      originalRenderActivityListDetail.apply(this, args);

      setTimeout(async function () {
        ensureAllInlineContainers();
        await window.refreshAllSubActivitiesInline();
      }, 80);
    };
  }

  setTimeout(async function () {
    ensureAllInlineContainers();
    await window.refreshAllSubActivitiesInline();
  }, 300);
})();
