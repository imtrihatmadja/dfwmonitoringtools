window.kmDocs = [];
window.kmLessons = [];
window.kmTopics = [];
window.kmFilteredType = '';

function kmEsc(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function kmMsg(text, type='info') {
  const el = document.getElementById('kmMsg');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = text;
  el.className = 'form-msg ' + (type === 'error' ? 'error' : 'success');
}
function kmHideMsg(){ const el=document.getElementById('kmMsg'); if(el){ el.style.display='none'; el.textContent=''; } }
function showKMTab(name){
  document.getElementById('kmDocumentsWrap')?.classList.toggle('hidden', name!=='documents');
  document.getElementById('kmLessonsWrap')?.classList.toggle('hidden', name!=='lessons');
  document.getElementById('kmTopicsWrap')?.classList.toggle('hidden', name!=='topics');
  const a=document.getElementById('kmDocumentsWrap'); if(a) a.style.display = name==='documents'?'block':'none';
  const b=document.getElementById('kmLessonsWrap'); if(b) b.style.display = name==='lessons'?'block':'none';
  const c=document.getElementById('kmTopicsWrap'); if(c) c.style.display = name==='topics'?'block':'none';
}
window.showKMTab = showKMTab;
window.openAddKMModal = function(){ alert('Tambahkan data KM dari Supabase dulu, atau nanti saya buatkan form tambahnya.'); };
window.loadKMData = async function(){
  const client = window.client;
  if(!client){ kmMsg('window.client belum siap.', 'error'); return; }
  kmMsg('Memuat Knowledge Management...', 'success');
  try{
    const [tRes,dRes,lRes] = await Promise.all([
      client.from('knowledge_topics').select('id, name, description, active, created_at').order('name', {ascending:true}),
      client.from('knowledge_documents').select('id, title, topic_id, project_id, doc_type, drive_url, owner, tags, notes, created_at').order('created_at', {ascending:false}),
      client.from('knowledge_lessons').select('id, title, topic_id, project_id, context, problem, solution, lesson, follow_up, created_at').order('created_at', {ascending:false}),
    ]);
    if (tRes.error) throw new Error('topics: ' + tRes.error.message);
    if (dRes.error) throw new Error('documents: ' + dRes.error.message);
    if (lRes.error) throw new Error('lessons: ' + lRes.error.message);
    window.kmTopics = tRes.data || [];
    window.kmDocs = dRes.data || [];
    window.kmLessons = lRes.data || [];
    document.getElementById('kmTopicCount') && (document.getElementById('kmTopicCount').textContent = window.kmTopics.filter(x=>x.active !== false).length);
    document.getElementById('kmDocCount') && (document.getElementById('kmDocCount').textContent = window.kmDocs.length);
    document.getElementById('kmLessonCount') && (document.getElementById('kmLessonCount').textContent = window.kmLessons.length);
    const tf = document.getElementById('kmFilterTopic');
    if (tf && !tf.dataset.ready) {
      tf.innerHTML = '<option value="">Semua Topik</option>' + window.kmTopics.map(t => `<option value="${kmEsc(t.name)}">${kmEsc(t.name)}</option>`).join('');
      tf.dataset.ready = '1';
    }
    renderKM();
    kmMsg(`Siap. ${window.kmDocs.length} dokumen, ${window.kmLessons.length} lesson, ${window.kmTopics.length} topik.`, 'success');
  }catch(e){
    kmMsg('Gagal memuat KM: ' + e.message, 'error');
    console.error('[KM]', e);
  }
}
function renderKM(){
  const q = (document.getElementById('kmSearchInput')?.value || '').toLowerCase().trim();
  const topic = document.getElementById('kmFilterTopic')?.value || '';
  const type = document.getElementById('kmFilterType')?.value || '';
  const topicNameById = new Map(window.kmTopics.map(t => [t.id, t.name]));
  const docs = window.kmDocs.filter(x => {
    const tname = topicNameById.get(x.topic_id) || '';
    const matchQ = !q || [x.title, x.owner, x.doc_type, tname, x.notes].filter(Boolean).join(' ').toLowerCase().includes(q);
    const matchTopic = !topic || tname === topic;
    return matchQ && matchTopic && (type ? type === 'document' : true);
  });
  const lessons = window.kmLessons.filter(x => {
    const tname = topicNameById.get(x.topic_id) || '';
    const matchQ = !q || [x.title, x.context, x.problem, x.solution, x.lesson, x.follow_up, tname].filter(Boolean).join(' ').toLowerCase().includes(q);
    const matchTopic = !topic || tname === topic;
    return matchQ && matchTopic && (type ? type === 'lesson' : true);
  });
  const topics = window.kmTopics.filter(x => !q || [x.name, x.description].filter(Boolean).join(' ').toLowerCase().includes(q));
  const db = document.getElementById('kmDocumentsBody');
  const lb = document.getElementById('kmLessonsBody');
  const tb = document.getElementById('kmTopicsBody');
  if (db) db.innerHTML = docs.length ? docs.map((x,i) => `<tr><td>${i+1}</td><td>${kmEsc(x.title)}</td><td>${kmEsc(topicNameById.get(x.topic_id) || '-')}</td><td>${kmEsc((window.allProjects||[]).find(p=>p.id===x.project_id)?.name || '-')}</td><td>${kmEsc(x.doc_type)}</td><td>${kmEsc(x.owner || '-')}</td><td>${x.drive_url ? `<a href="${kmEsc(x.drive_url)}" target="_blank">Buka</a>` : '-'}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px;">Belum ada dokumen.</td></tr>';
  if (lb) lb.innerHTML = lessons.length ? lessons.map((x,i) => `<tr><td>${i+1}</td><td>${kmEsc(x.title)}</td><td>${kmEsc(topicNameById.get(x.topic_id) || '-')}</td><td>${kmEsc((window.allProjects||[]).find(p=>p.id===x.project_id)?.name || '-')}</td><td>${kmEsc((x.lesson || '').slice(0,120))}</td><td><button class="btn-secondary btn-sm" onclick="alert(${JSON.stringify((x.lesson || '').slice(0,400))})">Lihat</button></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px;">Belum ada lesson learned.</td></tr>';
  if (tb) tb.innerHTML = topics.length ? topics.map((x,i) => `<tr><td>${i+1}</td><td>${kmEsc(x.name)}</td><td>${kmEsc(x.description || '-')}</td><td>${x.active === false ? 'Nonaktif' : 'Aktif'}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">Belum ada topik.</td></tr>';
}
window.filterKMData = renderKM;
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { if (typeof loadKMData === 'function' && document.getElementById('tab-knowledge')?.classList.contains('active')) loadKMData(); }, 700);
});
