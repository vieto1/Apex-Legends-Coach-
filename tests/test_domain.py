import pytest
from apexcoach.domain import Observation as O, detect

def test_counter_delta_and_combat_debounce():
    events = detect([O(0,100,.9),O(1,120,.9),O(2,140,.9),O(12,140,.9),O(13,155,.9)])
    assert [e.evidence['damage_delta'] for e in events if e.kind=='damage_delta']==[20,20,15]
    assert len([e for e in events if e.kind=='combat_start'])==2
    assert events[0].start==0

def test_unknown_reset_gap_and_implausible_jump_never_count_as_damage():
    values=[O(0,100,.9),O(1,None),O(2,160,.9),O(3,800,.9),O(4,0,.9),O(9,50,.9)]
    assert not detect(values)

def test_low_confidence_breaks_baseline():
    assert not detect([O(0,100,.9),O(1,150,.3),O(2,160,.9)])

def test_movement_needs_sustained_evidence_and_flushes_at_end():
    assert not detect([O(0,minimap_motion=3),O(1,minimap_motion=3)])
    result=detect([O(i,minimap_motion=3) for i in range(3)])
    assert result[0].kind=='position_change'
    assert (result[0].start,result[0].end)==(0,2)
    assert result[0].confidence < .5

def test_timestamp_order():
    with pytest.raises(ValueError): detect([O(2),O(1)])


def test_resources_reload_and_fight_summary():
    events=detect([O(0,100,.9,health=1,shield=1,ammo=5,ammo_confidence=.9),
                   O(1,140,.9,health=.7,shield=.5,ammo=20,ammo_confidence=.9),
                   O(2,140,.9,health=1,shield=1)])
    assert sum(e.kind=='resource_loss' for e in events)==2
    assert sum(e.kind=='resource_recovery' for e in events)==2
    assert any(e.kind=='ammo_refill' for e in events)
    fight=next(e for e in events if e.kind=='fight')
    assert fight.evidence['observed_outgoing_damage']==40
    assert fight.evidence['resource_loss_signals']==2


def test_scene_cut_does_not_invent_damage_or_resource_loss():
    events=detect([O(0,100,.9,health=1),O(1,160,.9,health=.5,scene_cut=True),O(2,160,.9,health=.5)])
    assert not events


def test_movement_is_not_merged_across_gaps():
    assert not detect([O(0,minimap_motion=3),O(1,minimap_motion=3),O(9,minimap_motion=3)])


def test_contextual_insights_reference_actual_signals():
    observations=[O(i,100 if i<2 else 140,.9,minimap_motion=3,
                    health=1 if i<2 else .25,ammo=5 if i<2 else 20,ammo_confidence=.9) for i in range(4)]
    events=detect(observations)
    kinds={e.kind for e in events}
    assert {'exposure_review','reload_pressure','low_health_fight'}<=kinds
    for e in events:
        assert 0<=e.start<=e.end<=3
