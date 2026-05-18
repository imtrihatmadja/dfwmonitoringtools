// ============================================================
// issues.js - MINIMAL DEBUG
// ============================================================
window.issueAllData = [];
window.issueFilteredData = [];
window.issueCurrentPage = 1;
const ISSUE_PAGE_SIZE = 20;

function escI(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function setBox(txt){ const el=document.getElementById('issueLoadError'); if(el){ el.style.display='block'; el.style.background='#eff6ff'; el.style.color='#2563eb'; el.style.border='1px solid #bfdbfe'; el.textContent=txt; } }
function showEmpty(reason){
  const body=document.getElementById('issueTableBody');
  const lbl=document.getElementById('issueCountLabel');
  if(lbl) lbl.textContent='0 isu';
  if(body) body.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">${escI(reason)}</td></tr>`;
}
function renderStats(){
  const d=window.issueAllData||[];
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  set('issueTotalCount', d.length);
  set('issuePendingCount', d.filter(x=>x.status==='pending_review').length);
  set('issueActiveCount', d.filter(x=>x.status==='active').length);
  set('issueCriticalCount', d.filter(x=>x.severity==='critical').length);
  set('issueStaleCount', d.filter(x=>x.severity==='critical' && (x.days_since_update||0)>14).length);
}
function renderTable(){
  const body=document.getElementById('issueTableBody');
  if(!body) return;
  const d=window.issueFilteredData||[];
  if(!d.length){ showEmpty('Belum ada data isu yang bisa ditampilkan.'); return; }
  body.innerHTML=d.slice(0,ISSUE_PAGE_SIZE).map((x,i)=>`<tr><td>${i+1}</td><td><b>${escI(x.title)}</b><div style="font-size:11px;color:#94a3b8">${escI(x.province||'')} ${x.location_name? '— '+escI(x.location_name):''}</div></td><td>${escI(x.category)}</td><td>${escI(x.severity)}</td><td>${escI(x.status)}</td><td>${x.date_occurred||'-'}</td><td>${(x.updates||[]).length}x</td><td><button class="btn-secondary btn-sm" onclick="openIssueDetail('${x.id}')">Detail</button></td></tr>`).join('');
  const lbl=document.getElementById('issueCountLabel'); if(lbl) lbl.textContent=`Menampilkan 1-${Math.min(d.length,ISSUE_PAGE_SIZE)} dari ${d.length} isu`;
}
window.loadIssues = async function(){
  const client = window.client;
  setBox('loadIssues() dipanggil.');
  if(!client){ setBox('window.client belum siap.'); showEmpty('window.client belum siap.'); return; }
  try{
    const [issRes, updRes] = await Promise.all([
      client.from('issues').select('*').order('created_at', {ascending:false}),
      client.from('issue_updates').select('*').order('updated_at', {ascending:false})
    ]);
    setBox(`issues: ${issRes.data ? issRes.data.length : 0}, updates: ${updRes.data ? updRes.data.length : 0}, err: ${issRes.error ? issRes.error.message : 'none'}`);
    if(issRes.error){ showEmpty('Error query issues: '+issRes.error.message); return; }
    const updMap={};
    (updRes.data||[]).forEach(u=>{ (updMap[u.issue_id]||(updMap[u.issue_id]=[])).push(u); });
    window.issueAllData=(issRes.data||[]).map(i=>({...i, updates: updMap[i.id]||[]}));
    window.issueFilteredData=[...window.issueAllData];
    renderStats();
    renderTable();
    if(!window.issueAllData.length) showEmpty('Query sukses tetapi issues kosong.');
  }catch(e){
    setBox('EXCEPTION: '+e.message); showEmpty('EXCEPTION: '+e.message);
  }
};
window.filterIssues = function(){ renderTable(); };
window.issueGoPage = function(){};
window.openIssueDetail = function(id){
  const overlay=document.getElementById('issueDetailOverlay');
  const body=document.getElementById('issueDetailBody');
  const item=(window.issueAllData||[]).find(x=>x.id===id);
  if(!overlay||!body) return;
  body.innerHTML=item ? `<div><h3>${escI(item.title)}</h3><div style="color:#64748b">${escI(item.category)} · ${escI(item.status)}</div><p>${escI(item.description||'')}</p><pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px">${JSON.stringify(item, null, 2)}</pre></div>` : 'Tidak ditemukan';
  overlay.classList.remove('hidden');
};
window.closeIssueDetail = function(){ document.getElementById('issueDetailOverlay')?.classList.add('hidden'); };
window.openAddIssueModal = function(){ document.getElementById('issueFormOverlay')?.classList.remove('hidden'); };
window.openEditIssueModal = function(){ document.getElementById('issueFormOverlay')?.classList.remove('hidden'); };
window.closeIssueModal = function(){ document.getElementById('issueFormOverlay')?.classList.add('hidden'); };
window.saveIssue = function(){ alert('debug'); };
window.deleteIssue = function(){ alert('debug'); };
window.saveIssueUpdate = function(){ alert('debug'); };
window.changeIssueStatus = function(){ alert('debug'); };
document.addEventListener('DOMContentLoaded', ()=>{
  const ov=['issueDetailOverlay','issueFormOverlay'];
  ov.forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('click', e=>{ if(e.target===el) el.classList.add('hidden'); }); });
  setTimeout(()=>{ if(typeof loadIssues==='function') loadIssues(); }, 800);
});
