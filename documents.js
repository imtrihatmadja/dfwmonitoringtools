// ============================================================
// DOCUMENTS.JS — Manajemen Dokumen via Google Drive
// PMIS DFW Indonesia
// ============================================================

const EDGE_FN_URL = `https://zdfxcxkgmksaeigyuibe.supabase.co/functions/v1/gdrive-upload`;

const DOC_CATEGORIES = [
  { code:'TOR',             label:'TOR / Proposal',   icon:'📋' },
  { code:'LAPORAN_BULANAN', label:'Laporan Bulanan',  icon:'📅' },
  { code:'FOTO_KEGIATAN',   label:'Foto Kegiatan',    icon:'📸' },
  { code:'DATA_SURVEI',     label:'Data & Survei',    icon:'📊' },
  { code:'BUKTI_CAPAIAN',   label:'Bukti Capaian',    icon:'✅' },
  { code:'MOU',             label:'MOU / Perjanjian', icon:'🤝' },
  { code:'PUBLIKASI',       label:'Publikasi',        icon:'📢' },
  { code:'LAINNYA',         label:'Lainnya',          icon:'🗂️' },
];

window._allDocs        = [];
window._stagedDocFiles = [];

// ── DB helper ────────────────────────────────────────────────
const _db = () => window.client;

// ─────────────────────────────────────────────────────────────
// INIT TAB DOKUMEN
// ─────────────────────────────────────────────────────────────
function initDocumentsTab() {
  const tab = document.getElementById('tab-documents');
  if (!tab) return;
  tab.innerHTML = `
    <div class="doc-page">
      <div class="doc-page-header">
        <div>
          <h2 class="doc-page-title">📂 Manajemen Dokumen</h2>
          <p class="doc-page-sub">Semua dokumen tersimpan di <strong>Google Drive DFW</strong></p>
        </div>
        <button class="btn-primary" onclick="openUploadModal()">☁️ Upload Dokumen</button>
      </div>
      <div class="doc-filter-bar">
        <input type="text" id="docSearchInput" class="doc-search-input"
          placeholder="🔍 Cari nama file atau proyek..." oninput="filterDocs()" />
        <select id="docCategoryFilter" class="doc-cat-select" onchange="filterDocs()">
          <option value="">Semua Kategori</option>
          ${DOC_CATEGORIES.map(c=>`<option value="${c.code}">${c.icon} ${c.label}</option>`).join('')}
        </select>
        <select id="docProjectFilter" class="doc-cat-select" onchange="filterDocs()">
          <option value="">Semua Proyek</option>
        </select>
      </div>
      <div id="docStatsBar" class="doc-stats-bar"></div>
      <div id="docGrid" class="doc-grid">
        <div class="doc-loading">⏳ Memuat dokumen...</div>
      </div>
    </div>`;
  loadAllDocuments();
}

// ── Load semua dokumen ───────────────────────────────────────
async function loadAllDocuments() {
  const grid = document.getElementById('docGrid');
  if (!grid) return;
  const { data, error } = await _db()
    .from('project_documents').select('*')
    .order('created_at',{ ascending:false });
  if (error) { grid.innerHTML=`<div class="doc-empty">Gagal: ${error.message}</div>`; return; }
  window._allDocs = data || [];
  _populateProjectFilter();
  renderDocGrid(window._allDocs);
  renderDocStats(window._allDocs);
}

function _populateProjectFilter() {
  const sel = document.getElementById('docProjectFilter');
  if (!sel) return;
  const projs = [...new Set(window._allDocs.map(d=>d.project_name))].sort();
  sel.innerHTML = `<option value="">Semua Proyek</option>` +
    projs.map(p=>`<option value="${p}">${p}</option>`).join('');
}

// ── Filter ───────────────────────────────────────────────────
function filterDocs() {
  const q   = (document.getElementById('docSearchInput')?.value||'').toLowerCase();
  const cat = document.getElementById('docCategoryFilter')?.value||'';
  const prj = document.getElementById('docProjectFilter')?.value||'';
  const res = window._allDocs.filter(d =>
    (!q   || d.file_name.toLowerCase().includes(q) || d.project_name.toLowerCase().includes(q)) &&
    (!cat || d.category    === cat) &&
    (!prj || d.project_name === prj)
  );
  renderDocGrid(res);
  renderDocStats(res);
}

