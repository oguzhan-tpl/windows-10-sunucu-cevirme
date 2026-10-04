from __future__ import annotations
import base64
import hashlib
import hmac
import json
import time
from fastapi import HTTPException, Request
from .config import settings
from .db import get_user

COOKIE_NAME="astra_session"

def _b64(data:bytes)->str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _unb64(value:str)->bytes:
    return base64.urlsafe_b64decode(value+"="*(-len(value)%4))

def create_session(user_id:int)->str:
    payload={"uid":user_id,"exp":int(time.time())+settings.session_ttl_hours*3600}
    raw=_b64(json.dumps(payload,separators=(",",":")).encode())
    sig=_b64(hmac.new(settings.server_secret.encode(),raw.encode(),hashlib.sha256).digest())
    return raw+"."+sig

def current_user(request:Request):
    token=request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        raw,sig=token.split(".",1)
        expected=_b64(hmac.new(settings.server_secret.encode(),raw.encode(),hashlib.sha256).digest())
        if not hmac.compare_digest(sig,expected):
            return None
        payload=json.loads(_unb64(raw))
        if int(payload["exp"])<int(time.time()):
            return None
        return get_user(int(payload["uid"]))
    except Exception:
        return None

def require_user(request:Request):
    user=current_user(request)
    if not user:
        raise HTTPException(401,"Oturum gerekli.")
    return user

def require_role(request:Request,*roles:str):
    user=require_user(request)
    if user["role"] not in roles:
        raise HTTPException(403,"Bu işlem için yetkiniz yok.")
    return user
