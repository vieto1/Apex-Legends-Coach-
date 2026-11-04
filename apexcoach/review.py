"""Review metrics and portable reports; no speculative tactical scoring."""
import json

def review_metrics(match):
    events=match['events']
    active=[e for e in events if e.get('review','unreviewed')!='dismissed']
    enemy=None
    reactions=[]
    for event in sorted(active,key=lambda e:e['start']):
        if event.get('origin')!='manual':
            continue
        if event['kind']=='enemy_visible':
            enemy=event
        elif event['kind']=='first_shot' and enemy is not None:
            delta=event['start']-enemy['start']
            if 0<=delta<=30:
                reactions.append({'start':enemy['start'],'end':event['start'],'seconds':round(delta,3),
                                  'source':'manual video annotations','limitation':'Annotation interval, not measured cognitive reaction time'})
            enemy=None
    return {'confirmed':sum(e.get('review')=='confirmed' for e in events),
            'dismissed':sum(e.get('review')=='dismissed' for e in events),
            'unreviewed':sum(e.get('review','unreviewed')=='unreviewed' for e in events),
            'manual_response_intervals':reactions}


def markdown_report(match):
    lines=['# Apex Review',f"Aufnahme: {match['name']}",f"Dauer: {match['duration']:.1f} s",'',
           'Heuristische Signale; keine verifizierte Spieltelemetrie. Zeitangaben beziehen sich auf das Originalvideo.',
           'Clips: API /api/matches/<id>/clips/<event-id>; im Downloadarchiv sind nur Bericht und Beobachtungen enthalten.','',
           '## Ereignisse']
    for event in match['events']:
        lines.extend([f"### {event['start']:.2f}–{event['end']:.2f} s: {event['title']}",
                      f"Review: {event.get('review','unreviewed')} · Herkunft: {event.get('origin','auto')}",
                      event['advice'], '```json',json.dumps(event['evidence'],ensure_ascii=False,indent=2),'```',''])
    lines.append('## Squad-Notizen')
    lines.extend(f"- {n['timestamp']:.2f} s: {n['body']}" for n in match['notes'])
    lines.extend(['','## Manuell markierte Antwortintervalle',json.dumps(review_metrics(match)['manual_response_intervals'],ensure_ascii=False,indent=2)])
    return '\n'.join(lines)
