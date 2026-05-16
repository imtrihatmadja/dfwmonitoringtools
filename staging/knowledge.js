// =========================================================
// knowledge.js - FINAL STABLE PACKAGE
// PMIS DFW Indonesia
// =========================================================

https://zdfxcxkgmksaeigyuibe.supabase.co/functions/v1/hyper-worker

const DEFAULT_FEEDS = [
  { name: 'Perikanan Indonesia', url: 'https://news.google.com/rss/search?q=perikanan+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'IUU Fishing Indonesia', url: 'https://news.google.com/rss/search?q=IUU+fishing+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'Hak Buruh Nelayan', url: 'https://news.google.com/rss/search?q=hak+buruh+nelayan&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'Trafficking Nelayan', url: 'https://news.google.com/rss/search?q=trafficking+nelayan+indonesia&hl=id-ID&gl=ID&ceid=ID:id' },
  { name: 'Forced Labour Fishing', url: 'https://news.google.com/rss/search?q=forced+labour+fishing+vessel&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Antara Perikanan', url: 'https://www.antaranews.com/rss/ekonomi/perikanan' },
  { name: 'Tempo Lingkungan', url: 'https://rss.tempo.co/lingkungan' }
];

let kbTopics = [];
let kbFeeds = [];
let kbArticles = [];
let rssItems = [];
let kbTab = 'rss';
let rssLoading = false;

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return str;
  }
}

function isLikelyRssUrl(url) {
  return /news\.google\.com\/rss|\/rss|\/feed|\.xml(\?|$)/i.test(url || '');
}

