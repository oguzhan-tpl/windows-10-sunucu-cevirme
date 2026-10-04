const $=q=>document.querySelector(q);
const all=q=>[...document.querySelectorAll(q)];

let currentUser=null;
let toastTimer=null;

async function api(url,opt={}){
  const r=await fetch(url,{credentials:"same-origin",...opt});
  const type=r.headers.get("content-type")||"";
  const data=type.includes("application/json")?await r.json():await r.text();
  if(!r.ok) throw new Error(data.detail||data||"İşlem başarısız.");
  return data;
}

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const size=v=>{
  const n=Number(v)||0;
  if(n<1024)return n+" B";
  if(n<1048576)return Math.max(1,Math.round(n/1024))+" KB";
  return (n/1048576).toFixed(1)+" MB";
};

function notify(message){
  const box=$("#toast");
  box.textContent=message;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>box.classList.remove("show"),2800);
}

function roleLabel(role){
  return ({user:"Kullanıcı",developer:"Geliştirici",admin:"Yönetici"}[role]||role||"-");
}

function setLoading(show){
  $("#loading").classList.toggle("hidden",!show);
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

function renderPublic(data){
  const url=data.url||"";
  $("#public-url").textContent=url||"Public tunnel henüz hazır değil.";
  $("#public-state").textContent=url?"AKTİF":"BEKLENİYOR";
  $("#copy-public").disabled=!url;
  $("#copy-public").dataset.url=url;
}

async function serverStatus(){
  try{renderPublic(await api("/api/server/status"))}
  catch{renderPublic({url:""})}
}

async function media(){
  const d=await api("/api/media");
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
      '<div class="data-row"><div class="data-cell"><strong>'+esc(m.title)+'</strong><span>'+esc(m.original_name)+' · '+size(m.size)+'</span></div><div></div><div class="actions"><button class="button light small" onclick="delMedia('+m.id+')">Sil</button></div></div>'
    ).join(""):'<div class="empty">Medya bulunmuyor.</div>';
  }
}

async function delMedia(id){
  try{await api("/api/admin/media/"+id,{method:"DELETE"});await media();notify("Medya kaldırıldı.")}catch(e){notify(e.message)}
}

function projectStatus(p){
  const status=p.status||((p.enabled)?"running":"stopped");
  const labels={running:"ÇALIŞIYOR",starting:"BAŞLIYOR",deploying:"YÜKLENİYOR",stopped:"DURDU",error:"HATA"};
  return {value:status,label:labels[status]||status.toUpperCase()};
}

