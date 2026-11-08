"""Desktop CPU simulation of NativeCutout's model and tensor contract."""
import base64, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort
root=Path(__file__).resolve().parents[1]
request=json.load(sys.stdin)
key=request['key']
files={'fast':'isnet-anime-q8.onnx','anime':'isnet-anime-fp32.onnx','birefnet':'birefnet-lite.onnx'}
if key not in files: raise ValueError('Unknown model')
source=Image.open(io.BytesIO(base64.b64decode(request['image']))).convert('RGBA')
rgb=Image.new('RGBA',source.size,(0,0,0,255));rgb.alpha_composite(source);rgb=rgb.convert('RGB')
letterbox=key!='birefnet';scale=1024/max(rgb.size)
w,h=(max(1,int(rgb.width*scale+.5)),max(1,int(rgb.height*scale+.5))) if letterbox else (1024,1024)
ox,oy=(1024-w)//2,(1024-h)//2
square=Image.new('RGB',(1024,1024));square.paste(rgb.resize((w,h),Image.Resampling.BILINEAR),(ox,oy))
x=np.asarray(square,dtype=np.float32)/255
if not letterbox:x=(x-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1;options.log_severity_level=3
sess=ort.InferenceSession(str(root/'anime'/files[key]),options,providers=['CPUExecutionProvider'])
mask=sess.run(None,{sess.get_inputs()[0].name:np.transpose(x,(2,0,1))[None].copy()})[0].squeeze()
if not letterbox:mask=1/(1+np.exp(-np.clip(mask,-80,80)))
mask=mask[oy:oy+h,ox:ox+w]
output=io.BytesIO();Image.fromarray(np.uint8(np.clip(mask,0,1)*255),'L').save(output,format='PNG')
json.dump({'id':request['id'],'mask':base64.b64encode(output.getvalue()).decode()},sys.stdout)
