"""Create a portable source distribution without private recordings or secrets."""
from hashlib import sha256
from pathlib import Path
import json
import zipfile

ROOT=Path(__file__).resolve().parents[1]
FILES=['README.md','SO-STARTEN.md','Dockerfile','compose.yaml','.dockerignore','.gitignore',
       'package.json','package-lock.json','requirements.txt','requirements-dev.txt','Start-Apex-Review.cmd','Stop-Apex-Review.cmd','start-local.sh']
DIRECTORIES=['apexcoach','browser','.github','scripts','tests','docs']

def build(output=None):
    target=Path(output) if output else ROOT/'artifacts'/'Apex-Review.zip'
    target.parent.mkdir(parents=True,exist_ok=True)
    files=[ROOT/f for f in FILES]
    for name in DIRECTORIES:
        files.extend(p for p in (ROOT/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix.lower() in {'.py','.js','.mjs','.cjs','.sh','.md','.css','.html','.json','.yml','.yaml'} or (p.is_file() and p.parent==ROOT/'browser' and p.suffix=='.mp4'))
    files=sorted(set(files))
    manifest={p.relative_to(ROOT).as_posix():sha256(p.read_bytes()).hexdigest() for p in files}
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            info=zipfile.ZipInfo('Apex-Review/'+path.relative_to(ROOT).as_posix(),date_time=(2026,1,1,0,0,0))
            info.external_attr=(0o100755 if path.suffix=='.sh' else 0o100644)<<16
            info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,path.read_bytes())
        archive.writestr('Apex-Review/MANIFEST.sha256.json',json.dumps(manifest,indent=2))
    digest=sha256(target.read_bytes()).hexdigest()
    target.with_suffix('.zip.sha256').write_text(f'{digest}  {target.name}\n',encoding='utf-8')
    print(f'{target} ({target.stat().st_size} bytes)')
    return target

if __name__=='__main__':
    build()
