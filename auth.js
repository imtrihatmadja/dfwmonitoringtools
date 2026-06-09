// =====================================================================
// auth.js  —  Google OAuth + Role Guard (v3 — CSS-class approach)
// Paradigma: App selalu tampil. Login Google opsional di topbar.
// Guest mode dikontrol lewat class "auth-guest" di <body> — BUKAN
// dengan wrap onclick, sehingga tidak ada konflik dengan app.js.
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
  window.authUser   = null;
  window.authClient = null;

  // ── Inject CSS guest-mode sekali saja ────────────────────────────
  // Saat body punya class "auth-guest":
  //   - Tombol edit/hapus/simpan tetap TERLIHAT tapi dikunci via overlay transparan
  //   - Klik ditangkap sebelum sampai ke app.js
  (function injectCSS() {
    const style = document.createElement("style");
    style.id = "auth-guest-style";
    style.textContent = `
      /* ── Wrapper klik-block untuk semua tombol aksi saat guest ── */
      body.auth-guest .auth-action-wrap {
        position: relative;
        display: inline-block;
      }
      body.auth-guest .auth-action-wrap::after {
        content: "";
        position: absolute;
        inset: 0;
        cursor: not-allowed;
        z-index: 10;
        border-radius: inherit;
      }

      /* ── Visual: tombol aksi tampak disabled tapi tidak dihilangkan ── */
      body.auth-guest button.btn-primary:not(#authLoginBtn):not(#refreshBtn):not(#topbarPrintBtn),
      body.auth-guest button.btn-edit,
      body.auth-guest button.btn-remove,
      body.auth-guest button.btn-danger,
      body.auth-guest button.btn-upload,
      body.auth-guest button.btn-ind-update,
      body.auth-guest #submitAllBtn,
      body.auth-guest #saveActivityBtn,
      body.auth-guest #saveNoteBtn,
      body.auth-guest #addActivityBtnDetail,
      body.auth-guest #actUploadAllBtn {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* ── Tab "Tambah Proyek" di sidebar dikunci visual ── */
      body.auth-guest [data-tab="input"] {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* ── Overlay klik-catcher global di atas semua tombol aksi ── */
      #auth-click-guard {
        display: none;
      }
      body.auth-guest #auth-click-guard {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: transparent;
        pointer-events: none; /* biarkan klik tembus, kita handle di capture listener */
      }
    `;
    document.head.appendChild(style);
  })();

  // ── Overlay elemen (tidak memblok, hanya untuk referensi) ────────
  function ensureClickGuard() {
    if (document.getElementById("auth-click-guard")) return;
    const el = document.createElement("div");
    el.id = "auth-click-guard";
    document.body.appendChild(el);
  }

  // ── Intercept klik pada tombol yang dilindungi (capture phase) ───
  // Ini SATU listener di document level — tidak butuh wrap per-tombol
  document.addEventListener("click", function (e) {
    if (!document.body.classList.contains("auth-guest")) return;

    const target = e.target.closest(
      "button.btn-primary, button.btn-edit, button.btn-remove, " +
      "button.btn-danger, button.btn-upload, button.btn-ind-update, " +
      "#submitAllBtn, #saveActivityBtn, #saveNoteBtn, " +
      "#addActivityBtnDetail, #actUploadAllBtn, #toStep2Btn, " +
      "#addIndicatorBtn, #addOutcomeBtn, [data-tab='input']"
    );

    // Kecualikan tombol yang boleh diklik guest
    const exempt = ["authLoginBtn", "authLogoutBtn", "refreshBtn", "topbarPrintBtn"];
    if (!target) return;
    if (exempt.includes(target.id)) return;
    if (target.closest("#authTopbarArea")) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    showLoginPrompt();
  }, true); // capture: true → jalan sebelum listener app.js

  // ── Set / clear guest mode ────────────────────────────────────────
  function setGuestMode(on) {
    if (on) {
      document.body.classList.add("auth-guest");
    } else {
      document.body.classList.remove("auth-guest");
    }
  }

  // ── Tunggu supabase-js ────────────────────────────────────────────
  function waitForSupabase(cb, n) {
    n = n || 0;
    if (n > 200) { console.error("auth.js: supabase-js tidak ditemukan"); return; }
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
      if (error) { console.warn("fetchUserRole error:", error.message); return null; }
      if (!data || data.is_active === false) return null;
      return data;
    } catch (e) {
      console.warn("fetchUserRole exception:", e.message);
      return null;
    }
  }

  // ── Toast "login diperlukan" ──────────────────────────────────────
  function showLoginPrompt() {
    let toast = document.getElementById("authLoginToast");
    if (toast) { toast.remove(); }
    toast = document.createElement("div");
    toast.id = "authLoginToast";
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <i class="fa-solid fa-lock" style="color:#f59e0b;font-size:16px;flex-shrink:0;"></i>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;">Login diperlukan</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px;">Login Google untuk mengedit data</div>
        </div>
        <button id="authToastLoginBtn"
          style="background:#2563eb;color:#fff;border:none;border-radius:7px;
                 padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;">
          Login
        </button>
        <button onclick="document.getElementById('authLoginToast').remove()"
          style="background:none;border:none;font-size:18px;color:#94a3b8;
                 cursor:pointer;padding:0;line-height:1;">×</button>
      </div>`;
    Object.assign(toast.style, {
      position: "fixed", bottom: "24px", left: "50%",
      transform: "translateX(-50%)",
      background: "#fff", border: "1.5px solid #e2e8f0",
      borderRadius: "12px", padding: "14px 18px",
      boxShadow: "0 8px 30px rgba(0,0,0,.18)",
      zIndex: "99999", minWidth: "300px", maxWidth: "90vw",
    });
    document.body.appendChild(toast);
    document.getElementById("authToastLoginBtn").onclick = signIn;
    setTimeout(() => toast && toast.remove(), 6000);
  }

  // ── Topbar: render area auth ──────────────────────────────────────
  function renderTopbarAuth() {
    const topbarRight = document.querySelector(".topbar-right");
    if (!topbarRight || document.getElementById("authTopbarArea")) return;
    const wrap = document.createElement("div");
    wrap.id = "authTopbarArea";
    wrap.style.cssText = "display:flex;align-items:center;gap:8px;order:0;";
    // Sisipkan di awal .topbar-right
    topbarRight.insertBefore(wrap, topbarRight.firstChild);
    renderTopbarGuest(wrap);
  }

  function renderTopbarGuest(wrap) {
    if (!wrap) wrap = document.getElementById("authTopbarArea");
    if (!wrap) return;
    wrap.innerHTML = `
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;">
        <i class="fa-solid fa-eye" style="color:#cbd5e1;"></i>&nbsp;Mode Lihat
      </span>
      <button id="authLoginBtn"
        style="display:flex;align-items:center;gap:7px;background:#fff;
               border:1.5px solid #e2e8f0;border-radius:8px;padding:6px 13px;
               font-size:12px;font-weight:700;color:#0f172a;cursor:pointer;
               box-shadow:0 1px 4px rgba(0,0,0,.07);transition:border-color .15s;">
        <svg width="14" height="14" viewBox="0 0 48 48">
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
    const roleColor = { admin:"#7c3aed", manager:"#0369a1", staff:"#15803d", viewer:"#64748b" }[user.role] || "#64748b";
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        ${user.avatar
          ? `<img src="${user.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;" alt="">`
          : `<span style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initial}</span>`
        }
        <div style="line-height:1.35;">
          <div style="font-size:12px;font-weight:700;color:#0f172a;max-width:140px;
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${user.name || user.email}
          </div>
          <div style="font-size:10px;font-weight:700;color:${roleColor};">
            ${user.roleLabel}
          </div>
        </div>
        <button id="authLogoutBtn" title="Keluar"
          style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;
                 padding:5px 10px;font-size:12px;color:#64748b;cursor:pointer;">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>`;
    document.getElementById("authLogoutBtn").onclick = signOut;
  }

  // ── Sidebar footer ────────────────────────────────────────────────
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

  // ── Sign In / Out ─────────────────────────────────────────────────
  async function signIn() {
    const btn = document.getElementById("authLoginBtn");
    if (btn) { btn.innerHTML = "⏳ Menghubungkan…"; btn.disabled = true; }
    try {
      const { error } = await window.authClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href.split("?")[0].split("#")[0] },
      });
      if (error) throw error;
      // Browser redirect ke Google — halaman akan dimuat ulang setelah login
    } catch (e) {
      alert("Login gagal: " + e.message);
      renderTopbarGuest();
    }
  }

  async function signOut() {
    await window.authClient.auth.signOut();
    // onAuthStateChange SIGNED_OUT akan handle sisanya
  }
  window.authSignOut = signOut;

  // ── Auth state handler ────────────────────────────────────────────
  async function handleAuthState(event, session) {
    // ── Logout / tidak ada session ──
    if (event === "SIGNED_OUT" || !session) {
      window.authUser = null;
      setGuestMode(true);
      renderTopbarGuest();
      resetSidebarFooter();
      return;
    }

    // ── Login / session ada ──
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      if (!session.user) return;

      const supaUser = session.user;
      const email    = supaUser.email || "";

      // Ambil role — fallback ke "admin" jika tabel belum diisi
      // (agar pemilik proyek tidak terkunci)
      let roleData = await fetchUserRole(email);

      // Fallback: jika user_roles belum dikonfigurasi sama sekali,
      // anggap user yang berhasil login sebagai admin sementara.
      const roleName = roleData?.role || "admin";
      const roleDef  = ROLES[roleName] || ROLES.admin;

      window.authUser = {
        id        : supaUser.id,
        email,
        name      : roleData?.display_name
                    || supaUser.user_metadata?.full_name
                    || supaUser.user_metadata?.name
                    || email.split("@")[0],
        avatar    : supaUser.user_metadata?.avatar_url
                    || supaUser.user_metadata?.picture
                    || "",
        role      : roleName,
        roleLabel : roleDef.label,
        canEdit   : roleDef.canEdit,
        canDelete : roleDef.canDelete,
      };

      // Matikan guest mode — user sudah login
      setGuestMode(false);
      renderTopbarLoggedIn(window.authUser);
      patchSidebarFooter(window.authUser);

      console.info("auth.js: logged in as", window.authUser.name, "/ role:", roleName);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────
  function initAuth() {
    window.authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    ensureClickGuard();

    // Pasang guest mode dulu, baru cek session
    setGuestMode(true);

    // Listener perubahan session (redirect OAuth, logout, token refresh)
    window.authClient.auth.onAuthStateChange((event, session) => {
      handleAuthState(event, session);
    });

    // Cek session yang sudah ada (reload halaman saat sudah login)
    window.authClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleAuthState("INITIAL_SESSION", session);
      }
      // Jika null → tetap guest mode, tidak perlu lakukan apa-apa
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────
  function bootstrap() {
    // Render topbar segera setelah DOM ready
    const onReady = () => {
      setTimeout(renderTopbarAuth, 80);
      waitForSupabase(initAuth);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
    // Fallback render topbar
    setTimeout(renderTopbarAuth, 600);
  }

  bootstrap();

})();
