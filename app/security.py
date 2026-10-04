from __future__ import annotations

import hashlib
import secrets
import time

from fastapi import HTTPException, Request

from .config import settings
from .db import (
    create_auth_session,
    delete_auth_session,
    get_auth_session,
    get_user,
    touch_auth_session,
)

COOKIE_NAME="astra_session"
SESSION_REFRESH_WINDOW=60 * 60 * 24 * 7
BROWSER_MAX_AGE=60 * 60 * 24 * 365

def _hash_token(token:str)->str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_session(user_id:int)->str:
    token=secrets.token_urlsafe(48)
    now=int(time.time())
    expires=now + settings.session_ttl_hours * 3600
    create_auth_session(_hash_token(token),user_id,expires,now)
    return token

def revoke_session(token:str|None):
    if token:
        delete_auth_session(_hash_token(token))

def current_user(request:Request):
    token=request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    session=get_auth_session(_hash_token(token))
    if not session:
        return None

    user=get_user(int(session["user_id"]))
    if not user:
        revoke_session(token)
        return None

    now=int(time.time())
    remaining=int(session["expires_at"])-now

    # Sliding session: an active user gets a fresh TTL instead of being
    # unexpectedly logged out while working.
    if remaining <= SESSION_REFRESH_WINDOW:
        touch_auth_session(
            _hash_token(token),
            now + settings.session_ttl_hours * 3600,
            now,
        )
    return user

def require_user(request:Request):
    user=current_user(request)
    if not user:
        raise HTTPException(401,"Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.")
    return user

def require_role(request:Request,*roles:str):
    user=require_user(request)
    if user["role"] not in roles:
        raise HTTPException(403,"Bu işlem için yetkiniz yok.")
    return user