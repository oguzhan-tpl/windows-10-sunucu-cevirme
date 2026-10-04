const $=q=>document.querySelector(q);
const all=q=>[...document.querySelectorAll(q)];

let currentUser=null;
let toastTimer=null;

async function api(url,opt={}){
  const {timeoutMs=10000,...fetchOptions}=opt;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  fetchOptions.credentials="same-origin";
  fetchOptions.signal=controller.signal;
  try{
    const r=await fetch(url,fetchOptions);
    const type=r.headers.get("content-type")||"";
    const data=type.includes("application/json")?await r.json():await r.text();
    if(!r.ok) throw new Error(data.detail||data||"İşlem başarısız.");
    return data;
  }catch(e){
    if(e?.name==="AbortError") throw new Error("Sunucu yanıt vermedi. İşlem zaman aşımına uğradı.");
    throw e;
  }finally{
    clearTimeout(timer);
  }
}

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const size=v=>{
  const n=Number(v)||0;
  if(n<1024)return n+" B";
  if(n<1048576)return Math.max(1,Math.round(n/1024))+" KB";
  if(n<1073741824)return (n/1048576).toFixed(1)+" MB";
  return (n/1073741824).toFixed(2)+" GB";
};

function notify(message){
  const box=$("#toast");
  if(!box)return;
  box.textContent=message;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>box.classList.remove("show"),3000);
}

function roleLabel(role){
  return ({user:"Kullanıcı",developer:"Geliştirici",admin:"Yönetici"}[role]||role||"-");
}

function setLoading(show){
  $("#loading")?.classList.toggle("hidden",!show);
}

function setSection(id){
  const labels={
    overview:["GENEL BAKIŞ","Kontrol merkezi"],
    "media-section":["İÇERİK","Medya arşivi"],
    "developer-section":["DEVELOPMENT","Geliştirici alanı"],
    "admin-section":["YÖNETİM","Yönetim"]
  };
  all(".page-section").forEach(x=>x.classList.toggle("hidden",x.id!==id));
  all(".nav-link").forEach(x=>x.classList.toggle("active",x.dataset.section===id));
  const pair=labels[id]||labels.overview;
  $("#section-kicker").textContent=pair[0];
  $("#section-title").textContent=pair[1];
  history.replaceState(null,"","#"+id);
  window.scrollTo({top:0,behavior:"smooth"});
}

function openDrawer(){
  const drawer=$("#account-drawer");
  if(!drawer)return;
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden","false");
  $("#account-trigger")?.setAttribute("aria-expanded","true");
}

function closeDrawer(){
  const drawer=$("#account-drawer");
  if(!drawer)return;
  drawer.classList.add("hidden");
  drawer.setAttribute("aria-hidden","true");
  $("#account-trigger")?.setAttribute("aria-expanded","false");
}

function syncDrawer(){
  if(!currentUser)return;
  $("#drawer-name").textContent=currentUser.username||"-";
  $("#drawer-role").textContent=roleLabel(currentUser.role);
  $("#drawer-avatar").textContent=(currentUser.username||"A").charAt(0).toUpperCase();
  const url=$("#copy-public")?.dataset.url||"";
  $("#drawer-public").textContent=url||"Hazırlanıyor";
}

function renderPublic(data){
  const url=data.url||data.public_url||"";
  $("#public-url").textContent=url||"Public adres henüz yapılandırılmadı.";
  $("#public-state").textContent=url?(data.stable?"AKTİF / SABİT":"AKTİF / GEÇİCİ"):"BEKLENİYOR";
  $("#copy-public").disabled=!url;
  $("#copy-public").dataset.url=url;
  syncDrawer();
}

async function serverStatus(){
  try{renderPublic(await api("/api/server/status",{"timeoutMs":8000}))}
  catch{renderPublic({url:""})}
}

