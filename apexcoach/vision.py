"""Replaceable local perception: OCR, calibrated bars and rotation-aware map flow."""
from typing import Protocol
import os
import re
import cv2
import numpy as np
import pytesseract
from .domain import Observation

# Keep OCR and vision predictable on CPU-limited single-user machines.
os.environ.setdefault('OMP_THREAD_LIMIT','1')
cv2.setNumThreads(2)

class Perception(Protocol):
    def observe(self, frame, t: float) -> Observation: ...


def crop(frame, roi):
    h,w=frame.shape[:2]
    x,y,rw,rh=roi
    return frame[int(y*h):max(int((y+rh)*h),int(y*h)+1),int(x*w):max(int((x+rw)*w),int(x*w)+1)]


def read_number(image):
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    if gray.shape[0]<40:
        gray=cv2.resize(gray,None,fx=2,fy=2)
    threshold=cv2.THRESH_BINARY_INV if float(np.mean(gray))<127 else cv2.THRESH_BINARY
    _,gray=cv2.threshold(gray,0,255,threshold+cv2.THRESH_OTSU)
    # Padding avoids a tightly cropped single glyph being discarded as a border.
    gray=cv2.copyMakeBorder(gray,15,15,15,15,cv2.BORDER_CONSTANT,value=255)
    result=pytesseract.image_to_data(gray,config='--psm 7 -c tessedit_char_whitelist=0123456789',
                                    output_type=pytesseract.Output.DICT,timeout=4)
    tokens=[(t.strip(),float(c)/100) for t,c in zip(result['text'],result['conf']) if re.fullmatch(r'\d{1,5}',t.strip())]
    return (int(tokens[0][0]),max(0,tokens[0][1])) if len(tokens)==1 else (None,0)


def bar_fraction(image, resource):
    """Occupied columns of a tightly calibrated bar. No pixels means unknown."""
    hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    hue,sat,val=cv2.split(hsv)
    white=(sat<65)&(val>180)
    if resource=='health':
        colored=((hue<12)|(hue>170))&(sat>95)&(val>110)
    else:
        colored=(sat>95)&(val>120)
    mask=white|colored
    # Reject thin outlines. ROI should contain the inner bar, without icon/text.
    columns=np.mean(mask,axis=0)>.35
    fill=float(np.mean(columns))
    return fill if fill>.015 else None


class HudVision:
    def __init__(self,profile):
        self.profile=profile
        self.previous_map=None
        self.previous_frame=None

    def observe(self,frame,t):
        thumb=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(80,45))
        cut=self.previous_frame is not None and float(np.mean(cv2.absdiff(thumb,self.previous_frame)))>65
        self.previous_frame=thumb
        issues=[]
        def number(key):
            if not self.profile.get(key):
                return None,0
            try:
                return read_number(crop(frame,self.profile[key]))
            except RuntimeError as exc:
                if 'timeout' not in str(exc).lower():
                    raise
                # A single slow OCR call is an unknown sample, not a fabricated
                # zero and not a reason to discard an entire otherwise valid video.
                issues.append(key+': OCR timeout')
                return None,0
        damage,dc=number('damage_roi')
        ammo,ac=number('ammo_roi')
        motion=None
        if self.profile.get('minimap_roi'):
            gray=cv2.resize(cv2.cvtColor(crop(frame,self.profile['minimap_roi']),cv2.COLOR_BGR2GRAY),(160,160))
            if self.previous_map is not None and not cut:
                mask=np.zeros_like(gray);mask[16:144,16:144]=255;mask[64:96,64:96]=0
                points=cv2.goodFeaturesToTrack(self.previous_map,150,.02,5,mask=mask)
                if points is not None and len(points)>=8:
                    next_points,status,_=cv2.calcOpticalFlowPyrLK(self.previous_map,gray,points,None)
                    if next_points is not None:
                        a=points[status.ravel()==1];b=next_points[status.ravel()==1]
                        if len(a)>=8:
                            transform,inliers=cv2.estimateAffinePartial2D(a,b,method=cv2.RANSAC,ransacReprojThreshold=2)
                            if transform is not None and inliers is not None and np.mean(inliers)>.55:
                                angle=abs(float(np.degrees(np.arctan2(transform[1,0],transform[0,0]))))
                                scale=float(np.hypot(transform[0,0],transform[1,0]))
                                # Suppress rotation/zoom rather than call it translation.
                                if angle<5 and .95<scale<1.05:
                                    motion=float(np.median(np.linalg.norm((b-a).reshape(-1,2),axis=1)))
            self.previous_map=gray
        health=(bar_fraction(crop(frame,self.profile['health_roi']),'health') if self.profile.get('health_roi') else None)
        shield=(bar_fraction(crop(frame,self.profile['shield_roi']),'shield') if self.profile.get('shield_roi') else None)
        return Observation(t,damage,dc,motion,health=health,shield=shield,ammo=ammo,ammo_confidence=ac,scene_cut=cut,issues=tuple(issues))
