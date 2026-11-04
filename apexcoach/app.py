from contextlib import asynccontextmanager
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
import json
import math
import os
import threading
import subprocess
import shutil
import io
import zipfile
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Literal
from .store import Store
from .pipeline import analyze
from .review import review_metrics, markdown_report
from .limits import UploadLimit

STATIC = Path(__file__).parent/'static'

class Profile(BaseModel):
    model_config = ConfigDict(extra='forbid')
    damage_roi: list[float] | None = None
    minimap_roi: list[float] | None = None
    health_roi: list[float] | None = None
    shield_roi: list[float] | None = None
    ammo_roi: list[float] | None = None

    @field_validator('damage_roi','minimap_roi','health_roi','shield_roi','ammo_roi')
    @classmethod
    def valid_roi(cls, v):
        if v is None:
            return v
        if len(v) != 4 or not all(math.isfinite(n) for n in v):
            raise ValueError('ROI benötigt x,y,Breite,Höhe')
        x,y,w,h = v
        if x < 0 or y < 0 or w < .01 or h < .01 or x+w > 1 or y+h > 1:
            raise ValueError('ROI muss innerhalb des Bildes liegen (Werte 0–1)')
        return v

class Note(BaseModel):
    timestamp: float = Field(ge=0, allow_inf_nan=False)
    body: str = Field(min_length=1, max_length=2000)


class ManualEvent(BaseModel):
    kind: Literal['manual','enemy_visible','first_shot','positioning','rotation','resources','decision'] = 'manual'
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(ge=0, allow_inf_nan=False)
    title: str = Field(min_length=1,max_length=150)
    advice: str = Field(default='',max_length=2000)

    @model_validator(mode='after')
    def ordered(self):
        if self.end < self.start or not self.title.strip():
            raise ValueError('Gültiges Zeitfenster und Titel erforderlich')
        return self

class EventReview(BaseModel):
    review: Literal['unreviewed','confirmed','dismissed']

class SavedProfile(BaseModel):
    name: str = Field(min_length=1,max_length=80)
    profile: Profile


