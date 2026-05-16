// ================================================================
// knowledge.js  v24 — Knowledge Base + RSS Reader
// PMIS DFW Indonesia
// Fix: pakai rss2json API (CORS-free, tidak perlu API key)
// ================================================================

// rss2json adalah layanan gratis yang handle CORS dan parse RSS/Atom
const _RSS2JSON = 'https://api.rss2json.com/v1/api.json?count=30&rss_url=';

const _DEFAULT_FEEDS = [
  { name: '🐟 Perikanan Indonesia',      url: 'https://news.google.com/rss/search?q=perikanan+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: '🚫 IUU Fishing',              url: 'https://news.google.com/rss/search?q=IUU+fishing+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: '👷 Hak Buruh Nelayan',        url: 'https://news.google.com/rss/search?q=hak+buruh+nelayan&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: '⛓️ Perbudakan Kapal',         url: 'https://news.google.com/rss/search?q=perbudakan+kapal+nelayan&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: '🏛️ KKP Kebijakan',           url: 'https://news.google.com/rss/search?q=KKP+kebijakan+perikanan&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: '⚓ Forced Labour Fishing',    url: 'https://news.google.com/rss/search?q=forced+labour+fishing+vessel&hl=en-US&gl=US&ceid=US:en' },
  { name: '🌊 Destructive Fishing',      url: 'https://news.google.com/rss/search?q=destructive+fishing+indonesia&hl=en-US&gl=US&ceid=US:en' },
  { name: '🔍 Anti Trafficking Nelayan', url: 'https://news.google.com/rss/search?q=trafficking+nelayan+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: '🗞️ Tempo Lingkungan',        url: 'https://www.tempo.co/tag/lingkungan' },
  { name: '📰 Antara Perikanan',         url: 'https://www.antaranews.com/rss/ekonomi' },
];

// ─── State ────────────────────────────────────────────────────
let _kbTopics   = [];
let _kbFeeds    = [];
let _kbArticles = [];
let _rssItems   = [];
let _rssLoading = false;
let _kbTab      = 'rss';

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────
window.initKnowledgeBase = async function () {
  const db = window.client;
  if (!db) return;
  try {
    const [t, f, a] = await Promise.all([
      db.from('kb_topics').select('*').order('name'),
      db.from('kb_rss_feeds').select('*').order('feed_name'),
      db.from('kb_articles').select('*').order('published_at',{ascending:false}).limit(100),
    ]);
    _kbTopics   = t.data || [];
    _kbFeeds    = f.data || [];
    _kbArticles = a.data || [];
  } catch(e) { console.warn('KB init:', e); }
  _renderKb();
};

// ─── Render utama ─────────────────────────────────────────────
function _renderKb() {
  const wrap = document.getElementById('tab-knowledge');
  if (!wrap) return;

  const tabs = [
    { id:'rss',      icon:'📡', label:'RSS Reader' },
    { id:'saved',    icon:'💾', label:'Artikel Tersimpan' },
    { id:'topics',   icon:'🏷️', label:'Topik' },
    { id:'settings', icon:'⚙️', label:'Kelola Sumber' },
  ];

  wrap.innerHTML = `
    <div style="max-width:960px">
      <div style="margin-bottom:20px">
        <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px">📚 Knowledge Base</h2>
        <p style="font-size:13px;color:#64748b">Pantau berita, simpan referensi, dan kelola sumber informasi</p>
      </div>
      <div style="display:flex;gap:4px;border-bottom:2px solid #e2e8f0;margin-bottom:20px;overflow-x:auto;padding-bottom:0">
        ${tabs.map(t=>`
          <button onclick="_kbSwitch('${t.id}')" id="kbtab-${t.id}"
            style="padding:9px 16px;border:none;border-bottom:2px solid ${_kbTab===t.id?'#2563eb':'transparent'};
                   margin-bottom:-2px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;
                   border-radius:6px 6px 0 0;background:${_kbTab===t.id?'#eff6ff':'none'};
                   color:${_kbTab===t.id?'#2563eb':'#64748b'};transition:all .18s">
            ${t.icon} ${t.label}
          </button>`).join('')}
      </div>
      <div id="kb-panel"></div>
    </div>`;

  _renderPanel();
}

window._kbSwitch = function(id) {
  _kbTab = id;
  document.querySelectorAll('[id^="kbtab-"]').forEach(btn => {
    const active = btn.id === 'kbtab-'+id;
    btn.style.color             = active ? '#2563eb' : '#64748b';
    btn.style.borderBottomColor = active ? '#2563eb' : 'transparent';
    btn.style.background        = active ? '#eff6ff' : 'none';
  });
  _renderPanel();
};

function _renderPanel() {
  const el = document.getElementById('kb-panel');
  if (!el) return;
  if (_kbTab === 'rss')      el.innerHTML = _buildRssPanel();
  if (_kbTab === 'saved')    el.innerHTML = _buildSavedPanel();
  if (_kbTab === 'topics')   el.innerHTML = _buildTopicsPanel();
  if (_kbTab === 'settings') el.innerHTML = _buildSettingsPanel();
}

// ═══════════════════════════════════════════════════════════════
// RSS PANEL
// ═══════════════════════════════════════════════════════════════
function _buildRssPanel() {
  const savedOpts = _kbFeeds.map(f =>
    `<option value="${_esc(f.feed_url)}">${_esc(f.feed_name)}</option>`).join('');
  const defOpts = _DEFAULT_FEEDS.map(f =>
    `<option value="${_esc(f.url)}">${_esc(f.name)}</option>`).join('');

  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;
                margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.05)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Pilih Sumber RSS</label>
          <select id="kb-feed-sel" class="search-input" style="width:100%;max-width:100%"
                  onchange="kbOnSelect(this.value)">
            <option value="">-- Pilih sumber --</option>
            ${savedOpts ? `<optgroup label="📌 Tersimpan">${savedOpts}</optgroup>` : ''}
            <optgroup label="⭐ Default DFW">${defOpts}</optgroup>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Filter kata kunci</label>
          <input id="kb-kw" class="search-input" style="width:100%;max-width:100%"
                 type="text" placeholder="nelayan, IUU, trafficking…" />
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;font-weight:600;color:#475569;white-space:nowrap">URL kustom:</label>
        <input id="kb-url" class="search-input" style="flex:1;min-width:180px"
               type="url" placeholder="https://example.com/feed.xml" />
        <button class="btn-primary btn-sm" onclick="kbFetchRss()">🔍 Muat</button>
        <button class="btn-secondary btn-sm" onclick="kbSaveFeed()">💾 Simpan</button>
      </div>
    </div>

    <div id="kb-status" style="font-size:13px;color:#475569;margin-bottom:10px;min-height:20px"></div>
    <div id="kb-results">
      <div style="text-align:center;padding:60px 20px;color:#94a3b8">
        <div style="font-size:40px;margin-bottom:12px">📡</div>
        <p>Pilih sumber RSS di atas untuk memuat berita terbaru</p>
      </div>
    </div>`;
}

window.kbOnSelect = function(url) {
  if (!url) return;
  const u = document.getElementById('kb-url');
  if (u) u.value = url;
  kbFetchRss();
};

window.kbFetchRss = async function() {
  if (_rssLoading) return;
  const urlEl     = document.getElementById('kb-url');
  const statusEl  = document.getElementById('kb-status');
  const resultsEl = document.getElementById('kb-results');
  const kwEl      = document.getElementById('kb-kw');

  const feedUrl  = urlEl?.value?.trim();
  const keywords = (kwEl?.value||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);

  if (!feedUrl) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#f97316">⚠️ Masukkan URL RSS terlebih dahulu.</span>';
    return;
  }

  _rssLoading = true;
  if (statusEl)  statusEl.innerHTML  = '<span style="color:#2563eb">⏳ Memuat artikel...</span>';
  if (resultsEl) resultsEl.innerHTML = `
    <div style="text-align:center;padding:40px;color:#64748b">
      <div style="font-size:28px;margin-bottom:10px">⏳</div>
      <p>Mengambil data RSS...</p>
    </div>`;

  try {
    // rss2json menangani CORS dan parse RSS/Atom secara otomatis
    const apiUrl  = _RSS2JSON + encodeURIComponent(feedUrl);
    const resp    = await fetch(apiUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data    = await resp.json();

    // Status bisa: ok, error, atau rate limit exceeded
    if (data.status === 'error') {
      throw new Error(data.message || 'Feed tidak dapat dibaca');
    }
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Format respons tidak dikenali');
    }
    if (data.items.length === 0) {
      throw new Error('Tidak ada artikel dalam feed ini');
    }

    const feedTitle = data.feed?.title || feedUrl;

    let items = data.items.map(it => ({
      title    : it.title     || '(tanpa judul)',
      url      : it.link      || it.guid || '',
      source   : feedTitle,
      summary  : (it.description || it.content || '').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,220),
      published: it.pubDate   || '',
      thumbnail: it.thumbnail || '',
    }));

    if (keywords.length) {
      items = items.filter(it => {
        const txt = (it.title+' '+it.summary).toLowerCase();
        return keywords.some(kw => txt.includes(kw));
      });
    }

    _rssItems = items;
    if (statusEl) statusEl.innerHTML =
      `<span style="color:#15803d">✅ <strong>${items.length}</strong> artikel dari <strong>${_esc(feedTitle)}</strong>`
      + (keywords.length ? ` — filter: <em>${keywords.join(', ')}</em>` : '') + `</span>`;
    _renderRssItems();

  } catch(e) {
    const msg = e.message;
    let hint = 'Coba pilih sumber lain dari daftar Default DFW.';
    if (msg.includes('rate') || msg.includes('limit')) {
      hint = 'Batas request tercapai. Tunggu 1 menit lalu coba lagi.';
    }
    if (statusEl)  statusEl.innerHTML  = `<span style="color:#dc2626">❌ Gagal: ${_esc(msg)}</span>`;
    if (resultsEl) resultsEl.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#94a3b8">
        <div style="font-size:36px;margin-bottom:12px">⚠️</div>
        <p style="font-size:14px;color:#dc2626;font-weight:600">${_esc(msg)}</p>
        <p style="font-size:12px;margin-top:8px;color:#64748b">${hint}</p>
      </div>`;
  } finally {
    _rssLoading = false;
  }
};

