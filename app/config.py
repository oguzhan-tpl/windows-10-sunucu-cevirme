from __future__ import annotations
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def env_bool(name,default=False):
    raw=os.getenv(name)
    if raw is None: return default
    return raw.strip().lower() in {"1","true","yes","on"}

def env_int(name,default):
    try: return int(os.getenv(name,str(default)))
    except ValueError: return default

@dataclass(frozen=True)
class Settings:
    app_name:str
    host:str
    port:int
    server_secret:str
    cookie_secure:bool
    session_ttl_hours:int
    allow_registration:bool
    bootstrap_admin_username:str
    bootstrap_admin_password:str
    data_dir:Path
    media_dir:Path
    projects_dir:Path
    max_upload_mb:int
    max_app_upload_mb:int
    app_max_count:int
    app_proxy_body_max_mb:int
    public_hostname:str
    cloudflare_tunnel_token:str
    cloudflare_tunnel_name:str
    user_storage_quota_mb:int

def load_settings():
    data=Path(os.getenv("DATA_DIR","./data")).resolve()
    result=Settings(
        app_name=os.getenv("APP_NAME","Astra Server"),
        host=os.getenv("HOST","127.0.0.1"),
        port=env_int("PORT",8080),
        server_secret=os.getenv("SERVER_SECRET",""),
        cookie_secure=env_bool("COOKIE_SECURE",False),
        session_ttl_hours=max(720,env_int("SESSION_TTL_HOURS",720)),
        allow_registration=env_bool("ALLOW_REGISTRATION",True),
        bootstrap_admin_username=os.getenv("BOOTSTRAP_ADMIN_USERNAME","admin").strip(),
        bootstrap_admin_password=os.getenv("BOOTSTRAP_ADMIN_PASSWORD",""),
        data_dir=data,
        media_dir=Path(os.getenv("MEDIA_DIR",str(data/"media"))).resolve(),
        projects_dir=Path(os.getenv("PROJECTS_DIR",str(data/"projects"))).resolve(),
        max_upload_mb=max(1,env_int("MAX_UPLOAD_MB",2048)),
        max_app_upload_mb=max(1,env_int("MAX_APP_UPLOAD_MB",128)),
        app_max_count=max(1,env_int("APP_MAX_COUNT",5)),
        app_proxy_body_max_mb=max(1,env_int("APP_PROXY_BODY_MAX_MB",16)),
        public_hostname=os.getenv("PUBLIC_HOSTNAME","").strip(),
        cloudflare_tunnel_token=os.getenv("CLOUDFLARE_TUNNEL_TOKEN","").strip(),
        cloudflare_tunnel_name=os.getenv("CLOUDFLARE_TUNNEL_NAME","sunucumon").strip() or "sunucumon",
        user_storage_quota_mb=max(64,env_int("USER_STORAGE_QUOTA_MB",2048)),
    )
    # Accept both a hostname and a full https://hostname value in .env.
    if result.public_hostname.lower().startswith(("http://","https://")):
        object.__setattr__(result, "public_hostname", result.public_hostname.split("://",1)[1].rstrip("/"))
    if not result.server_secret or result.server_secret=="change-this-to-a-long-random-secret":
        raise RuntimeError("SERVER_SECRET .env içinde güçlü bir değere ayarlanmalı.")
    for folder in (result.data_dir,result.media_dir,result.projects_dir):
        folder.mkdir(parents=True,exist_ok=True)
    return result

settings=load_settings()
