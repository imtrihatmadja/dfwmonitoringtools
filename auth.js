// =====================================================================
// auth.js  —  Google OAuth + Role (Topbar Mode, no login wall)
// Paradigma: App selalu tampil. Login Google opsional di topbar.
// Tanpa login → bisa lihat semua, tidak bisa edit/hapus/simpan.
// Diload SEBELUM app.js. Tidak mengubah app.js / app_sprint4.js.
// =====================================================================

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────────
  const SUPABASE_URL      = "https://zdfxcxkgmksaeigyuibe.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZnhjeGtnbWtzYWVpZ3l1aWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3Mjc0NjAsImV4cCI6MjA5MjMwMzQ2MH0.baUlaWNvN3wMKHL05E71aSxedjKvWhfVQXHGXraWyVU";

  const ROLES = {
    admin:   { label: "Administrator",   canEdit: true,  canDelete: true  },
    manager: { label: "Program Manager", canEdit: true,  canDelete: false },
    staff:   { label: "Staff",           canEdit: true,  canDelete: false },
    viewer:  { label: "Viewer",          canEdit: false, canDelete: false },
  };

  // ── State publik ──────────────────────────────────────────────────
  // authUser = null  → belum login (guest, read-only)
  // authUser = {...} → sudah login
  window.authUser   = null;
  window.authClient = null;

  // ── Guard utama: blokir aksi jika belum login / tidak punya hak ──
  // Panggil window.authGuard("edit") di tombol — kembalikan true jika boleh
  window.authGuard = function (action) {
    if (!window.authUser) {
      showLoginPrompt();
      return false;
    }
    if (action === "edit"   && !window.authUser.canEdit)   { alert("Akses ditolak: role Anda tidak memiliki izin edit."); return false; }
    if (action === "delete" && !window.authUser.canDelete) { alert("Akses ditolak: role Anda tidak memiliki izin hapus."); return false; }
    return true;
  };

  // ── Tunggu supabase-js ────────────────────────────────────────────
  function waitForSupabase(cb, n) {
    n = n || 0;
    if (n > 150) return;
    if (window.supabase && window.supabase.createClient) cb();
    else setTimeout(() => waitForSupabase(cb, n + 1), 50);
  }

  // ── Ambil role dari tabel user_roles ─────────────────────────────
  async function fetchUserRole(email) {
    try {
      const { data, error } = await window.authClient
        .from("user_roles")
        .select("role, is_active, display_name")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      if (error || !data || data.is_active === false) return null;
      return data;
    } catch (e) {
      console.warn("fetchUserRole:", e.message);
      return null;
    }
  }

  // ── Render tombol login di topbar ─────────────────────────────────
  function renderTopbarAuth() {
    const topbarRight = document.querySelector(".topbar-right");
    if (!topbarRight || document.getElementById("authTopbarArea")) return;

    const wrap = document.createElement("div");
    wrap.id = "authTopbarArea";
    wrap.style.cssText = "display:flex;align-items:center;gap:8px;";
    topbarRight.insertBefore(wrap, topbarRight.firstChild);

    renderTopbarGuest(wrap);
  }

  function renderTopbarGuest(wrap) {
    if (!wrap) wrap = document.getElementById("authTopbarArea");
    if (!wrap) return;
    wrap.innerHTML = `
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;">
        <i class="fa-solid fa-eye" style="color:#cbd5e1"></i> Mode Lihat
      </span>
      <button id="authLoginBtn"
        style="display:flex;align-items:center;gap:7px;background:#fff;border:1.5px solid #e2e8f0;
               border-radius:8px;padding:6px 13px;font-size:12px;font-weight:700;color:#0f172a;
               cursor:pointer;transition:all .15s;box-shadow:0 1px 4px rgba(0,0,0,.07);">
        <svg width="15" height="15" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Login Google
      </button>`;
    document.getElementById("authLoginBtn").onclick = signIn;
  }

  function renderTopbarLoggedIn(user) {
    const wrap = document.getElementById("authTopbarArea");
    if (!wrap) return;
    const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
    const avatarHtml = user.avatar
      ? `<img src="${user.avatar}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;" alt="">`
      : `<span style="width:26px;height:26px;border-radius:50%;background:#2563eb;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">${initial}</span>`;

    const roleColor = { admin:"#7c3aed", manager:"#0369a1", staff:"#15803d", viewer:"#64748b" }[user.role] || "#64748b";
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        ${avatarHtml}
        <div style="line-height:1.3;">
          <div style="font-size:12px;font-weight:700;color:#0f172a;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user.name || user.email}</div>
          <div style="font-size:10px;font-weight:700;color:${roleColor};">${user.roleLabel}</div>
        </div>
        <button id="authLogoutBtn"
          title="Keluar"
          style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;padding:5px 9px;
                 font-size:11px;font-weight:600;color:#64748b;cursor:pointer;transition:all .15s;">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>`;
    document.getElementById("authLogoutBtn").onclick = signOut;
  }

  // ── Sidebar footer: update user info ─────────────────────────────
  function patchSidebarFooter(user) {
    const avatarEl = document.querySelector(".user-avatar");
    const nameEl   = document.querySelector(".user-name");
    const roleEl   = document.querySelector(".user-role");
    if (avatarEl) {
      avatarEl.innerHTML = user.avatar
        ? `<img src="${user.avatar}" alt="" style="width:100%;height:100%;border-radius:8px;object-fit:cover;">`
        : (user.name || user.email || "?").charAt(0).toUpperCase();
    }
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (roleEl) roleEl.textContent = user.roleLabel;
  }

  function resetSidebarFooter() {
    const avatarEl = document.querySelector(".user-avatar");
    const nameEl   = document.querySelector(".user-name");
    const roleEl   = document.querySelector(".user-role");
    if (avatarEl) avatarEl.textContent = "DFW";
    if (nameEl)   nameEl.textContent   = "DFW Indonesia";
    if (roleEl)   roleEl.textContent   = "Mode Lihat";
  }

  // ── Popup mini saat guest klik aksi edit ─────────────────────────
  function showLoginPrompt() {
    let toast = document.getElementById("authLoginToast");
    if (toast) { toast.remove(); }
    toast = document.createElement("div");
    toast.id = "authLoginToast";
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <i class="fa-solid fa-lock" style="color:#f59e0b;font-size:15px;"></i>
        <div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;">Login diperlukan</div>
          <div style="font-size:11px;color:#64748b;">Silakan login Google untuk mengedit data</div>
        </div>
        <button onclick="document.getElementById('authLoginBtn')?.click()"
          style="background:#2563eb;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
          Login
        </button>
        <button onclick="this.closest('#authLoginToast').remove()"
          style="background:none;border:none;font-size:16px;color:#94a3b8;cursor:pointer;padding:0 4px;">✕</button>
      </div>`;
    Object.assign(toast.style, {
      position:"fixed", bottom:"24px", left:"50%", transform:"translateX(-50%)",
      background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:"12px",
      padding:"14px 18px", boxShadow:"0 8px 30px rgba(0,0,0,.15)",
      zIndex:"99999", minWidth:"320px", maxWidth:"90vw",
    });
    document.body.appendChild(toast);
    setTimeout(() => toast && toast.remove(), 5000);
  }

  // ── Sign In / Out ─────────────────────────────────────────────────
  async function signIn() {
    const btn = document.getElementById("authLoginBtn");
    if (btn) { btn.textContent = "Menghubungkan…"; btn.disabled = true; }
    try {
      const { error } = await window.authClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href.split("?")[0].split("#")[0] },
      });
      if (error) throw error;
    } catch (e) {
      alert("Login gagal: " + e.message);
      renderTopbarGuest();
    }
  }

  async function signOut() {
    await window.authClient.auth.signOut();
    // onAuthStateChange akan handle reset
  }
  window.authSignOut = signOut;

  // ── Apply / clear guest-mode (kunci tombol edit) ──────────────────
  function applyGuestMode() {
    // Tambah overlay tipis ke semua tombol aksi edit/hapus
    // menggunakan atribut data-auth-guarded agar tidak dobel
    const selectors = [
      "button.btn-primary:not([data-auth-skip])",
      "button.btn-edit:not([data-auth-skip])",
      "button.btn-remove:not([data-auth-skip])",
      "button.btn-danger:not([data-auth-skip])",
      "#submitAllBtn", "#saveActivityBtn", "#saveNoteBtn",
      "#addActivityBtnDetail", "#addIndicatorBtn", "#addOutcomeBtn",
      "#toStep2Btn", "#actUploadAllBtn",
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(btn => {
        if (btn.dataset.authGuarded) return;
        btn.dataset.authGuarded = "1";
        const orig = btn.onclick;
        btn.onclick = function (e) {
          if (!window.authUser) { e.preventDefault(); e.stopImmediatePropagation(); showLoginPrompt(); return false; }
          if (orig) orig.call(this, e);
        };
      });
    });

    // Nav links: tab input (tambah proyek) dikunci
    document.querySelectorAll("[data-tab='input']").forEach(li => {
      if (li.dataset.authGuarded) return;
      li.dataset.authGuarded = "1";
      const origClick = li.onclick;
      li.addEventListener("click", function (e) {
        if (!window.authUser) { e.stopImmediatePropagation(); showLoginPrompt(); }
      }, true);
    });
  }

  function clearGuestMode() {
    // Hapus semua data-auth-guarded agar tombol kembali normal
    document.querySelectorAll("[data-auth-guarded]").forEach(el => {
      delete el.dataset.authGuarded;
      el.onclick = null; // reset; app.js akan re-bind lewat event listener aslinya
    });
  }

  // ── Main auth state handler ───────────────────────────────────────
  function handleAuthState(event, session) {
    if (event === "SIGNED_OUT" || !session) {
      window.authUser = null;
      renderTopbarGuest();
      resetSidebarFooter();
      // Terapkan guest-mode setelah DOM settle
      setTimeout(applyGuestMode, 400);
      return;
    }

    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      if (!session?.user) return;

      const supaUser = session.user;
      const email    = supaUser.email || "";

      fetchUserRole(email).then(roleData => {
        const roleName = roleData?.role || "viewer";
        const roleDef  = ROLES[roleName] || ROLES.viewer;

        window.authUser = {
          id        : supaUser.id,
          email,
          name      : roleData?.display_name || supaUser.user_metadata?.full_name || email.split("@")[0],
          avatar    : supaUser.user_metadata?.avatar_url || "",
          role      : roleName,
          roleLabel : roleDef.label,
          canEdit   : roleDef.canEdit,
          canDelete : roleDef.canDelete,
        };

        // Bersihkan guest-mode guard
        clearGuestMode();
        renderTopbarLoggedIn(window.authUser);
        patchSidebarFooter(window.authUser);
      });
    }
  }

  // ── Init ──────────────────────────────────────────────────────────
  function initAuth() {
    window.authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Dengarkan perubahan session
    window.authClient.auth.onAuthStateChange((event, session) => {
      handleAuthState(event, session);
    });

    // Cek session yang sudah ada saat halaman dimuat
    window.authClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleAuthState("INITIAL_SESSION", session);
      } else {
        window.authUser = null;
        resetSidebarFooter();
        // Pasang guest guard setelah app.js selesai render
        setTimeout(applyGuestMode, 600);
        setTimeout(applyGuestMode, 1800); // second pass for dynamically rendered buttons
      }
    });
  }

  // ── Bootstrap: tunggu DOM + supabase-js ──────────────────────────
  function bootstrap() {
    const ready = () => waitForSupabase(initAuth);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        // Render topbar auth area segera setelah DOM ready
        setTimeout(renderTopbarAuth, 100);
        ready();
      });
    } else {
      setTimeout(renderTopbarAuth, 100);
      ready();
    }
    // Render topbar auth area juga setelah delay (fallback)
    setTimeout(renderTopbarAuth, 500);
    // Re-apply guest mode setelah setiap loadProjects / render
    const _origLoad = window.loadProjects;
    Object.defineProperty(window, "loadProjects", {
      set(fn) { window._loadProjectsReal = fn; },
      get() {
        return async (...args) => {
          const r = await (window._loadProjectsReal || _origLoad)?.(...args);
          if (!window.authUser) setTimeout(applyGuestMode, 300);
          return r;
        };
      },
      configurable: true,
    });
  }

  bootstrap();

})();