async function media(){
  const d=await api("/api/media",{"timeoutMs":15000});
  $("#mc").textContent=d.items.length;
  $("#media").innerHTML=d.items.length?d.items.map(m=>{
    const playable=String(m.mime_type||"").startsWith("video/");
    return '<article class="media-row">'+
      '<div class="media-main">'+
        '<div class="media-title">'+esc(m.title)+'</div>'+
        '<div class="media-sub">'+esc(m.original_name)+' · '+size(m.size)+'</div>'+
        (playable?'<div class="video-frame"><video controls preload="metadata" src="'+esc(m.url)+'"></video></div>':'')+
      '</div>'+
      '<div class="media-side">'+esc(new Date(m.created_at).toLocaleDateString("tr-TR"))+'</div>'+
    '</article>';
  }).join(""):'<div class="empty">Henüz yayınlanmış medya bulunmuyor.</div>';

  if(currentUser?.role==="admin"){
    $("#admin-media").innerHTML=d.items.length?d.items.map(m=>
      '<div class="data-row"><div class="data-cell"><strong>'+esc(m.title)+'</strong><span>'+esc(m.original_name)+' · '+size(m.size)+'</span></div><div class="role-cell">'+esc(new Date(m.created_at).toLocaleDateString("tr-TR"))+'</div><div class="actions inline-actions"><button class="button light small" onclick="delMedia('+m.id+')">Sil</button></div></div>'
    ).join(""):'<div class="empty">Medya bulunmuyor.</div>';
  }
}

async function delMedia(id){
  if(!confirm("Bu medya içeriği sunucudan tamamen silinsin mi?"))return;
  try{await api("/api/admin/media/"+id,{method:"DELETE"});await media();await adminOverview();notify("Medya kaldırıldı.")}catch(e){notify(e.message)}
}

function projectStatus(p){
  const status=p.status||((p.enabled)?"running":"stopped");
  const labels={running:"ÇALIŞIYOR",starting:"BAŞLIYOR",deploying:"YÜKLENİYOR",stopped:"DURDU",error:"HATA"};
  return {value:status,label:labels[status]||status.toUpperCase()};
}

async function projects(){
  const d=await api("/api/projects",{"timeoutMs":10000});
  $("#projects").innerHTML=d.items.length?d.items.map(p=>{
    const state=projectStatus(p);
    return '<article class="project-row">'+
      '<div class="project-top"><div><div class="project-name">'+esc(p.name)+'</div><div class="project-sub">Port '+esc(p.port)+' · '+esc(p.slug)+'</div></div>'+
      '<span class="status '+esc(state.value)+'">'+esc(state.label)+'</span></div>'+
      '<div class="project-url">'+esc(location.origin+p.app_url)+'</div>'+
      (p.last_error?'<div class="project-sub danger-text">'+esc(p.last_error)+'</div>':'')+
      '<div class="actions">'+
        '<a class="button light small" href="'+esc(p.app_url)+'" target="_blank" rel="noopener">Uygulamayı aç</a>'+
        '<button class="button light small" onclick="source('+JSON.stringify(p.slug)+')">ZIP yükle ve çalıştır</button>'+
        '<button class="button light small" onclick="dbInfo('+JSON.stringify(p.slug)+')">Veritabanı</button>'+
      '</div></article>';
  }).join(""):'<div class="empty">Henüz proje oluşturulmamış.</div>';
}

function source(slug){
  const input=document.createElement("input");
  input.type="file";
  input.accept=".zip,application/zip";
  input.onchange=async()=>{
    const file=input.files?.[0];
    if(!file)return;
    const form=new FormData();
    form.append("file",file);
    notify("Proje yükleniyor ve hazırlanıyor…");
    try{
      const d=await api("/api/projects/"+encodeURIComponent(slug)+"/source",{method:"POST",body:form,timeoutMs:20*60*1000});
      await projects();
      notify(d.status==="running"?"Proje çalışıyor.":"Proje alındı; durum panelden izlenebilir.");
    }catch(e){notify(e.message);await projects()}
  };
  input.click();
}

async function dbInfo(slug){
  try{
    const d=await api("/api/projects/"+encodeURIComponent(slug)+"/database");
    window.prompt("Proje veritabanı bağlantısı",d.connection);
  }catch(e){notify(e.message)}
}

