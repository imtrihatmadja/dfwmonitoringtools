// =====================================================================
// learning.js — Learning Loop PIMS DFW Indonesia
// Aligned with app.js / beneficiary.js render patterns
// RLS-ready: semua query filter manual via dibuat_oleh = user.id
// =====================================================================

// ── State ─────────────────────────────────────────────────────────────
const LEARN = {
  caseId   : null,
  caseName : null,
  userId   : null,
  refleksi : [],
  pelajaran: [],
  activities: [],
  filterKegiatan: '',
  selectedRefs  : new Set(),
};

const LEARN_CAT   = ['program','koordinasi','komunikasi','logistik','advokasi','pemantauan','lainnya'];
const LEARN_CONF  = ['rendah','sedang','tinggi'];
const LEARN_STATUS_MAP = {
  draft:'Draft', review:'Review', disetujui:'Disetujui', diadopsi:'Diadopsi', diarsipkan:'Diarsipkan'
};
const LEARN_STATUS_COLOR = {
  draft:'#64748b', review:'#2563eb', disetujui:'#059669', diadopsi:'#7c3aed', diarsipkan:'#b91c1c'
};

// ── Helpers ───────────────────────────────────────────────────────────
function _lc(){ return window.client || client; }
function _esc(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _fmtDate(v){ try{ return v ? new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-'; }catch{ return String(v); } }
function _badge(text, bg='#eff6ff', color='#2563eb'){
  return `<span style="font-size:10px;background:${bg};color:${color};border-radius:999px;padding:2px 8px;font-weight:600">${_esc(text)}</span>`;
}
function _showMsg(elId, msg, type='error'){
  const el=document.getElementById(elId);
  if(!el) return;
  el.textContent=msg; el.className='form-msg '+(type==='success'?'success':'error'); el.style.display='block';
  if(type==='success') setTimeout(()=>{ el.style.display='none'; },3000);
}

// ── Init ──────────────────────────────────────────────────────────────
window.loadLearningLoop = async function(caseId){
  const cp = window.currentProject || (typeof currentProject !== 'undefined' ? currentProject : null);
  LEARN.caseId   = caseId || (cp && cp.id)   || LEARN.caseId;
  LEARN.caseName = (cp && cp.name) || LEARN.caseName;
  const shell = document.getElementById('learningTabShell');
  if (!LEARN.caseId){
    if(shell) shell.innerHTML = `<div class="empty-state" style="padding:30px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📚</div>
      <div style="font-weight:600;color:#0f172a;margin-bottom:4px">Buka detail proyek dahulu</div>
      <small style="color:#94a3b8">Tab Learning membutuhkan konteks proyek aktif.</small>
    </div>`;
    return;
  }
  if(shell) shell.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px">Memuat Learning Loop…</div>';
  try {
    const { data:{ user }, error:authErr } = await _lc().auth.getUser();
    if(authErr||!user) throw new Error('Pengguna belum login');
    LEARN.userId = user.id;

    // membership check
    const { data: mData, error: mErr } = await _lc().from('kasus_member').select('kasus_id').eq('user_id', LEARN.userId);
    if(mErr) throw mErr;
    const memberIds = (mData||[]).map(r=>r.kasus_id);
    if(!memberIds.includes(LEARN.caseId)) throw new Error('Anda bukan anggota kasus ini. Minta admin untuk menambahkan Anda ke kasus_member.');

    // parallel fetch
    const [rRef, rLes, rAct] = await Promise.all([
      _lc().from('refleksi').select('*').eq('kasus_id', LEARN.caseId).eq('dibuat_oleh', LEARN.userId).order('tanggal',{ascending:false}),
      _lc().from('pelajaran').select('*').eq('kasus_id', LEARN.caseId).eq('dibuat_oleh', LEARN.userId).order('created_at',{ascending:false}),
      _lc().from('activities').select('id,name,status,due_date').eq('project_id', LEARN.caseId).order('due_date',{ascending:false}),
    ]);
    if(rRef.error) throw rRef.error;
    if(rLes.error) throw rLes.error;
    if(rAct.error) throw rAct.error;
    LEARN.refleksi  = rRef.data || [];
    LEARN.pelajaran = rLes.data || [];
    LEARN.activities= rAct.data || [];
    LEARN.filterKegiatan = '';
    renderLearningShell();
  } catch(err) {
    if(shell) shell.innerHTML = `<div style="margin-top:10px;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;font-size:13px">⚠️ ${_esc(err.message||String(err))}</div>`;
  }
};

// ── Main Shell ────────────────────────────────────────────────────────
function renderLearningShell(){
  const shell = document.getElementById('learningTabShell');
  if(!shell) return;
  const rc = _filteredRefleksi().length;
  const lc = LEARN.pelajaran.length;
  shell.innerHTML = `
    <!-- BREADCRUMB -->
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:12px;color:#64748b;flex-wrap:wrap">
      <span style="cursor:pointer;color:#2563eb" onclick="switchTab('dashboard')">Dashboard</span>
      <span style="color:#cbd5e1">/</span>
      <span style="cursor:pointer;color:#2563eb" onclick="switchTab('detail')">${_esc(LEARN.caseName||'Proyek')}</span>
      <span style="color:#cbd5e1">/</span>
      <span style="color:#0f172a;font-weight:600">Learning Loop</span>
    </div>

    <!-- STAT CARDS -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:18px">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 14px">
        <div style="font-size:11px;color:#2563eb;font-weight:700">Refleksi</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a">${LEARN.refleksi.length}</div>
      </div>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:12px 14px">
        <div style="font-size:11px;color:#7c3aed;font-weight:700">Pelajaran</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a">${lc}</div>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px">
        <div style="font-size:11px;color:#15803d;font-weight:700">Diadopsi</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a">${LEARN.pelajaran.filter(p=>p.status==='diadopsi').length}</div>
      </div>
    </div>

    <!-- PANEL REFLEKSI -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <i class="fa-solid fa-clipboard-list" style="color:#2563eb"></i>
          <span style="font-weight:700;color:#0f172a">Refleksi Kegiatan</span>
          <span style="font-size:11px;color:#94a3b8;background:#f8fafc;border-radius:999px;padding:2px 9px">${rc}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="learnFilterKegiatan" onchange="applyLearnFilter(this.value)" style="font-size:12px;padding:5px 10px;border:1px solid #d1d5db;border-radius:8px;color:#374151">
            <option value="">Semua Kegiatan</option>
            ${LEARN.activities.map(a=>`<option value="${_esc(a.id)}" ${LEARN.filterKegiatan===a.id?'selected':''}>${_esc(a.name)}</option>`).join('')}
          </select>
          <button class="btn-secondary btn-sm" onclick="openLearnReflectionModal()">
            <i class="fa-solid fa-plus"></i> Tambah Refleksi
          </button>
        </div>
      </div>
      <div id="learnReflectionList">${renderRefleksiList()}</div>
    </div>

    <!-- PANEL PELAJARAN -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <i class="fa-solid fa-book-open" style="color:#7c3aed"></i>
          <span style="font-weight:700;color:#0f172a">Pelajaran</span>
          <span style="font-size:11px;color:#94a3b8;background:#f8fafc;border-radius:999px;padding:2px 9px">${lc}</span>
        </div>
        <button class="btn-primary btn-sm" onclick="openLearnLessonModal()" ${LEARN.refleksi.length?'':'disabled'}>
          <i class="fa-solid fa-book"></i> Buat Pelajaran
        </button>
      </div>
      <div id="learnLessonList">${renderPelajaranList()}</div>
    </div>
  `;
}

// ── Filter ────────────────────────────────────────────────────────────
window.applyLearnFilter = function(val){
  LEARN.filterKegiatan = val;
  document.getElementById('learnReflectionList').innerHTML = renderRefleksiList();
};

function _filteredRefleksi(){
  if(!LEARN.filterKegiatan) return LEARN.refleksi;
  return LEARN.refleksi.filter(r => r.kegiatan_id === LEARN.filterKegiatan);
}

// ── Render Refleksi List ──────────────────────────────────────────────
function renderRefleksiList(){
  const list = _filteredRefleksi();
  if(!list.length) return `<div class="empty-state" style="padding:20px">Belum ada refleksi${LEARN.filterKegiatan?' untuk kegiatan ini.':'. Klik <strong>Tambah Refleksi</strong> untuk memulai.'}</div>`;
  return list.map(r => {
    const act = LEARN.activities.find(a=>a.id===r.kegiatan_id);
    return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fafcff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${_badge(r.kategori,'#eff6ff','#2563eb')}
          ${_badge(r.tingkat_kepercayaan,'#faf5ff','#7c3aed')}
          ${act ? _badge('📋 '+act.name,'#f8fafc','#475569') : ''}
          <span style="font-size:11px;color:#94a3b8">${_fmtDate(r.tanggal)}</span>
        </div>
        <button class="btn-primary btn-sm" style="font-size:11px;padding:4px 10px;white-space:nowrap"
          onclick="quickCreateLesson('${r.id}')">
          <i class="fa-solid fa-bolt"></i> Buat Pelajaran
        </button>
      </div>
      <div style="margin-top:10px;display:grid;gap:6px">
        <div style="font-size:12px;background:#f0fdf4;border-left:3px solid #22c55e;border-radius:0 6px 6px 0;padding:7px 10px;color:#15803d">
          ✅ <strong>Berjalan baik:</strong> ${_esc(r.apa_yang_berjalan_baik)}
        </div>
        <div style="font-size:12px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 6px 6px 0;padding:7px 10px;color:#b91c1c">
          ❌ <strong>Tidak berjalan:</strong> ${_esc(r.apa_yang_tidak_berjalan)}
        </div>
        <div style="font-size:12px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0;padding:7px 10px;color:#1d4ed8">
          🔄 <strong>Akan diubah:</strong> ${_esc(r.apa_yang_akan_diubah)}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Render Pelajaran List ─────────────────────────────────────────────
function renderPelajaranList(){
  if(!LEARN.pelajaran.length) return `<div class="empty-state" style="padding:20px">Belum ada pelajaran. Tambahkan dari refleksi kegiatan.</div>`;
  return LEARN.pelajaran.map(l=>{
    const color = LEARN_STATUS_COLOR[l.status]||'#64748b';
    const label = LEARN_STATUS_MAP[l.status]||l.status;
    const sudah = (l.diadopsi_oleh||[]).includes(LEARN.userId);
    return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:700;color:#0f172a">${_esc(l.judul)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${_fmtDate(l.created_at)} · ${(l.sumber_refleksi||[]).length} refleksi</div>
        </div>
        <span style="font-size:11px;background:#f8fafc;color:${color};border:1px solid ${color}33;border-radius:999px;padding:2px 8px;font-weight:600;white-space:nowrap">${label}</span>
      </div>
      <div style="font-size:12px;color:#475569;line-height:1.7;margin-top:8px">${_esc(l.ringkasan)}</div>
      ${l.rekomendasi?`<div style="margin-top:8px;background:#f8fafc;border-radius:8px;padding:8px 10px;font-size:12px;color:#334155;border:1px solid #f1f5f9"><strong>📌 Rekomendasi:</strong> ${_esc(l.rekomendasi)}</div>`:''}
      <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:8px">
        ${!sudah && l.status!=='diarsipkan'
          ? `<button class="btn-primary btn-sm" onclick="adoptLearnLesson('${l.id}')">Adopsi Pelajaran</button>`
          : `<span style="font-size:11px;color:#15803d;font-style:italic">✓ Sudah diadopsi</span>`}
      </div>
    </div>`;
  }).join('');
}

// ── Quick Create Lesson (dari tombol per refleksi) ────────────────────
window.quickCreateLesson = function(refleksiId){
  LEARN.selectedRefs = new Set([refleksiId]);
  openLearnLessonModal();
};

// ── Modal Refleksi ────────────────────────────────────────────────────
window.openLearnReflectionModal = function(){
  let overlay = document.getElementById('learnRefOverlay');
  if(!overlay){ overlay = document.createElement('div'); overlay.id='learnRefOverlay'; document.body.appendChild(overlay); }
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:620px;width:95vw">
      <div class="modal-header">
        <span style="font-size:15px;font-weight:700;color:#0f172a">Tambah Refleksi Kegiatan</span>
        <button class="modal-close" onclick="closeLearnRefModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full">
            <label>Kegiatan terkait</label>
            <select id="learnRefAct" style="width:100%">
              <option value="">— Tidak terkait kegiatan spesifik —</option>
              ${LEARN.activities.map(a=>`<option value="${_esc(a.id)}">${_esc(a.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group full">
            <label>Apa yang berjalan baik <span class="required">*</span></label>
            <textarea id="learnRefGood" rows="3" placeholder="Min. 10 karakter…"></textarea>
          </div>
          <div class="form-group full">
            <label>Apa yang tidak berjalan <span class="required">*</span></label>
            <textarea id="learnRefBad" rows="3" placeholder="Hambatan / tantangan yang dihadapi…"></textarea>
          </div>
          <div class="form-group full">
            <label>Apa yang akan diubah <span class="required">*</span></label>
            <textarea id="learnRefChange" rows="3" placeholder="Rencana perbaikan ke depan…"></textarea>
          </div>
          <div class="form-group">
            <label>Kategori</label>
            <select id="learnRefCat">
              ${LEARN_CAT.map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Tingkat Kepercayaan</label>
            <select id="learnRefConf">
              ${LEARN_CONF.map(c=>`<option value="${c}" ${c==='sedang'?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="learnRefMsg" class="form-msg hidden" style="margin-top:10px"></div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="closeLearnRefModal()">Batal</button>
          <button class="btn-primary"   onclick="saveLearnReflection()">💾 Simpan Refleksi</button>
        </div>
      </div>
    </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeLearnRefModal(); };
};
window.closeLearnRefModal = function(){
  const o=document.getElementById('learnRefOverlay'); if(o) o.remove();
};

window.saveLearnReflection = async function(){
  const btn  = document.querySelector('#learnRefOverlay .btn-primary');
  const good = document.getElementById('learnRefGood')?.value?.trim()||'';
  const bad  = document.getElementById('learnRefBad')?.value?.trim()||'';
  const chg  = document.getElementById('learnRefChange')?.value?.trim()||'';
  const cat  = document.getElementById('learnRefCat')?.value||'program';
  const conf = document.getElementById('learnRefConf')?.value||'sedang';
  const actId= document.getElementById('learnRefAct')?.value||null;
  if(!good||!bad||!chg){ _showMsg('learnRefMsg','Semua field wajib diisi.','error'); return; }
  if(good.length<10||bad.length<10||chg.length<10){ _showMsg('learnRefMsg','Setiap field minimal 10 karakter.','error'); return; }
  if(btn){ btn.textContent='Menyimpan…'; btn.disabled=true; }
  try {
    const { data, error } = await _lc().from('refleksi').insert({
      kegiatan_id : actId || null,
      kasus_id    : LEARN.caseId,
      dibuat_oleh : LEARN.userId,
      tanggal     : new Date().toISOString().split('T')[0],
      apa_yang_berjalan_baik  : good,
      apa_yang_tidak_berjalan : bad,
      apa_yang_akan_diubah    : chg,
      kategori                : cat,
      tingkat_kepercayaan     : conf,
    }).select('*').single();
    if(error) throw error;
    LEARN.refleksi.unshift(data);
    closeLearnRefModal();
    renderLearningShell();
  } catch(err){
    _showMsg('learnRefMsg', err.message||String(err), 'error');
    if(btn){ btn.textContent='💾 Simpan Refleksi'; btn.disabled=false; }
  }
};

// ── Modal Pelajaran ───────────────────────────────────────────────────
window.openLearnLessonModal = function(){
  let overlay = document.getElementById('learnLessonOverlay');
  if(!overlay){ overlay = document.createElement('div'); overlay.id='learnLessonOverlay'; document.body.appendChild(overlay); }
  overlay.className = 'modal-overlay';
  const refItems = LEARN.refleksi.map(r=>{
    const checked = LEARN.selectedRefs.has(r.id);
    const act = LEARN.activities.find(a=>a.id===r.kegiatan_id);
    return `
    <label style="display:flex;gap:10px;padding:10px;border-radius:8px;border:1px solid ${checked?'#93c5fd':'#f1f5f9'};background:${checked?'#eff6ff':'#fff'};cursor:pointer;margin-bottom:8px;transition:border-color .15s" id="learnRefPick-${r.id}">
      <input type="checkbox" value="${r.id}" ${checked?'checked':''} onchange="toggleLearnPick('${r.id}',this)"/>
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:700;color:#0f172a;line-clamp:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(r.apa_yang_berjalan_baik)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${_badge(r.kategori,'#f1f5f9','#475569')} ${act?`· ${_esc(act.name)}`:''} · ${_fmtDate(r.tanggal)}</div>
      </div>
    </label>`;
  }).join('');
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:660px;width:95vw">
      <div class="modal-header">
        <span style="font-size:15px;font-weight:700;color:#0f172a">Buat Pelajaran dari Refleksi</span>
        <button class="modal-close" onclick="closeLearnLessonModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px">
          Pilih refleksi sumber <span style="color:#64748b;font-weight:400">(wajib min. 1)</span>
        </div>
        <div style="max-height:230px;overflow:auto;padding:2px 0;margin-bottom:14px">${refItems}</div>
        <div id="learnPickCount" style="font-size:11px;color:#7c3aed;margin-bottom:12px">${LEARN.selectedRefs.size} refleksi dipilih</div>
        <div class="form-grid">
          <div class="form-group full">
            <label>Judul <span class="required">*</span></label>
            <input id="learnLesTitle" type="text" placeholder="Judul ringkas pelajaran…">
          </div>
          <div class="form-group full">
            <label>Ringkasan <span class="required">*</span></label>
            <textarea id="learnLesSummary" rows="4" placeholder="Min. 20 karakter…"></textarea>
          </div>
          <div class="form-group full">
            <label>Rekomendasi <span style="color:#94a3b8;font-weight:400">(opsional)</span></label>
            <textarea id="learnLesRec" rows="3" placeholder="Saran tindak lanjut…"></textarea>
          </div>
        </div>
        <div id="learnLesMsg" class="form-msg hidden" style="margin-top:10px"></div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="closeLearnLessonModal()">Batal</button>
          <button class="btn-primary"   onclick="saveLearnLesson()">💾 Simpan Pelajaran</button>
        </div>
      </div>
    </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeLearnLessonModal(); };
};
window.closeLearnLessonModal = function(){
  const o=document.getElementById('learnLessonOverlay'); if(o) o.remove(); LEARN.selectedRefs=new Set();
};
window.toggleLearnPick = function(id, el){
  if(el.checked){ LEARN.selectedRefs.add(id); el.closest('label').style.background='#eff6ff'; el.closest('label').style.borderColor='#93c5fd'; }
  else { LEARN.selectedRefs.delete(id); el.closest('label').style.background='#fff'; el.closest('label').style.borderColor='#f1f5f9'; }
  const cnt=document.getElementById('learnPickCount'); if(cnt) cnt.textContent=LEARN.selectedRefs.size+' refleksi dipilih';
};

window.saveLearnLesson = async function(){
  const btn   = document.querySelector('#learnLessonOverlay .btn-primary');
  const title = document.getElementById('learnLesTitle')?.value?.trim()||'';
  const summ  = document.getElementById('learnLesSummary')?.value?.trim()||'';
  const rec   = document.getElementById('learnLesRec')?.value?.trim()||null;
  if(!title||!summ){ _showMsg('learnLesMsg','Judul dan ringkasan wajib diisi.','error'); return; }
  if(summ.length<20){ _showMsg('learnLesMsg','Ringkasan minimal 20 karakter.','error'); return; }
  if(LEARN.selectedRefs.size===0){ _showMsg('learnLesMsg','Pilih minimal 1 refleksi sumber.','error'); return; }
  if(btn){ btn.textContent='Menyimpan…'; btn.disabled=true; }
  try {
    const { data, error } = await _lc().from('pelajaran').insert({
      kasus_id       : LEARN.caseId,
      dibuat_oleh    : LEARN.userId,
      judul          : title,
      ringkasan      : summ,
      sumber_refleksi: Array.from(LEARN.selectedRefs),
      rekomendasi    : rec,
      status         : 'draft',
      diadopsi_oleh  : [],
    }).select('*').single();
    if(error) throw error;
    LEARN.pelajaran.unshift(data);
    closeLearnLessonModal();
    renderLearningShell();
  } catch(err){
    _showMsg('learnLesMsg', err.message||String(err), 'error');
    if(btn){ btn.textContent='💾 Simpan Pelajaran'; btn.disabled=false; }
  }
};

// ── Adopsi Pelajaran ──────────────────────────────────────────────────
window.adoptLearnLesson = async function(id){
  const btn = event.target; if(btn){ btn.textContent='Mengadopsi…'; btn.disabled=true; }
  try {
    const { data: existing, error: getErr } = await _lc().from('pelajaran').select('diadopsi_oleh,status,dibuat_oleh').eq('id', id).single();
    if(getErr) throw getErr;
    if(existing.dibuat_oleh !== LEARN.userId) throw new Error('Tidak dapat mengadopsi pelajaran milik pengguna lain.');
    const curr = existing.diadopsi_oleh || [];
    if(!curr.includes(LEARN.userId)){
      const { error: upErr } = await _lc().from('pelajaran').update({ diadopsi_oleh:[...curr,LEARN.userId], status:'diadopsi' }).eq('id', id).eq('dibuat_oleh', LEARN.userId);
      if(upErr) throw upErr;
      const idx = LEARN.pelajaran.findIndex(p=>p.id===id);
      if(idx>=0){ LEARN.pelajaran[idx].diadopsi_oleh=[...curr,LEARN.userId]; LEARN.pelajaran[idx].status='diadopsi'; }
      document.getElementById('learnLessonList').innerHTML = renderPelajaranList();
    }
  } catch(err){ alert('Gagal adopsi: '+(err.message||err)); if(btn){ btn.textContent='Adopsi Pelajaran'; btn.disabled=false; } }
};

// ── Load from tab click ───────────────────────────────────────────────
window.loadLearningLoopFromUI = function(){
  switchTab('learning');
  const cp = window.currentProject || (typeof currentProject!=='undefined'?currentProject:null);
  loadLearningLoop(cp ? cp.id : null);
};
