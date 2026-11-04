"""Reproducible synthetic HUD fixture, explicitly NOT a real Apex match."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np

PROFILE={'damage_roi':[.78,.02,.18,.12], 'minimap_roi':[.015625,.027778,.125,.222222],
         'health_roi':[40/1280,650/720,200/1280,20/720],
         'shield_roi':[40/1280,615/720,200/1280,20/720],
         'ammo_roi':[.80,.80,.18,.14]}

def create_demo(path):
    path=Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),10,(1280,720))
    if not writer.isOpened():
        raise RuntimeError('Video encoder unavailable')
    terrain=np.random.default_rng(42).integers(20,160,(160,160,3),dtype=np.uint8)
    terrain=cv2.GaussianBlur(terrain,(5,5),0)
    try:
        for i in range(150):
            t=i/10
            frame=np.full((720,1280,3),(25,32,29),dtype=np.uint8)
            cv2.putText(frame,'SYNTHETIC DEMO - NOT GAMEPLAY',(280,330),cv2.FONT_HERSHEY_SIMPLEX,.8,(180,220,180),2)
            damage=100 if t<3 else 145 if t<6 else 190
            cv2.putText(frame,str(damage),(1010,75),cv2.FONT_HERSHEY_SIMPLEX,1.8,(255,255,255),3)
            shift=int(max(0,min(t-8,5))*8)
            frame[20:180,20:180]=np.roll(terrain,shift,axis=1)
            health=1 if t<3 or t>=10 else .6 if t<5 else .4 if t<9 else .2
            shield=1 if t<3 or t>=10 else .5
            frame[650:670,40:240]=(0,0,0)
            frame[650:670,40:40+int(200*health)]=(255,255,255)
            frame[615:635,40:240]=(0,0,0)
            frame[615:635,40:40+int(200*shield)]=(220,60,180)
            ammo=20 if t<4 else 12 if t<6 else 25
            cv2.putText(frame,str(ammo),(1040,645),cv2.FONT_HERSHEY_SIMPLEX,1.8,(255,255,255),3)
            writer.write(frame)
    finally:
        writer.release()
    path.with_suffix('.profile.json').write_text(json.dumps(PROFILE,indent=2),encoding='utf-8')
    return path

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='data/demo.mp4')
    args=parser.parse_args()
    print(create_demo(args.output).resolve())
    print('HUD profile:',json.dumps(PROFILE))