function _renderRssItems() {
  const el = document.getElementById('kb-results');
  if (!el) return;
  if (!_rssItems.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8">Tidak ada artikel yang sesuai filter.</div>';
    return;
  }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">` +
    _rssItems.map(item => {
      const dateStr = item.published
        ? (() => { try { return new Date(item.published).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}); } catch(e) { return ''; } })()
        : '';
      return `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;
                    display:flex;gap:14px;box-shadow:0 1px 4px rgba(0,0,0,.04);
                    transition:box-shadow .18s"
             onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'"
             onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.04)'">
          ${item.thumbnail
            ? `<img src="${_esc(item.thumbnail)}" alt="" loading="lazy"
                    style="width:80px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0" />`
            : ''}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-size:11px;color:#2563eb;font-weight:600;background:#eff6ff;
                           padding:2px 8px;border-radius:20px">${_esc(item.source)}</span>
              ${dateStr ? `<span style="font-size:11px;color:#94a3b8">${dateStr}</span>` : ''}
            </div>
            <a href="${_esc(item.url)}" target="_blank" rel="noopener"
               style="font-size:14px;font-weight:700;color:#0f172a;text-decoration:none;
                      line-height:1.4;display:block;margin-bottom:6px"
               onmouseover="this.style.color='#2563eb'" onmouseout="this.style.color='#0f172a'">
              ${_esc(item.title)}
            </a>
            ${item.summary
              ? `<p style="font-size:12px;color:#64748b;line-height:1.6;margin-bottom:10px">${_esc(item.summary)}…</p>`
              : ''}
            <div style="display:flex;gap:8px">
              <a href="${_esc(item.url)}" target="_blank" rel="noopener"
                 class="btn-secondary btn-sm">🔗 Buka</a>
              <button class="btn-primary btn-sm"
                onclick='kbSaveArticle(${JSON.stringify(item).replace(/"/g,"&quot;")})'>
                💾 Simpan
              </button>
            </div>
          </div>
        </div>`;
    }).join('') + `</div>`;
}

