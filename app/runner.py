from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from .config import settings
from .db import update_project

ENTRYPOINT_RE=re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)$")


def pid_running(pid):
    if not pid:
        return False
    try:
        out=subprocess.run(
            ["tasklist","/FI",f"PID eq {pid}","/NH"],
            capture_output=True,text=True,timeout=5,
            creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0)
        )
        return str(pid) in out.stdout
    except Exception:
        return False


def stop_pid(pid):
    if pid:
        subprocess.run(
            ["taskkill","/PID",str(pid),"/T","/F"],
            capture_output=True,text=True,timeout=20,
            creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0)
        )


def free_port(preferred):
    if preferred:
        try:
            with socket.socket() as s:
                s.bind(("127.0.0.1",int(preferred)))
                return int(preferred)
        except OSError:
            pass
    with socket.socket() as s:
        s.bind(("127.0.0.1",0))
        return int(s.getsockname()[1])


def safe_extract(upload_path,target):
    target=Path(target).resolve()
    staging=Path(tempfile.mkdtemp(prefix="astra-extract-"))
    try:
        with zipfile.ZipFile(upload_path) as zf:
            for info in zf.infolist():
                name=info.filename.replace("\\","/")
                candidate=(staging/name).resolve()
                if name.startswith("/") or ".." in Path(name).parts or ":" in Path(name).parts:
                    raise ValueError("ZIP içinde güvenli olmayan yol var.")
                if os.path.commonpath([str(staging.resolve()),str(candidate)])!=str(staging.resolve()):
                    raise ValueError("ZIP path traversal.")
            zf.extractall(staging)
        children=[x for x in staging.iterdir()]
        source=children[0] if len(children)==1 and children[0].is_dir() else staging
        target.mkdir(parents=True,exist_ok=True)
        for child in list(target.iterdir()):
            shutil.rmtree(child,ignore_errors=True) if child.is_dir() else child.unlink(missing_ok=True)
        for child in source.iterdir():
            shutil.move(str(child),str(target/child.name))
    finally:
        shutil.rmtree(staging,ignore_errors=True)


def read_entrypoint(app_dir):
    cfg=app_dir/"deploy.json"
    if not cfg.exists():
        return "main:app"
    data=json.loads(cfg.read_text("utf-8"))
    entrypoint=str(data.get("entrypoint","main:app"))
    if not ENTRYPOINT_RE.fullmatch(entrypoint):
        raise ValueError("deploy.json entrypoint geçersiz.")
    return entrypoint


def ensure_venv(app_dir):
    venv=app_dir.parent/".venv"
    python=venv/"Scripts"/"python.exe"
    if not python.exists():
        subprocess.run([sys.executable,"-m","venv",str(venv)],cwd=app_dir,check=True,timeout=300)
    if not python.exists():
        raise RuntimeError("Proje Python ortamı oluşturulamadı.")
    return python


def install_requirements(app_dir,python):
    req=app_dir/"requirements.txt"
    if not req.exists():
        return
    subprocess.run(
        [str(python),"-m","pip","install","--disable-pip-version-check","--no-input","-r",str(req)],
        cwd=app_dir,check=True,timeout=900
    )


def wait_local(port,seconds=20):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        try:
            with socket.create_connection(("127.0.0.1",port),timeout=.5):
                return True
        except OSError:
            time.sleep(.25)
    return False


def deploy(project,zip_path):
    app_dir=Path(project["project_dir"])
    log_dir=app_dir.parent/"logs"
    log_dir.mkdir(parents=True,exist_ok=True)
    log_file=log_dir/"app.log"

    update_project(project["id"],status="deploying",last_error=None)

    try:
        if pid_running(project["pid"]):
            stop_pid(project["pid"])

        safe_extract(zip_path,app_dir)
        entrypoint=read_entrypoint(app_dir)
        module=app_dir/entrypoint.split(":",1)[0].replace(".",os.sep)
        if not module.with_suffix(".py").exists():
            raise ValueError(f"Entrypoint bulunamadı: {entrypoint}")

        python=ensure_venv(app_dir)
        install_requirements(app_dir,python)

        port=free_port(project["port"])
        env=os.environ.copy()
        env.update({
            "PYTHONUNBUFFERED":"1",
            "ASTRA_PROJECT_SLUG":project["slug"],
            "ASTRA_PROJECT_DB":str(project["db_path"]),
        })

        with log_file.open("ab",buffering=0) as log:
            proc=subprocess.Popen(
                [str(python),"-m","uvicorn",entrypoint,"--host","127.0.0.1","--port",str(port)],
                cwd=app_dir,env=env,stdin=subprocess.DEVNULL,
                stdout=log,stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0),
            )

        update_project(project["id"],entrypoint=entrypoint,port=port,pid=proc.pid,status="starting")
        if not wait_local(port,20):
            if pid_running(proc.pid):
                raise RuntimeError("Uygulama porta bağlanmadı. Log dosyasını kontrol edin.")
            raise RuntimeError("Uygulama başlatılamadı; process erken kapandı.")

        update_project(project["id"],status="running",last_error=None)
    except Exception as exc:
        update_project(project["id"],status="error",last_error=str(exc))
        raise


def stop(project):
    stop_pid(project["pid"])
    update_project(project["id"],status="stopped",pid=None)


async def deploy_async(project,zip_path):
    await asyncio.to_thread(deploy,project,zip_path)
