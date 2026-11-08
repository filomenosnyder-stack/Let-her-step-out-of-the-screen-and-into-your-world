"""Local model comparison using known-alpha composites and real illustrations."""
import json, time, os
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(os.environ['ARCAM_FIXTURES']) if os.environ.get('ARCAM_FIXTURES') else None
OUT = ROOT / 'artifacts' / 'model-comparison'
OUT.mkdir(parents=True, exist_ok=True)
resample = Image.Resampling.LANCZOS
fg = Image.open(ROOT / 'chars/立绘/全身2.png').convert('RGBA')
fg.thumbnail((380, 720), resample)
cases = []
for name, color in [('bright', (225, 222, 214)), ('dark', (35, 43, 55))]:
    bg = Image.new('RGB', (700, 800), color)
    draw = ImageDraw.Draw(bg)
    for y in range(0, 800, 40): draw.line((0, y, 700, y + 90), fill=tuple(min(255, x + 16) for x in color), width=12)
    at = ((700 - fg.width)//2, 800 - fg.height)
    bg.paste(fg, at, fg)
    gt = Image.new('L', bg.size); gt.paste(fg.getchannel('A'), at)
    cases.append((name, bg, np.asarray(gt)/255))
for name in ['c1.jpg', 'c3.jpg']:
    if FIXTURES and (FIXTURES/'_models'/name).exists():
        cases.append((name[:-4], Image.open(FIXTURES/'_models'/name).convert('RGB'), None))

configs = [
    ('old-q8', ROOT/'anime/isnet-anime-q8.onnx', True, True),
    ('anime-q8-fixed', ROOT/'anime/isnet-anime-q8.onnx', False, True),
    ('anime-fp32', ROOT/'anime/isnet-anime-fp32.onnx', False, True),
    ('birefnet-lite', ROOT/'anime/birefnet-lite.onnx', True, False),
]
rows, results = {}, []
for title, path, normalize, letterbox in configs:
    opts = ort.SessionOptions(); opts.intra_op_num_threads = 4; opts.log_severity_level = 3
    sess = ort.InferenceSession(str(path), opts, providers=['CPUExecutionProvider'])
    row = []
    for name, image, gt in cases:
        w,h = image.size
        if letterbox:
            scale=1024/max(w,h); nw,nh=round(w*scale),round(h*scale)
            ox,oy=(1024-nw)//2,(1024-nh)//2
            small=np.asarray(image.resize((nw,nh),resample),dtype=np.float32)/255
            x=np.pad(small,((oy,1024-nh-oy),(ox,1024-nw-ox),(0,0)),mode='edge' if normalize else 'constant')
        else:
            x=np.asarray(image.resize((1024,1024),resample),dtype=np.float32)/255
        if normalize: x=(x-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
        x=np.transpose(x,(2,0,1))[None].copy()
        start=time.perf_counter(); mask=sess.run(None,{sess.get_inputs()[0].name:x})[0].squeeze()
        ms=round((time.perf_counter()-start)*1000)
        if not letterbox: mask=1/(1+np.exp(-np.clip(mask,-80,80)))
        else: mask=mask[oy:oy+nh,ox:ox+nw]
        mask=np.asarray(Image.fromarray(mask.astype(np.float32),'F').resize(image.size,Image.Resampling.BILINEAR))
        pred=mask>.5
        metrics={'model':title,'image':name,'ms':ms,'fg':round(float(pred.mean()),4)}
        if gt is not None:
            truth=gt>.5
            metrics['iou']=round(float((pred&truth).sum()/max(1,(pred|truth).sum())),4)
            metrics['mae']=round(float(np.abs(mask-gt).mean()),4)
        results.append(metrics); print(json.dumps(metrics),flush=True)
        maskimg=Image.fromarray(np.uint8(np.clip(mask,0,1)*255),'L')
        cut=image.copy().convert('RGBA'); cut.putalpha(maskimg)
        cut.save(OUT/f'{title}-{name}.png')
        checker=Image.new('RGB',image.size,(75,78,84))
        checker.paste(cut,(0,0),cut); checker.thumbnail((300,360),resample)
        tile=Image.new('RGB',(310,400),(18,24,30)); tile.paste(checker,((310-checker.width)//2,30))
        ImageDraw.Draw(tile).text((8,8),f'{title} / {name}',fill='white')
        row.append(tile)
    rows[title]=row
    del sess
sheet=Image.new('RGB',(310*len(cases),400*len(rows)),(18,24,30))
for y,tiles in enumerate(rows.values()):
    for x,tile in enumerate(tiles): sheet.paste(tile,(x*310,y*400))
sheet.save(OUT/'comparison.jpg')
(OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
