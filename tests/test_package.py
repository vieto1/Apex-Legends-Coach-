import json
import zipfile
from hashlib import sha256
from scripts.package import build


def test_distribution_contains_startup_and_verified_sources_not_private_data(tmp_path):
    archive=build(tmp_path/'Apex-Review.zip')
    with zipfile.ZipFile(archive) as z:
        names=set(z.namelist())
        assert 'Apex-Review/Start-Apex-Review.cmd' in names
        assert 'Apex-Review/Dockerfile' in names
        assert 'Apex-Review/apexcoach/limits.py' in names
        assert not any('/data/' in n or '/.git/' in n or '/.venv/' in n or '__pycache__' in n for n in names)
        manifest=json.loads(z.read('Apex-Review/MANIFEST.sha256.json'))
        for path,digest in manifest.items():
            assert sha256(z.read('Apex-Review/'+path)).hexdigest()==digest
    assert archive.with_suffix('.zip.sha256').read_text().startswith(sha256(archive.read_bytes()).hexdigest())