async function adminOverview(){
  const d=await api("/api/admin/overview",{"timeoutMs":15000});
  const t=d.totals||{};
  $("#admin-user-count").textContent=t.users||0;
  $("#admin-dev-count").textContent=t.developers||0;
  $("#admin-db-count").textContent=t.databases||0;
  $("#admin-db-size").textContent=size(t.database_bytes||0);
  $("#admin-session-count").textContent=t.active_sessions||0;
  $("#admin-top-user").textContent=t.top_user||"-";
  const disk=d.disk||{};
  $("#admin-disk").textContent=
    "Disk: "+size(disk.used_bytes||0)+" kullanılıyor / "+size(disk.total_bytes||0)+" toplam · "+
    "boş "+size(disk.free_bytes||0)+" · "+Number(disk.used_percent||0).toFixed(1)+"%";

  $("#admin-usage").innerHTML=d.users?.length?d.users.map(u=>{
    const dbs=(u.databases||[]).map(db=>
      '<div class="data-row db-mini-row">'+
        '<div class="data-cell"><strong>'+esc(db.name)+'</strong><span>'+esc(db.slug)+' · Port '+esc(db.port)+' · '+esc(db.kv_records)+' kayıt</span></div>'+
        '<div class="role-cell">'+esc(size(db.size_bytes))+'</div>'+
        '<div class="role-cell">'+esc(db.status)+'</div>'+
      '</div>'
    ).join("");
    return '<div class="usage-user">'+
      '<div class="usage-head"><div><strong>'+esc(u.username)+'</strong><span>'+esc(roleLabel(u.role))+' · '+u.project_count+' proje · '+u.database_count+' DB · '+u.active_sessions+' aktif oturum</span></div>'+
      '<strong>'+Number(u.storage_percent||0).toFixed(2)+'%</strong></div>'+
      '<div class="usage-subline">Proje alanı '+size(u.project_storage_bytes)+' · DB alanı '+size(u.database_bytes)+' · DB payı '+Number(u.database_share_percent||0).toFixed(2)+'%</div>'+
      '<div class="usage-bar"><span style="width:'+Math.min(100,Number(u.storage_percent)||0)+'%"></span></div>'+
      (dbs||'<div class="empty compact">Veritabanı yok.</div>')+
    '</div>';
  }).join(""):'<div class="empty">Kullanıcı bulunmuyor.</div>';
  return d;
}

async function adminUsers(){
  const d=await api("/api/admin/users",{"timeoutMs":10000});
  $("#admin-users").innerHTML=d.items.length?d.items.map(u=>
    '<div class="data-row admin-user-row">'+
      '<div class="data-cell"><strong>'+esc(u.username)+'</strong><span>ID '+esc(u.id)+' · Oluşturulma '+esc(new Date(u.created_at).toLocaleDateString("tr-TR"))+'</span></div>'+
      '<select class="admin-role-select" onchange="changeRole('+u.id+',this.value)">'+
        '<option value="user" '+(u.role==="user"?"selected":"")+'>Kullanıcı</option>'+
        '<option value="developer" '+(u.role==="developer"?"selected":"")+'>Geliştirici</option>'+
        '<option value="admin" '+(u.role==="admin"?"selected":"")+'>Yönetici</option>'+
      '</select>'+
      '<div class="actions inline-actions"><button class="button light small" onclick="resetPassword('+u.id+')">Şifre</button>'+
      (u.id!==currentUser?.id?'<button class="button light small danger-button" onclick="removeUser('+u.id+')">Sil</button>':'')+
      '</div></div>'
  ).join(""):'<div class="empty">Kullanıcı bulunmuyor.</div>';
}

