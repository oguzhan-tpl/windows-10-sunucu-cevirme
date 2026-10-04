from __future__ import annotations

import mimetypes
import secrets
import socket
import shutil
import tempfile
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import settings
from .db import (
    create_media, create_project, create_user, db, delete_media, get_media,
    get_project, get_project_by_slug, get_user_by_username, init_db,
    list_media, list_projects, list_users, list_all_projects, project_kv_path, set_project_kv,
    verify_password, ensure_bootstrap, admin_usage, update_user, delete_project, delete_user,
    hash_password,
)
from .security import BROWSER_MAX_AGE, COOKIE_NAME, create_session, require_role, require_user, revoke_session
from .runner import deploy_async, stop as stop_project


class Login(BaseModel):
    username: str
    password: str


class Register(BaseModel):
    username: str
    password: str


class NewUser(BaseModel):
    username: str
    password: str
    role: str


class NewProject(BaseModel):
    name: str


class UserUpdate(BaseModel):
    role: str | None = None
    password: str | None = None


class KV(BaseModel):
    value: str


@asynccontextmanager
async def lifespan(_app):
    init_db()
    ensure_bootstrap(settings.bootstrap_admin_username, settings.bootstrap_admin_password, "admin")
    # Clear stale process state after a normal Windows restart.
    from .runner import pid_running
    from .db import update_project
    for project in list_all_projects():
        if project["pid"] and not pid_running(project["pid"]):
            update_project(project["id"], status="stopped", pid=None)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse((Path(__file__).parent / "static" / "index.html").read_text("utf-8"))


@app.get("/healthz")
async def healthz():
    return {"ok": True, "service": settings.app_name}


@app.post("/api/auth/login")
async def login(body: Login):
    user = get_user_by_username(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Kullanıcı adı veya şifre hatalı.")
    out = JSONResponse({"ok": True, "user": {"id": user["id"], "username": user["username"], "role": user["role"]}})
    out.set_cookie(
        COOKIE_NAME,
        create_session(user["id"]),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=BROWSER_MAX_AGE,
        path="/",
    )
    return out


@app.post("/api/auth/logout")
async def logout(request: Request):
    revoke_session(request.cookies.get(COOKIE_NAME))
    out = JSONResponse({"ok": True})
    out.delete_cookie(COOKIE_NAME, path="/")
    return out


@app.get("/api/auth/me")
async def me(request: Request):
    u = require_user(request)
    return {"user": {"id": u["id"], "username": u["username"], "role": u["role"]}}


@app.post("/api/auth/register")
async def register(body: Register):
    if not settings.allow_registration:
        raise HTTPException(403, "Kayıt kapalı.")
    username = body.username.strip()
    if len(username) < 3 or len(username) > 32:
        raise HTTPException(400, "Kullanıcı adı 3-32 karakter olmalı.")
    if len(body.password) < 8:
        raise HTTPException(400, "Şifre en az 8 karakter olmalı.")
    if get_user_by_username(username):
        raise HTTPException(409, "Kullanıcı zaten var.")
    return {"ok": True, "id": create_user(username, body.password, "user")}


@app.get("/api/media")
async def media(request: Request):
    require_user(request)
    return {"items": [
        {"id": m["id"], "title": m["title"], "original_name": m["original_name"], "mime_type": m["mime_type"],
         "size": m["size"], "created_at": m["created_at"], "url": "/media/" + str(m["id"])}
        for m in list_media()
    ]}


@app.get("/media/{media_id}")
async def stream_media(media_id: int, request: Request):
    require_user(request)
    m = get_media(media_id)
    if not m:
        raise HTTPException(404, "Medya bulunamadı.")
    path = settings.media_dir / m["filename"]
    if not path.exists():
        raise HTTPException(404, "Dosya bulunamadı.")
    return FileResponse(path, media_type=m["mime_type"])


@app.post("/api/admin/media")
async def upload_media(request: Request, title: str = Form(...), file: UploadFile = File(...)):
    require_role(request, "admin")
    limit = settings.max_upload_mb * 1024 * 1024
    stored = secrets.token_hex(16) + Path(file.filename or "file").suffix[:16]
    destination = settings.media_dir / stored
    size = 0
    try:
        with destination.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, "Dosya boyutu sınırı aşıldı.")
                out.write(chunk)
        mid = create_media(
            title.strip() or (file.filename or "Medya"),
            stored,
            file.filename or stored,
            file.content_type or mimetypes.guess_type(stored)[0] or "application/octet-stream",
            size,
        )
        return {"ok": True, "id": mid}
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@app.delete("/api/admin/media/{media_id}")
async def remove_media(media_id: int, request: Request):
    require_role(request, "admin")
    filename = delete_media(media_id)
    if not filename:
        raise HTTPException(404, "Medya bulunamadı.")
    (settings.media_dir / filename).unlink(missing_ok=True)
    return {"ok": True}