async function projects(){
  const d=await api("/api/projects");
  $("#projects").innerHTML=d.items.length?d.items.map(p=>{
    const state=projectStatus(p);
    return '<article class="project-row">'+
      '<div class="project-top"><div><div class="project-name">'+esc(p.name)+'</div><div class="project-sub">Port '+esc(p.port)+' · '+esc(p.slug)+'</div></div>'+
      '<span class="status '+esc(state.value)+'">'+esc(state.label)+'</span></div>'+
      '<div class="project-url">'+esc(location.origin+p.app_url)+'</div>'+
      (p.last_error?'<div class="project-sub danger-text" style="margin-top:8px">'+esc(p.last_error)+'</div>':'')+
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
    notify("Proje yükleniyor ve başlatılıyor…");
    try{
      const d=await api("/api/projects/"+encodeURIComponent(slug)+"/source",{method:"POST",body:form});
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
  const d=await api("/api/admin/overview");
  const t=d.totals||{};
  $("#admin-user-count").textContent=t.users||0;
  $("#admin-db-count").textContent=t.databases||0;
  $("#admin-db-size").textContent=(Number(t.database_mb)||0).toFixed(1)+" MB";
  $("#admin-top-user").textContent=t.top_user||"-";
  $("#admin-usage").innerHTML=d.users.length?d.users.map(u=>{
    const dbs=(u.databases||[]).map(db=>
      '<div class="data-row"><div class="data-cell"><strong>'+esc(db.name)+'</strong><span>'+esc(db.slug)+' · Port '+esc(db.port)+' · '+esc(db.kv_records)+' kayıt</span></div><div class="role-cell">'+esc(size(db.size_bytes))+'</div><div class="role-cell">'+esc(db.status)+'</div></div>'
    ).join("");
    return '<div class="usage-user">'+
      '<div class="usage-head"><div><strong>'+esc(u.username)+'</strong><span>'+esc(roleLabel(u.role))+' · '+u.database_count+' veritabanı · '+size(u.database_bytes)+'</span></div>'+
      '<strong>'+Number(u.storage_percent||0).toFixed(2)+'%</strong></div>'+
      '<div class="usage-bar"><span style="width:'+Math.min(100,Number(u.storage_percent)||0)+'%"></span></div>'+
      (dbs||'<div class="empty compact">Veritabanı yok.</div>')+
    '</div>';
  }).join(""):'<div class="empty">Kullanıcı bulunmuyor.</div>';
}

async function adminUsers(){
  const d=await api("/api/admin/users");
  $("#admin-users").innerHTML=d.items.length?d.items.map(u=>
    '<div class="data-row"><div class="data-cell"><strong>'+esc(u.username)+'</strong><span>Oluşturulma: '+esc(new Date(u.created_at).toLocaleDateString("tr-TR"))+'</span></div><div class="role-cell">'+esc(roleLabel(u.role))+'</div><div></div></div>'
  ).join(""):'<div class="empty">Kullanıcı bulunmuyor.</div>';
}

async function enter(user){
  currentUser=user;
  $("#auth").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  $("#who").textContent=user.username;
  $("#role").textContent=roleLabel(user.role);
  $("#role-stat").textContent=roleLabel(user.role).toUpperCase();
  $("#avatar").textContent=(user.username||"A").charAt(0).toUpperCase();

  $("#nav-developer").classList.toggle("hidden",user.role!=="developer");
  $("#nav-admin").classList.toggle("hidden",user.role!=="admin");
  $("#developer-section").classList.toggle("hidden",user.role!=="developer");
  $("#admin-section").classList.toggle("hidden",user.role!=="admin");

  await media();
  await serverStatus();
  if(user.role==="developer")await projects();
  if(user.role==="admin"){await adminUsers();await adminOverview();}

  const requested=location.hash.replace("#","");
  const allowed=["overview","media-section","developer-section","admin-section"];
  setSection(allowed.includes(requested)&&!$("#"+requested).classList.contains("hidden")?requested:"overview");
}

async function boot(){
  try{
    const me=await api("/api/auth/me");
    await enter(me.user);
  }catch{
    currentUser=null;
    $("#auth").classList.remove("hidden");
    $("#dashboard").classList.add("hidden");
  }finally{
    setLoading(false);
    setTimeout(()=>$("#app").classList.remove("hidden"),0);
  }
}

$("#login").addEventListener("submit",async e=>{
  e.preventDefault();
  const button=e.submitter;
  button.disabled=true;
  try{
    const d=await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#lu").value.trim(),password:$("#lp").value})});
    $("#lp").value="";
    await enter(d.user);
  }catch(x){notify(x.message)}
  finally{button.disabled=false}
});

$("#register").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#ru").value.trim(),password:$("#rp").value})});
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
  try{await api("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("#pn").value.trim()})});$("#pn").value="";await projects();notify("Proje oluşturuldu. ZIP yükleyerek çalıştırabilirsiniz.")}catch(x){notify(x.message)}
});

$("#upload").addEventListener("submit",async e=>{
  e.preventDefault();
  const file=$("#mf").files?.[0];
  if(!file){notify("Bir medya dosyası seçin.");return}
  const form=new FormData();
  form.append("title",$("#mt").value.trim());
  form.append("file",file);
  try{await api("/api/admin/media",{method:"POST",body:form});$("#upload").reset();await media();notify("Medya yayınlandı.")}catch(x){notify(x.message)}
});

$("#new-user").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#nu").value.trim(),password:$("#np").value,role:$("#nr").value})});$("#new-user").reset();await adminUsers();notify("Hesap oluşturuldu.")}catch(x){notify(x.message)}
});

$("#refresh").onclick=async()=>{try{await media();notify("Medya listesi yenilendi.")}catch(e){notify(e.message)}};
$("#copy-public").onclick=async()=>{
  const url=$("#copy-public").dataset.url;
  if(!url)return;
  try{await navigator.clipboard.writeText(url);notify("Public adres kopyalandı.")}catch{window.prompt("Public adres",url)}
};
$("#out").onclick=async()=>{try{await api("/api/auth/logout",{method:"POST"})}catch{};await boot()};

all(".nav-link").forEach(link=>link.addEventListener("click",e=>{
  e.preventDefault();
  setSection(link.dataset.section);
}));

window.addEventListener("hashchange",()=>{
  const id=location.hash.replace("#","");
  if(id&&$("#"+id)&&!$("#"+id).classList.contains("hidden"))setSection(id);
});

boot();