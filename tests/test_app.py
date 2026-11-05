import json
import subprocess
import time
from fastapi.testclient import TestClient
from apexcoach.app import create_app
from apexcoach.domain import Event, serialize
from apexcoach.vision import HudVision


def make_video(path):
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=black:s=640x360:r=10:d=3',
                    '-c:v','libx264','-pix_fmt','yuv420p',str(path)],check=True)


def test_upload_analysis_playback_notes_and_clip(tmp_path):
    video=tmp_path/'test.mp4';make_video(video)
    app=create_app(tmp_path/'data')
    with TestClient(app) as client:
        with video.open('rb') as f:
            response=client.post('/api/matches',files={'file':('test.mp4',f,'video/mp4')})
        assert response.status_code==202,response.text
        mid=response.json()['id']
        for _ in range(100):
            result=client.get(f'/api/matches/{mid}').json()
            if result['status'] in ('ready','failed'): break
            time.sleep(.1)
        assert result['status']=='ready',result
        assert 2.9 <= result['duration'] <= 3.1
        assert result['events']==[] # A blank video must not invent gameplay.
        assert client.get(f'/api/matches/{mid}/video',headers={'Range':'bytes=0-99'}).status_code==206
        assert client.post(f'/api/matches/{mid}/notes',json={'timestamp':1,'body':'Deckung prüfen'}).status_code==201
        assert client.post(f'/api/matches/{mid}/notes',json={'timestamp':100,'body':'bad'}).status_code==422
        assert client.get(f'/api/matches/{mid}/report').json()['notes'][0]['body']=='Deckung prüfen'
        # Seed a reviewed event to test actual clip encoding and download.
        with app.state.store.connect() as db:
            cur=db.execute('INSERT INTO events(match_id,payload) VALUES (?,?)',
                           (mid,json.dumps(serialize(Event('combat_start',1,2,'Test',{},'Review',.8)))))
            eid=cur.lastrowid
        clip=client.get(f'/api/matches/{mid}/clips/{eid}')
        assert clip.status_code==200 and len(clip.content)>100
        assert 'cossas-ki-clip-' in clip.headers['content-disposition']
        target=tmp_path/'clip.mp4';target.write_bytes(clip.content)
        probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(target)],capture_output=True,check=True)
        assert float(json.loads(probe.stdout)['format']['duration'])>2


def test_invalid_video_profile_and_missing_match(tmp_path):
    with TestClient(create_app(tmp_path/'data')) as client:
        assert client.post('/api/matches',files={'file':('fake.mp4',b'not video')}).status_code==422
        assert client.post('/api/matches',data={'profile':'{"damage_roi":[0.9,0,0.5,1]}'},files={'file':('fake',b'x')}).status_code==422
        assert client.get('/api/matches/missing').status_code==404
        assert client.get('/').status_code==200


def test_restart_marks_interrupted_jobs(tmp_path):
    app=create_app(tmp_path/'data')
    with app.state.store.connect() as db:
        db.execute("INSERT INTO matches(id,name,status,profile) VALUES ('interrupted','x','analyzing','{}')")
    with TestClient(app) as client:
        assert client.get('/api/matches/interrupted').json()['status']=='failed'


def test_local_ocr_and_motion_adapter():
    import cv2
    import numpy as np
    frame=np.zeros((180,500,3),dtype=np.uint8)
    cv2.putText(frame,'123',(20,110),cv2.FONT_HERSHEY_SIMPLEX,2.7,(255,255,255),5)
    o=HudVision({'damage_roi':[0,0,1,1]}).observe(frame,0)
    assert o.damage==123
    assert o.damage_confidence>=.65


def wait_ready(client,mid):
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        result=client.get(f'/api/matches/{mid}').json()
        if result['status'] in ('ready','failed'):
            assert result['status']=='ready',result
            return result
        time.sleep(.1)
    raise AssertionError('Analysis did not finish within 90 seconds')