window.kbSaveArticle = async function(item) {
  const db = window.client;
  if (!db) { alert('Database tidak terhubung'); return; }
  const { error } = await db.from('kb_articles').insert({
    title: item.title, url: item.url, source: item.source,
    summary: item.summary, published_at: item.published || null,
  });
  if (error) { alert('Gagal simpan: ' + error.message); return; }
  alert('✅ Artikel berhasil disimpan!');
  const { data } = await window.client.from('kb_articles')
    .select('*').order('published_at',{ascending:false}).limit(100);
  _kbArticles = data || [];
};

window.kbSaveFeed = async function() {
  const db  = window.client;
  const url = document.getElementById('kb-url')?.value?.trim();
  if (!url) { alert('Masukkan URL feed terlebih dahulu'); return; }
  const name = prompt('Nama untuk sumber RSS ini:',
    url.replace(/https?:\/\//,'').split('/')[0]) || url;
  if (!name) return;
  const { error } = await db.from('kb_rss_feeds')
    .insert({ feed_name: name, feed_url: url });
  if (error) { alert('Gagal: ' + error.message); return; }
  alert('✅ Sumber RSS tersimpan!');
  const { data } = await window.client.from('kb_rss_feeds')
    .select('*').order('feed_name');
  _kbFeeds = data || [];
  _renderPanel();
};

// ═══════════════════════════════════════════════════════════════
// SAVED ARTICLES
// ═══════════════════════════════════════════════════════════════
function _buildSavedPanel() {
  if (!_kbArticles.length) return `
    <div style="text-align:center;padding:60px 20px;color:#94a3b8">
      <div style="font-size:40px;margin-bottom:12px">📰</div>
      <p>Belum ada artikel tersimpan.<br>
         Muat RSS lalu klik <strong>💾 Simpan</strong> pada artikel yang ingin disimpan.</p>
    </div>`;

  return `<div style="display:flex;flex-direction:column;gap:10px">` +
    _kbArticles.map(a => {
      const dateStr = a.published_at
        ? (() => { try { return new Date(a.published_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}); } catch(e) { return ''; } })()
        : '';
      return `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;
                    padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.04)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;
                      flex-wrap:wrap;justify-content:space-between">
            <span style="font-size:11px;color:#2563eb;font-weight:600;background:#eff6ff;
                         padding:2px 8px;border-radius:20px">${_esc(a.source||'—')}</span>
            ${dateStr ? `<span style="font-size:11px;color:#94a3b8">${dateStr}</span>` : ''}
          </div>
          <a href="${_esc(a.url||'#')}" target="_blank" rel="noopener"
             style="font-size:14px;font-weight:700;color:#0f172a;text-decoration:none;
                    line-height:1.4;display:block;margin-bottom:6px"
             onmouseover="this.style.color='#2563eb'" onmouseout="this.style.color='#0f172a'">
            ${_esc(a.title)}
          </a>
          ${a.summary ? `<p style="font-size:12px;color:#64748b;line-height:1.6;margin-bottom:10px">${_esc(a.summary)}</p>` : ''}
          <div style="display:flex;gap:8px">
            <a href="${_esc(a.url||'#')}" target="_blank" rel="noopener"
               class="btn-secondary btn-sm">🔗 Buka</a>
            <button class="btn-secondary btn-sm" style="color:#dc2626"
                    onclick="kbDeleteArticle('${a.id}')">🗑️ Hapus</button>
          </div>
        </div>`;
    }).join('') + `</div>`;
}

window.kbDeleteArticle = async function(id) {
  if (!confirm('Hapus artikel ini?')) return;
  const db = window.client;
  await db.from('kb_articles').delete().eq('id', id);
  const { data } = await db.from('kb_articles')
    .select('*').order('published_at',{ascending:false}).limit(100);
  _kbArticles = data || [];
  _renderPanel();
};

// ═══════════════════════════════════════════════════════════════
// TOPICS
// ═══════════════════════════════════════════════════════════════
function _buildTopicsPanel() {
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;
                box-shadow:0 1px 4px rgba(0,0,0,.05)">
      <h3 style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">🏷️ Kelola Topik</h3>
      <div style="display:flex;gap:8px;margin-bottom:18px">
        <input id="kb-new-topic" class="search-input" style="flex:1"
               placeholder="Nama topik baru..." />
        <button class="btn-primary btn-sm" onclick="kbAddTopic()">➕ Tambah</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${_kbTopics.length
          ? _kbTopics.map(t=>`
              <div style="display:flex;align-items:center;justify-content:space-between;
                          padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
                <span style="font-size:13px;font-weight:600;color:#0f172a">🏷️ ${_esc(t.name)}</span>
                <button class="btn-remove" onclick="kbDeleteTopic('${t.id}')" title="Hapus">🗑️</button>
              </div>`).join('')
          : `<p style="text-align:center;color:#94a3b8;padding:20px">
               Belum ada topik. Tambahkan topik untuk mengorganisir konten.
             </p>`
        }
      </div>
    </div>`;
}

window.kbAddTopic = async function() {
  const db   = window.client;
  const name = document.getElementById('kb-new-topic')?.value?.trim();
  if (!name) return;
  const { error } = await db.from('kb_topics').insert({ name });
  if (error) { alert('Gagal: ' + error.message); return; }
  document.getElementById('kb-new-topic').value = '';
  const { data } = await db.from('kb_topics').select('*').order('name');
  _kbTopics = data || [];
  _renderPanel();
};
window.kbDeleteTopic = async function(id) {
  if (!confirm('Hapus topik ini?')) return;
  const db = window.client;
  await db.from('kb_topics').delete().eq('id', id);
  const { data } = await db.from('kb_topics').select('*').order('name');
  _kbTopics = data || [];
  _renderPanel();
};

// ═══════════════════════════════════════════════════════════════
// SETTINGS — kelola sumber RSS tersimpan
// ═══════════════════════════════════════════════════════════════
function _buildSettingsPanel() {
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;
                box-shadow:0 1px 4px rgba(0,0,0,.05)">
      <h3 style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">⚙️ Sumber RSS Tersimpan</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${_kbFeeds.length
          ? _kbFeeds.map(f=>`
              <div style="display:flex;align-items:center;justify-content:space-between;
                          padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;
                          border-radius:8px;gap:10px">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:#0f172a">${_esc(f.feed_name)}</div>
                  <div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;
                              white-space:nowrap">${_esc(f.feed_url)}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0">
                  <button class="btn-edit" onclick="kbLoadFeed('${_esc(f.feed_url)}')"
                          title="Muat feed ini">▶️</button>
                  <button class="btn-remove" onclick="kbDeleteFeed('${f.id}')"
                          title="Hapus">🗑️</button>
                </div>
              </div>`).join('')
          : `<p style="text-align:center;color:#94a3b8;padding:20px">
               Belum ada sumber tersimpan.
             </p>`
        }
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-top:16px">
        💡 Tambah sumber: buka tab <strong>RSS Reader</strong> → isi URL kustom → klik <strong>💾 Simpan</strong>
      </p>
    </div>`;
}

window.kbLoadFeed = function(url) {
  _kbSwitch('rss');
  setTimeout(() => {
    const u = document.getElementById('kb-url');
    if (u) { u.value = url; kbFetchRss(); }
  }, 150);
};
window.kbDeleteFeed = async function(id) {
  if (!confirm('Hapus sumber ini?')) return;
  const db = window.client;
  await db.from('kb_rss_feeds').delete().eq('id', id);
  const { data } = await db.from('kb_rss_feeds').select('*').order('feed_name');
  _kbFeeds = data || [];
  _renderPanel();
};

// ─── Trigger init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  new MutationObserver(() => {
    const t = document.getElementById('tab-knowledge');
    if (t?.classList.contains('active') && !t.dataset.kbInit) {
      t.dataset.kbInit = '1';
      window.initKnowledgeBase();
    }
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
});