@app.get("/api/admin/overview")
async def admin_overview(request: Request):
    require_role(request, "admin")
    users=admin_usage()
    total_databases=sum(u["database_count"] for u in users)
    total_db_bytes=sum(u["database_bytes"] for u in users)
    total_project_bytes=sum(u["project_storage_bytes"] for u in users)
    total_media_bytes=sum(int(m["size"]) for m in list_media())
    top=max(users,key=lambda u:u["project_storage_bytes"],default=None)
    top_db=max(users,key=lambda u:u["database_bytes"],default=None)
    quota_bytes=settings.user_storage_quota_mb*1024*1024
    for u in users:
        u["storage_percent"]=round(min(100.0,(u["project_storage_bytes"]/quota_bytes)*100),2)
        u["database_share_percent"]=round((u["database_bytes"]/total_db_bytes)*100,2) if total_db_bytes else 0
    disk=shutil.disk_usage(settings.data_dir)
    return {
        "users":users,
        "totals":{
            "users":len(users),
            "developers":sum(u["role"]=="developer" for u in users),
            "admins":sum(u["role"]=="admin" for u in users),
            "active_sessions":sum(u["active_sessions"] for u in users),
            "databases":total_databases,
            "database_bytes":total_db_bytes,
            "database_mb":round(total_db_bytes/1048576,2),
            "project_storage_bytes":total_project_bytes,
            "project_storage_mb":round(total_project_bytes/1048576,2),
            "media_bytes":total_media_bytes,
            "media_mb":round(total_media_bytes/1048576,2),
            "top_user":top["username"] if top else None,
            "top_user_storage_bytes":top["project_storage_bytes"] if top else 0,
            "top_database_user":top_db["username"] if top_db else None,
        },
        "storage_quota_mb":settings.user_storage_quota_mb,
        "disk":{"total_bytes":disk.total,"used_bytes":disk.used,"free_bytes":disk.free,
                "used_percent":round((disk.used/disk.total)*100,2) if disk.total else 0},
    }


@app.get("/api/admin/projects")
async def admin_projects(request: Request):
    require_role(request, "admin")
    return {"items":[{
        "id":p["id"],"name":p["name"],"slug":p["slug"],"owner_id":p["owner_id"],
        "owner_username":p["owner_username"],"owner_role":p["owner_role"],"port":p["port"],
        "enabled":bool(p["enabled"]),"status":p["status"],"pid":p["pid"],"entrypoint":p["entrypoint"],
        "last_error":p["last_error"],"created_at":p["created_at"],"database_path":p["db_path"],
        "project_dir":p["project_dir"]
    } for p in list_all_projects()]}


@app.get("/api/admin/databases")
async def admin_databases(request: Request):
    require_role(request, "admin")
    users=admin_usage()
    items=[]
    for u in users:
        for d in u["databases"]:
            items.append({**d,"owner_id":u["id"],"owner_username":u["username"],"owner_role":u["role"],
                          "database_mb":round(d["size_bytes"]/1048576,2)})
    return {"items":items}


@app.patch("/api/admin/users/{user_id}")
async def admin_update_user(user_id:int, request:Request, body:UserUpdate):
    actor=require_role(request,"admin")
    with db() as c:
        target=c.execute("SELECT * FROM users WHERE id=?",(user_id,)).fetchone()
        admin_count=c.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0]
    if not target:
        raise HTTPException(404,"Kullanıcı bulunamadı.")
    if body.role is not None and body.role not in {"user","developer","admin"}:
        raise HTTPException(400,"Geçersiz rol.")
    if body.password is not None and len(body.password)<8:
        raise HTTPException(400,"Şifre en az 8 karakter olmalı.")
    if target["id"]==actor["id"] and body.role and body.role!="admin":
        raise HTTPException(400,"Kendi yönetici yetkinizi kaldıramazsınız.")
    if target["role"]=="admin" and body.role and body.role!="admin" and admin_count<=1:
        raise HTTPException(400,"Sistemde en az bir yönetici hesabı kalmalı.")
    fields={}
    if body.role is not None: fields["role"]=body.role
    if body.password is not None: fields["password_hash"]=hash_password(body.password)
    update_user(user_id,**fields)
    return {"ok":True}


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id:int, request:Request):
    actor=require_role(request,"admin")
    with db() as c:
        target=c.execute("SELECT * FROM users WHERE id=?",(user_id,)).fetchone()
        admin_count=c.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0]
        projects=c.execute("SELECT * FROM projects WHERE owner_id=?",(user_id,)).fetchall()
    if not target:
        raise HTTPException(404,"Kullanıcı bulunamadı.")
    if target["id"]==actor["id"]:
        raise HTTPException(400,"Aktif yönetici hesabı silinemez.")
    if target["role"]=="admin" and admin_count<=1:
        raise HTTPException(400,"Son yönetici hesabı silinemez.")
    from .runner import stop_pid, pid_running
    for p in projects:
        if p["pid"] and pid_running(p["pid"]):
            stop_pid(p["pid"])
        shutil.rmtree(Path(p["project_dir"]).parent,ignore_errors=True)
    delete_user(user_id)
    return {"ok":True}


