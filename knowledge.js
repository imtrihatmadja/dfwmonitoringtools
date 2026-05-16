// ================================================================
// knowledge.js — Knowledge Base Management + RSS Reader
// PMIS DFW Indonesia  v22 (Google News direct fetch)
// ================================================================

// ─── RSS proxy fallback untuk feed non-Google ──────────────────
const RSS_PROXY     = 'https://api.allorigins.win/get?url=';
const GOOGLE_NEWS_RE = /^https:\/\/news\.google\.com\/rss/;

// ─── Default RSS feeds via Google News (no CORS, no API key) ──
const DEFAULT_FEEDS = [
  { name: 'Perikanan Indonesia',     url: 'https://news.google.com/rss/search?q=perikanan+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'IUU Fishing',             url: 'https://news.google.com/rss/search?q=IUU+fishing&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Hak Buruh Nelayan',       url: 'https://news.google.com/rss/search?q=hak+buruh+nelayan+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'Perbudakan Kapal',        url: 'https://news.google.com/rss/search?q=perbudakan+kapal+nelayan&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'KKP Kebijakan Perikanan', url: 'https://news.google.com/rss/search?q=KKP+kebijakan+perikanan&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'Destructive Fishing',     url: 'https://news.google.com/rss/search?q=destructive+fishing+indonesia&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Forced Labour Fishing',   url: 'https://news.google.com/rss/search?q=forced+labour+fishing+vessel&hl=en-US&gl=US&ceid=US:en' },
];

// ─── Module state ──────────────────────────────────────────────
let _kbTopics      = [];
let _kbArticles    = [];
let _kbDocs        = [];
let _kbFeeds       = [];
let _kbSubTab      = 'rss';
let _kbActiveTopic = null;
let _rssResults    = [];
let _rssLoading    = false;

function _kbEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Entry point ───────────────────────────────────────────────
window.initKnowledgeBase = async function () {
  await _loadKbTopics();
  await _loadKbArticles();
  await _loadKbDocs();
  await _loadKbFeeds();
  _renderKbSubTabs();
  _renderKbSubTabContent();
};

// ──────────────────────────────────────────────────────────────
// DATA LOADERS
// ──────────────────────────────────────────────────────────────
async function _loadKbTopics() {
  const db = window.client;
  if (!db) return;
  const { data } = await db.from('kb_topics').select('*').order('name');
  _kbTopics = data || [];
}
async function _loadKbArticles() {
  const db = window.client;
  if (!db) return;
  const { data } = await db.from('kb_articles').select('*').order('published_at', { ascending: false }).limit(200);
  _kbArticles = data || [];
}
async function _loadKbDocs() {
  const db = window.client;
  if (!db) return;
  const { data } = await db.from('kb_documents').select('*').order('created_at', { ascending: false });
  _kbDocs = data || [];
}
async function _loadKbFeeds() {
  const db = window.client;
  if (!db) return;
  const { data } = await db.from('kb_rss_feeds').select('*').order('feed_name');
  _kbFeeds = data || [];
}

// ──────────────────────────────────────────────────────────────
// RENDER LAYOUT
// ──────────────────────────────────────────────────────────────
function _renderKbSubTabs() {
  const tab = document.getElementById('tab-knowledge');
  if (!tab) return;
  const tabs = [
    { id: 'rss',    icon: '📡', label: 'RSS Reader' },
    { id: 'docs',   icon: '📁', label: 'Repositori Dokumen' },
    { id: 'topics', icon: '🏷️', label: 'Kelola Topik' },
  ];
  tab.innerHTML = `
    <div class="kb-page">
      <div class="kb-header">
        <h2 class="kb-title">📚 Knowledge Base</h2>
        <div class="kb-subtabs">
          ${tabs.map(t => `<button class="kb-subtab-btn${_kbSubTab===t.id?' active':''}" onclick="_kbSwitchTab('${t.id}')">${t.icon} ${t.label}</button>`).join('')}
        </div>
      </div>
      <div id="kb-sub-content"></div>
    </div>`;
  _renderKbSubTabContent();
}

function _kbSwitchTab(tabId) {
  _kbSubTab = tabId;
  document.querySelectorAll('.kb-subtab-btn').forEach(b => b.classList.toggle('active', b.textContent.includes(tabId==='rss'?'RSS':tabId==='docs'?'Repositori':'Topik')));
  _renderKbSubTabContent();
}
window._kbSwitchTab = _kbSwitchTab;

function _renderKbSubTabContent() {
  const el = document.getElementById('kb-sub-content');
  if (!el) return;
  if (_kbSubTab === 'rss')    el.innerHTML = _buildRssPanel();
  if (_kbSubTab === 'docs')   el.innerHTML = _buildDocsPanel();
  if (_kbSubTab === 'topics') el.innerHTML = _buildTopicsPanel();
}

// ──────────────────────────────────────────────────────────────
// RSS PANEL
// ──────────────────────────────────────────────────────────────
function _buildRssPanel() {
  const savedFeeds = _kbFeeds.map(f =>
    `<option value="${_kbEsc(f.feed_url)}">${_kbEsc(f.feed_name)}</option>`).join('');
  const defaultOpts = DEFAULT_FEEDS.map(f =>
    `<option value="${_kbEsc(f.url)}">${_kbEsc(f.name)}</option>`).join('');
  return `
    <div class="kb-rss-panel">
      <div class="kb-rss-toolbar">
        <div class="kb-rss-source-group">
          <label class="kb-label">Pilih Sumber RSS</label>
          <select id="kb-rss-select" class="kb-select" onchange="kbOnFeedSelect(this.value)">
            <option value="">-- Pilih sumber RSS --</option>
            <optgroup label="📌 Sumber Tersimpan">${savedFeeds || '<option disabled>Belum ada sumber tersimpan</option>'}</optgroup>
            <optgroup label="⭐ Sumber Default DFW">${defaultOpts}</optgroup>
          </select>
        </div>
        <div class="kb-rss-url-group">
          <label class="kb-label">Atau masukkan URL RSS</label>
          <div class="kb-rss-url-row">
            <input id="kb-rss-url" class="kb-input" type="url" placeholder="https://example.com/feed.xml" />
            <button class="btn-primary" onclick="kbFetchRss()">🔍 Muat</button>
            <button class="btn-secondary" onclick="kbSaveFeed()" title="Simpan sumber ini">💾 Simpan</button>
          </div>
        </div>
        <div class="kb-rss-filter-group">
          <label class="kb-label">Filter kata kunci</label>
          <div class="kb-rss-url-row">
            <input id="kb-rss-keywords" class="kb-input" type="text" placeholder="contoh: nelayan, IUU, buruh" />
          </div>
        </div>
      </div>
      <div id="kb-rss-status" class="kb-status"></div>
      <div id="kb-rss-list" class="kb-rss-list">
        <div class="kb-empty">
          <i class="fa-solid fa-satellite-dish"></i>
          <p>Pilih sumber RSS di atas untuk menampilkan berita terbaru</p>
        </div>
      </div>
    </div>`;
}

window.kbOnFeedSelect = function(url) {
  if (!url) return;
  const urlInput = document.getElementById('kb-rss-url');
  if (urlInput) urlInput.value = url;
  kbFetchRss();
};

window.kbFetchRss = async function() {
  if (_rssLoading) return;
  const urlInput  = document.getElementById('kb-rss-url');
  const statusEl  = document.getElementById('kb-rss-status');
  const listEl    = document.getElementById('kb-rss-list');
  const kwInput   = document.getElementById('kb-rss-keywords');

  const feedUrl  = urlInput?.value?.trim();
  const keywords = (kwInput?.value || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);

  if (!feedUrl) { if(statusEl) statusEl.textContent = '⚠️ Masukkan URL RSS terlebih dahulu.'; return; }

  _rssLoading = true;
  if (statusEl) statusEl.textContent = '⏳ Memuat artikel...';
  if (listEl)   listEl.innerHTML = '<div class="kb-loading"><i class="fa-solid fa-spinner fa-spin"></i> Mengambil data RSS...</div>';

  try {
    let xmlText = '';

    if (GOOGLE_NEWS_RE.test(feedUrl)) {
      // Google News RSS dapat diakses langsung tanpa proxy CORS
      const resp = await fetch(feedUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      xmlText = await resp.text();
    } else {
      // Feed lain: gunakan allorigins sebagai proxy CORS
      const apiUrl = RSS_PROXY + encodeURIComponent(feedUrl);
      const resp   = await fetch(apiUrl);
      if (!resp.ok) throw new Error('Proxy error ' + resp.status);
      const data   = await resp.json();
      if (!data.contents) throw new Error('Respons proxy kosong');
      xmlText = data.contents;
    }

    // Parse XML RSS/Atom
    const parser    = new DOMParser();
    const xml       = parser.parseFromString(xmlText, 'text/xml');
    const parseErr  = xml.querySelector('parsererror');
    if (parseErr) throw new Error('Format XML tidak valid — pastikan URL adalah RSS/Atom feed');

    const isAtom    = xml.querySelector('feed') !== null;
    const nodes     = [...xml.querySelectorAll(isAtom ? 'entry' : 'item')].slice(0, 50);
    const feedTitle = xml.querySelector(isAtom ? 'feed > title' : 'channel > title')?.textContent || feedUrl;

    if (nodes.length === 0) throw new Error('Tidak ada artikel ditemukan dalam feed ini');

    const getText = (el, tag) => el.querySelector(tag)?.textContent?.trim() || '';
    const getLink = (el) => {
      if (isAtom) return el.querySelector('link')?.getAttribute('href') || getText(el, 'link') || '';
      return getText(el, 'link') || getText(el, 'guid') || '';
    };
    const getDesc = (el) => {
      const raw = isAtom
        ? (getText(el,'summary') || getText(el,'content'))
        : (getText(el,'description') || el.querySelector('content\\:encoded')?.textContent?.trim() || '');
      return raw.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,250);
    };
    const getDate = (el) => isAtom ? getText(el,'published') || getText(el,'updated') : getText(el,'pubDate');

    let items = nodes.map(el => ({
      title       : getText(el,'title') || '(tanpa judul)',
      url         : getLink(el),
      source      : feedTitle,
      summary     : getDesc(el),
      published_at: getDate(el),
    }));

    if (keywords.length) {
      items = items.filter(item => {
        const text = (item.title + ' ' + item.summary).toLowerCase();
        return keywords.some(kw => text.includes(kw));
      });
    }

    _rssResults = items;
    if (statusEl) statusEl.textContent = `✅ ${_rssResults.length} artikel ditemukan dari "${feedTitle}"` + (keywords.length ? ` (filter: ${keywords.join(', ')})` : '');
    _renderRssResults();

  } catch(e) {
    if (statusEl) statusEl.textContent = '❌ Gagal memuat: ' + e.message;
    if (listEl)   listEl.innerHTML = '<div class="kb-empty"><i class="fa-solid fa-circle-exclamation"></i><p>Tidak bisa memuat RSS.<br><small>' + _kbEsc(e.message) + '</small></p></div>';
  } finally {
    _rssLoading = false;
  }
};

function _renderRssResults() {
  const listEl = document.getElementById('kb-rss-list');
  if (!listEl) return;
  if (!_rssResults.length) {
    listEl.innerHTML = '<div class="kb-empty"><p>Tidak ada artikel yang cocok dengan filter.</p></div>';
    return;
  }
  listEl.innerHTML = _rssResults.map(item => {
    const dateStr = item.published_at ? new Date(item.published_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '';
    return `<div class="kb-article-card">
      <div class="kb-article-meta">
        <span class="kb-article-source">${_kbEsc(item.source)}</span>
        ${dateStr ? `<span class="kb-article-date">${dateStr}</span>` : ''}
      </div>
      <a class="kb-article-title" href="${_kbEsc(item.url)}" target="_blank" rel="noopener">${_kbEsc(item.title)}</a>
      ${item.summary ? `<p class="kb-article-summary">${_kbEsc(item.summary)}</p>` : ''}
      <div class="kb-article-actions">
        <button class="btn-secondary btn-sm" onclick="kbSaveArticle(${JSON.stringify({title:item.title,url:item.url,source:item.source,summary:item.summary,published_at:item.published_at}).replace(/"/g,'&quot;')})">💾 Simpan Artikel</button>
        <a class="btn-ghost btn-sm" href="${_kbEsc(item.url)}" target="_blank" rel="noopener">🔗 Buka</a>
      </div>
    </div>`;
  }).join('');
}

window.kbSaveArticle = async function(item) {
  const db = window.client;
  if (!db) return;
  const topicId = _kbActiveTopic;
  const { error } = await db.from('kb_articles').insert({
    title: item.title, url: item.url, source: item.source,
    summary: item.summary, published_at: item.published_at || null, topic_id: topicId
  });
  if (error) { alert('Gagal simpan: ' + error.message); return; }
  alert('✅ Artikel berhasil disimpan ke Knowledge Base!');
  await _loadKbArticles();
};

window.kbSaveFeed = async function() {
  const db = window.client;
  const url = document.getElementById('kb-rss-url')?.value?.trim();
  if (!url) { alert('Masukkan URL feed terlebih dahulu'); return; }
  const name = prompt('Nama untuk sumber RSS ini:', url.replace(/https?:\/\//,'').split('/')[0]) || url;
  const { error } = await db.from('kb_rss_feeds').insert({ feed_name: name, feed_url: url });
  if (error) { alert('Gagal: ' + error.message); return; }
  alert('✅ Sumber RSS tersimpan!');
  await _loadKbFeeds();
  _renderKbSubTabContent();
};

// ──────────────────────────────────────────────────────────────
// DOCS PANEL
// ──────────────────────────────────────────────────────────────
function _buildDocsPanel() {
  const topicOpts = _kbTopics.map(t => `<option value="${t.id}">${_kbEsc(t.name)}</option>`).join('');
  const docs = _kbActiveTopic ? _kbDocs.filter(d => d.topic_id === _kbActiveTopic) : _kbDocs;
  return `
    <div class="kb-docs-panel">
      <div class="kb-docs-toolbar">
        <select class="kb-select" onchange="_kbFilterDocsByTopic(this.value)">
          <option value="">Semua Topik</option>
          ${topicOpts}
        </select>
        <button class="btn-primary" onclick="kbOpenAddDocModal()">➕ Tambah Referensi</button>
      </div>
      <div class="kb-docs-list">
        ${docs.length ? docs.map(d => `
          <div class="kb-doc-item">
            <div class="kb-doc-icon">📄</div>
            <div class="kb-doc-info">
              <a class="kb-doc-title" href="${_kbEsc(d.url||'#')}" target="_blank">${_kbEsc(d.title)}</a>
              ${d.description ? `<p class="kb-doc-desc">${_kbEsc(d.description)}</p>` : ''}
              <div class="kb-doc-meta">
                ${d.doc_type ? `<span class="kb-badge">${_kbEsc(d.doc_type)}</span>` : ''}
                ${d.year ? `<span class="kb-badge">${d.year}</span>` : ''}
              </div>
            </div>
            <button class="btn-ghost btn-sm" onclick="kbDeleteDoc('${d.id}')" title="Hapus">🗑️</button>
          </div>`).join('') :
          '<div class="kb-empty"><i class="fa-solid fa-folder-open"></i><p>Belum ada dokumen referensi.</p></div>'
        }
      </div>
    </div>`;
}
window._kbFilterDocsByTopic = function(topicId) {
  _kbActiveTopic = topicId || null;
  _renderKbSubTabContent();
};
window.kbDeleteDoc = async function(id) {
  if (!confirm('Hapus dokumen ini?')) return;
  const db = window.client;
  await db.from('kb_documents').delete().eq('id', id);
  await _loadKbDocs();
  _renderKbSubTabContent();
};
window.kbOpenAddDocModal = function() {
  let m = document.getElementById('kb-add-doc-modal');
  if (!m) { m = document.createElement('div'); m.id='kb-add-doc-modal'; document.body.appendChild(m); }
  const topicOpts = _kbTopics.map(t=>`<option value="${t.id}">${_kbEsc(t.name)}</option>`).join('');
  m.className = 'doc-modal-overlay';
  m.innerHTML = `<div class="doc-modal" style="max-width:480px">
    <div class="doc-modal-header"><h3 style="margin:0;font-size:16px">Tambah Dokumen Referensi</h3>
    <button class="doc-modal-close" onclick="document.getElementById('kb-add-doc-modal').style.display='none'">✕</button></div>
    <div class="doc-modal-body" style="display:flex;flex-direction:column;gap:12px">
      <input id="kb-doc-title" class="kb-input" placeholder="Judul dokumen *" />
      <input id="kb-doc-url"   class="kb-input" type="url" placeholder="URL (opsional)" />
      <input id="kb-doc-desc"  class="kb-input" placeholder="Deskripsi singkat" />
      <select id="kb-doc-topic" class="kb-select"><option value="">-- Pilih Topik --</option>${topicOpts}</select>
      <input id="kb-doc-year"  class="kb-input" type="number" placeholder="Tahun (misal: 2024)" />
    </div>
    <div class="doc-modal-footer">
      <button class="btn-secondary" onclick="document.getElementById('kb-add-doc-modal').style.display='none'">Batal</button>
      <button class="btn-primary" onclick="kbSubmitAddDoc()">💾 Simpan</button>
    </div>
  </div>`;
  m.style.display = 'flex';
};
window.kbSubmitAddDoc = async function() {
  const db = window.client;
  const title = document.getElementById('kb-doc-title')?.value?.trim();
  if (!title) { alert('Judul wajib diisi'); return; }
  const { error } = await db.from('kb_documents').insert({
    title, url: document.getElementById('kb-doc-url')?.value?.trim() || null,
    description: document.getElementById('kb-doc-desc')?.value?.trim() || null,
    topic_id: document.getElementById('kb-doc-topic')?.value || null,
    year: Number(document.getElementById('kb-doc-year')?.value) || null,
  });
  if (error) { alert('Gagal: ' + error.message); return; }
  document.getElementById('kb-add-doc-modal').style.display = 'none';
  await _loadKbDocs();
  _renderKbSubTabContent();
};

// ──────────────────────────────────────────────────────────────
// TOPICS PANEL
// ──────────────────────────────────────────────────────────────
function _buildTopicsPanel() {
  return `
    <div class="kb-topics-panel">
      <div class="kb-topics-add">
        <input id="kb-new-topic" class="kb-input" placeholder="Nama topik baru..." />
        <button class="btn-primary" onclick="kbAddTopic()">➕ Tambah</button>
      </div>
      <div class="kb-topics-list">
        ${_kbTopics.length ? _kbTopics.map(t=>`
          <div class="kb-topic-item">
            <span class="kb-topic-name">${_kbEsc(t.name)}</span>
            <button class="btn-ghost btn-sm" onclick="kbDeleteTopic('${t.id}')">🗑️</button>
          </div>`).join('') :
          '<div class="kb-empty"><p>Belum ada topik. Tambahkan topik untuk mengorganisir konten.</p></div>'
        }
      </div>
    </div>`;
}
window.kbAddTopic = async function() {
  const db = window.client;
  const name = document.getElementById('kb-new-topic')?.value?.trim();
  if (!name) return;
  const { error } = await db.from('kb_topics').insert({ name });
  if (error) { alert('Gagal: ' + error.message); return; }
  document.getElementById('kb-new-topic').value = '';
  await _loadKbTopics();
  _renderKbSubTabContent();
};
window.kbDeleteTopic = async function(id) {
  if (!confirm('Hapus topik ini?')) return;
  const db = window.client;
  await db.from('kb_topics').delete().eq('id', id);
  await _loadKbTopics();
  _renderKbSubTabContent();
};

// ─── Init via MutationObserver (sama seperti modul lain) ───────
document.addEventListener('DOMContentLoaded', () => {
  new MutationObserver(() => {
    const t = document.getElementById('tab-knowledge');
    if (t?.classList.contains('active') && !t.dataset.kbInit) {
      t.dataset.kbInit = '1';
      window.initKnowledgeBase();
    }
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
});
