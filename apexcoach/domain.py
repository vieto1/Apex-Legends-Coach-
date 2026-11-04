"""Pure event logic. Unknown observations remain None, never zero."""
from dataclasses import dataclass, asdict

@dataclass
class Observation:
    t: float
    damage: int | None = None
    damage_confidence: float = 0
    minimap_motion: float | None = None
    source: str = 'video'
    health: float | None = None
    shield: float | None = None
    ammo: int | None = None
    ammo_confidence: float = 0
    scene_cut: bool = False
    issues: tuple[str,...] = ()

@dataclass
class Event:
    kind: str
    start: float
    end: float
    title: str
    evidence: dict
    advice: str
    confidence: float


def detect(observations: list[Observation]) -> list[Event]:
    events = []
    baseline = None
    last_combat = -100.0
    movement = []
    last_t = -1.0
    for o in observations:
        if o.t <= last_t:
            raise ValueError('Observations must have strictly increasing timestamps')
        gap = o.t - last_t
        last_t = o.t
        if o.scene_cut or gap > 3:
            baseline = None
            if len(movement) >= 3:
                events.append(movement_event(movement))
            movement = []
        if o.scene_cut:
            continue
        # Two consecutive credible samples establish a counter change. Large jumps,
        # resets and unreadable gaps reset the baseline instead of inventing damage.
        if o.damage is not None and o.damage_confidence >= .65:
            if baseline and o.t - baseline.t <= 3:
                delta = o.damage - baseline.damage
                if 0 < delta <= 300:
                    evidence = {'counter_before': baseline.damage, 'counter_after': o.damage,
                                'damage_delta': delta, 'sample_start': baseline.t,
                                'sample_end': o.t, 'source': o.source,
                                'limitation': 'OCR counter delta; damage received and target unknown'}
                    if o.t - last_combat > 8:
                        events.append(Event('combat_start', baseline.t, o.t,
                            'Möglicher Kampfbeginn', evidence,
                            'Clip prüfen: War Deckung verfügbar und das Team bereit?', min(.85, o.damage_confidence)))
                    events.append(Event('damage_delta', baseline.t, o.t,
                        f'+{delta} abgelesener Schaden', evidence,
                        'Prüft den Trade gemeinsam. Eingehender Schaden ist hier unbekannt.', o.damage_confidence))
                    last_combat = o.t
            baseline = o
        else:
            baseline = None
        if o.minimap_motion is not None and o.minimap_motion > 1.8:
            movement.append(o)
        else:
            if len(movement) >= 3:
                events.append(movement_event(movement))
            movement = []
    if len(movement) >= 3:
        events.append(movement_event(movement))
    events.extend(resource_events(observations))
    events.extend(fight_events(events))
    events.extend(contextual_insights(events,observations))
    return sorted(events, key=lambda e: (e.start, e.kind))


def movement_event(samples):
    return Event('position_change', samples[0].t, samples[-1].t,
        'Möglicher Positionswechsel',
        {'median_flow_px': [round(s.minimap_motion, 2) for s in samples],
         'source': 'minimap optical flow',
         'limitation': 'Map rotation, zoom, overlays and spectator views can mimic movement; no world coordinates'},
        'Clip prüfen: Welche Deckung und welcher Rückweg waren nach der Rotation verfügbar?', .45)


def serialize(event):
    return asdict(event)


def resource_events(observations):
    events = []
    previous = None
    for o in observations:
        if previous is not None and not o.scene_cut and not previous.scene_cut and o.t-previous.t <= 3:
            for name, label in [('health','Gesundheit'),('shield','Schild')]:
                before, after = getattr(previous,name), getattr(o,name)
                if before is None or after is None:
                    continue
                delta = after-before
                if abs(delta) >= .15:
                    loss = delta < 0
                    events.append(Event('resource_loss' if loss else 'resource_recovery',previous.t,o.t,
                        f'{label}: möglicher Verlust' if loss else f'{label}: mögliche Wiederherstellung',
                        {'resource':name,'before_fraction':round(before,3),'after_fraction':round(after,3),
                         'source':'calibrated HUD bar color occupancy',
                         'limitation':'Relative visible fill, not damage points. HUD animation, armor swap or occlusion can change the reading.'},
                        'Prüfen: War Deckung erreichbar und wäre Heilen oder ein Schildwechsel sinnvoll gewesen?' if loss else
                        'Prüfen: War das Zeitfenster zum Heilen oder Schildwechsel ausreichend abgesichert?',.5))
            if o.ammo is not None and previous.ammo is not None and min(o.ammo_confidence,previous.ammo_confidence)>=.65:
                if o.ammo-previous.ammo >= 5:
                    events.append(Event('ammo_refill',previous.t,o.t,'Mögliches Nachladen / Waffenwechsel',
                        {'ammo_before':previous.ammo,'ammo_after':o.ammo,'source':'ammo HUD OCR',
                         'limitation':'Weapon changes and magazine upgrades can mimic reloads; not a confirmed reload.'},
                        'Prüfen: War das Nachladen gedeckt oder wäre ein Waffenwechsel schneller gewesen?',.5))
        previous = o
    return events