def create_app(root=None):
    store = Store(Path(root or os.getenv('APEX_DATA_DIR','data')))
    pool = ThreadPoolExecutor(max_workers=1)
    slots = threading.BoundedSemaphore(4)
    guard = threading.RLock()

    @asynccontextmanager
    async def lifespan(app):
        store.recover()
        yield
        pool.shutdown(wait=True)

    app = FastAPI(title='Apex Review', lifespan=lifespan)
    app.state.store = store
    app.state.pool = pool
    app.add_middleware(UploadLimit)
    app.mount('/static', StaticFiles(directory=STATIC), name='static')

    @app.middleware('http')
    async def same_origin(request,call_next):
        if request.method in ('POST','PUT','PATCH','DELETE'):
            origin=request.headers.get('origin')
            if origin and origin!=str(request.base_url).rstrip('/'):
                return Response('Cross-origin mutation rejected',status_code=403)
        response=await call_next(request)
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='same-origin'
        return response

    def require(mid):
        result = store.match(mid)
        if result is None:
            raise HTTPException(404, 'Aufnahme nicht gefunden')
        result['review_metrics']=review_metrics(result)
        result['media_ready']=(store.root/mid/'video.mp4').is_file()
        return result

    def editable(mid):
        match=require(mid)
        if match['status'] in ('queued','analyzing'):
            raise HTTPException(409,'Analyse läuft; bitte Abschluss abwarten')
        return match

    def locked(function):
        @wraps(function)
        def wrapped(*args,**kwargs):
            with guard:
                return function(*args,**kwargs)
        return wrapped

    @app.get('/')
    def index():
        return FileResponse(STATIC/'index.html')

    @app.get('/api/matches')
    def matches():
        with store.connect() as db:
            return [dict(r) for r in db.execute('SELECT id,name,status,duration,progress,error,created FROM matches ORDER BY created DESC')]

    @app.post('/api/matches', status_code=202)
    def upload(file: UploadFile = File(...), profile: str = Form('{}')):
        try:
            selected = Profile.model_validate_json(profile).model_dump()
        except ValueError as exc:
            raise HTTPException(422, 'Ungültiges HUD-Profil') from exc
        if not slots.acquire(blocking=False):
            raise HTTPException(429, 'Analyse-Warteschlange voll; bitte später versuchen')
        mid = uuid4().hex
        folder = store.root/mid
        queued = False
        try:
            folder.mkdir()
            total = 0
            with (folder/'source').open('wb') as out:
                while block := file.file.read(1024*1024):
                    total += len(block)
                    if total > 2*1024**3:
                        raise HTTPException(413, 'Maximal 2 GiB pro Video')
                    out.write(block)
            try:
                probe = subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,start_time:format=duration',
                                        '-of','json',str(folder/'source')], capture_output=True, timeout=15)
            except subprocess.TimeoutExpired as exc:
                raise HTTPException(422, 'Videoprüfung hat das Zeitlimit überschritten') from exc
            except OSError as exc:
                raise HTTPException(503, 'ffprobe fehlt oder kann nicht gestartet werden') from exc
            try:
                metadata = json.loads(probe.stdout)
                stream = metadata['streams'][0]
                duration_value=metadata.get('format',{}).get('duration')
                if duration_value is None:
                    # MediaRecorder WebM often has no duration header. Scan packet
                    # timestamps without decoding; do not reject a valid recording.
                    packets=subprocess.run(['ffprobe','-v','error','-select_streams','v:0',
                        '-show_entries','packet=pts_time,duration_time','-of','csv=p=0',str(folder/'source')],
                        capture_output=True,timeout=45,check=True)
                    ends=[]
                    for line in packets.stdout.decode('utf-8').splitlines():
                        cells=line.split(',')
                        try:
                            pts=float(cells[0])
                            step=float(cells[1]) if len(cells)>1 and cells[1]!='N/A' else 1/30
                            if math.isfinite(pts) and math.isfinite(step):
                                ends.append(pts+step)
                        except ValueError:
                            continue
                    duration_value=max(ends)-float(stream.get('start_time',0)) if ends else 0
                duration = float(duration_value)
                valid = probe.returncode == 0 and math.isfinite(duration) and 0 < duration <= 7200 and 0 < stream['width'] <= 3840 and 0 < stream['height'] <= 2160
            except (ValueError, TypeError, KeyError, IndexError, subprocess.SubprocessError):
                valid = False
            if not valid:
                raise HTTPException(422, 'Lesbares Video bis 2 Stunden und 3840×2160 erforderlich')
            with store.connect() as db:
                db.execute('INSERT INTO matches(id,name,status,profile) VALUES (?,?,?,?)',
                           (mid, Path(file.filename or 'Gameplay').name[:150], 'queued', json.dumps(selected)))
            store.update(mid,duration=duration)
            def work():
                try:
                    analyze(store, mid, selected)
                finally:
                    slots.release()
            try:
                pool.submit(work)
            except RuntimeError as exc:
                raise HTTPException(503,'Analyse-Warteschlange beendet; Anwendung neu starten') from exc
            queued = True
            return {'id': mid}
        finally:
            file.file.close()
            if not queued:
                import shutil
                try:
                    if folder.exists():
                        shutil.rmtree(folder)
                    with store.connect() as db:
                        db.execute('DELETE FROM matches WHERE id=?',(mid,))
                finally:
                    slots.release()

    @app.post('/api/demo',status_code=202)
    def demo():
        from tempfile import TemporaryDirectory
        from scripts.demo import create_demo, PROFILE
        with TemporaryDirectory(prefix='apex-demo-') as temporary:
            path=create_demo(Path(temporary)/'demo.mp4')
            return upload(UploadFile(filename='Synthetische-HUD-Demo.mp4',file=path.open('rb')),
                          json.dumps(PROFILE))

    @app.get('/api/matches/{mid}')
    def detail(mid: str):
        return require(mid)

    @app.get('/api/matches/{mid}/video')
    def video(mid: str):
        match = require(mid)
        path = store.root/mid/'video.mp4'
        if not path.exists():
            raise HTTPException(409, 'Video wird vorbereitet')
        return FileResponse(path, media_type='video/mp4')

    @app.post('/api/matches/{mid}/notes', status_code=201)
    @locked
    def add_note(mid: str, note: Note):
        match = require(mid)
        if note.timestamp > match['duration']:
            raise HTTPException(422, 'Zeitstempel liegt außerhalb des Videos')
        if not note.body.strip():
            raise HTTPException(422, 'Notiz darf nicht leer sein')
        with store.connect() as db:
            db.execute('INSERT INTO notes(match_id,timestamp,body) VALUES (?,?,?)', (mid,note.timestamp,note.body.strip()))
        return {'saved': True}

    @app.get('/api/matches/{mid}/report')
    def report(mid: str):
        return require(mid)


    @app.get('/api/health')
    def health():
        return {'status':'ok','tools':{name:shutil.which(name) is not None for name in ('ffmpeg','ffprobe','tesseract')},
                'analysis':'local-hud-v2','sample_hz':1}

    @app.get('/api/profiles')
    def profiles():
        with store.connect() as db:
            return [dict(id=r['id'],name=r['name'],profile=json.loads(r['payload'])) for r in db.execute('SELECT * FROM profiles ORDER BY name')]

    @app.post('/api/profiles',status_code=201)
    def save_profile(value:SavedProfile):
        if not value.name.strip():
            raise HTTPException(422,'Profilname fehlt')
        pid=uuid4().hex
        with store.connect() as db:
            db.execute('INSERT INTO profiles VALUES (?,?,?)',(pid,value.name.strip(),value.profile.model_dump_json()))
        return {'id':pid}

    @app.delete('/api/profiles/{pid}',status_code=204)
    def delete_profile(pid:str):
        with store.connect() as db:
            row=db.execute('DELETE FROM profiles WHERE id=?',(pid,))
            if row.rowcount==0:
                raise HTTPException(404,'Profil nicht gefunden')
        return Response(status_code=204)

    @app.post('/api/matches/{mid}/analyze',status_code=202)
    def reanalyze(mid:str,profile:Profile):
        with guard:
            editable(mid)
            if not slots.acquire(blocking=False):
                raise HTTPException(429,'Analyse-Warteschlange voll')
            store.update(mid,status='queued',progress=0,error=None,profile=profile.model_dump_json())
            def work():
                try:
                    analyze(store,mid,profile.model_dump())
                finally:
                    slots.release()
            try:
                pool.submit(work)
            except RuntimeError as exc:
                slots.release()
                store.update(mid,status='failed',error='Warteschlange beendet; erneut starten')
                raise HTTPException(503,'Warteschlange beendet') from exc
            return {'id':mid}

    @app.delete('/api/matches/{mid}',status_code=204)
    def delete_match(mid:str):
        with guard:
            editable(mid)
            folder=store.root/mid
            # Rename before DB mutation so a filesystem failure preserves metadata.
            trash=store.root/f'deleted-{uuid4().hex}'
            if folder.exists():
                folder.rename(trash)
            try:
                with store.connect() as db:
                    db.execute('DELETE FROM events WHERE match_id=?',(mid,))
                    db.execute('DELETE FROM notes WHERE match_id=?',(mid,))
                    db.execute('DELETE FROM matches WHERE id=?',(mid,))
            except Exception:
                if trash.exists():
                    trash.rename(folder)
                raise
            if trash.exists():
                shutil.rmtree(trash)
            return Response(status_code=204)

    @app.post('/api/matches/{mid}/events',status_code=201)
    def manual_event(mid:str,event:ManualEvent):
        with guard:
            match=editable(mid)
            if event.end>match['duration']:
                raise HTTPException(422,'Zeitfenster liegt außerhalb des Videos')
            payload=event.model_dump()
            payload.update(origin='manual',review='confirmed',confidence=1.0,
                           evidence={'source':'manual video annotation','limitation':'User annotation, not automatic model inference'})
            with store.connect() as db:
                row=db.execute('INSERT INTO events(match_id,payload) VALUES (?,?)',(mid,json.dumps(payload)))
                return {'id':row.lastrowid}

    @app.put('/api/matches/{mid}/events/{eid}')
    def edit_manual_event(mid:str,eid:int,event:ManualEvent):
        with guard:
            match=editable(mid)
            old=next((e for e in match['events'] if e['id']==eid),None)
            if old is None:
                raise HTTPException(404,'Ereignis nicht gefunden')
            if old.get('origin')!='manual':
                raise HTTPException(422,'Automatischen Befund bewerten oder durch eine eigene Markierung ergänzen')
            if event.end>match['duration']:
                raise HTTPException(422,'Zeitfenster liegt außerhalb des Videos')
            payload=event.model_dump()
            payload.update(origin='manual',review=old.get('review','confirmed'),confidence=1.0,
                           evidence={'source':'manual video annotation','limitation':'User annotation, not automatic model inference'})
            with store.connect() as db:
                db.execute('UPDATE events SET payload=? WHERE match_id=? AND id=?',(json.dumps(payload),mid,eid))
            (store.root/mid/f'clip-{eid}.mp4').unlink(missing_ok=True)
            return {'saved':True}

    @app.patch('/api/matches/{mid}/events/{eid}')
    def event_review(mid:str,eid:int,value:EventReview):
        with guard:
            match=editable(mid)
            event=next((e for e in match['events'] if e['id']==eid),None)
            if event is None:
                raise HTTPException(404,'Ereignis nicht gefunden')
            event.pop('id')
            event['review']=value.review
            with store.connect() as db:
                db.execute('UPDATE events SET payload=? WHERE id=? AND match_id=?',(json.dumps(event),eid,mid))
            return {'saved':True}

    @app.delete('/api/matches/{mid}/events/{eid}',status_code=204)
    def delete_event(mid:str,eid:int):
        with guard:
            editable(mid)
            with store.connect() as db:
                row=db.execute('DELETE FROM events WHERE id=? AND match_id=?',(eid,mid))
                if row.rowcount==0:
                    raise HTTPException(404,'Ereignis nicht gefunden')
            (store.root/mid/f'clip-{eid}.mp4').unlink(missing_ok=True)
            return Response(status_code=204)

    @app.delete('/api/matches/{mid}/notes/{nid}',status_code=204)
    def delete_note(mid:str,nid:int):
        with guard:
            require(mid)
            with store.connect() as db:
                row=db.execute('DELETE FROM notes WHERE match_id=? AND id=?',(mid,nid))
                if row.rowcount==0:
                    raise HTTPException(404,'Notiz nicht gefunden')
            return Response(status_code=204)

    @app.get('/api/matches/{mid}/source')
    def original_video(mid:str):
        match=require(mid)
        path=store.root/mid/'source'
        if not path.exists():
            raise HTTPException(404,'Originaldatei nicht vorhanden')
        return FileResponse(path,media_type='application/octet-stream',filename=match['name'])

    @app.get('/api/matches/{mid}/observations')
    def observations(mid:str):
        require(mid)
        path=store.root/mid/'observations.json'
        if not path.exists():
            raise HTTPException(404,'Noch keine Beobachtungen vorhanden')
        return FileResponse(path,media_type='application/json',filename='observations.json')

    @app.get('/api/matches/{mid}/export')
    def export(mid:str):
        with guard:
            match=editable(mid)
            output=io.BytesIO()
            with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
                archive.writestr('report.md',markdown_report(match))
                archive.writestr('report.json',json.dumps(match,ensure_ascii=False,indent=2))
                path=store.root/mid/'observations.json'
                if path.exists():
                    archive.write(path,'observations.json')
            return Response(output.getvalue(),media_type='application/zip',
                            headers={'Content-Disposition':'attachment; filename="apex-review.zip"'})

    @app.get('/api/matches/{mid}/clips/{eid}')
    @locked
    def clip(mid: str, eid: int):
        match = require(mid)
        event = next((e for e in match['events'] if e['id']==eid), None)
        if event is None or match['status'] in ('queued','analyzing'):
            raise HTTPException(404, 'Clip nicht vorhanden')
        target = store.root/mid/f'clip-{eid}.mp4'
        if not target.exists():
            temp = target.with_name(f'{uuid4().hex}.mp4')
            start = max(0,event['start']-3)
            length = min(match['duration'],event['end']+4)-start
            try:
                subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-ss',str(start),'-i',str(store.root/mid/'video.mp4'),
                                '-t',str(length),'-c:v','libx264','-preset','veryfast','-threads','2','-c:a','aac','-movflags','+faststart',str(temp)],
                               check=True, timeout=90, capture_output=True)
                temp.replace(target)
            except (subprocess.SubprocessError, OSError) as exc:
                temp.unlink(missing_ok=True)
                raise HTTPException(500,'Clip konnte nicht erstellt werden') from exc
        return FileResponse(target, media_type='video/mp4', filename=f'apex-{eid}.mp4')

    return app

app = create_app()