def test_complete_review_reanalysis_profiles_and_delete(tmp_path):
    import io
    import zipfile
    video=tmp_path/'test.mp4';make_video(video)
    app=create_app(tmp_path/'data')
    with TestClient(app) as client:
        assert client.get('/api/health').json()['tools']['tesseract']
        p=client.post('/api/profiles',json={'name':'1080p','profile':{'damage_roi':[0,0,1,1]}})
        assert p.status_code==201
        assert client.get('/api/profiles').json()[0]['name']=='1080p'
        with video.open('rb') as f:
            mid=client.post('/api/matches',files={'file':('test.mp4',f)}).json()['id']
        wait_ready(client,mid)
        e1=client.post(f'/api/matches/{mid}/events',json={'kind':'enemy_visible','start':1,'end':1,'title':'Kontakt'})
        e2=client.post(f'/api/matches/{mid}/events',json={'kind':'first_shot','start':1.5,'end':1.5,'title':'Schuss'})
        assert e1.status_code==201 and e2.status_code==201
        assert client.post(f'/api/matches/{mid}/events',json={'start':2,'end':1,'title':'bad'}).status_code==422
        assert client.post(f'/api/matches/{mid}/events',json={'start':2,'end':5,'title':'bad'}).status_code==422
        match=client.get(f'/api/matches/{mid}').json()
        assert match['review_metrics']['manual_response_intervals'][0]['seconds']==.5
        eid=e1.json()['id']
        assert client.patch(f'/api/matches/{mid}/events/{eid}',json={'review':'dismissed'}).status_code==200
        assert client.get(f'/api/matches/{mid}').json()['review_metrics']['manual_response_intervals']==[]
        client.post(f'/api/matches/{mid}/notes',json={'timestamp':1,'body':'keep'})
        assert client.get(f'/api/matches/{mid}/source').content==video.read_bytes()
        assert client.put(f'/api/matches/{mid}/events/{e2.json()["id"]}',json={'kind':'first_shot','start':1.75,'end':1.75,'title':'Korrigierter Schuss'}).status_code==200
        assert client.post(f'/api/matches/{mid}/analyze',json={}).status_code==202
        match=wait_ready(client,mid)
        assert len(match['events'])==2 and len(match['notes'])==1
        assert any(e['title']=='Korrigierter Schuss' and e['start']==1.75 for e in match['events'])
        assert match['summary']['sample_count']==3
        assert client.get(f'/api/matches/{mid}/observations').status_code==200
        archive=client.get(f'/api/matches/{mid}/export')
        assert archive.status_code==200
        with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
            assert set(z.namelist())=={'report.md','report.json','observations.json'}
            assert len(json.loads(z.read('report.json'))['events'])==2
        nid=match['notes'][0]['id']
        assert client.delete(f'/api/matches/{mid}/notes/{nid}').status_code==204
        assert client.delete(f'/api/matches/{mid}/events/{eid}').status_code==204
        assert client.delete(f'/api/profiles/{p.json()["id"]}').status_code==204
        assert client.delete(f'/api/matches/{mid}').status_code==204
        assert client.get(f'/api/matches/{mid}').status_code==404
        assert not (app.state.store.root/mid).exists()


def test_reanalysis_and_delete_reject_running_jobs(tmp_path):
    app=create_app(tmp_path/'data')
    with TestClient(app) as client:
        with app.state.store.connect() as db:
            db.execute("INSERT INTO matches(id,name,status,profile) VALUES ('running','x','analyzing','{}')")
        assert client.post('/api/matches/running/analyze',json={}).status_code==409
        assert client.delete('/api/matches/running').status_code==409
        assert client.post('/api/profiles',headers={'Origin':'https://unrelated.example'},json={'name':'x','profile':{}}).status_code==403


def test_bar_adapter_and_rotation_suppression():
    import cv2
    import numpy as np
    from apexcoach.vision import bar_fraction
    bar=np.zeros((20,100,3),dtype=np.uint8);bar[:,:60]=(255,255,255)
    assert bar_fraction(bar,'health')==.6
    assert bar_fraction(np.zeros_like(bar),'health') is None
    rng=np.random.default_rng(13)
    first=rng.integers(0,255,(160,160,3),dtype=np.uint8)
    first=cv2.GaussianBlur(first,(3,3),0)
    rotated=cv2.warpAffine(first,cv2.getRotationMatrix2D((80,80),12,1),(160,160))
    vision=HudVision({'minimap_roi':[0,0,1,1]})
    vision.observe(first,0)
    assert vision.observe(rotated,1).minimap_motion is None


def test_webm_with_no_duration_header_can_be_uploaded(tmp_path):
    video=tmp_path/'stream.webm'
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=black:s=320x180:r=10:d=2',
                    '-c:v','libvpx','-f','webm','-live','1',str(video)],check=True)
    with TestClient(create_app(tmp_path/'data')) as client:
        with video.open('rb') as f:
            response=client.post('/api/matches',files={'file':('stream.webm',f,'video/webm')})
        assert response.status_code==202,response.text
        result=wait_ready(client,response.json()['id'])
        assert result['duration']>=1.8


def test_synthetic_hud_pipeline_detects_all_core_and_resource_events(tmp_path):
    from scripts.demo import create_demo,PROFILE
    video=create_demo(tmp_path/'hud.mp4')
    with TestClient(create_app(tmp_path/'data')) as client:
        with video.open('rb') as f:
            response=client.post('/api/matches',files={'file':('hud.mp4',f)},data={'profile':json.dumps(PROFILE)})
        assert response.status_code==202,response.text
        match=wait_ready(client,response.json()['id'])
        kinds={e['kind'] for e in match['events']}
        assert {'combat_start','damage_delta','position_change','resource_loss','resource_recovery','ammo_refill','fight'}<=kinds,kinds
        assert sum(e['evidence']['damage_delta'] for e in match['events'] if e['kind']=='damage_delta')==90
        assert match['summary']['damage_readable_fraction']>.8


