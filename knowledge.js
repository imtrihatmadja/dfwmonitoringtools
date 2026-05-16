// ================================================================
// knowledge.js — Knowledge Base Management + RSS Reader
// PMIS DFW Indonesia
// ================================================================

// ─── RSS proxy (CORS-free, no API key needed) ──────────────────
const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ─── Default RSS feeds per tema perikanan & buruh ──────────────
const DEFAULT_FEEDS = [
  { name: 'FAO Fisheries News',    url: 'https://www.fao.org/fishery/news/rss/en/' },
  { name: 'ILO News',              url: 'https://www.ilo.org/global/about-the-ilo/newsroom/news/WCMS_RSS_EN/rss.xml' },
  { name: 'SeafoodSource',         url: 'https://www.seafoodsource.com/rss.xml' },
  { name: 'Global Fishing Watch',  url: 'https://globalfishingwatch.org/feed/' },
  { name: 'Antara – Perikanan',    url: 'https://www.antaranews.com/rss/ekonomi/perikanan' },
  { name: 'Tempo Lingkungan',      url: 'https://rss.tempo.co/lingkungan' },
  { name: 'Human Rights Watch',    url: 'https://www.hrw.org/rss/rss.xml' },
];

// ─── Module state ──────────────────────────────────────────────
let _kbTopics    = [];
let _kbArticles  = [];
let _kbDocs      = [];
let _kbFeeds     = [];
let _kbSubTab    = 'rss';    // rss | docs | topics
let _kbActiveTopic = null;   // null = semua topik
let _rssResults  = [];       // hasil fetch RSS sementara
let _rssLoading  = false;

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
  const _c = window.client || client;
  const { data } = await _c.from('kb_topics').select('*').order('created_at', { ascending: false });
  _kbTopics = data || [];
}

async function _loadKbArticles() {
  const _c = window.client || client;
  const { data } = await _c.from('kb_articles').select('*').order('created_at', { ascending: false }).limit(200);
  _kbArticles = data || [];
}

async function _loadKbDocs() {
  const _c = window.client || client;
  const { data } = await _c.from('kb_documents').select('*').order('created_at', { ascending: false });
  _kbDocs = data || [];
}

async function _loadKbFeeds() {
  const _c = window.client || client;
  const { data } = await _c.from('kb_rss_feeds').select('*').order('feed_name');
  _kbFeeds = data || [];
}

// ──────────────────────────────────────────────────────────────
// SUB-TAB NAVIGATION
// ──────────────────────────────────────────────────────────────
function _renderKbSubTabs() {
  const wrap = document.getElementById('kb-subtabs');
  if (!wrap) return;
  const tabs = [
    { id: 'rss',    icon: 'fa-rss',        label: 'Pantau Isu (RSS)' },
    { id: 'saved',  icon: 'fa-bookmark',   label: 'Tersimpan' },
    { id: 'docs',   icon: 'fa-folder-open',label: 'Repositori Dokumen' },
    { id: 'topics', icon: 'fa-tags',       label: 'Kelola Topik' },
  ];
  wrap.innerHTML = tabs.map(t => `
    <button class="kb-subtab${_kbSubTab === t.id ? ' active' : ''}" onclick="kbSwitchTab('${t.id}')">
      <i class="fa-solid ${t.icon}"></i> ${t.label}
    </button>`).join('');
}

window.kbSwitchTab = function (tabId) {
  _kbSubTab = tabId;
  _renderKbSubTabs();
  _renderKbSubTabContent();
};

function _renderKbSubTabContent() {
  const wrap = document.getElementById('kb-content');
  if (!wrap) return;
  if (_kbSubTab === 'rss')    _renderRssTab(wrap);
  if (_kbSubTab === 'saved')  _renderSavedTab(wrap);
  if (_kbSubTab === 'docs')   _renderDocsTab(wrap);
  if (_kbSubTab === 'topics') _renderTopicsTab(wrap);
}

