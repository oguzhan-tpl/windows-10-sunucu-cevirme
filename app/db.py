from __future__ import annotations
import hashlib
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime,timezone
from pathlib import Path
from typing import Iterator
from .config import settings

META_DB=settings.data_dir/"server.sqlite3"

def now_iso(): return datetime.now(timezone.utc).isoformat()

def connect(path:Path=META_DB):
    c=sqlite3.connect(path,timeout=20,check_same_thread=False)
    c.row_factory=sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    return c

@contextmanager
def db()->Iterator[sqlite3.Connection]:
    c=connect()
    try:
        yield c
        c.commit()
    finally:
        c.close()

def hash_password(password:str)->str:
    salt=os.urandom(16)
    digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1,dklen=64)
    return "scrypt$16384$8$1$"+salt.hex()+"$"+digest.hex()

def verify_password(password:str,encoded:str)->bool:
    try:
        algo,n,r,p,salt_hex,digest_hex=encoded.split("$")
        if algo!="scrypt": return False
        digest=hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt_hex),n=int(n),r=int(r),p=int(p),dklen=64)
        return secrets.compare_digest(digest.hex(),digest_hex)
    except Exception:
        return False

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user','developer','admin')),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS media(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          filename TEXT NOT NULL UNIQUE,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          db_path TEXT NOT NULL,
          project_dir TEXT NOT NULL,
          port INTEGER NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
        CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
        """)

def ensure_bootstrap(username,password,role):
    if not username or not password: return
    with db() as c:
        if c.execute("SELECT 1 FROM users WHERE username=? COLLATE NOCASE",(username,)).fetchone(): return
        c.execute("INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)",(username,hash_password(password),role,now_iso()))

def get_user_by_username(username):
    with db() as c:
        return c.execute("SELECT * FROM users WHERE username=? COLLATE NOCASE",(username,)).fetchone()

def get_user(uid):
    with db() as c:
        return c.execute("SELECT id,username,role,created_at FROM users WHERE id=?",(uid,)).fetchone()

def create_user(username,password,role):
    with db() as c:
        return c.execute("INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)",(username.strip(),hash_password(password),role,now_iso())).lastrowid

def list_users():
    with db() as c: return c.execute("SELECT id,username,role,created_at FROM users ORDER BY id").fetchall()

def slugify(v):
    s=re.sub(r"[^a-z0-9-]+","-",v.lower().strip())
    return re.sub(r"-+","-",s).strip("-")[:40] or "project-"+secrets.token_hex(3)

def allocate_port():
    with db() as c:
        used={r[0] for r in c.execute("SELECT port FROM projects").fetchall()}
    for port in range(20000,21000):
        if port not in used: return port
    raise RuntimeError("Ayrılacak proje portu kalmadı.")

def create_project(owner_id,name):
    base=slugify(name)
    with db() as c:
        slug=base
        i=2
        while c.execute("SELECT 1 FROM projects WHERE slug=?",(slug,)).fetchone():
            slug=f"{base}-{i}"; i+=1
        root=settings.projects_dir/slug
        root.mkdir(parents=True,exist_ok=True)
        db_path=root/"data.sqlite3"
        project_dir=root/"app"
        project_dir.mkdir(parents=True,exist_ok=True)
        pid=c.execute(
          "INSERT INTO projects(owner_id,name,slug,db_path,project_dir,port,created_at) VALUES(?,?,?,?,?,?,?)",
          (owner_id,name.strip(),slug,str(db_path),str(project_dir),allocate_port(),now_iso())
        ).lastrowid
    with sqlite3.connect(db_path) as pc:
        pc.execute("CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)")
        pc.commit()
    return pid

def get_project(pid):
    with db() as c: return c.execute("SELECT * FROM projects WHERE id=?",(pid,)).fetchone()

def get_project_by_slug(slug):
    with db() as c: return c.execute("SELECT * FROM projects WHERE slug=?",(slug,)).fetchone()

def list_projects(owner_id):
    with db() as c: return c.execute("SELECT * FROM projects WHERE owner_id=? ORDER BY id DESC",(owner_id,)).fetchall()

def list_media():
    with db() as c: return c.execute("SELECT * FROM media ORDER BY created_at DESC").fetchall()

def get_media(mid):
    with db() as c: return c.execute("SELECT * FROM media WHERE id=?",(mid,)).fetchone()

def create_media(title,filename,original_name,mime_type,size):
    with db() as c:
        return c.execute("INSERT INTO media(title,filename,original_name,mime_type,size,created_at) VALUES(?,?,?,?,?,?)",(title,filename,original_name,mime_type,size,now_iso())).lastrowid

def delete_media(mid):
    with db() as c:
        row=c.execute("SELECT filename FROM media WHERE id=?",(mid,)).fetchone()
        if not row: return None
        c.execute("DELETE FROM media WHERE id=?",(mid,))
        return row["filename"]

def project_kv_path(project,key):
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}",key): raise ValueError("Geçersiz key.")
    path=Path(project["db_path"])
    with sqlite3.connect(path) as c:
        row=c.execute("SELECT key,value,updated_at FROM kv WHERE key=?",(key,)).fetchone()
    return row

def set_project_kv(project,key,value):
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}",key): raise ValueError("Geçersiz key.")
    path=Path(project["db_path"])
    with sqlite3.connect(path) as c:
        c.execute("INSERT INTO kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",(key,value,now_iso()))
        c.commit()
