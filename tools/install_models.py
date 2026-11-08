"""Install verified weights with the official Hugging Face Hub client or a local file."""
import argparse, hashlib, json, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--anime-source',type=Path,help='Local original ISNet-anime ONNX file')
parser.add_argument('--redownload-birefnet',action='store_true')
args=parser.parse_args()
models=json.loads((root/'anime/models.json').read_text(encoding='utf-8'))
def digest(file):
    result=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(4*1024*1024),b''):result.update(chunk)
    return result.hexdigest()
def valid(file,spec):
    return file.exists() and file.stat().st_size==spec['bytes'] and digest(file)==spec['sha256']
for key,spec in models.items():
    target=root/'anime'/spec['file']
    if valid(target,spec) and not(key=='birefnet' and args.redownload_birefnet):
        print('Verified:',target.name,flush=True);continue
    if key=='birefnet':
        from huggingface_hub import hf_hub_download
        source=Path(hf_hub_download(repo_id=spec['repo'],filename=spec['remote_file'],revision=spec['revision'],local_dir=root/'research/hf-download'))
    elif key=='anime' and args.anime_source:
        source=args.anime_source
    else:
        raise SystemExit('Missing or invalid '+target.name+'. Supply the original local file; anime precision accepts --anime-source.')
    if not valid(source,spec):raise SystemExit('Model checksum failed: '+str(source))
    if source.resolve()!=target.resolve():shutil.copy2(source,target)
    print('Installed and verified:',target.name,flush=True)
