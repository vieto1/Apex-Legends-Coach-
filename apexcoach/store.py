from contextlib import contextmanager
import sqlite3
import json
from pathlib import Path

class Store:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / 'coach.sqlite'
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS matches (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
              duration REAL DEFAULT 0, progress REAL DEFAULT 0, error TEXT,
              profile TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY, match_id TEXT REFERENCES matches(id), payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS notes (
              id INTEGER PRIMARY KEY, match_id TEXT REFERENCES matches(id),
              timestamp REAL NOT NULL, body TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS profiles (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, payload TEXT NOT NULL);
            ''')
            columns={r['name'] for r in db.execute('PRAGMA table_info(matches)')}
            if 'summary' not in columns:
                db.execute("ALTER TABLE matches ADD COLUMN summary TEXT NOT NULL DEFAULT '{}'")


    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def update(self, mid, **fields):
        allowed = {'status','duration','progress','error','profile','summary'}
        if not fields.keys() <= allowed:
            raise ValueError('Invalid update')
        with self.connect() as db:
            db.execute('UPDATE matches SET '+', '.join(f'{k}=?' for k in fields)+' WHERE id=?', [*fields.values(), mid])

    def recover(self):
        with self.connect() as db:
            db.execute("UPDATE matches SET status='failed', error='Analyse durch Neustart unterbrochen. Analyse erneut starten.' WHERE status IN ('queued','analyzing')")

    def match(self, mid):
        with self.connect() as db:
            row = db.execute('SELECT * FROM matches WHERE id=?', (mid,)).fetchone()
            if row is None:
                return None
            result = dict(row)
            result['profile'] = json.loads(result['profile'])
            result['summary'] = json.loads(result['summary'])
            result['events'] = [dict(id=r['id'], **json.loads(r['payload'])) for r in db.execute('SELECT * FROM events WHERE match_id=? ORDER BY id', (mid,))]
            result['events'].sort(key=lambda e:(e['start'],e['id']))
            result['notes'] = [dict(r) for r in db.execute('SELECT * FROM notes WHERE match_id=? ORDER BY timestamp', (mid,))]
            return result