def fight_events(events):
    signals = sorted([e for e in events if e.kind in ('damage_delta','resource_loss')],key=lambda e:e.start)
    groups=[]
    for e in signals:
        if not groups or e.start-groups[-1][-1].end>8:
            groups.append([e])
        else:
            groups[-1].append(e)
    result=[]
    for group in groups:
        outgoing=sum(e.evidence['damage_delta'] for e in group if e.kind=='damage_delta')
        result.append(Event('fight',group[0].start,group[-1].end,'Kampfphase zum Review',
            {'observed_outgoing_damage':outgoing,'resource_loss_signals':sum(e.kind=='resource_loss' for e in group),
             'source':'grouped HUD signals, gap <= 8 seconds',
             'limitation':'Incomplete counter observations; incoming damage, enemy visibility and kill outcome unknown.'},
            'Gemeinsam prüfen: Einstieg, Fokusziel, Deckung, Rückzug und Ressourcen. Was war die erste vermeidbare Entscheidung?',.55))
    return result


def summarize(observations, events):
    count=len(observations)
    return {'sample_count':count,'damage_readable_fraction':round(sum(o.damage is not None and o.damage_confidence>=.65 for o in observations)/max(count,1),3),
            'scene_cuts':sum(o.scene_cut for o in observations),
            'ocr_timeout_count':sum('timeout' in issue for o in observations for issue in o.issues),
            'fight_count':sum(e.kind=='fight' for e in events),
            'observed_outgoing_damage':sum(e.evidence['damage_delta'] for e in events if e.kind=='damage_delta'),
            'limitations':['Heuristische Signale, keine verifizierte Telemetrie.',
                           'Reaktionszeiten benötigen manuell markierte Sichtkontakt- und Schusszeitpunkte.',
                           'Kartenbewegung belegt keine sichere Weltposition oder Rotationsqualität.']}


def contextual_insights(events,observations):
    """Evidence-linked questions, never a causal claim or player score."""
    insights=[]
    losses=[e for e in events if e.kind=='resource_loss']
    for movement in [e for e in events if e.kind=='position_change']:
        overlap=[e for e in losses if e.start<=movement.end and e.end>=movement.start]
        if overlap:
            insights.append(Event('exposure_review',movement.start,movement.end,
                'Ressourcenverlust während möglicher Bewegung',
                {'movement_window':[movement.start,movement.end],
                 'resource_loss_windows':[[e.start,e.end,e.evidence['resource']] for e in overlap],
                 'source':'overlapping minimap movement and calibrated resource observations',
                 'limitation':'Temporal overlap does not prove poor positioning or incoming fire.'},
                'Prüft diese Route im Clip: Gab es eine kürzere Strecke zwischen Deckungen oder einen sicheren Rückweg?',.4))
    for refill in [e for e in events if e.kind=='ammo_refill']:
        nearby=[e for e in losses if e.start<=refill.end+2 and e.end>=refill.start-2]
        if nearby:
            insights.append(Event('reload_pressure',max(0,refill.start-2),min(observations[-1].t,refill.end+2),
                'Munitionsauffüllung nahe Ressourcenverlust',
                {'ammo_window':[refill.start,refill.end],
                 'resource_loss_windows':[[e.start,e.end] for e in nearby],
                 'source':'temporally neighboring HUD signals',
                 'limitation':'Reload and incoming damage are not confirmed; weapon swap is possible.'},
                'Prüft den Clip: Hätte Deckung vor dem Nachladen oder der Wechsel zur Zweitwaffe die Situation verbessert?',.4))
    # Limit low-health prompts to one per fight to avoid flooding the timeline.
    for fight in [e for e in events if e.kind=='fight']:
        low=next((o for o in observations if fight.start<=o.t<=fight.end and o.health is not None and o.health<=.35 and not o.scene_cut),None)
        if low:
            insights.append(Event('low_health_fight',low.t,low.t,
                'Niedriger Lebensbalken in einer Kampfphase',
                {'health_fraction':round(low.health,3),'fight_window':[fight.start,fight.end],
                 'source':'calibrated health bar and grouped combat signals',
                 'limitation':'Visible bar fraction; no exact HP, cover visibility or causal mistake classification.'},
                'Hier pausieren: Welche Option war besser begründbar — Druck halten, zurückziehen oder Ressourcen auffüllen?',.45))
    return insights
