"""Validate the complete analysis without network or external services."""
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from apexcoach.store import Store
from apexcoach.pipeline import analyze
from scripts.demo import create_demo,PROFILE

with TemporaryDirectory(prefix='apex-offline-') as directory:
    store=Store(Path(directory)/'reviews')
    mid='offline-smoke'
    folder=store.root/mid
    folder.mkdir()
    create_demo(folder/'input.mp4').rename(folder/'source')
    with store.connect() as db:
        db.execute('INSERT INTO matches(id,name,status,profile) VALUES (?,?,?,?)',
                   (mid,'Synthetic offline test','queued',json.dumps(PROFILE)))
    analyze(store,mid,PROFILE)
    match=store.match(mid)
    assert match['status']=='ready',match['error']
    kinds={e['kind'] for e in match['events']}
    assert {'combat_start','damage_delta','position_change','resource_loss','resource_recovery','ammo_refill','fight'}<=kinds,kinds
    assert match['summary']['observed_outgoing_damage']==90
    print(json.dumps({'status':'passed','event_types':sorted(kinds),'summary':match['summary']}))