async function changeRole(id,role){
  try{
    await api("/api/admin/users/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role}),timeoutMs:10000});
    await Promise.all([adminUsers(),adminOverview()]);
    notify("Kullanıcı rolü güncellendi.");
  }catch(e){notify(e.message);await adminUsers()}
}

async function resetPassword(id){
  const password=window.prompt("Yeni şifreyi girin (en az 8 karakter):");
  if(password===null)return;
  if(password.length<8){notify("Şifre en az 8 karakter olmalı.");return}
  try{
    await api("/api/admin/users/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({password}),timeoutMs:10000});
    notify("Şifre güncellendi.");
  }catch(e){notify(e.message)}
}

async function removeUser(id){
  if(!confirm("Bu kullanıcı ve sahip olduğu projeler/veritabanları tamamen silinsin mi?"))return;
  try{
    await api("/api/admin/users/"+id,{method:"DELETE",timeoutMs:30000});
    await Promise.all([adminUsers(),adminOverview(),adminDatabases(),adminProjects()]);
    notify("Kullanıcı ve ilişkili kaynakları silindi.");
  }catch(e){notify(e.message)}
}

async function adminDatabases(){
  const d=await api("/api/admin/databases",{"timeoutMs":15000});
  $("#admin-databases").innerHTML=d.items.length?d.items.map(db=>
    '<div class="data-row admin-resource-row">'+
      '<div class="data-cell"><strong>'+esc(db.name)+'</strong><span>'+esc(db.owner_username)+' · '+esc(db.slug)+' · '+esc(db.kv_records)+' kayıt</span></div>'+
      '<div class="role-cell">'+esc(size(db.size_bytes))+'</div>'+
      '<div class="actions inline-actions"><span class="status '+esc(db.status)+'">'+esc(db.status)+'</span><button class="button light small danger-button" onclick="removeAdminProject('+db.id+')">Sil</button></div>'+
    '</div>'
  ).join(""):'<div class="empty">Veritabanı bulunmuyor.</div>';
}

async function adminProjects(){
  const d=await api("/api/admin/projects",{"timeoutMs":15000});
  $("#admin-projects").innerHTML=d.items.length?d.items.map(p=>
    '<div class="data-row admin-resource-row">'+
      '<div class="data-cell"><strong>'+esc(p.name)+'</strong><span>'+esc(p.owner_username)+' · '+esc(p.slug)+' · Port '+esc(p.port)+'</span></div>'+
      '<div class="role-cell">'+esc(p.status)+'</div>'+
      '<div class="actions inline-actions">'+
        (p.status!=="stopped"?'<button class="button light small" onclick="stopAdminProject('+p.id+')">Durdur</button>':'')+
        '<button class="button light small danger-button" onclick="removeAdminProject('+p.id+')">Sil</button>'+
      '</div></div>'
  ).join(""):'<div class="empty">Proje bulunmuyor.</div>';
}

async function stopAdminProject(id){
  try{
    await api("/api/admin/projects/"+id+"/stop",{method:"POST"});
    await Promise.all([adminProjects(),adminDatabases(),adminOverview()]);
    notify("Proje durduruldu.");
  }catch(e){notify(e.message)}
}

async function removeAdminProject(id){
  if(!confirm("Bu proje ve veritabanı tamamen silinsin mi? Bu işlem geri alınamaz."))return;
  try{
    await api("/api/admin/projects/"+id,{method:"DELETE",timeoutMs:30000});
    await Promise.all([adminProjects(),adminDatabases(),adminOverview()]);
    notify("Proje ve veritabanı silindi.");
  }catch(e){notify(e.message)}
}

async function enter(user){
  currentUser=user;
  $("#auth").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  $("#who").textContent=user.username;
  $("#role").textContent=roleLabel(user.role);
  $("#role-stat").textContent=roleLabel(user.role).toUpperCase();
  $("#avatar").textContent=(user.username||"A").charAt(0).toUpperCase();
  syncDrawer();

  $("#nav-developer").classList.toggle("hidden",user.role!=="developer");
  $("#nav-admin").classList.toggle("hidden",user.role!=="admin");
  $("#developer-section").classList.toggle("hidden",user.role!=="developer");
  $("#admin-section").classList.toggle("hidden",user.role!=="admin");

  const jobs=[media(),serverStatus()];
  if(user.role==="developer")jobs.push(projects());
  if(user.role==="admin")jobs.push(adminUsers(),adminOverview(),adminDatabases(),adminProjects());
  const results=await Promise.allSettled(jobs);
  if(results.some(x=>x.status==="rejected"))notify("Panel açıldı; bazı bilgiler yeniden yüklenmeli.");

  const requested=location.hash.replace("#","");
  const allowed=["overview","media-section","developer-section","admin-section"];
  setSection(allowed.includes(requested)&&!$("#"+requested).classList.contains("hidden")?requested:"overview");
}

async function boot(){
  try{
    const me=await api("/api/auth/me",{"timeoutMs":8000});
    await enter(me.user);
  }catch{
    currentUser=null;
    $("#auth").classList.remove("hidden");
    $("#dashboard").classList.add("hidden");
  }finally{
    setLoading(false);
    requestAnimationFrame(()=>$("#app").classList.remove("hidden"));
  }
}

$("#login").addEventListener("submit",async e=>{
  e.preventDefault();
  const button=e.submitter||$("#login button[type=submit]");
  button.disabled=true;
  try{
    const d=await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#lu").value.trim(),password:$("#lp").value}),timeoutMs:10000});
    $("#lp").value="";
    await enter(d.user);
  }catch(x){notify(x.message)}
  finally{button.disabled=false}
});

$("#register").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#ru").value.trim(),password:$("#rp").value}),timeoutMs:10000});
    $("#register").classList.add("hidden");
    $("#login").classList.remove("hidden");
    $("#lu").value=$("#ru").value.trim();
    $("#ru").value=$("#rp").value="";
    notify("Hesap oluşturuldu. Giriş yapabilirsiniz.");
  }catch(x){notify(x.message)}
});

