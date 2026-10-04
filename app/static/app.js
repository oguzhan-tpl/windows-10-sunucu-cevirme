const $=q=>document.querySelector(q);

async function api(url,opt={}){
 const r=await fetch(url,{credentials:"same-origin",...opt});
 const t=r.headers.get("content-type")||"";
 const d=t.includes("application/json")?await r.json():await r.text();
 if(!r.ok) throw new Error(d.detail||d||"İşlem başarısız");
 return d;
}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const size=v=>{const n=Number(v);if(n<1048576)return Math.max(1,Math.round(n/1024))+" KB";return Math.round(n/1048576*10)/10+" MB"};
function err(e){alert(e.message||"Hata")}

async function media(u){
 const d=await api("/api/media");
 $("#mc").textContent=d.items.length;
 $("#media").innerHTML=d.items.length?d.items.map(m=>{
   const playable=String(m.mime_type||"").startsWith("video/");
   return '<article class="media-card item"><div>'+
     (playable?'<div class="media-preview"><video controls preload="metadata" src="'+esc(m.url)+'"></video></div>':'')+
     '<div class="meta-row"><div><strong>'+esc(m.title)+'</strong><div class="item-sub">'+esc(m.original_name)+'</div></div><small>'+size(m.size)+'</small></div>'+
     '</div></article>';
 }).join(""):'<div class="empty">Henüz medya yayınlanmamış.</div>';

 if(u.role==="admin"){
   $("#admin-media").innerHTML=d.items.map(m=>'<div class="item"><div class="item-main"><div class="item-title">'+esc(m.title)+'</div><div class="item-sub">'+esc(m.original_name)+'</div></div><button class="btn small danger" onclick="delMedia('+m.id+')">Sil</button></div>').join("")||'<div class="empty">Medya yok.</div>';
 }
}

async function delMedia(id){
 try{await api("/api/admin/media/"+id,{method:"DELETE"});const me=await api("/api/auth/me");await media(me.user)}
 catch(e){err(e)}
}

async function projects(){
 const d=await api("/api/projects");
 $("#projects").innerHTML=d.items.length?d.items.map(p=>{
   const appUrl=location.origin+p.app_url;
   const dbUrl=location.origin+p.database_url;
   return '<article class="project-card"><div class="project-top"><div class="item-main"><div class="item-title">'+esc(p.name)+'</div><div class="item-sub">Port '+esc(p.port)+' · localhost</div></div><span class="status">'+(p.enabled?"AKTİF":"KAPALI")+'</span></div>'+
     '<div class="url">'+esc(appUrl)+'</div>'+
     '<div class="actions" style="margin-top:9px"><a class="btn small primary" href="'+esc(p.app_url)+'" target="_blank">Uygulamayı aç</a><a class="btn small soft" href="'+esc(p.database_url)+'" target="_blank">DB bilgisi</a><button class="btn small" onclick="source('+JSON.stringify(p.slug)+')">ZIP yükle</button></div>'+
     '<div class="item-sub" style="margin-top:8px">DB: '+esc(dbUrl)+'</div></article>';
 }).join(""):'<div class="empty">Henüz proje oluşturulmamış.</div>';
}

function source(slug){
 const i=document.createElement("input");i.type="file";i.accept=".zip";
 i.onchange=async()=>{
   if(!i.files[0])return;
   const f=new FormData();f.append("file",i.files[0]);
   try{
     const d=await api("/api/projects/"+encodeURIComponent(slug)+"/source",{method:"POST",body:f});
     alert("Kod sunucuya alındı. Uygulamanın çalışması için Windows'ta oluşturulan proje portu: "+d.port);
     await projects();
   }catch(e){err(e)}
 };
 i.click();
}

async function adminUsers(){
 const d=await api("/api/admin/users");
 $("#admin-users").innerHTML=d.items.length?d.items.map(u=>'<div class="item"><div class="item-main"><div class="item-title">'+esc(u.username)+'</div><div class="item-sub">'+esc(u.role)+'</div></div></div>').join(""):'<div class="empty">Kullanıcı yok.</div>';
}

async function boot(){
 try{
  const me=await api("/api/auth/me");
  $("#auth").classList.add("hidden");$("#dashboard").classList.remove("hidden");
  $("#who").textContent=me.user.username;
  $("#role").textContent=me.user.role;
  $("#role-stat").textContent=me.user.role.toUpperCase();
  if(me.user.role==="developer"){$("#dev").classList.remove("hidden");await projects()}
  if(me.user.role==="admin"){$("#admin").classList.remove("hidden");await adminUsers()}
  await media(me.user);
 }catch{
  $("#auth").classList.remove("hidden");$("#dashboard").classList.add("hidden");$("#who").textContent="Misafir";
 }
}

$("#login").onsubmit=async e=>{e.preventDefault();try{await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#lu").value,password:$("#lp").value})});await boot()}catch(x){err(x)}};
$("#register").onsubmit=async e=>{e.preventDefault();try{await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#ru").value,password:$("#rp").value})});alert("Hesap oluşturuldu.")}catch(x){err(x)}};
$("#project").onsubmit=async e=>{e.preventDefault();try{await api("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("#pn").value})});$("#pn").value="";await projects()}catch(x){err(x)}};
$("#upload").onsubmit=async e=>{e.preventDefault();const f=new FormData();f.append("title",$("#mt").value);f.append("file",$("#mf").files[0]);try{await api("/api/admin/media",{method:"POST",body:f});$("#upload").reset();const me=await api("/api/auth/me");await media(me.user)}catch(x){err(x)}};
$("#new-user").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#nu").value,password:$("#np").value,role:$("#nr").value})});$("#new-user").reset();await adminUsers();alert("Hesap oluşturuldu.")}catch(x){err(x)}};
$("#refresh").onclick=async()=>{try{const me=await api("/api/auth/me");await media(me.user)}catch(e){err(e)}};
$("#out").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});await boot()};
boot();