// ── Stats bar ────────────────────────────────────────────────
function renderDocStats(docs) {
  const bar = document.getElementById('docStatsBar');
  if (!bar) return;
  const mb  = (docs.reduce((s,d)=>s+(d.file_size||0),0)/1048576).toFixed(1);
  const cc  = {};
  docs.forEach(d => { cc[d.category]=(cc[d.category]||0)+1; });
  const top = Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([c,n])=>{ const x=DOC_CATEGORIES.find(k=>k.code===c)||{icon:'🗂️',label:c};
      return `<span class="doc-stat-chip">${x.icon} ${x.label}: ${n}</span>`; }).join('');
  bar.innerHTML = `<span class="doc-stat-chip">📄 ${docs.length} dokumen</span>
    <span class="doc-stat-chip">💾 ${mb} MB</span>${top}`;
}

// ── Render grid ──────────────────────────────────────────────
function renderDocGrid(docs) {
  const grid = document.getElementById('docGrid');
  if (!grid) return;
  if (!docs.length) {
    grid.innerHTML=`<div class="doc-empty">
      <div style="font-size:40px;margin-bottom:12px">🗂️</div>
      <div>Belum ada dokumen. Klik <strong>Upload Dokumen</strong> untuk menambahkan.</div>
    </div>`; return;
  }
  grid.innerHTML = docs.map(doc => {
    const cat  = DOC_CATEGORIES.find(c=>c.code===doc.category)||{icon:'🗂️',label:doc.category};
    const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '';
    const size = doc.file_size  ? _fmtSize(doc.file_size) : '';
    return `<div class="doc-card">
      <div class="doc-card-thumb" onclick="previewDoc('${doc.id}')">
        <div class="doc-thumb-icon" style="background:${_fileColor(doc.mime_type,doc.file_name)}20;color:${_fileColor(doc.mime_type,doc.file_name)}">
          ${_fileIcon(doc.mime_type,doc.file_name)}
        </div>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-name" title="${_esc(doc.file_name)}">${_esc(doc.file_name)}</div>
        <div class="doc-card-meta"><span class="doc-cat-badge">${cat.icon} ${cat.label}</span></div>
        <div class="doc-card-project">${_esc(doc.project_name)}</div>
        ${doc.description?`<div class="doc-card-desc">${_esc(doc.description)}</div>`:''}
        <div class="doc-card-footer">
          <span class="doc-card-info">${[size,date].filter(Boolean).join(' · ')}</span>
          <div class="doc-card-actions">
            <button onclick="previewDoc('${doc.id}')" title="Preview">👁️</button>
            <a href="${doc.web_view_link}" target="_blank" title="Buka di Drive">↗️</a>
            <button onclick="deleteDoc('${doc.id}','${_esc(doc.file_name)}','${doc.drive_file_id}')" title="Hapus">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Panel dokumen di detail proyek ───────────────────────────
async function renderProjectDocPanel(projectName, containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = `<div style="padding:16px;color:#94a3b8;text-align:center">⏳ Memuat...</div>`;
  const { data } = await _db().from('project_documents').select('*')
    .eq('project_name', projectName).order('created_at',{ascending:false});
  const docs = data || [];
  c.innerHTML = `<div class="proj-doc-panel">
    <div class="proj-doc-header">
      <span class="proj-doc-title">📂 Dokumen Proyek
        <span class="proj-doc-count">${docs.length}</span>
      </span>
      <button class="btn-secondary btn-sm" onclick="openUploadModal('${_esc(projectName)}')">☁️ Upload</button>
    </div>
    ${!docs.length
      ? `<div class="proj-doc-empty">Belum ada dokumen untuk proyek ini.</div>`
      : `<div class="proj-doc-list">${docs.map(doc=>{
          const cat  = DOC_CATEGORIES.find(c=>c.code===doc.category)||{icon:'🗂️',label:doc.category};
          const size = doc.file_size ? _fmtSize(doc.file_size) : '';
          const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '';
          return `<div class="proj-doc-item">
            <span class="proj-doc-icon">${_fileIcon(doc.mime_type,doc.file_name)}</span>
            <div class="proj-doc-info">
              <div class="proj-doc-name">${_esc(doc.file_name)}</div>
              <div class="proj-doc-sub">
                <span class="doc-cat-badge sm">${cat.icon} ${cat.label}</span>
                ${size?`<span>${size}</span>`:''}${date?`<span>${date}</span>`:''}
              </div>
            </div>
            <div class="proj-doc-btns">
              <button onclick="previewDoc('${doc.id}')" title="Preview">👁️</button>
              <a href="${doc.web_view_link}" target="_blank" title="Buka di Drive">↗️</a>
              <button onclick="deleteDoc('${doc.id}','${_esc(doc.file_name)}','${doc.drive_file_id}')"
                style="color:#ef4444" title="Hapus">🗑️</button>
            </div>
          </div>`;}).join('')}</div>`
    }
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// MODAL UPLOAD
// ─────────────────────────────────────────────────────────────
function openUploadModal(presetProject='') {
  let m = document.getElementById('docUploadModal');
  if (!m) { m=document.createElement('div'); m.id='docUploadModal'; m.className='doc-modal-overlay'; document.body.appendChild(m); }
  const projs = (window.allProjects||[]).map(p=>p.name);
  m.innerHTML = `<div class="doc-modal">
    <div class="doc-modal-header">
      <h3 style="margin:0;font-size:16px;font-weight:700">☁️ Upload Dokumen ke Google Drive</h3>
      <button class="doc-modal-close" onclick="closeUploadModal()">✕</button>
    </div>
    <div class="doc-modal-body">
      <div class="doc-dropzone" id="docDropzone"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="_handleDrop(event)">
        <div style="font-size:36px;margin-bottom:8px">☁️</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Drag & drop file di sini</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">atau</div>
        <label class="btn-primary" style="cursor:pointer">
          Pilih dari Komputer
          <input type="file" id="docFileInput" multiple style="display:none"
            onchange="_handleFileSelect(this.files)" />
        </label>
        <div style="font-size:11px;color:#94a3b8;margin-top:8px">PDF, Word, Excel, gambar, video · Maks 50MB per file</div>
      </div>
      <div id="docStagedList"></div>
      <div class="doc-form">
        <div class="doc-form-row">
          <label>Proyek *</label>
          <select id="docFormProject" class="doc-input">
            <option value="">-- Pilih Proyek --</option>
            ${projs.map(p=>`<option value="${p}"${p===presetProject?' selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="doc-form-row">
          <label>Kategori *</label>
          <select id="docFormCategory" class="doc-input">
            ${DOC_CATEGORIES.map(c=>`<option value="${c.code}">${c.icon} ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="doc-form-row">
          <label>Deskripsi <span style="color:#94a3b8;font-weight:400">(opsional)</span></label>
          <input type="text" id="docFormDesc" class="doc-input" placeholder="Contoh: Laporan April 2026" />
        </div>
      </div>
      <div id="docUploadProgress" style="display:none;margin-top:14px">
        <div id="docUploadStatus" class="doc-upload-status"></div>
        <div class="doc-progress-bar"><div id="docProgressFill" class="doc-progress-fill" style="width:0%"></div></div>
      </div>
    </div>
    <div class="doc-modal-footer">
      <button class="btn-secondary" onclick="closeUploadModal()">Batal</button>
      <button class="btn-primary" id="docUploadBtn" onclick="startDocUpload()">☁️ Upload ke Drive</button>
    </div>
  </div>`;
  m.style.display='flex';
  window._stagedDocFiles=[];
}

function closeUploadModal() {
  const m=document.getElementById('docUploadModal');
  if(m) m.style.display='none';
  window._stagedDocFiles=[];
}

function _handleDrop(e) {
  e.preventDefault();
  document.getElementById('docDropzone')?.classList.remove('dragover');
  _handleFileSelect(e.dataTransfer.files);
}

function _handleFileSelect(files) {
  if(!files?.length) return;
  Array.from(files).forEach(f=>window._stagedDocFiles.push(f));
  _renderStaged();
}

function _renderStaged() {
  const c=document.getElementById('docStagedList');
  if(!c) return;
  const files=window._stagedDocFiles||[];
  if(!files.length){c.innerHTML='';return;}
  c.innerHTML=`<div class="doc-staged-list">${files.map((f,i)=>`
    <div class="doc-staged-item">
      <span style="font-size:20px">${_fileIcon(f.type,f.name)}</span>
      <div style="flex:1;min-width:0">
        <div class="doc-staged-name">${_esc(f.name)}</div>
        <div class="doc-staged-size">${_fmtSize(f.size)}</div>
      </div>
      <button class="doc-staged-remove" onclick="_removeStaged(${i})">✕</button>
    </div>`).join('')}</div>`;
}

function _removeStaged(i) { window._stagedDocFiles.splice(i,1); _renderStaged(); }

// ── Upload proses ────────────────────────────────────────────
async function startDocUpload() {
  const files   = window._stagedDocFiles||[];
  const project = document.getElementById('docFormProject')?.value;
  const cat     = document.getElementById('docFormCategory')?.value;
  const desc    = document.getElementById('docFormDesc')?.value||'';
  if(!files.length) return alert('Pilih file terlebih dahulu.');
  if(!project)      return alert('Pilih proyek terlebih dahulu.');

  const btn  = document.getElementById('docUploadBtn');
  const prog = document.getElementById('docUploadProgress');
  const stat = document.getElementById('docUploadStatus');
  const fill = document.getElementById('docProgressFill');
  btn.disabled=true; prog.style.display='block'; let ok=0;

  for(let i=0;i<files.length;i++){
    const f=files[i];
    fill.style.width=Math.round(i/files.length*100)+'%';
    stat.textContent=`Mengunggah ${i+1}/${files.length}: ${f.name}`;
    try {
      const fd=new FormData();
      fd.append('file',f); fd.append('project_name',project); fd.append('category',cat);
      const res  = await fetch(EDGE_FN_URL,{method:'POST',body:fd});
      const data = await res.json();
      if(!data.success) throw new Error(data.error||'Upload gagal');
      await _db().from('project_documents').insert({
        project_name:project, category:cat,
        file_name:data.file_name, mime_type:data.mime_type, file_size:data.file_size,
        drive_file_id:data.drive_file_id, drive_folder_id:data.folder_id,
        web_view_link:data.web_view_link, description:desc,
      });
      ok++;
    } catch(err){ alert(`Gagal: ${f.name}\n${err.message}`); }
  }
  fill.style.width='100%';
  stat.textContent=`✅ ${ok}/${files.length} file berhasil diupload ke Google Drive`;
  btn.disabled=false;
  setTimeout(()=>{ closeUploadModal(); loadAllDocuments();
    if(window.currentProject?.name===project) renderProjectDocPanel(project,'projDocPanel');
  },1200);
}

// ─────────────────────────────────────────────────────────────
// PREVIEW MODAL
// ─────────────────────────────────────────────────────────────
async function previewDoc(docId) {
  let doc=(window._allDocs||[]).find(d=>d.id===docId);
  if(!doc){
    const{data}=await _db().from('project_documents').select('*').eq('id',docId).single();
    if(!data) return alert('Dokumen tidak ditemukan.');
    doc=data;
  }
  let m=document.getElementById('docPreviewModal');
  if(!m){m=document.createElement('div');m.id='docPreviewModal';m.className='doc-modal-overlay';document.body.appendChild(m);}

  const cat  = DOC_CATEGORIES.find(c=>c.code===doc.category)||{icon:'🗂️',label:doc.category};
  const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '';
  const mime = doc.mime_type||'';
  const ext  = doc.file_name.split('.').pop().toLowerCase();
  let preview='';

  if(mime.startsWith('image/')){
    preview=`<div class="doc-preview-image"><img src="https://drive.google.com/uc?export=view&id=${doc.drive_file_id}" alt="${_esc(doc.file_name)}" /></div>`;
  } else if(mime.startsWith('video/')){
    preview=`<video class="doc-preview-video" controls src="https://drive.google.com/uc?export=download&id=${doc.drive_file_id}"></video>`;
  } else if(mime==='application/pdf'||ext==='pdf'){
    preview=`<iframe class="doc-preview-iframe" src="https://drive.google.com/file/d/${doc.drive_file_id}/preview" allowfullscreen></iframe>`;
  } else if(mime.includes('google-apps')){
    preview=`<iframe class="doc-preview-iframe" src="${doc.web_view_link.replace('/edit','/preview').replace('/view','/preview')}" allowfullscreen></iframe>`;
  } else if(['doc','docx','xls','xlsx','ppt','pptx','csv','txt'].includes(ext)){
    preview=`<iframe class="doc-preview-iframe" src="https://docs.google.com/viewer?url=https://drive.google.com/uc?export%3Ddownload%26id%3D${doc.drive_file_id}&embedded=true" allowfullscreen></iframe>`;
  } else {
    preview=`<div class="doc-preview-fallback">
      <div style="font-size:56px;margin-bottom:16px">${_fileIcon(mime,doc.file_name)}</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">${_esc(doc.file_name)}</div>
      <div style="color:#64748b;margin-bottom:20px">File ini tidak dapat dipreview langsung.</div>
      <a class="btn-primary" href="${doc.web_view_link}" target="_blank">↗️ Buka di Google Drive</a>
    </div>`;
  }

  m.innerHTML=`<div class="doc-modal doc-preview-modal">
    <div class="doc-modal-header">
      <div>
        <div class="doc-modal-title">${_esc(doc.file_name)}</div>
        <div class="doc-modal-meta">
          <span class="doc-cat-badge">${cat.icon} ${cat.label}</span>
          <span>${_esc(doc.project_name)}</span>
          ${date?`<span>${date}</span>`:''}
          ${doc.file_size?`<span>${_fmtSize(doc.file_size)}</span>`:''}
        </div>
      </div>
      <button class="doc-modal-close" onclick="document.getElementById('docPreviewModal').style.display='none'">✕</button>
    </div>
    <div class="doc-preview-body">${preview}</div>
    <div class="doc-modal-footer">
      <span style="font-size:12px;color:#64748b">${doc.description?_esc(doc.description):''}</span>
      <a class="btn-primary" href="${doc.web_view_link}" target="_blank">↗️ Buka di Google Drive</a>
    </div>
  </div>`;
  m.style.display='flex';
}

// ── Hapus dokumen ─────────────────────────────────────────────
async function deleteDoc(docId, fileName, driveFileId) {
  if(!confirm(`Hapus dokumen "${fileName}"?\n\nFile akan dihapus dari Google Drive dan database.`)) return;
  try {
    await fetch(`${EDGE_FN_URL}?action=delete`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({drive_file_id:driveFileId})
    });
    await _db().from('project_documents').delete().eq('id',docId);
    window._allDocs=(window._allDocs||[]).filter(d=>d.id!==docId);
    renderDocGrid(window._allDocs);
    renderDocStats(window._allDocs);
    const pp=document.getElementById('projDocPanel');
    if(pp&&window.currentProject) renderProjectDocPanel(window.currentProject.name,'projDocPanel');
  } catch(err){ alert('Gagal menghapus: '+err.message); }
}

// ─────────────────────────────────────────────────────────────
// INJECT PANEL KE DETAIL PROYEK
// ─────────────────────────────────────────────────────────────
(function patchOpenProjectDetail(){
  const _wait = setInterval(()=>{
    if(typeof window.openProjectDetail !== 'function') return;
    clearInterval(_wait);
    const orig = window.openProjectDetail;
    window.openProjectDetail = async function(proj,...args){
      await orig(proj,...args);
      if(!proj?.name) return;
      setTimeout(()=>{
        // Cari container sections di detail view
        const sections = document.querySelector('#tab-detail .detail-body, #tab-detail, .project-detail-body');
        if(!sections) return;
        if(!document.getElementById('projDocPanel')){
          const wrap = document.createElement('div');
          wrap.className = 'detail-section';
          wrap.innerHTML = `<div class="section-title" style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:10px">📂 Dokumen Proyek</div><div id="projDocPanel"></div>`;
          sections.appendChild(wrap);
        }
        renderProjectDocPanel(proj.name,'projDocPanel');
      }, 500);
    };
  }, 200);
})();

// ── Init saat tab Dokumen aktif ───────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  new MutationObserver(()=>{
    const t=document.getElementById('tab-documents');
    if(t?.classList.contains('active') && !t.dataset.docInit){
      t.dataset.docInit='1'; initDocumentsTab();
    }
  }).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
});

// ── Helpers ───────────────────────────────────────────────────
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmtSize(b){ if(!b)return''; if(b<1024)return b+' B'; if(b<1048576)return(b/1024).toFixed(1)+' KB'; if(b<1073741824)return(b/1048576).toFixed(1)+' MB'; return(b/1073741824).toFixed(2)+' GB'; }
function _fileIcon(mime,name){
  const e=(name||'').split('.').pop().toLowerCase();
  if((mime||'').startsWith('image/'))  return'🖼️';
  if((mime||'').startsWith('video/'))  return'🎬';
  if((mime||'').startsWith('audio/'))  return'🎵';
  if(mime==='application/pdf'||e==='pdf') return'📕';
  if(['doc','docx'].includes(e))       return'📝';
  if(['xls','xlsx','csv'].includes(e)) return'📊';
  if(['ppt','pptx'].includes(e))       return'📊';
  if(['zip','rar','7z'].includes(e))   return'🗜️';
  if((mime||'').includes('spreadsheet')) return'📊';
  if((mime||'').includes('document'))    return'📝';
  if((mime||'').includes('presentation'))return'📊';
  return'📄';
}
function _fileColor(mime,name){
  const ic=_fileIcon(mime,name);
  const m={'📕':'#ef4444','📝':'#3b82f6','📊':'#22c55e','🖼️':'#8b5cf6','🎬':'#f59e0b','🎵':'#ec4899','🗜️':'#f97316'};
  return m[ic]||'#64748b';
}
