// =====================================================================
// auth.js — Google OAuth + Role Guard (v8 — popup flow)
//
// ROOT CAUSE FINAL:
// Browser Edge/Firefox dengan Tracking Prevention memblokir localStorage
// untuk session OAuth yang datang dari redirect cross-site (Google→app).
// FIX: Ganti signInWithOAuth redirect → signInWithOAuth popup.
// Popup tidak dianggap cross-site redirect → storage tidak diblokir.
//
// Tambahan: Pakai window.client yang sudah ada dari app.js (bukan buat baru)
// untuk menghindari "Multiple GoTrueClient instances" warning.
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

  // ── State ─────────────────────────────────────────────────────────
  window.authUser       = null;
  let _isGuest          = true;
  let _sessionProcessed = false;

  // ── Capture listener — blokir klik saat guest ─────────────────────
  const PROTECTED =
    "button.btn-primary, button.btn-edit, button.btn-remove, " +
    "button.btn-danger, button.btn-upload, button.btn-ind-update, " +
    "button.file-btn-delete, button.btn-sub-activity, " +
    "#submitAllBtn, #saveActivityBtn, #saveNoteBtn, " +
    "#addActivityBtnDetail, #actUploadAllBtn, #toStep2Btn, " +
    "#addIndicatorBtn, #addOutcomeBtn, [data-tab='input']";

  const EXEMPT = new Set([
    "authLoginBtn","authLogoutBtn","authToastLoginBtn",
    "refreshBtn","topbarPrintBtn"
  ]);

  document.addEventListener("click", function (e) {
    if (!_isGuest) return;
    const t = e.target.closest(PROTECTED);
    if (!t) return;
    if (EXEMPT.has(t.id)) return;
    if (t.closest("#authTopbarArea")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showLoginToast();
  }, true);

  // ── Guest mode ────────────────────────────────────────────────────
  function setGuest(on) {
    _isGuest = on;
    document.body.classList.toggle("auth-guest", on);
    console.info("auth: guest →", on);
  }

  // ── Toast ─────────────────────────────────────────────────────────
  function showLoginToast() {
    const old = document.getElementById("authLoginToast");
    if (old) old.remove();
    const t = document.createElement("div");
    t.id = "authLoginToast";
    t.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <i class="fa-solid fa-lock" style="color:#f59e0b;font-size:16px;flex-shrink:0;"></i>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;">Login diperlukan</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px;">Klik Login Google di pojok kanan atas</div>
        </div>
        <button id="authToastLoginBtn"
          style="background:#2563eb;color:#fff;border:none;border-radius:7px;
                 padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;">
          Login
        </button>
        <button onclick="document.getElementById('authLoginToast').remove()"
          style="background:none;border:none;font-size:20px;color:#94a3b8;cursor:pointer;padding:0 2px;">×</button>
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

  // ── Topbar ────────────────────────────────────────────────────────
  function ensureTopbar() {
    if (document.getElementById("authTopbarArea")) return;
    const tr = document.querySelector(".topbar-right");
    if (!tr) return;
    const w = document.createElement("div");
    w.id = "authTopbarArea";
    w.style.cssText = "display:flex;align-items:center;gap:8px;";
    tr.insertBefore(w, tr.firstChild);
  }

  function renderGuest() {
    ensureTopbar();
    const w = document.getElementById("authTopbarArea");
    if (!w) return;
    w.innerHTML = `
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px;">
        <i class="fa-solid fa-eye" style="color:#cbd5e1;"></i>&nbsp;Mode Lihat
      </span>
      <button id="authLoginBtn"
        style="display:flex;align-items:center;gap:7px;background:#fff;
               border:1.5px solid #e2e8f0;border-radius:8px;padding:6px 13px;
               font-size:12px;font-weight:700;color:#0f172a;cursor:pointer;
               box-shadow:0 1px 4px rgba(0,0,0,.06);white-space:nowrap;">
        <svg width="14" height="14" viewBox="0 0 48 48" style="flex-shrink:0">
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
    ensureTopbar();
    const w = document.getElementById("authTopbarArea");
    if (!w) return;
    const ini = (user.name || user.email || "?").charAt(0).toUpperCase();
    const clr = {admin:"#7c3aed",manager:"#0369a1",staff:"#15803d",viewer:"#64748b"}[user.role]||"#64748b";
    w.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        ${user.avatar
          ? `<img src="${user.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;" alt="">`
          : `<span style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ini}</span>`
        }
        <div style="line-height:1.3;">
          <div style="font-size:12px;font-weight:700;color:#0f172a;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user.name||user.email}</div>
          <div style="font-size:10px;font-weight:700;color:${clr};">${user.roleLabel}</div>
        </div>
        <button id="authLogoutBtn" title="Keluar"
          style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;
                 padding:5px 10px;font-size:12px;color:#64748b;cursor:pointer;flex-shrink:0;">
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
      : (user.name||user.email||"?").charAt(0).toUpperCase();
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

  // ── fetchRole via REST — tidak pakai client instance ─────────────
  async function fetchRole(email, token) {
    const url = `${SUPABASE_URL}/rest/v1/user_roles` +
      `?select=role,is_active,display_name` +
      `&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`;
    try {
      const res = await fetch(url, {
        headers: {
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + token,
          "Content-Type":  "application/json",
        },
      });
      const rows = await res.json();
      console.info("auth: fetchRole →", rows);
      if (!rows || !rows.length || rows[0].is_active === false) return null;
      return rows[0];
    } catch (e) {
      console.warn("auth: fetchRole error:", e.message);
      return null;
    }
  }

  // ── processSession ────────────────────────────────────────────────
  async function processSession(session) {
    if (_sessionProcessed) { console.info("auth: skip duplikat"); return; }
    _sessionProcessed = true;

    const u     = session.user;
    const email = (u.email || "").toLowerCase();
    const token = session.access_token;

    console.info("auth: processSession →", email);

    let roleData = null;
    try { roleData = await fetchRole(email, token); } catch(e) {}

    const roleName = roleData?.role || "admin";
    const roleDef  = ROLES[roleName] || ROLES.admin;

    window.authUser = {
      id:        u.id,
      email,
      name:      roleData?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || email.split("@")[0],
      avatar:    u.user_metadata?.avatar_url || u.user_metadata?.picture || "",
      role:      roleName,
      roleLabel: roleDef.label,
      canEdit:   roleDef.canEdit,
      canDelete: roleDef.canDelete,
    };

    console.info("auth ✅", email, "| role:", roleName, "| canEdit:", roleDef.canEdit);
    setGuest(false);
    renderLoggedIn(window.authUser);
    patchSidebar(window.authUser);
  }

  // ── SIGN IN — popup flow (bypass Tracking Prevention) ────────────
  // Popup tidak memerlukan redirect → tidak ada cross-site storage block.
  // Supabase memunculkan window popup Google, user pilih akun,
  // popup tertutup dan onAuthStateChange di parent window langsung fire.
  async function signIn() {
    const cl = window.client; // pakai client yang sama dengan app.js
    if (!cl) { alert("Halaman belum siap, coba lagi."); return; }

    const btn = document.getElementById("authLoginBtn");
    if (btn) { btn.innerHTML = "⏳ Menghubungkan…"; btn.disabled = true; }

    try {
      // ── Coba popup dulu ───────────────────────────────────────────
      // Buka URL OAuth manual sebagai popup, tangkap hasilnya
      const { data, error } = await cl.auth.signInWithOAuth({
        provider: "google",
        options:  {
          skipBrowserRedirect: true,           // jangan redirect halaman ini
          redirectTo: window.location.origin + window.location.pathname,
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (error) throw error;

      // Buka popup ke URL yang dikembalikan Supabase
      const authUrl = data?.url;
      if (!authUrl) throw new Error("URL OAuth tidak tersedia");

      const popup = window.open(
        authUrl,
        "supabase-google-login",
        "width=500,height=620,left=" + Math.round((screen.width-500)/2) +
        ",top=" + Math.round((screen.height-620)/2) +
        ",resizable=yes,scrollbars=yes,status=yes"
      );

      if (!popup || popup.closed) {
        // Popup diblokir browser → fallback ke redirect biasa
        console.warn("auth: popup diblokir, fallback ke redirect");
        await cl.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin + window.location.pathname },
        });
        return;
      }

      // Pantau popup: tunggu sampai ditutup, lalu cek session
      btn.innerHTML = "⏳ Menunggu login…";
      const timer = setInterval(async () => {
        if (!popup.closed) return;
        clearInterval(timer);

        console.info("auth: popup tertutup, cek session...");
        btn && (btn.disabled = false);

        // Cek session setelah popup tertutup
        const { data: { session } } = await cl.auth.getSession();
        if (session) {
          console.info("auth: session ditemukan setelah popup →", session.user?.email);
          await processSession(session);
        } else {
          console.warn("auth: tidak ada session setelah popup tutup");
          renderGuest();
        }
      }, 500);

    } catch (e) {
      console.error("auth: signIn error:", e.message);
      alert("Login gagal: " + e.message);
      renderGuest();
    }
  }

  // ── Sign Out ──────────────────────────────────────────────────────
  async function signOut() {
    _sessionProcessed = false;
    const cl = window.client;
    if (cl) await cl.auth.signOut();
  }
  window.authSignOut = signOut;

  // ── Init — tunggu window.client dari app.js ───────────────────────
  // Pakai SATU client saja (window.client) — hilangkan warning multiple instances
  function waitForClient(cb, n) {
    n = n || 0;
    if (n > 300) { console.error("auth: window.client tidak tersedia"); return; }
    if (window.client) { cb(window.client); return; }
    setTimeout(() => waitForClient(cb, n + 1), 50);
  }

  function initAuth(cl) {
    console.info("auth: init dengan window.client");
    setGuest(true);

    // Dengarkan perubahan session dari window.client
    cl.auth.onAuthStateChange(async (event, session) => {
      console.info("auth: onAuthStateChange →", event, "|", session?.user?.email || "null");
      if (event === "SIGNED_OUT" || !session) {
        _sessionProcessed = false;
        window.authUser   = null;
        setGuest(true);
        renderGuest();
        resetSidebar();
        return;
      }
      if (["SIGNED_IN","INITIAL_SESSION","TOKEN_REFRESHED"].includes(event) && session.user) {
        await processSession(session);
      }
    });

    // Cek session existing (reload halaman)
    cl.auth.getSession().then(async ({ data: { session } }) => {
      console.info("auth: getSession →", session?.user?.email || "null");
      if (session) {
        await processSession(session);
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