@app.post("/api/admin/projects/{project_id}/stop")
async def admin_stop_project(project_id:int, request:Request):
    require_role(request,"admin")
    p=get_project(project_id)
    if not p:
        raise HTTPException(404,"Proje bulunamadı.")
    stop_project(p)
    return {"ok":True,"status":"stopped"}


@app.delete("/api/admin/projects/{project_id}")
async def admin_delete_project(project_id:int, request:Request):
    require_role(request,"admin")
    p=get_project(project_id)
    if not p:
        raise HTTPException(404,"Proje bulunamadı.")
    stop_project(p)
    shutil.rmtree(Path(p["project_dir"]).parent,ignore_errors=True)
    delete_project(project_id)
    return {"ok":True}


@app.get("/api/admin/users")
async def admin_users(request: Request):
    require_role(request, "admin")
    return {"items": [dict(x) for x in list_users()]}


@app.post("/api/admin/users")
async def admin_create_user(request: Request, body: NewUser):
    require_role(request, "admin")
    username = body.username.strip()
    if body.role not in {"user", "developer", "admin"} or not 3 <= len(username) <= 32 or len(body.password) < 8:
        raise HTTPException(400, "Geçersiz kullanıcı bilgisi.")
    if get_user_by_username(username):
        raise HTTPException(409, "Kullanıcı zaten var.")
    return {"ok": True, "id": create_user(username, body.password, body.role)}


def owned(request: Request, slug: str):
    u = require_role(request, "developer", "admin")
    p = get_project_by_slug(slug)
    if not p:
        raise HTTPException(404, "Proje bulunamadı.")
    if u["role"] == "developer" and p["owner_id"] != u["id"]:
        raise HTTPException(403, "Bu projeye erişim yok.")
    return u, p


@app.get("/api/server/status")
async def server_status(request: Request):
    require_user(request)
    url_file = settings.data_dir / "public-url.txt"
    public_url = settings.public_hostname or ""
    if url_file.exists() and not public_url:
        try:
            public_url = url_file.read_text("utf-8").strip()
        except OSError:
            public_url = ""
    return {
        "ok": True,
        "local_url": "http://127.0.0.1:" + str(settings.port),
        "public_url": public_url,
        "url": public_url,
        "tunnel": bool(public_url),
    }


@app.get("/api/projects")
async def projects(request: Request):
    u = require_role(request, "developer")
    return {"items": [
        {
            "id": p["id"],
            "name": p["name"],
            "slug": p["slug"],
            "port": p["port"],
            "enabled": bool(p["enabled"]),
            "status": p["status"],
            "last_error": p["last_error"],
            "app_url": "/apps/" + p["slug"] + "/",
            "database_url": "/api/projects/" + p["slug"] + "/database"
        }
        for p in list_projects(u["id"])
    ]}


@app.post("/api/projects")
async def new_project(request: Request, body: NewProject):
    u = require_role(request, "developer")
    name = body.name.strip()
    if not 2 <= len(name) <= 80:
        raise HTTPException(400, "Proje adı 2-80 karakter olmalı.")
    with db() as c:
        count = c.execute("SELECT COUNT(*) FROM projects WHERE owner_id=?", (u["id"],)).fetchone()[0]
    if count >= settings.app_max_count:
        raise HTTPException(429, "Proje limitine ulaşıldı.")
    p = get_project(create_project(u["id"], name))
    return {"ok": True, "project": {"slug": p["slug"], "port": p["port"],
                                     "app_url": "/apps/" + p["slug"] + "/",
                                     "database_url": "/api/projects/" + p["slug"] + "/database"}}


@app.get("/api/projects/{slug}/database")
async def database_info(request: Request, slug: str):
    _, p = owned(request, slug)
    return {"project": p["name"], "driver": "sqlite", "connection": "sqlite:///" + p["db_path"],
            "local_path": p["db_path"], "http_api": "/api/projects/" + p["slug"] + "/data/<key>",
            "port": p["port"]}


@app.get("/api/projects/{slug}/data/{key}")
async def data_get(request: Request, slug: str, key: str):
    _, p = owned(request, slug)
    try:
        row = project_kv_path(p, key)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not row:
        raise HTTPException(404, "Kayıt bulunamadı.")
    return {"key": row[0], "value": row[1], "updated_at": row[2]}