// ──────────────────────────────────────────────────────────────
// RSS TAB
// ──────────────────────────────────────────────────────────────
function _renderRssTab(wrap) {
  wrap.innerHTML = `
    <div class="kb-rss-controls">
      <div class="kb-rss-left">
        <select id="kbFeedSelect" style="min-width:200px">
          <option value="">-- Pilih sumber RSS --</option>
          ${DEFAULT_FEEDS.map(f=>`<option value="${_kbEsc(f.url)}">${_kbEsc(f.name)}</option>`).join('')}
          ${_kbFeeds.map(f=>`<option value="${_kbEsc(f.feed_url)}">${_kbEsc(f.feed_name)}</option>`).join('')}
        </select>
        <input id="kbKeywordFilter" type="text" placeholder="Filter kata kunci (pisah koma)…" style="min-width:220px">
        <select id="kbTopicSave">
          <option value="">-- Simpan ke topik --</option>
          ${_kbTopics.map(t=>`<option value="${t.id}">${_kbEsc(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="kb-rss-right">
        <button class="btn-primary btn-sm" onclick="kbFetchRss()">
          <i class="fa-solid fa-rotate"></i> Muat Berita
        </button>
      </div>
    </div>
    <div id="kb-rss-status" style="font-size:12px;color:#94a3b8;margin-bottom:8px"></div>
    <div id="kb-rss-list"></div>
  `;
  if (_rssResults.length) _renderRssResults();
}

window.kbFetchRss = async function () {
  const feedUrl = document.getElementById('kbFeedSelect')?.value;
  if (!feedUrl) { alert('Pilih sumber RSS terlebih dahulu.'); return; }

  const keyword = (document.getElementById('kbKeywordFilter')?.value || '').toLowerCase();
  const keywords = keyword ? keyword.split(',').map(k => k.trim()).filter(Boolean) : [];

  const statusEl = document.getElementById('kb-rss-status');
  const listEl   = document.getElementById('kb-rss-list');
  if (statusEl) statusEl.textContent = '⏳ Memuat berita…';
  if (listEl)   listEl.innerHTML = _kbSkeletonRows(6);
  _rssLoading = true;

  try {
    const apiUrl = RSS_PROXY + encodeURIComponent(feedUrl) + '&count=30';
    const resp   = await fetch(apiUrl);
    const json   = await resp.json();

    if (json.status !== 'ok') throw new Error(json.message || 'RSS gagal dimuat');

    let items = json.items || [];
    if (keywords.length) {
      items = items.filter(item => {
        const text = ((item.title||'') + ' ' + (item.description||'') + ' ' + (item.categories||[]).join(' ')).toLowerCase();
        return keywords.some(kw => text.includes(kw));
      });
    }

    _rssResults = items.map(item => ({
      title       : item.title || '(tanpa judul)',
      url         : item.link  || '',
      source      : json.feed?.title || feedUrl,
      summary     : (item.description||'').replace(/<[^>]+>/g,'').slice(0,220) + '…',
      published_at: item.pubDate || '',
    }));

    if (statusEl) statusEl.textContent = `✅ ${_rssResults.length} artikel ditemukan` + (keywords.length ? ` (filter: ${keywords.join(', ')})` : '');
    _renderRssResults();
  } catch(e) {
    if (statusEl) statusEl.textContent = '❌ Gagal memuat: ' + e.message;
    if (listEl)   listEl.innerHTML = `<div class="kb-empty">Tidak bisa terhubung ke sumber RSS. Coba sumber lain.</div>`;
  }
  _rssLoading = false;
};

function _renderRssResults() {
  const listEl = document.getElementById('kb-rss-list');
  if (!listEl) return;
  if (!_rssResults.length) {
    listEl.innerHTML = `<div class="kb-empty"><i class="fa-solid fa-newspaper"></i><p>Tidak ada artikel ditemukan.</p></div>`;
    return;
  }
  listEl.innerHTML = _rssResults.map((a, i) => `
    <div class="kb-article-card" id="rss-card-${i}">
      <div class="kb-article-meta">
        <span class="kb-badge source">${_kbEsc(a.source)}</span>
        <span class="kb-date">${_kbEsc(a.published_at ? new Date(a.published_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '')}</span>
      </div>
      <div class="kb-article-title">
        <a href="${_kbEsc(a.url)}" target="_blank" rel="noopener noreferrer">${_kbEsc(a.title)}</a>
      </div>
      <div class="kb-article-summary">${_kbEsc(a.summary)}</div>
      <div class="kb-article-actions">
        <button class="btn-primary btn-xs" onclick="kbSaveArticle(${i})">
          <i class="fa-solid fa-bookmark"></i> Simpan
        </button>
        <a href="${_kbEsc(a.url)}" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-xs">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka
        </a>
      </div>
    </div>`).join('');
}

window.kbSaveArticle = async function (idx) {
  const a = _rssResults[idx];
  if (!a) return;
  const _c = window.client || client;
  const topicId   = document.getElementById('kbTopicSave')?.value || null;
  const topicName = topicId ? _kbTopics.find(t=>t.id===topicId)?.name || '' : '';

  const btn = document.querySelector(`#rss-card-${idx} .btn-primary`);
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }

  const { error } = await _c.from('kb_articles').insert({
    topic_id    : topicId || null,
    topic_name  : topicName,
    title       : a.title,
    source_url  : a.url,
    source_name : a.source,
    summary     : a.summary,
    published_at: a.published_at,
    status      : 'saved',
  });

  if (error) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Simpan'; }
    alert('Gagal menyimpan: ' + error.message);
  } else {
    if (btn) { btn.disabled = true; btn.innerHTML = '✅ Tersimpan'; btn.style.background='#16a34a'; }
    await _loadKbArticles();
  }
};

// ──────────────────────────────────────────────────────────────
// SAVED ARTICLES TAB
// ──────────────────────────────────────────────────────────────
function _renderSavedTab(wrap) {
  const topicFilter = _kbActiveTopic;
  const articles = topicFilter
    ? _kbArticles.filter(a => a.topic_id === topicFilter)
    : _kbArticles;

  wrap.innerHTML = `
    <div class="kb-toolbar">
      <div class="kb-toolbar-left">
        <select id="kbSavedTopicFilter" onchange="kbFilterSaved(this.value)" style="min-width:180px">
          <option value="">Semua Topik</option>
          ${_kbTopics.map(t=>`<option value="${t.id}"${topicFilter===t.id?' selected':''}>${_kbEsc(t.name)}</option>`).join('')}
        </select>
        <input id="kbSavedSearch" type="text" placeholder="Cari judul…" oninput="kbSearchSaved(this.value)" style="min-width:200px">
      </div>
      <div class="kb-toolbar-right">
        <span style="font-size:12px;color:#94a3b8">${articles.length} artikel tersimpan</span>
      </div>
    </div>
    <div id="kb-saved-list">
      ${articles.length ? articles.map(a => _kbArticleRow(a)).join('') : `<div class="kb-empty"><i class="fa-solid fa-bookmark"></i><p>Belum ada artikel tersimpan.</p></div>`}
    </div>
  `;
}

function _kbArticleRow(a) {
  const topic = _kbTopics.find(t => t.id === a.topic_id);
  const statusColor = a.status === 'reviewed' ? '#16a34a' : a.status === 'archived' ? '#94a3b8' : '#2563eb';
  return `
    <div class="kb-article-card">
      <div class="kb-article-meta">
        ${topic ? `<span class="kb-badge topic" style="background:${topic.color}22;color:${topic.color}">${_kbEsc(topic.name)}</span>` : ''}
        <span class="kb-badge source">${_kbEsc(a.source_name||'')}</span>
        <span class="kb-badge status" style="color:${statusColor}">${a.status||'saved'}</span>
        <span class="kb-date">${a.published_at ? new Date(a.published_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : ''}</span>
      </div>
      <div class="kb-article-title">
        ${a.source_url ? `<a href="${_kbEsc(a.source_url)}" target="_blank" rel="noopener noreferrer">${_kbEsc(a.title)}</a>` : _kbEsc(a.title)}
      </div>
      <div class="kb-article-summary">${_kbEsc(a.summary||'')}</div>
      ${a.note ? `<div class="kb-note-display"><i class="fa-solid fa-note-sticky"></i> ${_kbEsc(a.note)}</div>` : ''}
      <div class="kb-article-actions">
        <button class="btn-secondary btn-xs" onclick="kbMarkReviewed('${a.id}')"><i class="fa-solid fa-check"></i> Tandai Reviewed</button>
        <button class="btn-secondary btn-xs" onclick="kbAddNote('${a.id}','${_kbEsc(a.note||'')}')"><i class="fa-solid fa-pen"></i> Catatan</button>
        <button class="btn-danger btn-xs" onclick="kbDeleteArticle('${a.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

window.kbFilterSaved = function(topicId) {
  _kbActiveTopic = topicId || null;
  const wrap = document.getElementById('kb-content');
  if (wrap) _renderSavedTab(wrap);
};

window.kbSearchSaved = function(q) {
  const list = document.getElementById('kb-saved-list');
  if (!list) return;
  const query = q.toLowerCase();
  const filtered = query
    ? _kbArticles.filter(a => (a.title||'').toLowerCase().includes(query) || (a.summary||'').toLowerCase().includes(query))
    : _kbArticles;
  list.innerHTML = filtered.length
    ? filtered.map(a => _kbArticleRow(a)).join('')
    : `<div class="kb-empty"><p>Tidak ada artikel yang cocok.</p></div>`;
};

window.kbMarkReviewed = async function(id) {
  const _c = window.client || client;
  const art = _kbArticles.find(a => a.id === id);
  const newStatus = art?.status === 'reviewed' ? 'saved' : 'reviewed';
  await _c.from('kb_articles').update({ status: newStatus }).eq('id', id);
  await _loadKbArticles();
  _renderKbSubTabContent();
};

window.kbAddNote = async function(id, currentNote) {
  const note = prompt('Tambahkan catatan untuk artikel ini:', currentNote || '');
  if (note === null) return;
  const _c = window.client || client;
  await _c.from('kb_articles').update({ note }).eq('id', id);
  await _loadKbArticles();
  _renderKbSubTabContent();
};

window.kbDeleteArticle = async function(id) {
  if (!confirm('Hapus artikel ini dari daftar tersimpan?')) return;
  const _c = window.client || client;
  await _c.from('kb_articles').delete().eq('id', id);
  await _loadKbArticles();
  _renderKbSubTabContent();
};

// ──────────────────────────────────────────────────────────────
// DOKUMEN REPOSITORI TAB
// ──────────────────────────────────────────────────────────────
const DOC_TYPES = ['policy','regulation','report','module','template','guideline','other'];
const DOC_TYPE_LABELS = { policy:'Kebijakan', regulation:'Regulasi', report:'Laporan', module:'Modul', template:'Template', guideline:'Panduan', other:'Lainnya' };

function _renderDocsTab(wrap) {
  wrap.innerHTML = `
    <div class="kb-toolbar">
      <div class="kb-toolbar-left">
        <select id="kbDocTypeFilter" onchange="kbRenderDocList()" style="min-width:150px">
          <option value="">Semua Jenis</option>
          ${DOC_TYPES.map(t=>`<option value="${t}">${DOC_TYPE_LABELS[t]||t}</option>`).join('')}
        </select>
        <select id="kbDocTopicFilter" onchange="kbRenderDocList()" style="min-width:150px">
          <option value="">Semua Topik</option>
          ${_kbTopics.map(t=>`<option value="${t.id}">${_kbEsc(t.name)}</option>`).join('')}
        </select>
        <input id="kbDocSearch" type="text" placeholder="Cari dokumen…" oninput="kbRenderDocList()" style="min-width:200px">
      </div>
      <div class="kb-toolbar-right">
        <button class="btn-primary btn-sm" onclick="kbOpenDocModal()">
          <i class="fa-solid fa-plus"></i> Tambah Dokumen
        </button>
      </div>
    </div>
    <div id="kb-doc-list"></div>
    ${_kbDocModalHTML()}
  `;
  kbRenderDocList();
}

window.kbRenderDocList = function() {
  const typeF  = document.getElementById('kbDocTypeFilter')?.value || '';
  const topicF = document.getElementById('kbDocTopicFilter')?.value || '';
  const q      = (document.getElementById('kbDocSearch')?.value || '').toLowerCase();
  let docs = [..._kbDocs];
  if (typeF)  docs = docs.filter(d => d.doc_type === typeF);
  if (topicF) docs = docs.filter(d => d.topic_id === topicF);
  if (q)      docs = docs.filter(d => (d.title||'').toLowerCase().includes(q) || (d.description||'').toLowerCase().includes(q));

  const listEl = document.getElementById('kb-doc-list');
  if (!listEl) return;
  if (!docs.length) {
    listEl.innerHTML = `<div class="kb-empty"><i class="fa-solid fa-folder-open"></i><p>Belum ada dokumen.</p></div>`;
    return;
  }
  listEl.innerHTML = `
    <div class="kb-doc-grid">
      ${docs.map(d => {
        const topic = _kbTopics.find(t => t.id === d.topic_id);
        const icon  = { policy:'fa-file-contract', regulation:'fa-scale-balanced', report:'fa-chart-bar', module:'fa-book', template:'fa-file-lines', guideline:'fa-list-check', other:'fa-file' }[d.doc_type] || 'fa-file';
        return `
          <div class="kb-doc-card">
            <div class="kb-doc-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="kb-doc-body">
              <div class="kb-doc-title">${_kbEsc(d.title)}</div>
              <div class="kb-doc-meta">
                <span class="kb-badge source">${DOC_TYPE_LABELS[d.doc_type]||d.doc_type||'Dokumen'}</span>
                ${topic ? `<span class="kb-badge topic" style="background:${topic.color}22;color:${topic.color}">${_kbEsc(topic.name)}</span>` : ''}
                ${d.project_name ? `<span class="kb-badge source">${_kbEsc(d.project_name)}</span>` : ''}
                <span class="kb-date">${d.created_at ? new Date(d.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : ''}</span>
              </div>
              ${d.description ? `<div class="kb-article-summary">${_kbEsc(d.description)}</div>` : ''}
            </div>
            <div class="kb-doc-actions">
              ${d.file_url ? `<a href="${_kbEsc(d.file_url)}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-xs"><i class="fa-solid fa-arrow-up-right-from-square"></i> Buka</a>` : ''}
              <button class="btn-danger btn-xs" onclick="kbDeleteDoc('${d.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
};

function _kbDocModalHTML() {
  return `
    <div id="kbDocOverlay" class="modal-overlay hidden">
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-plus"></i> Tambah Dokumen</div>
          <button class="modal-close" onclick="kbCloseDocModal()">×</button>
        </div>
        <div class="form-grid">
          <div class="form-group full">
            <label>Judul Dokumen *</label>
            <input type="text" id="kbDocTitle" placeholder="Nama dokumen…">
          </div>
          <div class="form-group">
            <label>Jenis Dokumen</label>
            <select id="kbDocType">
              <option value="">-- Pilih --</option>
              ${DOC_TYPES.map(t=>`<option value="${t}">${DOC_TYPE_LABELS[t]||t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Topik</label>
            <select id="kbDocTopic">
              <option value="">-- Opsional --</option>
              ${_kbTopics.map(t=>`<option value="${t.id}">${_kbEsc(t.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group full">
            <label>Link File (Google Drive / URL)</label>
            <input type="url" id="kbDocUrl" placeholder="https://drive.google.com/…">
          </div>
          <div class="form-group full">
            <label>Deskripsi</label>
            <textarea id="kbDocDesc" rows="2" placeholder="Penjelasan singkat…"></textarea>
          </div>
        </div>
        <div id="kbDocMsg" class="form-msg hidden"></div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="kbCloseDocModal()">Batal</button>
          <button class="btn-primary" onclick="kbSaveDoc()">Simpan</button>
        </div>
      </div>
    </div>`;
}

window.kbOpenDocModal = function() {
  const el = document.getElementById('kbDocOverlay');
  if (el) el.classList.remove('hidden');
};

window.kbCloseDocModal = function() {
  const el = document.getElementById('kbDocOverlay');
  if (el) el.classList.add('hidden');
};

window.kbSaveDoc = async function() {
  const _c     = window.client || client;
  const title  = document.getElementById('kbDocTitle')?.value.trim();
  if (!title) { alert('Judul dokumen wajib diisi.'); return; }
  const topicId   = document.getElementById('kbDocTopic')?.value || null;
  const topicName = topicId ? _kbTopics.find(t=>t.id===topicId)?.name||'' : '';
  const btn = document.querySelector('#kbDocOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
  const { error } = await _c.from('kb_documents').insert({
    title,
    doc_type    : document.getElementById('kbDocType')?.value || 'other',
    topic_id    : topicId,
    topic_name  : topicName,
    file_url    : document.getElementById('kbDocUrl')?.value.trim() || null,
    description : document.getElementById('kbDocDesc')?.value.trim() || null,
  });
  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    alert('Gagal menyimpan: ' + error.message);
  } else {
    kbCloseDocModal();
    await _loadKbDocs();
    kbRenderDocList();
  }
};

window.kbDeleteDoc = async function(id) {
  if (!confirm('Hapus dokumen ini?')) return;
  const _c = window.client || client;
  await _c.from('kb_documents').delete().eq('id', id);
  await _loadKbDocs();
  kbRenderDocList();
};

// ──────────────────────────────────────────────────────────────
// TOPIK TAB
// ──────────────────────────────────────────────────────────────
const TOPIC_COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#be185d','#0d9488'];

function _renderTopicsTab(wrap) {
  wrap.innerHTML = `
    <div class="kb-toolbar">
      <div class="kb-toolbar-right">
        <button class="btn-primary btn-sm" onclick="kbOpenTopicModal()">
          <i class="fa-solid fa-plus"></i> Tambah Topik
        </button>
      </div>
    </div>
    <div class="kb-topic-grid" id="kb-topic-list">
      ${_kbTopics.length ? _kbTopics.map(t => {
        const artCount = _kbArticles.filter(a => a.topic_id === t.id).length;
        const docCount = _kbDocs.filter(d => d.topic_id === t.id).length;
        const kwList   = (t.keywords||[]).slice(0,5).map(k=>`<span class="kb-kw">${_kbEsc(k)}</span>`).join('');
        return `
          <div class="kb-topic-card" style="border-left:4px solid ${t.color||'#2563eb'}">
            <div class="kb-topic-header">
              <div class="kb-topic-name">${_kbEsc(t.name)}</div>
              <button class="btn-danger btn-xs" onclick="kbDeleteTopic('${t.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
            ${t.description ? `<div class="kb-article-summary">${_kbEsc(t.description)}</div>` : ''}
            <div class="kb-kw-list">${kwList}</div>
            <div class="kb-topic-stats">
              <span><i class="fa-solid fa-newspaper"></i> ${artCount} artikel</span>
              <span><i class="fa-solid fa-file"></i> ${docCount} dokumen</span>
            </div>
          </div>`;
      }).join('') : `<div class="kb-empty"><i class="fa-solid fa-tags"></i><p>Belum ada topik. Tambahkan topik pantauan DFW.</p></div>`}
    </div>
    <div id="kbTopicOverlay" class="modal-overlay hidden">
      <div class="modal-box" style="max-width:440px">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-tag"></i> Tambah Topik</div>
          <button class="modal-close" onclick="document.getElementById('kbTopicOverlay').classList.add('hidden')">×</button>
        </div>
        <div class="form-grid">
          <div class="form-group full">
            <label>Nama Topik *</label>
            <input type="text" id="kbTopicName" placeholder="contoh: IUU Fishing, C188, Rekrutmen Adil…">
          </div>
          <div class="form-group full">
            <label>Kata Kunci Filter RSS <span style="font-weight:400;color:#94a3b8">(pisah koma)</span></label>
            <input type="text" id="kbTopicKeywords" placeholder="IUU, illegal fishing, kapal ikan…">
          </div>
          <div class="form-group full">
            <label>Deskripsi</label>
            <textarea id="kbTopicDesc" rows="2" placeholder="Mengapa topik ini dipantau?"></textarea>
          </div>
          <div class="form-group full">
            <label>Warna Label</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${TOPIC_COLORS.map(c=>`<button type="button" onclick="selectKbColor('${c}')" data-color="${c}" style="width:28px;height:28px;background:${c};border-radius:50%;border:2px solid transparent;cursor:pointer"></button>`).join('')}
            </div>
            <input type="hidden" id="kbTopicColor" value="${TOPIC_COLORS[0]}">
          </div>
        </div>
        <div id="kbTopicMsg" class="form-msg hidden"></div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="document.getElementById('kbTopicOverlay').classList.add('hidden')">Batal</button>
          <button class="btn-primary" onclick="kbSaveTopic()">Simpan</button>
        </div>
      </div>
    </div>
  `;
}

window.selectKbColor = function(c) {
  document.getElementById('kbTopicColor').value = c;
  document.querySelectorAll('[data-color]').forEach(btn => {
    btn.style.borderColor = btn.dataset.color === c ? '#0f172a' : 'transparent';
  });
};

window.kbOpenTopicModal = function() {
  document.getElementById('kbTopicOverlay')?.classList.remove('hidden');
};

window.kbSaveTopic = async function() {
  const _c   = window.client || client;
  const name = document.getElementById('kbTopicName')?.value.trim();
  if (!name) { alert('Nama topik wajib diisi.'); return; }
  const kwRaw  = document.getElementById('kbTopicKeywords')?.value || '';
  const keywords = kwRaw.split(',').map(k=>k.trim()).filter(Boolean);
  const { error } = await _c.from('kb_topics').insert({
    name,
    keywords,
    description: document.getElementById('kbTopicDesc')?.value.trim() || null,
    color      : document.getElementById('kbTopicColor')?.value || TOPIC_COLORS[0],
  });
  if (error) { alert('Gagal: ' + error.message); return; }
  document.getElementById('kbTopicOverlay')?.classList.add('hidden');
  await _loadKbTopics();
  _renderKbSubTabContent();
};

window.kbDeleteTopic = async function(id) {
  if (!confirm('Hapus topik ini? Artikel dan dokumen terkait tidak ikut terhapus.')) return;
  const _c = window.client || client;
  await _c.from('kb_topics').delete().eq('id', id);
  await _loadKbTopics();
  _renderKbSubTabContent();
};

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function _kbSkeletonRows(n) {
  return Array.from({length:n}, () =>
    `<div class="kb-article-card" style="pointer-events:none">
       <div class="skeleton skeleton-text" style="width:60%;height:12px;margin-bottom:6px"></div>
       <div class="skeleton skeleton-text" style="width:90%;height:16px;margin-bottom:8px"></div>
       <div class="skeleton skeleton-text" style="width:80%;height:12px"></div>
     </div>`).join('');
}