$("#show-register").onclick=()=>{
  $("#login").classList.add("hidden");
  $("#register").classList.remove("hidden");
  $("#show-register").closest(".auth-register").classList.add("hidden");
  $("#ru").focus();
};
$("#hide-register").onclick=()=>{
  $("#register").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#show-register").closest(".auth-register").classList.remove("hidden");
};

$("#project").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("#pn").value.trim()}),timeoutMs:10000});
    $("#pn").value="";
    await projects();
    notify("Proje oluşturuldu. ZIP yükleyerek çalıştırabilirsiniz.");
  }catch(x){notify(x.message)}
});

$("#upload").addEventListener("submit",async e=>{
  e.preventDefault();
  const file=$("#mf").files?.[0];
  if(!file){notify("Bir medya dosyası seçin.");return}
  const form=new FormData();
  form.append("title",$("#mt").value.trim());
  form.append("file",file);
  notify("Medya yükleniyor…");
  try{
    await api("/api/admin/media",{method:"POST",body:form,timeoutMs:30*60*1000});
    $("#upload").reset();
    await Promise.all([media(),adminOverview()]);
    notify("Medya yayınlandı.");
  }catch(x){notify(x.message)}
});

$("#new-user").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#nu").value.trim(),password:$("#np").value,role:$("#nr").value}),timeoutMs:10000});
    $("#new-user").reset();
    await Promise.all([adminUsers(),adminOverview(),adminDatabases(),adminProjects()]);
    notify("Hesap oluşturuldu.");
  }catch(x){notify(x.message)}
});

$("#refresh").onclick=async()=>{
  try{await media();notify("Medya listesi yenilendi.")}catch(e){notify(e.message)}
};
$("#refresh-admin").onclick=async()=>{
  try{
    await Promise.all([adminUsers(),adminOverview(),adminDatabases(),adminProjects()]);
    notify("Yönetim verileri yenilendi.");
  }catch(e){notify(e.message)}
};
$("#copy-public").onclick=async()=>{
  const url=$("#copy-public").dataset.url;
  if(!url)return;
  try{await navigator.clipboard.writeText(url);notify("Public adres kopyalandı.")}catch{window.prompt("Public adres",url)}
};
async function doLogout(){
  closeDrawer();
  try{await api("/api/auth/logout",{method:"POST",timeoutMs:5000})}catch{}
  location.hash="";
  await boot();
}
$("#out").onclick=doLogout;
$("#drawer-out").onclick=doLogout;
$("#account-trigger").onclick=()=>{
  const open=$("#account-drawer")?.classList.contains("hidden")===false;
  open?closeDrawer():openDrawer();
};
$("#account-drawer-close").onclick=closeDrawer;
all("[data-drawer-close]").forEach(x=>x.addEventListener("click",closeDrawer));

all(".nav-link").forEach(link=>link.addEventListener("click",e=>{
  e.preventDefault();
  setSection(link.dataset.section);
}));

window.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer()});
window.addEventListener("hashchange",()=>{
  const id=location.hash.replace("#","");
  if(id&&$("#"+id)&&!$("#"+id).classList.contains("hidden"))setSection(id);
});

boot();