@app.put("/api/projects/{slug}/data/{key}")
async def data_put(request: Request, slug: str, key: str, body: KV):
    _, p = owned(request, slug)
    try:
        set_project_kv(p, key, body.value)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "key": key, "value": body.value}


def zip_extract_safe(upload: Path, target: Path):
    target = target.resolve()
    with zipfile.ZipFile(upload) as zf:
        for item in zf.infolist():
            name = item.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts or ":" in Path(name).parts:
                raise HTTPException(400, "ZIP içinde güvenli olmayan yol var.")
        target.mkdir(parents=True, exist_ok=True)
        for item in zf.infolist():
            out = (target / item.filename).resolve()
            if not str(out).startswith(str(target)):
                raise HTTPException(400, "ZIP path traversal.")
        zf.extractall(target)


@app.post("/api/projects/{slug}/source")
async def source_upload(request: Request, slug: str, file: UploadFile = File(...)):
    _, p = owned(request, slug)
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(400, "ZIP dosyası bekleniyor.")
    limit = settings.max_app_upload_mb * 1024 * 1024
    temp = Path(tempfile.gettempdir()) / ("astra-" + secrets.token_hex(8) + ".zip")
    size = 0
    try:
        with temp.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, "Proje ZIP boyutu sınırı aşıldı.")
                out.write(chunk)
        await deploy_async(p, temp)
        latest = get_project(p["id"])
        return {
            "ok": True,
            "status": latest["status"],
            "port": latest["port"],
            "app_url": "/apps/" + latest["slug"] + "/",
            "log_file": str(Path(latest["project_dir"]).parent / "logs" / "app.log"),
            "last_error": latest["last_error"],
        }
    except Exception as exc:
        latest = get_project(p["id"])
        raise HTTPException(400, latest["last_error"] or str(exc))
    finally:
        temp.unlink(missing_ok=True)
        await file.close()


def local_up(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=.6):
            return True
    except OSError:
        return False


@app.api_route("/apps/{slug}", methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"])
async def proxy_root(request: Request, slug: str):
    return await proxy(request, slug, "")


@app.api_route("/apps/{slug}/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"])
async def proxy_path(request: Request, slug: str, path: str):
    return await proxy(request, slug, path)


async def proxy(request: Request, slug: str, path: str):
    u=require_user(request)
    p=get_project_by_slug(slug)
    if not p or not p["enabled"] or not local_up(p["port"]):
        raise HTTPException(404,"Uygulama çalışmıyor. Proje portunda yerelde başlatın.")
    if u["role"]=="developer" and p["owner_id"]!=u["id"]:
        raise HTTPException(403,"Bu uygulamaya erişim yok.")
    body=await request.body()
    if len(body)>settings.app_proxy_body_max_mb*1024*1024:
        raise HTTPException(413,"İstek gövdesi sınırı aşıldı.")
    target="http://127.0.0.1:"+str(p["port"])+"/"+path
    if request.url.query:
        target+="?"+request.url.query
    excluded={"host","content-length","connection","transfer-encoding","content-encoding"}
    headers={k:v for k,v in request.headers.items() if k.lower() not in excluded}
    headers["x-astra-project"]=p["slug"]

    if request.method in {"GET","HEAD"}:
        client=httpx.AsyncClient(timeout=httpx.Timeout(60.0,connect=5.0),follow_redirects=False)
        try:
            upstream=await client.send(await client.build_request(request.method,target,content=body,headers=headers),stream=True)
        except httpx.HTTPError as exc:
            await client.aclose()
            raise HTTPException(502,"Astra uygulaması erişilemiyor: "+str(exc))
        response_headers={k:v for k,v in upstream.headers.items()
                          if k.lower() not in {"content-length","connection","transfer-encoding","content-encoding","content-disposition"}}
        async def iterate():
            try:
                async for chunk in upstream.aiter_bytes(64*1024):
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()
        return StreamingResponse(iterate(),status_code=upstream.status_code,headers=response_headers,
                                 media_type=upstream.headers.get("content-type"))

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0,connect=5.0),follow_redirects=False) as client:
            upstream=await client.request(request.method,target,content=body,headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(502,"Astra uygulaması erişilemiyor: "+str(exc))
    response_headers={k:v for k,v in upstream.headers.items()
                      if k.lower() not in {"content-length","connection","transfer-encoding","content-encoding","content-disposition"}}
    return Response(content=upstream.content,status_code=upstream.status_code,headers=response_headers,
                    media_type=upstream.headers.get("content-type"))

def run():
    import uvicorn
    uvicorn.run("app.main:app",host=settings.host,port=settings.port,reload=False)


if __name__=="__main__":
    run()
