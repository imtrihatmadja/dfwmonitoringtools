// =====================================================================
// auth.js  —  Google OAuth + Role Guard
// Diload SEBELUM app.js. Tidak mengubah app.js / app_sprint4.js sama sekali.
// =====================================================================

(function () {
  "use strict";

  // ── Supabase config (sama dengan app.js) ──────────────────────────
  const SUPABASE_URL      = "https://zdfxcxkgmksaeigyuibe.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZnhjeGtnbWtzYWVpZ3l1aWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3Mjc0NjAsImV4cCI6MjA5MjMwMzQ2MH0.baUlaWNvN3wMKHL05E71aSxedjKvWhfVQXHGXraWyVU";

  // ── Role config ───────────────────────────────────────────────────
  // Daftar role dan hak aksesnya. Sesuaikan seperlunya.
  const ROLES = {
    admin:    { label: "Administrator",     canEdit: true,  canDelete: true,  canViewAll: true  },
    manager:  { label: "Program Manager",   canEdit: true,  canDelete: false, canViewAll: true  },
    staff:    { label: "Staff",             canEdit: true,  canDelete: false, canViewAll: false },
    viewer:   { label: "Viewer / Tamu",     canEdit: false, canDelete: false, canViewAll: false },
  };
  const DEFAULT_ROLE = "viewer";

  // ── State ─────────────────────────────────────────────────────────
  window.authUser     = null;   // { id, email, name, avatar, role, roleLabel, canEdit, canDelete, canViewAll }
  window.authClient   = null;   // supabase client khusus auth (dibuat setelah supabase-js dimuat)

  // ── Helper: tunggu supabase-js tersedia ──────────────────────────
  function waitForSupabase(cb, tries) {
    tries = tries || 0;
    if (tries > 100) { console.error("auth.js: supabase-js tidak dimuat."); return; }
    if (window.supabase && window.supabase.createClient) { cb(); }
    else { setTimeout(() => waitForSupabase(cb, tries + 1), 50); }
  }

  // ── Render: layar login ───────────────────────────────────────────
  function renderLoginScreen(msg) {
    const el = document.getElementById("auth-screen");
    if (!el) return;
    el.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">
          <svg width="44" height="44" viewBox="0 0 30 30" fill="none" aria-label="Logo">
            <rect width="30" height="30" rx="8" fill="#2563eb"/>
            <rect x="6"  y="14" width="5" height="11" rx="2" fill="white"/>
            <rect x="13" y="10" width="5" height="15" rx="2" fill="white" opacity=".85"/>
            <rect x="20" y="6"  width="5" height="19" rx="2" fill="white" opacity=".7"/>
          </svg>
        </div>
        <div class="auth-brand">DFW-I ME Tools</div>
        <div class="auth-tagline">Masuk untuk melanjutkan</div>
        ${msg ? `<div class="auth-error">${msg}</div>` : ""}
        <button class="auth-google-btn" id="authGoogleBtn">
          <svg width="18" height="18" viewBox="0 0 48 48" style="flex-shrink:0">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>Masuk dengan Google</span>
        </button>
        <div class="auth-footer">
          Akses diatur oleh administrator sistem
        </div>
      </div>
    `;
    el.classList.remove("hidden");
    document.getElementById("authGoogleBtn").addEventListener("click", signInWithGoogle);
  }

  // ── Render: layar loading ─────────────────────────────────────────
  function renderLoadingScreen(text) {
    const el = document.getElementById("auth-screen");
    if (!el) return;
    el.innerHTML = `
      <div class="auth-card">
        <div class="auth-spinner"></div>
        <div style="font-size:14px;color:#64748b;margin-top:14px">${text || "Memuat…"}</div>
      </div>
    `;
    el.classList.remove("hidden");
  }

  // ── Render: akses ditolak ─────────────────────────────────────────
  function renderAccessDenied(email) {
    const el = document.getElementById("auth-screen");
    if (!el) return;
    el.innerHTML = `
      <div class="auth-card">
        <div style="font-size:36px;margin-bottom:10px">🚫</div>
        <div class="auth-brand" style="color:#dc2626">Akses Ditolak</div>
        <div style="font-size:13px;color:#64748b;margin:10px 0 18px;text-align:center;line-height:1.6">
          Akun <strong>${email}</strong> belum terdaftar atau belum diaktifkan.<br>
          Hubungi administrator untuk mendapatkan akses.
        </div>
        <button class="auth-google-btn" id="authSignOutBtn" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5">
          <span>Keluar / Coba Akun Lain</span>
        </button>
      </div>
    `;
    el.classList.remove("hidden");
    document.getElementById("authSignOutBtn").addEventListener("click", signOut);
  }

  // ── Sign In dengan Google ─────────────────────────────────────────
  async function signInWithGoogle() {
    try {
      renderLoadingScreen("Menghubungkan ke Google…");
      const { error } = await window.authClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.href.split("?")[0].split("#")[0],
        },
      });
      if (error) { renderLoginScreen("⚠️ " + error.message); }
    } catch (e) {
      renderLoginScreen("⚠️ " + e.message);
    }
  }

  // ── Sign Out ─────────────────────────────────────────────────────
  async function signOut() {
    await window.authClient.auth.signOut();
    window.authUser = null;
    hideApp();
    renderLoginScreen();
  }
  window.authSignOut = signOut;

  // ── Tampilkan / sembunyikan app ───────────────────────────────────
  function showApp() {
    const el = document.getElementById("auth-screen");
    if (el) el.classList.add("hidden");
    // Sidebar, main, dll sudah ada di DOM — hanya perlu dishow
    document.querySelectorAll(".sidebar, .main").forEach(el => el.style.display = "");
  }

  function hideApp() {
    document.querySelectorAll(".sidebar, .main").forEach(el => el.style.display = "none");
  }

  // ── Patch sidebar footer: tampilkan user info ────────────────────
  function patchSidebarUser(user) {
    const avatarEl  = document.querySelector(".user-avatar");
    const nameEl    = document.querySelector(".user-name");
    const roleEl    = document.querySelector(".user-role");
    if (avatarEl) {
      if (user.avatar) {
        avatarEl.innerHTML = `<img src="${user.avatar}" alt="${user.name}" style="width:100%;height:100%;border-radius:8px;object-fit:cover">`;
      } else {
        avatarEl.textContent = (user.name || user.email || "?").charAt(0).toUpperCase();
      }
    }
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (roleEl) roleEl.textContent = user.roleLabel || user.role;

    // Tambah tombol logout di sidebar footer jika belum ada
    const footer = document.querySelector(".sidebar-footer");
    if (footer && !footer.querySelector(".auth-logout-btn")) {
      const logoutBtn = document.createElement("button");
      logoutBtn.className = "auth-logout-btn";
      logoutBtn.title = "Keluar";
      logoutBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> <span>Keluar</span>`;
      logoutBtn.addEventListener("click", signOut);
      footer.appendChild(logoutBtn);
    }
  }

  // ── Ambil role user dari tabel user_roles di Supabase ────────────
  // Tabel: user_roles (id, email, role, is_active)
  // Jika user tidak ada di tabel → akses ditolak
  async function fetchUserRole(email) {
    try {
      const { data, error } = await window.authClient
        .from("user_roles")
        .select("role, is_active, display_name")
        .eq("email", email.toLowerCase())
        .single();

      if (error || !data) return null;
      if (data.is_active === false) return null;
      return data;
    } catch (e) {
      console.error("fetchUserRole error:", e);
      return null;
    }
  }

  // ── Guard: cek apakah user boleh melakukan aksi tertentu ─────────
  window.authCan = function (action) {
    if (!window.authUser) return false;
    if (action === "edit")      return !!window.authUser.canEdit;
    if (action === "delete")    return !!window.authUser.canDelete;
    if (action === "viewAll")   return !!window.authUser.canViewAll;
    return false;
  };

  // ── Patch elemen UI berdasarkan role ─────────────────────────────
  // Elemen dengan class "auth-require-edit" disembunyikan untuk viewer
  // Elemen dengan class "auth-require-delete" disembunyikan kecuali admin
  function applyRoleVisibility() {
    if (!window.authUser) return;
    const user = window.authUser;

    if (!user.canEdit) {
      document.querySelectorAll(".auth-require-edit").forEach(el => {
        el.style.display = "none";
      });
    }
    if (!user.canDelete) {
      document.querySelectorAll(".auth-require-delete").forEach(el => {
        el.style.display = "none";
      });
    }
  }
  window.authApplyRoleVisibility = applyRoleVisibility;

  // ── Intercept app.js AUDIT_USER agar memakai nama login ─────────
  // Dijalan setelah app.js selesai load
  function patchAuditUser() {
    if (window.authUser && window.authUser.name) {
      // app.js mendefinisikan AUDIT_USER sebagai const — kita override via window
      window.AUDIT_USER_OVERRIDE = window.authUser.name;
    }
  }

  // ── Main auth flow ────────────────────────────────────────────────
  function initAuth() {
    window.authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Sembunyikan app sampai auth selesai
    hideApp();

    // Dengarkan perubahan session (termasuk redirect setelah OAuth)
    window.authClient.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        window.authUser = null;
        hideApp();
        renderLoginScreen();
        return;
      }

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (!session?.user) {
          renderLoginScreen();
          return;
        }

        const supaUser = session.user;
        const email    = supaUser.email || "";

        renderLoadingScreen("Memverifikasi akses…");

        // Cek role di tabel user_roles
        const roleData = await fetchUserRole(email);

        if (!roleData) {
          // User tidak terdaftar atau tidak aktif
          await window.authClient.auth.signOut();
          renderAccessDenied(email);
          return;
        }

        const roleName = roleData.role || DEFAULT_ROLE;
        const roleDef  = ROLES[roleName] || ROLES[DEFAULT_ROLE];

        window.authUser = {
          id        : supaUser.id,
          email     : email,
          name      : roleData.display_name || supaUser.user_metadata?.full_name || email.split("@")[0],
          avatar    : supaUser.user_metadata?.avatar_url || "",
          role      : roleName,
          roleLabel : roleDef.label,
          canEdit   : roleDef.canEdit,
          canDelete : roleDef.canDelete,
          canViewAll: roleDef.canViewAll,
        };

        // Patch AUDIT_USER segera
        patchAuditUser();

        // Tampilkan app
        const authScreen = document.getElementById("auth-screen");
        if (authScreen) authScreen.classList.add("hidden");
        showApp();

        // Patch sidebar user info
        patchSidebarUser(window.authUser);

        // Patch visibility berdasarkan role
        applyRoleVisibility();

        // Jika app.js sudah dimuat, re-apply setelah render
        setTimeout(applyRoleVisibility, 800);
        setTimeout(applyRoleVisibility, 2000);
      }
    });

    // Cek session yang sudah ada (refresh halaman)
    window.authClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        renderLoginScreen();
      }
      // onAuthStateChange akan handle INITIAL_SESSION
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────
  // Tunggu DOM siap dan supabase-js tersedia
  function bootstrap() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => waitForSupabase(initAuth));
    } else {
      waitForSupabase(initAuth);
    }
  }

  bootstrap();

})();
