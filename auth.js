// =====================================================================
// auth.js  —  Google OAuth + Role Guard (v5 — authenticated query)
//
// FIX v5: fetchRole menggunakan authenticated client (dengan JWT token
// user yang sudah login), bukan anon client dari app.js.
// Ini memastikan RLS policy tabel user_roles bisa terpenuhi.
//
// Flow:
//  1. window.client (app.js) dipakai untuk auth.signInWithOAuth & getSession
//  2. Setelah session confirmed → buat authClient baru dengan access_token
//  3. Query user_roles dengan authClient yang sudah punya JWT → RLS terpenuhi
// =====================================================================

(function () {
  "use strict";

  const SUPABASE_URL      = "https://zdfxcxkgmksaeigyuibe.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZnhjeGtnbWtzYWVpZ3l1aWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3Mjc0NjAsImV4cCI6MjA5MjMwMzQ2MH0.baUlaWNvN3wMKHL05E71aSxedjKvWhfVQXHGXraWyVU";

  const ROLES = {
    admin:   { label: "Administrator",   canEdit: true,  canDelete: true  },
    manager: { label: "Program Manager", canEdit: true,  canDelete: false },
    staff:   { label: "Staff",           canEdit: true,  canDelete: false },
    viewer:  { label: "Viewer",          canEdit: false, canDelete: false },
  };

  window.authUser   = null;
  window.authClient = null; // dedicated auth client, diisi setelah session ada

  // ── Inject CSS guest-mode ─────────────────────────────────────────
  (function injectCSS() {
    const s = document.createElement("style");
    s.id = "auth-css";
    s.textContent = `
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
      body.auth-guest #actUploadAllBtn,
      body.auth-guest #toStep2Btn,
      body.auth-guest #addIndicatorBtn,
      body.auth-guest #addOutcomeBtn {
        opacity: 0.4;
        pointer-events: none;
        cursor: not-allowed;
      }
      body.auth-guest [data-tab="input"] {
        opacity: 0.4;
        pointer-events: none;
      }
      #authTopbarArea button { font-family: inherit; }
      #authLoginBtn:hover    { border-color: #2563eb !important; }
      #authLogoutBtn:hover   { background: #fee2e2 !important; color: #dc2626 !important; }
    `;
    document.head.appendChild(s);
  })();

  // ── Capture listener — blokir klik tombol saat guest ─────────────
  document.addEventListener("click", function (e) {
    if (!document.body.classList.contains("auth-guest")) return;
    const target = e.target.closest(
      "button.btn-primary, button.btn-edit, button.btn-remove," +
      "button.btn-danger, button.btn-upload, button.btn-ind-update," +
      "#submitAllBtn, #saveActivityBtn, #saveNoteBtn," +
      "#addActivityBtnDetail, #actUploadAllBtn, #toStep2Btn," +
      "#addIndicatorBtn, #addOutcomeBtn, [data-tab='input']"
    );
    if (!target) return;
    if (["authLoginBtn","authLogoutBtn","authToastLoginBtn",
         "refreshBtn","topbarPrintBtn"].includes(target.id)) return;
    if (target.closest("#authTopbarArea")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showLoginPrompt();
  }, true);

  // ── Guest mode toggle ─────────────────────────────────────────────
  function setGuest(on) {
    document.body.classList.toggle("auth-guest", on);
  }

  // ── Toast login prompt ────────────────────────────────────────────
  function showLoginPrompt() {
    const old = document.getElementById("authLoginToast");
    if (old) old.remove();
    const t = document.createElement("div");
    t.id = "authLoginToast";
    t.innerHTML = `
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
          style="background:none;border:none;font-size:20px;color:#94a3b8;cursor:pointer;padding:0;">×</button>
      </div>`;
    Object.assign(t.style, {
      position:"fixed", bottom:"24px", left:"50%", transform:"translateX(-50%)",
      background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:"12px",
      padding:"14px 18px", boxShadow:"0 8px 30px rgba(0,0,0,.18)",
      zIndex:"99999", minWidth:"300px", maxWidth:"90vw",
    });
    document.body.appendChild(t);
    document.getElementById("authToastLoginBtn").onclick = signIn;
    setTimeout(() => t.isConnected && t.remove(), 6000);
  }

  // ── Topbar UI ─────────────────────────────────────────────────────
  function ensureTopbarArea() {
    if (document.getElementById("authTopbarArea")) return;
    const topbarRight = document.querySelector(".topbar-right");
    if (!topbarRight) return;
    const wrap = document.createElement("div");
    wrap.id = "authTopbarArea";
    wrap.style.cssText = "display:flex;align-items:center;gap:8px;";
    topbarRight.insertBefore(wrap, topbarRight.firstChild);
  }

  function renderGuest() {
    ensureTopbarArea();
    const wrap = document.getElementById("authTopbarArea");
    if (!wrap) return;
    wrap.innerHTML = `
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px;">
        <i class="fa-solid fa-eye" style="color:#cbd5e1;"></i> Mode Lihat
      </span>
      <button id="authLoginBtn"
        style="display:flex;align-items:center;gap:7px;background:#fff;
               border:1.5px solid #e2e8f0;border-radius:8px;padding:6px 13px;
               font-size:12px;font-weight:700;color:#0f172a;cursor:pointer;
               box-shadow:0 1px 4px rgba(0,0,0,.06);">
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

  function renderLoggedIn(user) {
    ensureTopbarArea();
    const wrap = document.getElementById("authTopbarArea");
    if (!wrap) return;
    const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
    const clr = { admin:"#7c3aed", manager:"#0369a1", staff:"#15803d", viewer:"#64748b" }[user.role] || "#64748b";
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        ${user.avatar
          ? `<img src="${user.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;" alt="">`
          : `<span style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;">${initial}</span>`
        }
        <div style="line-height:1.35;">
          <div style="font-size:12px;font-weight:700;color:#0f172a;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user.name || user.email}</div>
          <div style="font-size:10px;font-weight:700;color:${clr};">${user.roleLabel}</div>
        </div>
        <button id="authLogoutBtn" title="Keluar"
          style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;
                 padding:5px 10px;font-size:12px;color:#64748b;cursor:pointer;">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>`;
    document.getElementById("authLogoutBtn").onclick = signOut;
  }

  function patchSidebar(user) {
    const av = document.querySelector(".user-avatar");
    const nm = document.querySelector(".user-name");
    const rl = document.querySelector(".user-role");
    if (av) av.innerHTML = user.avatar
      ? `<img src="${user.avatar}" alt="" style="width:100%;height:100%;border-radius:8px;object-fit:cover;">`
      : (user.name || user.email || "?").charAt(0).toUpperCase();
    if (nm) nm.textContent = user.name || user.email;
    if (rl) rl.textContent = user.roleLabel;
  }

  function resetSidebar() {
    const av = document.querySelector(".user-avatar");
    const nm = document.querySelector(".user-name");
    const rl = document.querySelector(".user-role");
    if (av) av.textContent = "DFW";
    if (nm) nm.textContent = "DFW Indonesia";
    if (rl) rl.textContent = "Mode Lihat";
  }

  // ── Sign In — pakai window.client (sama dengan app.js) ────────────
  async function signIn() {
    const cl = window.client;
    if (!cl) { alert("Halaman belum siap, tunggu sebentar lalu coba lagi."); return; }
    const btn = document.getElementById("authLoginBtn");
    if (btn) { btn.innerHTML = "⏳ Menghubungkan…"; btn.disabled = true; }
    try {
      const { error } = await cl.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
    } catch (e) {
      alert("Login gagal: " + e.message);
      renderGuest();
    }
  }

  // ── Sign Out ──────────────────────────────────────────────────────
  async function signOut() {
    const cl = window.client;
    if (cl) await cl.auth.signOut();
  }
  window.authSignOut = signOut;

  // ── fetchRole: query dengan authenticated client ───────────────────
  // Buat client baru yang di-set dengan session token user yang sudah login.
  // Ini memastikan RLS policy (jika ada) terpenuhi dengan JWT yang valid.
  async function fetchRole(email, accessToken) {
    try {
      // Buat fresh client dengan auth header yang sudah berisi JWT user
      const authCl = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: { Authorization: "Bearer " + accessToken }
        }
      });

      const { data, error } = await authCl
        .from("user_roles")
        .select("role, is_active, display_name")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (error) {
        console.warn("auth: fetchRole DB error →", error.code, error.message);
        return null;
      }
      if (!data) {
        console.warn("auth: email tidak ditemukan di tabel user_roles →", email);
        return null;
      }
      if (data.is_active === false) {
        console.warn("auth: user tidak aktif →", email);
        return null;
      }
      return data;

    } catch (e) {
      console.warn("auth: fetchRole exception →", e.message);
      return null;
    }
  }

  // ── processSession: set authUser dan update UI ────────────────────
  async function processSession(session) {
    const supaUser   = session.user;
    const email      = (supaUser.email || "").toLowerCase();
    const accessToken = session.access_token; // JWT yang valid

    console.info("auth: processing session untuk →", email);

    // Query dengan authenticated client
    const roleData = await fetchRole(email, accessToken);

    console.info("auth: roleData →", roleData);

    // Fallback ke "admin" hanya jika tabel kosong/tidak ditemukan
    // (safety net agar pemilik proyek tidak terkunci)
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

    console.info("auth: authUser final →", window.authUser.email,
                 "| role:", roleName,
                 "| canEdit:", roleDef.canEdit,
                 "| canDelete:", roleDef.canDelete);

    setGuest(false);
    renderLoggedIn(window.authUser);
    patchSidebar(window.authUser);
  }

  // ── Init: tunggu window.client dari app.js ────────────────────────
  function waitForClient(cb, n) {
    n = n || 0;
    if (n > 300) { console.error("auth: window.client tidak tersedia setelah 15 detik"); return; }
    if (window.client) { cb(window.client); return; }
    setTimeout(() => waitForClient(cb, n + 1), 50);
  }

  function initAuth(cl) {
    setGuest(true);

    // Listener perubahan session
    cl.auth.onAuthStateChange(async (event, session) => {
      console.info("auth: onAuthStateChange →", event);

      if (event === "SIGNED_OUT" || !session) {
        window.authUser = null;
        setGuest(true);
        renderGuest();
        resetSidebar();
        return;
      }
      if (["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) {
        await processSession(session);
      }
    });

    // Cek session yang sudah ada (reload halaman setelah login)
    cl.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        console.info("auth: session existing ditemukan →", session.user?.email);
        await processSession(session);
      } else {
        console.info("auth: tidak ada session, mode guest");
      }
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────
  function bootstrap() {
    const onReady = () => {
      setTimeout(renderGuest, 80);
      waitForClient(initAuth);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }

  bootstrap();

})();
