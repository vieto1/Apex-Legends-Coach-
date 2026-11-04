from apexcoach.review import review_metrics,markdown_report

def test_manual_response_intervals_exclude_dismissed_and_automatic_marks():
    base={'origin':'manual','review':'confirmed','end':0,'title':'Test','evidence':{},'advice':''}
    match={'name':'Test','duration':10,'notes':[], 'events':[
        dict(base,kind='enemy_visible',start=1),dict(base,kind='first_shot',start=1.75),
        dict(base,kind='enemy_visible',start=3,review='dismissed'),
        dict(base,kind='first_shot',start=4)]}
    metrics=review_metrics(match)
    assert metrics['manual_response_intervals']==[{'start':1,'end':1.75,'seconds':.75,'source':'manual video annotations','limitation':'Annotation interval, not measured cognitive reaction time'}]
    assert metrics['dismissed']==1
    assert '1.00' in markdown_report(match)