def test_gameplay_audio_is_preserved(tmp_path):
    video=tmp_path/'with-audio.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=black:s=320x180:r=10:d=2',
                    '-f','lavfi','-i','sine=frequency=440:duration=2','-shortest','-c:v','libx264','-c:a','aac',str(video)],check=True)
    app=create_app(tmp_path/'data')
    with TestClient(app) as client:
        with video.open('rb') as f:
            mid=client.post('/api/matches',files={'file':('with-audio.mp4',f)}).json()['id']
        wait_ready(client,mid)
        result=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type','-of','json',
                               str(app.state.store.root/mid/'video.mp4')],capture_output=True,check=True)
        assert {s['codec_type'] for s in json.loads(result.stdout)['streams']}=={'video','audio'}


def test_demo_is_ready_without_user_calibration(tmp_path):
    with TestClient(create_app(tmp_path/'data')) as client:
        response=client.post('/api/demo')
        assert response.status_code==202,response.text
        match=wait_ready(client,response.json()['id'])
        assert match['media_ready']
        assert match['name']=='Synthetische-HUD-Demo.mp4'
        assert match['summary']['observed_outgoing_damage']==90


def test_media_ready_recovers_after_failed_preparation(tmp_path,monkeypatch):
    import apexcoach.pipeline as pipeline
    video=tmp_path/'test.mp4';make_video(video)
    original=pipeline.prepare
    def fail(*args):
        raise RuntimeError('Simulated encoder error')
    monkeypatch.setattr(pipeline,'prepare',fail)
    with TestClient(create_app(tmp_path/'data')) as client:
        with video.open('rb') as f:
            mid=client.post('/api/matches',files={'file':('test.mp4',f)}).json()['id']
        for _ in range(100):
            match=client.get(f'/api/matches/{mid}').json()
            if match['status']=='failed': break
            time.sleep(.02)
        assert match['status']=='failed' and not match['media_ready']
        monkeypatch.setattr(pipeline,'prepare',original)
        assert client.post(f'/api/matches/{mid}/analyze',json={}).status_code==202
        assert wait_ready(client,mid)['media_ready']


def test_upload_limit_before_multipart_and_for_chunked_requests(tmp_path):
    from apexcoach.limits import UploadLimit
    app=create_app(tmp_path/'data')
    app.add_middleware(UploadLimit,max_bytes=100)
    with TestClient(app) as client:
        assert client.post('/api/matches',files={'file':('large.mp4',b'x'*200)}).status_code==413
        def chunks():
            yield b'{"name":"'
            yield b'x'*200
            yield b'","profile":{}}'
        response=client.post('/api/profiles',content=chunks(),headers={'Content-Type':'application/json'})
        assert response.status_code==413,response.text
        assert not list((tmp_path/'data').glob('*/source'))


def test_queue_failure_leaves_no_ghost_match(tmp_path,monkeypatch):
    video=tmp_path/'test.mp4';make_video(video)
    app=create_app(tmp_path/'data')
    def fail(*args,**kwargs):
        raise RuntimeError('Pool stopped')
    monkeypatch.setattr(app.state.pool,'submit',fail)
    with TestClient(app) as client:
        for _ in range(5):
            with video.open('rb') as f:
                response=client.post('/api/matches',files={'file':('test.mp4',f)})
            assert response.status_code==503,response.text
        assert client.get('/api/matches').json()==[]
        assert not list((tmp_path/'data').glob('*/source'))


def test_odd_sized_videos_are_normalized(tmp_path):
    # FFV1 preserves odd dimensions that H.264's usual yuv420p cannot encode.
    video=tmp_path/'odd.mkv'
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=black:s=322x182:r=5:d=1',
                    '-vf','crop=321:181:exact=1','-c:v','ffv1',str(video)],check=True)
    with TestClient(create_app(tmp_path/'data')) as client:
        with video.open('rb') as f:
            response=client.post('/api/matches',files={'file':('odd.mkv',f)})
        assert response.status_code==202,response.text
        assert wait_ready(client,response.json()['id'])['media_ready']


def test_ocr_timeout_is_unknown_with_timestamped_issue(monkeypatch):
    import numpy as np
    import apexcoach.vision as vision
    from apexcoach.domain import summarize
    def timeout(image):
        raise RuntimeError('Tesseract process timeout')
    monkeypatch.setattr(vision,'read_number',timeout)
    observation=vision.HudVision({'damage_roi':[0,0,1,1]}).observe(np.zeros((60,100,3),dtype=np.uint8),12)
    assert observation.t==12 and observation.damage is None
    assert observation.issues==('damage_roi: OCR timeout',)
    assert summarize([observation],[])['ocr_timeout_count']==1