async function fetchWithTimeout(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadKnowledgeData() {
  const db = window.client;
  if (!db) throw new Error('Client Supabase tidak tersedia');

  const [topicsRes, feedsRes, articlesRes] = await Promise.all([
    db.from('kb_topics').select('*').order('name'),
    db.from('kb_rss_feeds').select('*').order('feed_name'),
    db.from('kb_articles').select('*').order('published_at', { ascending: false }).limit(100)
  ]);

  if (topicsRes.error) throw topicsRes.error;
  if (feedsRes.error) throw feedsRes.error;
  if (articlesRes.error) throw articlesRes.error;

  kbTopics = topicsRes.data || [];
  kbFeeds = feedsRes.data || [];
  kbArticles = articlesRes.data || [];
}

window.initKnowledgeBase = async function () {
  try {
    await loadKnowledgeData();
  } catch (err) {
    console.warn('initKnowledgeBase error:', err);
  }
  renderKnowledgeBase();
};

function renderKnowledgeBase() {
  const wrap = document.getElementById('tab-knowledge');
  if (!wrap) return;

  wrap.innerHTML = `
    <div style="max-width:980px;">
      <div style="margin-bottom:20px;">
        <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px;">Knowledge Base</h2>
        <p style="font-size:13px;color:#64748b;">Pantau berita media, simpan artikel penting, dan kelola sumber RSS.</p>
      </div>

      <div style="display:flex;gap:4px;border-bottom:2px solid #e2e8f0;margin-bottom:20px;overflow-x:auto;">
        ${[
          ['rss', 'RSS Reader'],
          ['saved', 'Artikel Tersimpan'],
          ['topics', 'Topik'],
          ['settings', 'Kelola Sumber']
        ].map(([id, label]) => `
          <button
            id="kbtab-${id}"
            onclick="kbSwitch('${id}')"
            style="
              padding:9px 16px;
              border:none;
              border-bottom:2px solid ${kbTab === id ? '#2563eb' : 'transparent'};
              margin-bottom:-2px;
              font-size:13px;
              font-weight:600;
              cursor:pointer;
              white-space:nowrap;
              border-radius:6px 6px 0 0;
              background:${kbTab === id ? '#eff6ff' : 'transparent'};
              color:${kbTab === id ? '#2563eb' : '#64748b'};
            "
          >${label}</button>
        `).join('')}
      </div>

      <div id="kb-panel"></div>
    </div>
  `;

  renderKbPanel();
}

window.kbSwitch = function (tab) {
  kbTab = tab;
  renderKnowledgeBase();
};

function renderKbPanel() {
  const panel = document.getElementById('kb-panel');
  if (!panel) return;

  if (kbTab === 'rss') panel.innerHTML = buildRssPanel();
  if (kbTab === 'saved') panel.innerHTML = buildSavedPanel();
  if (kbTab === 'topics') panel.innerHTML = buildTopicsPanel();
  if (kbTab === 'settings') panel.innerHTML = buildSettingsPanel();
}

function buildRssPanel() {
  const savedOptions = kbFeeds.map(feed => {
    return `<option value="${esc(feed.feed_url)}">${esc(feed.feed_name)}</option>`;
  }).join('');

  const defaultOptions = DEFAULT_FEEDS.map(feed => {
    return `<option value="${esc(feed.url)}">${esc(feed.name)}</option>`;
  }).join('');

  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px;">Pilih Sumber RSS</label>
          <select id="kb-feed-sel" class="search-input" style="width:100%;max-width:100%;" onchange="kbOnSelect(this.value)">
            <option value="">-- Pilih sumber --</option>
            ${savedOptions ? `<optgroup label="Tersimpan">${savedOptions}</optgroup>` : ''}
            <optgroup label="Default">${defaultOptions}</optgroup>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px;">Filter kata kunci</label>
          <input id="kb-kw" class="search-input" style="width:100%;max-width:100%;" type="text" placeholder="nelayan, IUU, trafficking">
        </div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
        <label style="font-size:12px;font-weight:600;color:#475569;white-space:nowrap;">URL kustom</label>
        <input id="kb-url" class="search-input" style="flex:1;min-width:220px;" type="url" placeholder="https://example.com/feed.xml">
        <button class="btn-primary btn-sm" onclick="kbFetchRss()">Muat</button>
        <button class="btn-secondary btn-sm" onclick="kbSaveFeed()">Simpan</button>
      </div>

      <div id="kb-status" style="font-size:13px;color:#475569;margin-bottom:10px;min-height:20px;"></div>

      <div id="kb-results" style="text-align:center;padding:50px 20px;color:#94a3b8;">
        Pilih sumber RSS di atas untuk memuat artikel terbaru.
      </div>
    </div>
  `;
}

window.kbOnSelect = function (url) {
  const input = document.getElementById('kb-url');
  if (input) input.value = url || '';
};

window.kbFetchRss = async function () {
  if (rssLoading) return;

  const urlEl = document.getElementById('kb-url');
  const kwEl = document.getElementById('kb-kw');
  const statusEl = document.getElementById('kb-status');
  const resultsEl = document.getElementById('kb-results');

  const feedUrl = urlEl?.value?.trim() || '';
  const keywordRaw = kwEl?.value?.trim() || '';
  const keywords = keywordRaw.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);

  if (!feedUrl) {
    statusEl.innerHTML = '<span style="color:#f97316;">Masukkan URL RSS terlebih dahulu.</span>';
    return;
  }

  if (!isLikelyRssUrl(feedUrl)) {
    statusEl.innerHTML = '<span style="color:#f97316;">URL ini tampaknya bukan RSS feed. Gunakan URL yang mengandung /rss, /feed, atau .xml.</span>';
    return;
  }

  rssLoading = true;
  statusEl.innerHTML = '<span style="color:#2563eb;">Memuat artikel...</span>';
  resultsEl.innerHTML = '<div style="padding:30px 0;color:#64748b;">Mengambil data RSS...</div>';

  try {
    const resp = await fetch(RSS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_ANON_KEY || ''
      },
      body: JSON.stringify({ feedUrl })
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    if (!Array.isArray(data.items) || !data.items.length) {
      throw new Error('Tidak ada artikel dalam feed ini');
    }

    const sourceName = data.feed?.title || feedUrl;

    let items = data.items.map(item => ({
      title: item.title || 'Tanpa judul',
      url: item.link || '',
      source: sourceName,
      summary: stripHtml(item.description || '').slice(0, 240),
      published: item.pubDate || '',
      thumbnail: ''
    }));

    if (keywords.length) {
      items = items.filter(item => {
        const txt = `${item.title} ${item.summary}`.toLowerCase();
        return keywords.some(kw => txt.includes(kw));
      });
    }

    rssItems = items;

    statusEl.innerHTML = `
      <span style="color:#15803d;">
        <strong>${rssItems.length}</strong> artikel berhasil dimuat dari
        <strong>${esc(sourceName)}</strong>.
      </span>
    `;

    renderRssItems();
  } catch (err) {
    const msg = err.message || 'Unknown error';
    statusEl.innerHTML = `<span style="color:#dc2626;">❌ Gagal: ${esc(msg)}</span>`;
    resultsEl.innerHTML = `
      <div style="text-align:center;padding:50px 20px;color:#94a3b8;">
        <div style="font-size:15px;color:#dc2626;font-weight:700;margin-bottom:8px;">Error Fetching Artikel</div>
        <div style="font-size:13px;color:#64748b;">${esc(msg)}</div>
      </div>
    `;
  } finally {
    rssLoading = false;
  }
};

function renderRssItems() {
  const el = document.getElementById('kb-results');
  if (!el) return;

  if (!rssItems.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#94a3b8;">Tidak ada artikel yang cocok dengan filter.</div>';
    return;
  }

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${rssItems.map(item => `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;gap:14px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
          ${item.thumbnail ? `
            <img src="${esc(item.thumbnail)}" alt="" loading="lazy"
              style="width:80px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0;">
          ` : ''}

          <div style="flex:1;min-width:0;text-align:left;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
              <span style="font-size:11px;color:#2563eb;font-weight:600;background:#eff6ff;padding:2px 8px;border-radius:20px;">
                ${esc(item.source)}
              </span>
              <span style="font-size:11px;color:#94a3b8;">${esc(fmtDate(item.published))}</span>
            </div>

            <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"
              style="font-size:14px;font-weight:700;color:#0f172a;text-decoration:none;line-height:1.4;display:block;margin-bottom:6px;">
              ${esc(item.title)}
            </a>

            ${item.summary ? `
              <p style="font-size:12px;color:#64748b;line-height:1.6;margin-bottom:10px;">
                ${esc(item.summary)}
              </p>
            ` : ''}

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm">Buka</a>
              <button class="btn-primary btn-sm" onclick="kbSaveArticleByIndex(${rssItems.indexOf(item)})">Simpan</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.kbSaveArticleByIndex = async function (index) {
  const item = rssItems[index];
  if (!item) return;

  const db = window.client;
  if (!db) {
    alert('Database tidak terhubung.');
    return;
  }

  const payload = {
    title: item.title || 'Tanpa judul',
    source_url: item.url || null,
    source_name: item.source || null,
    summary: item.summary || null,
    published_at: item.published || null,
    status: 'saved',
    saved_by: 'Tim'
  };

  const { error } = await db.from('kb_articles').insert(payload);

  if (error) {
    alert('Gagal simpan: ' + error.message);
    return;
  }

  await loadKnowledgeData();
  alert('Artikel berhasil disimpan.');
};

function buildSavedPanel() {
  if (!kbArticles.length) {
    return `
      <div style="text-align:center;padding:60px 20px;color:#94a3b8;">
        Belum ada artikel tersimpan.
      </div>
    `;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${kbArticles.map(a => `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#2563eb;font-weight:600;background:#eff6ff;padding:2px 8px;border-radius:20px;">
              ${esc(a.source_name)}
            </span>
            <span style="font-size:11px;color:#94a3b8;">${esc(fmtDate(a.published_at))}</span>
          </div>

          <a href="${esc(a.source_url)}" target="_blank" rel="noopener noreferrer"
            style="font-size:14px;font-weight:700;color:#0f172a;text-decoration:none;line-height:1.4;display:block;margin-bottom:6px;">
            ${esc(a.title)}
          </a>

          ${a.summary ? `
            <p style="font-size:12px;color:#64748b;line-height:1.6;margin-bottom:10px;">
              ${esc(a.summary)}
            </p>
          ` : ''}

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${esc(a.source_url)}" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm">Buka</a>
            <button class="btn-secondary btn-sm" style="color:#dc2626;" onclick="kbDeleteArticle('${a.id}')">Hapus</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.kbDeleteArticle = async function (id) {
  if (!confirm('Hapus artikel ini?')) return;

  const db = window.client;
  const { error } = await db.from('kb_articles').delete().eq('id', id);

  if (error) {
    alert('Gagal hapus: ' + error.message);
    return;
  }

  await loadKnowledgeData();
  renderKnowledgeBase();
};

function buildTopicsPanel() {
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
      <h3 style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px;">Kelola Topik</h3>

      <div style="display:flex;gap:8px;margin-bottom:18px;">
        <input id="kb-new-topic" class="search-input" style="flex:1;" placeholder="Nama topik baru...">
        <button class="btn-primary btn-sm" onclick="kbAddTopic()">Tambah</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${kbTopics.length ? kbTopics.map(t => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <span style="font-size:13px;font-weight:600;color:#0f172a;">${esc(t.name)}</span>
            <button class="btn-remove" onclick="kbDeleteTopic('${t.id}')" title="Hapus">×</button>
          </div>
        `).join('') : `
          <p style="text-align:center;color:#94a3b8;padding:20px;">Belum ada topik.</p>
        `}
      </div>
    </div>
  `;
}

window.kbAddTopic = async function () {
  const db = window.client;
  const input = document.getElementById('kb-new-topic');
  const name = input?.value?.trim();

  if (!name) return;

  const { error } = await db.from('kb_topics').insert({ name });

  if (error) {
    alert('Gagal tambah topik: ' + error.message);
    return;
  }

  input.value = '';
  await loadKnowledgeData();
  renderKnowledgeBase();
};

window.kbDeleteTopic = async function (id) {
  if (!confirm('Hapus topik ini?')) return;

  const db = window.client;
  const { error } = await db.from('kb_topics').delete().eq('id', id);

  if (error) {
    alert('Gagal hapus topik: ' + error.message);
    return;
  }

  await loadKnowledgeData();
  renderKnowledgeBase();
};

function buildSettingsPanel() {
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
      <h3 style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px;">Sumber RSS Tersimpan</h3>

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${kbFeeds.length ? kbFeeds.map(f => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(f.feed_name)}</div>
              <div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.feed_url)}</div>
            </div>

            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn-edit" onclick="kbLoadFeed('${esc(f.feed_url)}')" title="Muat feed ini">↗</button>
              <button class="btn-remove" onclick="kbDeleteFeed('${f.id}')" title="Hapus">×</button>
            </div>
          </div>
        `).join('') : `
          <p style="text-align:center;color:#94a3b8;padding:20px;">Belum ada sumber tersimpan.</p>
        `}
      </div>

      <p style="font-size:12px;color:#94a3b8;margin-top:16px;">
        Tambah sumber melalui tab <strong>RSS Reader</strong>, isi URL kustom, lalu klik <strong>Simpan</strong>.
      </p>
    </div>
  `;
}

window.kbLoadFeed = function (url) {
  kbTab = 'rss';
  renderKnowledgeBase();

  setTimeout(() => {
    const input = document.getElementById('kb-url');
    if (input) input.value = url;
  }, 100);
};

window.kbSaveFeed = async function () {
  const db = window.client;
  const url = document.getElementById('kb-url')?.value?.trim();

  if (!url) {
    alert('Masukkan URL feed terlebih dahulu.');
    return;
  }

  if (!isLikelyRssUrl(url)) {
    alert('URL ini tampaknya bukan RSS feed yang valid.');
    return;
  }

  const defaultName = url.replace(/^https?:\/\//, '').split('/')[0];
  const name = prompt('Nama untuk sumber RSS ini:', defaultName);

  if (!name) return;

  const payload = {
    feed_name: name.trim(),
    feed_url: url,
    active: true
  };

  const { error } = await db.from('kb_rss_feeds').upsert(payload, { onConflict: 'feed_url' });

  if (error) {
    alert('Gagal simpan feed: ' + error.message);
    return;
  }

  await loadKnowledgeData();
  renderKnowledgeBase();
  alert('Sumber RSS berhasil disimpan.');
};

window.kbDeleteFeed = async function (id) {
  if (!confirm('Hapus sumber ini?')) return;

  const db = window.client;
  const { error } = await db.from('kb_rss_feeds').delete().eq('id', id);

  if (error) {
    alert('Gagal hapus feed: ' + error.message);
    return;
  }

  await loadKnowledgeData();
  renderKnowledgeBase();
};

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    const tab = document.getElementById('tab-knowledge');
    if (tab?.classList.contains('active') && !tab.dataset.kbInit) {
      tab.dataset.kbInit = '1';
      window.initKnowledgeBase();
    }
  });

  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class']
  });
});
