from dataclasses import asdict
from pathlib import Path
import json
import math
import subprocess
import cv2
from .vision import HudVision
from .domain import detect, serialize, summarize

MAX_SECONDS = 7200

def prepare(source: Path, target: Path):
    # Browser-compatible video; no shell interpolation and bounded runtime.
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(source),'-t',str(MAX_SECONDS),
                    '-map','0:v:0','-map','0:a:0?','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','veryfast','-crf','24',
                    '-threads','2','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',str(target)],
                   check=True, timeout=1800, capture_output=True)


def analyze(store, mid, profile, perception_factory=HudVision):
    folder = store.root / mid
    cap = None
    try:
        store.update(mid, status='analyzing')
        if not (folder/'video.mp4').exists():
            temp=folder/'preparing.mp4'
            prepare(folder/'source', temp)
            temp.replace(folder/'video.mp4')
        cap = cv2.VideoCapture(str(folder/'video.mp4'))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not cap.isOpened() or not math.isfinite(fps) or fps <= 0 or frames <= 0:
            raise ValueError('Video enthält keine lesbaren Frames')
        duration = frames/fps
        store.update(mid, duration=duration)
        vision = perception_factory(profile)
        observations = []
        # 1 Hz is intentional; do not report millisecond reaction times.
        for second in range(math.ceil(duration)):
            cap.set(cv2.CAP_PROP_POS_MSEC, second*1000)
            ok, frame = cap.read()
            if not ok:
                raise ValueError(f'Frame bei {second}s nicht lesbar; Analyse unvollständig')
            observations.append(vision.observe(frame, float(second)))
            if second == 0:
                cv2.imwrite(str(folder/'preview.jpg'), frame)
            if second % 5 == 0:
                store.update(mid, progress=second/duration)
        (folder/'observations.json').write_text(json.dumps([asdict(o) for o in observations]), encoding='utf-8')
        events = detect(observations)
        with store.connect() as db:
            db.execute("DELETE FROM events WHERE match_id=? AND coalesce(json_extract(payload,'$.origin'),'auto')='auto'",(mid,))
            db.executemany('INSERT INTO events(match_id,payload) VALUES (?,?)',
                           [(mid,json.dumps(serialize(e))) for e in events])
        for clip in folder.glob('clip-*.mp4'):
            clip.unlink(missing_ok=True)
        store.update(mid, status='ready', progress=1, error=None, summary=json.dumps(summarize(observations,events)))
    except Exception as exc:
        store.update(mid, status='failed', error=f'{type(exc).__name__}: {str(exc)[:300]}')
    finally:
        if cap is not None:
            cap.release()
