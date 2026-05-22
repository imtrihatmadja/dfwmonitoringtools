// =====================================================================
// learning.js — Learning Loop PIMS DFW Indonesia
// Render-only first, DB-safe insert with minimal returning
// =====================================================================

const LEARN = { caseId:null, caseName:null, userId:null, refleksi:[], pelajaran:[], activities:[], filterKegiatan:'', selectedRefs:new Set() };
const LEARN_CAT = ['program','koordinasi','komunikasi','logistik','advokasi','pemantauan','lainnya'];
const LEARN_CONF = ['rendah','sedang','tinggi'];

function _lc(){ return window.client || client; }
function _esc(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _date(v){ try { return v ? new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-'; } catch { return String(v||''); } }
function _msg(el, text, cls){ if(!el) return; el.textContent=text; el.className='form-msg '+cls; el.style.display='block'; }

function renderLearningShell(){
  const shell = document.getElementById('learningTabShell');
  const cp = window.currentProject || (typeof currentProject !== 'undefined' ? currentProject : null);
  const refList = filteredRefs();
  const pelList = LEARN.pelajaran || [];
  if (!shell) return;
  if (!cp && !LEARN.caseId) {
    shell.innerHTML = `<div class="empty-state" style="padding:30px;text-align:center"><div style="font-size:32px;margin-bottom:8px">📚</div><div style="font-weight:600;color:#0f172a;margin-bottom:4px">Buka detail proyek dahulu</div><small style="color:#94a3b8">Tab Learning membutuhkan konteks proyek aktif.</small></div>`;
    return;
  }
  shell.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:12px;color:#64748b;flex-wrap:wrap">
      <span style="cursor:pointer;color:#2563eb" onclick="switchTab('dashboard')">Dashboard</span>
      <span style="color:#cbd5e1">/</span>
      <span style="cursor:pointer;color:#2563eb" onclick="switchTab('detail')">${_esc((cp||{}).name || LEARN.caseName || 'Proyek')}</span>
      <span style="color:#cbd5e1">/</span>
      <span style="color:#0f172a;font-weight:600">Learning Loop</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:#2563eb;font-weight:700">Refleksi</div><div style="font-size:20px;font-weight:800;color:#0f172a">${LEARN.refleksi.length}</div></div>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:#7c3aed;font-weight:700">Pelajaran</div><div style="font-size:20px;font-weight:800;color:#0f172a">${pelList.length}</div></div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:#15803d;font-weight:700">Diadopsi</div><div style="font-size:20px;font-weight:800;color:#0f172a">${pelList.filter(p=>p.status==='diadopsi').length}</div></div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px"><i class="fa-solid fa-clipboard-list" style="color:#2563eb"></i><span style="font-weight:700;color:#0f172a">Refleksi Kegiatan</span><span style="font-size:11px;color:#94a3b8;background:#f8fafc;border-radius:999px;padding:2px 9px">${refList.length}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="learnFilterKegiatan" onchange="applyLearnFilter(this.value)" style="font-size:12px;padding:5px 10px;border:1px solid #d1d5db;border-radius:8px;color:#374151">
            <option value="">Semua Kegiatan</option>${(LEARN.activities||[]).map(a=>`<option value="${_esc(a.id)}" ${LEARN.filterKegiatan===a.id?'selected':''}>${_esc(a.name)}</option>`).join('')}
          </select>
          <button class="btn-secondary btn-sm" onclick="openLearnReflectionModal()"><i class="fa-solid fa-plus"></i> Tambah Refleksi</button>
        </div>
      </div>
      <div id="learnReflectionList">${renderRefleksiList()}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px"><i class="fa-solid fa-book-open" style="color:#7c3aed"></i><span style="font-weight:700;color:#0f172a">Pelajaran</span><span style="font-size:11px;color:#94a3b8;background:#f8fafc;border-radius:999px;padding:2px 9px">${pelList.length}</span></div>
        <button class="btn-primary btn-sm" onclick="openLearnLessonModal()" ${refList.length ? '' : 'disabled'}><i class="fa-solid fa-book"></i> Buat Pelajaran</button>
      </div>
      <div id="learnLessonList">${renderPelajaranList()}</div>
    </div>`;
}

function filteredRefs(){ return LEARN.filterKegiatan ? LEARN.refleksi.filter(r=>r.kegiatan_id===LEARN.filterKegiatan) : LEARN.refleksi; }
function renderRefleksiList(){
  const list = filteredRefs();
  if (!list.length) return `<div class="empty-state" style="padding:20px">Belum ada refleksi${LEARN.filterKegiatan ? ' untuk kegiatan ini.' : '. Klik <strong>Tambah Refleksi</strong> untuk memulai.'}</div>`;
  return list.map(r=>`<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fafcff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:10px;background:#eff6ff;color:#2563eb;border-radius:999px;padding:2px 8px;font-weight:600">${_esc(r.kategori||'program')}</span>
        <span style="font-size:10px;background:#faf5ff;color:#7c3aed;border-radius:999px;padding:2px 8px;font-weight:600">${_esc(r.tingkat_kepercayaan||'sedang')}</span>
        ${r.activity_name ? `<span style="font-size:10px;background:#f8fafc;color:#475569;border-radius:999px;padding:2px 8px;font-weight:600">📋 ${_esc(r.activity_name)}</span>` : ''}
        <span style="font-size:11px;color:#94a3b8">${_date(r.tanggal)}</span>
      </div>
      <button class="btn-primary btn-sm" style="font-size:11px;padding:4px 10px;white-space:nowrap" onclick="quickCreateLesson('${r.id}')"><i class="fa-solid fa-bolt"></i> Buat Pelajaran</button>
    </div>
    <div style="margin-top:10px;display:grid;gap:6px">
      <div style="font-size:12px;background:#f0fdf4;border-left:3px solid #22c55e;border-radius:0 6px 6px 0;padding:7px 10px;color:#15803d"><strong>Berjalan baik:</strong> ${_esc(r.apa_yang_berjalan_baik)}</div>
      <div style="font-size:12px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 6px 6px 0;padding:7px 10px;color:#b91c1c"><strong>Tidak berjalan:</strong> ${_esc(r.apa_yang_tidak_berjalan)}</div>
      <div style="font-size:12px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0;padding:7px 10px;color:#1d4ed8"><strong>Akan diubah:</strong> ${_esc(r.apa_yang_akan_diubah)}</div>
    </div>
  </div>`).join('');
}
function renderPelajaranList(){
  if (!LEARN.pelajaran.length) return `<div class="empty-state" style="padding:20px">Belum ada pelajaran. Tambahkan dari refleksi kegiatan.</div>`;
  return LEARN.pelajaran.map(l=>`<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap"><div style="min-width:0"><div style="font-size:13px;font-weight:700;color:#0f172a">${_esc(l.judul)}</div><div style="font-size:11px;color:#94a3b8;margin-top:2px">${_date(l.created_at)} · ${(l.sumber_refleksi||[]).length} refleksi</div></div><span style="font-size:11px;background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;font-weight:600;white-space:nowrap">${_esc(l.status||'draft')}</span></div>
    <div style="font-size:12px;color:#475569;line-height:1.7;margin-top:8px">${_esc(l.ringkasan)}</div>
    ${l.rekomendasi ? `<div style="margin-top:8px;background:#f8fafc;border-radius:8px;padding:8px 10px;font-size:12px;color:#334155;border:1px solid #f1f5f9"><strong>📌 Rekomendasi:</strong> ${_esc(l.rekomendasi)}</div>` : ''}
  </div>`).join('');
}

window.applyLearnFilter = function(val){ LEARN.filterKegiatan = val || ''; renderLearningShell(); };
window.quickCreateLesson = function(refId){ LEARN.selectedRefs = new Set([refId]); openLearnLessonModal(); };

window.loadLearningLoop = async function(caseId){
  const cp = window.currentProject || (typeof currentProject !== 'undefined' ? currentProject : null);
  LEARN.caseId = caseId || cp?.id || LEARN.caseId;
  LEARN.caseName = cp?.name || LEARN.caseName;
  const shell = document.getElementById('learningTabShell');
  if (!LEARN.caseId) { renderLearningShell(); return; }
  if (shell) shell.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px">Memuat Learning Loop…</div>';
  try {
    const { data:{ user }, error:authErr } = await _lc().auth.getUser();
    if (authErr || !user) throw new Error('Pengguna belum login');
    LEARN.userId = user.id;

    const [rMem, rRef, rLes, rAct] = await Promise.all([
      _lc().from('kasus_member').select('kasus_id').eq('user_id', user.id),
      _lc().from('refleksi').select('*').eq('kasus_id', LEARN.caseId).order('created_at', { ascending:false }),
      _lc().from('pelajaran').select('*').eq('kasus_id', LEARN.caseId).order('created_at', { ascending:false }),
      _lc().from('activities').select('id,name').eq('project_id', LEARN.caseId).order('created_at', { ascending:true }),
    ]);
    if (rMem.error) throw rMem.error;
    if (!((rMem.data||[]).map(x=>x.kasus_id)).includes(LEARN.caseId)) {
      throw new Error('Anda bukan anggota kasus ini.');
    }
    if (rRef.error) throw rRef.error;
    if (rLes.error) throw rLes.error;
    if (rAct.error) throw rAct.error;
    LEARN.refleksi = (rRef.data||[]).map(x => ({ ...x, activity_name: (rAct.data||[]).find(a=>a.id===x.kegiatan_id)?.name || '' }));
    LEARN.pelajaran = rLes.data || [];
    LEARN.activities = rAct.data || [];
    renderLearningShell();
  } catch (err) {
    if (shell) shell.innerHTML = `<div style="margin-top:10px;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;font-size:13px">⚠️ ${_esc(err.message || String(err))}</div>`;
  }
};
window.loadLearningLoopFromUI = function(){ switchTab('learning'); const cp = window.currentProject || (typeof currentProject !== 'undefined' ? currentProject : null); if (typeof loadLearningLoop === 'function') loadLearningLoop(cp ? cp.id : null); };

window.openLearnReflectionModal = function(){
  let o=document.getElementById('learnRefOverlay'); if(!o){ o=document.createElement('div'); o.id='learnRefOverlay'; document.body.appendChild(o);} o.className='modal-overlay';
  const cp = window.currentProject || (typeof currentProject !== 'undefined' ? currentProject : null);
  o.innerHTML = `<div class="modal-box" style="max-width:640px;width:95vw"><div class="modal-header"><span style="font-size:15px;font-weight:700;color:#0f172a">Tambah Refleksi Kegiatan</span><button class="modal-close" onclick="closeLearnRefModal()">✕</button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label>Kegiatan terkait</label><select id="learnRefAct" style="width:100%"><option value="">— Tidak terkait kegiatan spesifik —</option>${(LEARN.activities||[]).map(a=>`<option value="${_esc(a.id)}">${_esc(a.name)}</option>`).join('')}</select></div><div class="form-group full"><label>Apa yang berjalan baik <span class="required">*</span></label><textarea id="learnRefGood" rows="3"></textarea></div><div class="form-group full"><label>Apa yang tidak berjalan <span class="required">*</span></label><textarea id="learnRefBad" rows="3"></textarea></div><div class="form-group full"><label>Apa yang akan diubah <span class="required">*</span></label><textarea id="learnRefChange" rows="3"></textarea></div><div class="form-group"><label>Kategori</label><select id="learnRefCat">${LEARN_CAT.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div><div class="form-group"><label>Tingkat Kepercayaan</label><select id="learnRefConf">${LEARN_CONF.map(c=>`<option value="${c}" ${c==='sedang'?'selected':''}>${c}</option>`).join('')}</select></div></div><div id="learnRefMsg" class="form-msg hidden" style="margin-top:10px"></div><div class="form-actions"><button class="btn-secondary" onclick="closeLearnRefModal()">Batal</button><button class="btn-primary" onclick="saveLearnReflection()">💾 Simpan Refleksi</button></div></div></div>`;
};
window.closeLearnRefModal = function(){ const o=document.getElementById('learnRefOverlay'); if(o) o.remove(); };
window.saveLearnReflection = async function(){
  const btn = document.querySelector('#learnRefOverlay .btn-primary');
  const good = document.getElementById('learnRefGood')?.value.trim() || '';
  const bad = document.getElementById('learnRefBad')?.value.trim() || '';
  const chg = document.getElementById('learnRefChange')?.value.trim() || '';
  const act = document.getElementById('learnRefAct')?.value || null;
  const cat = document.getElementById('learnRefCat')?.value || 'program';
  const conf = document.getElementById('learnRefConf')?.value || 'sedang';
  const msg = document.getElementById('learnRefMsg');
  if (!good || !bad || !chg) return _msg(msg, 'Semua field wajib diisi.', 'error');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
  try {
    const { data:{ user }, error:authErr } = await _lc().auth.getUser();
    if (authErr || !user) throw new Error('Belum login');
    const { error } = await _lc().from('refleksi').insert([{ kegiatan_id: act, kasus_id: LEARN.caseId || (window.currentProject && window.currentProject.id), dibuat_oleh: user.id, tanggal: new Date().toISOString().split('T')[0], apa_yang_berjalan_baik: good, apa_yang_tidak_berjalan: bad, apa_yang_akan_diubah: chg, kategori: cat, tingkat_kepercayaan: conf }], { returning: 'minimal' });
    if (error) throw error;
    _msg(msg, 'Refleksi tersimpan.', 'success');
    document.getElementById('learnRefGood').value=''; document.getElementById('learnRefBad').value=''; document.getElementById('learnRefChange').value='';
    await loadLearningLoop(LEARN.caseId || (window.currentProject && window.currentProject.id));
    if (window.currentProject && window.currentProject.id) await populateDetailLearningActivities();
  } catch (err) {
    _msg(msg, 'Gagal simpan refleksi: ' + (err.message || err), 'error');
  } finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Refleksi'; } }
};

window.openLearnLessonModal = function(){
  let o=document.getElementById('learnLessonOverlay'); if(!o){ o=document.createElement('div'); o.id='learnLessonOverlay'; document.body.appendChild(o);} o.className='modal-overlay';
  const refs = filteredRefs();
  o.innerHTML = `<div class="modal-box" style="max-width:700px;width:95vw"><div class="modal-header"><span style="font-size:15px;font-weight:700;color:#0f172a">Buat Pelajaran dari Refleksi</span><button class="modal-close" onclick="closeLearnLessonModal()">✕</button></div><div class="modal-body"><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px">Pilih refleksi sumber <span style="color:#64748b;font-weight:400">(wajib min. 1)</span></div><div style="max-height:230px;overflow:auto;padding:2px 0;margin-bottom:14px">${refs.map(r=>`<label style="display:flex;gap:10px;padding:10px;border-radius:8px;border:1px solid #f1f5f9;background:#fff;cursor:pointer;margin-bottom:8px"><input type="checkbox" value="${r.id}" ${LEARN.selectedRefs.has(r.id)?'checked':''} onchange="toggleLearnPick('${r.id}',this)"/><div><div style="font-size:12px;font-weight:700;color:#0f172a">${_esc(r.apa_yang_berjalan_baik)}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${_esc(r.activity_name || '')} · ${_date(r.tanggal)}</div></div></label>`).join('')}</div><div id="learnPickCount" style="font-size:11px;color:#7c3aed;margin-bottom:12px">${LEARN.selectedRefs.size} refleksi dipilih</div><div class="form-grid"><div class="form-group full"><label>Judul <span class="required">*</span></label><input id="learnLesTitle" type="text" placeholder="Judul ringkas pelajaran…"></div><div class="form-group full"><label>Ringkasan <span class="required">*</span></label><textarea id="learnLesSummary" rows="4" placeholder="Min. 20 karakter…"></textarea></div><div class="form-group full"><label>Rekomendasi</label><textarea id="learnLesRec" rows="3" placeholder="Saran tindak lanjut…"></textarea></div></div><div id="learnLesMsg" class="form-msg hidden" style="margin-top:10px"></div><div class="form-actions"><button class="btn-secondary" onclick="closeLearnLessonModal()">Batal</button><button class="btn-primary" onclick="saveLearnLesson()">💾 Simpan Pelajaran</button></div></div></div>`;
};
window.closeLearnLessonModal = function(){ const o=document.getElementById('learnLessonOverlay'); if(o) o.remove(); LEARN.selectedRefs = new Set(); };
window.toggleLearnPick = function(id, el){ if(el.checked) LEARN.selectedRefs.add(id); else LEARN.selectedRefs.delete(id); const c=document.getElementById('learnPickCount'); if(c) c.textContent = `${LEARN.selectedRefs.size} refleksi dipilih`; };
window.saveLearnLesson = async function(){
  const btn = document.querySelector('#learnLessonOverlay .btn-primary');
  const title = document.getElementById('learnLesTitle')?.value.trim() || '';
  const summ = document.getElementById('learnLesSummary')?.value.trim() || '';
  const rec = document.getElementById('learnLesRec')?.value.trim() || null;
  const msg = document.getElementById('learnLesMsg');
  if (!title || !summ) return _msg(msg, 'Judul dan ringkasan wajib diisi.', 'error');
  if (!LEARN.selectedRefs.size) return _msg(msg, 'Pilih minimal 1 refleksi.', 'error');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
  try {
    const { data:{ user }, error:authErr } = await _lc().auth.getUser();
    if (authErr || !user) throw new Error('Belum login');
    const { error } = await _lc().from('pelajaran').insert([{ kasus_id: LEARN.caseId || (window.currentProject && window.currentProject.id), dibuat_oleh: user.id, judul: title, ringkasan: summ, sumber_refleksi: Array.from(LEARN.selectedRefs), rekomendasi: rec, status: 'draft', diadopsi_oleh: [] }], { returning: 'minimal' });
    if (error) throw error;
    _msg(msg, 'Pelajaran tersimpan.', 'success');
    LEARN.selectedRefs = new Set();
    await loadLearningLoop(LEARN.caseId || (window.currentProject && window.currentProject.id));
  } catch (err) {
    _msg(msg, 'Gagal simpan pelajaran: ' + (err.message || err), 'error');
  } finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Pelajaran'; } }
};
