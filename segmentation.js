/* Model-specific preprocessing, native Android inference, and soft alpha refinement. */
(function (global) {
  'use strict';
  const base = new URL('./anime/', document.currentScript.src).href;
  const models = {
    fast: { name: '动漫 · 快速', file: 'isnet-anime-q8.onnx', size: 44214375, letterbox: true },
    anime: { name: '动漫 · 精细', file: 'isnet-anime-fp32.onnx', size: 176069933, letterbox: true },
    birefnet: { name: '复杂背景 · BiRefNet', file: 'birefnet-lite.onnx', size: 224005088, letterbox: false },
  };
  let session = null, sessionKey = '', runtimePromise = null, running = false;
  function runtime() {
    if (global.ort) return Promise.resolve(global.ort);
    if (!runtimePromise) runtimePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = base + 'ort.min.js';
      script.onload = () => resolve(global.ort); script.onerror = () => { runtimePromise = null; reject(new Error('推理引擎载入失败')); };
      document.head.appendChild(script);
    });
    return runtimePromise;
  }
  async function getSession(key, progress) {
    if (session && sessionKey === key) return session;
    if (session) { await session.release(); session = null; sessionKey = ''; }
    const ort = await runtime();
    ort.env.wasm.wasmPaths = base;
    ort.env.wasm.numThreads = 1;
    const m = models[key];
    progress('读取 ' + m.name + ' 模型…', 0);
    const cached=key==='fast' && global.ARCAM_CUT?.modelBytes ? await global.ARCAM_CUT.modelBytes() : null;
    if(cached) {
      session=await ort.InferenceSession.create(cached,{executionProviders:['wasm']});sessionKey=key;return session;
    }
    const response = await fetch(base + m.file);
    if (!response.ok) throw new Error(m.name + ' 模型文件缺失，请运行模型安装脚本');
    const reader = response.body.getReader(), parts = []; let total = 0;
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      parts.push(value); total += value.length;
      progress('读取模型…', Math.min(1, total / m.size), total, m.size);
    }
    if (total !== m.size) throw new Error('模型文件不完整：' + total + ' / ' + m.size);
    const bytes = new Uint8Array(total); let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.length; }
    progress('初始化精细分割…', null);
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    sessionKey = key; return session;
  }
  // Separable box mean; O(W×H) independent of radius.
  function boxMean(input, w, h, r) {
    const tmp = new Float32Array(w*h), out = new Float32Array(w*h);
    for (let y=0; y<h; y++) {
      let sum=0; for (let k=0;k<=Math.min(r,w-1);k++) sum+=input[y*w+k];
      for(let x=0;x<w;x++) {
        tmp[y*w+x]=sum/(Math.min(w-1,x+r)-Math.max(0,x-r)+1);
        if(x-r>=0) sum-=input[y*w+x-r]; if(x+r+1<w) sum+=input[y*w+x+r+1];
      }
    }
    for(let x=0;x<w;x++) {
      let sum=0; for(let k=0;k<=Math.min(r,h-1);k++) sum+=tmp[k*w+x];
      for(let y=0;y<h;y++) {
        out[y*w+x]=sum/(Math.min(h-1,y+r)-Math.max(0,y-r)+1);
        if(y-r>=0) sum-=tmp[(y-r)*w+x]; if(y+r+1<h) sum+=tmp[(y+r+1)*w+x];
      }
    }
    return out;
  }
  function guidedAlpha(mask, rgb, w, h) {
    const n=w*h, gray=new Float32Array(n), ii=new Float32Array(n), ip=new Float32Array(n);
    for(let p=0;p<n;p++) {
      const i=p*4; gray[p]=(rgb[i]*.2126+rgb[i+1]*.7152+rgb[i+2]*.0722)/255;
      ii[p]=gray[p]*gray[p]; ip[p]=gray[p]*mask[p];
    }
    const meanI=boxMean(gray,w,h,3), meanP=boxMean(mask,w,h,3);
    const meanII=boxMean(ii,w,h,3), meanIP=boxMean(ip,w,h,3);
    const a=new Float32Array(n), b=new Float32Array(n);
    for(let p=0;p<n;p++) {
      a[p]=(meanIP[p]-meanI[p]*meanP[p])/(Math.max(0,meanII[p]-meanI[p]*meanI[p])+.001);
      b[p]=meanP[p]-a[p]*meanI[p];
    }
    const ma=boxMean(a,w,h,3), mb=boxMean(b,w,h,3), out=new Float32Array(n);
    for(let p=0;p<n;p++) {
      const q=ma[p]*gray[p]+mb[p];
      out[p]=Math.max(0,Math.min(1,(q-.02)/.96));
    }
    return out;
  }
  function applyMask(source, mask, w, h) {
    const small=document.createElement('canvas'); small.width=w;small.height=h;
    const g=small.getContext('2d',{willReadFrequently:true}); g.drawImage(source,0,0,w,h);
    const rgb=g.getImageData(0,0,w,h), refined=guidedAlpha(mask,rgb.data,w,h);
    // Estimate foreground color from nearby confident pixels, only at uncertain
    // edges. This reduces white/background-colored fringes without eroding hair.
    const edgeColor=new Int32Array(w*h);edgeColor.fill(-1);
    const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const p=y*w+x;if(refined[p]<=.02 || refined[p]>=.98)continue;
      const i=p*4;let best=Infinity;
      for(let radius=1;radius<=3;radius++)for(const [dx,dy] of directions) {
        const nx=x+dx*radius,ny=y+dy*radius;if(nx<0||nx>=w||ny<0||ny>=h)continue;
        const q=ny*w+nx;if(refined[q]<.98)continue;const j=q*4;
        const score=(rgb.data[i]-rgb.data[j])**2+(rgb.data[i+1]-rgb.data[j+1])**2+(rgb.data[i+2]-rgb.data[j+2])**2+radius*30;
        if(score<best){best=score;edgeColor[p]=(rgb.data[j]<<16)|(rgb.data[j+1]<<8)|rgb.data[j+2];}
      }
    }
    const alpha=g.createImageData(w,h); let count=0;
    for(let p=0;p<w*h;p++) { alpha.data[p*4+3]=Math.round(refined[p]*255); if(refined[p]>.5)count++; }
    g.putImageData(alpha,0,0);
    const result=document.createElement('canvas'); result.width=source.width;result.height=source.height;
    const ctx=result.getContext('2d',{willReadFrequently:true}); ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0);
    const original=ctx.getImageData(0,0,result.width,result.height);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(small,0,0,result.width,result.height);
    ctx.globalCompositeOperation='source-over';
    const corrected=ctx.getImageData(0,0,result.width,result.height),data=corrected.data;
    const sx=w/result.width,sy=h/result.height;
    for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++) {
      const i=(y*result.width+x)*4,a=data[i+3];
      // Existing intentional transparency is not matte contamination.
      if(a<8 || a>247 || original.data[i+3]<250)continue;
      const color=edgeColor[Math.min(h-1,Math.floor(y*sy))*w+Math.min(w-1,Math.floor(x*sx))];if(color<0)continue;
      const mix=(1-a/255)*.65;
      data[i]+=((color>>16&255)-data[i])*mix;
      data[i+1]+=((color>>8&255)-data[i+1])*mix;
      data[i+2]+=((color&255)-data[i+2])*mix;
    }
    ctx.putImageData(corrected,0,0);
    return {canvas:result,fg:count/(w*h)};
  }
  const jobs = new Map(); let nextJob=0;
  global.addEventListener('arcam-native-segmentation', event => {
    const data=event.detail, job=jobs.get(data.id); if(!job)return;
    jobs.delete(data.id);clearTimeout(job.timeout);
    data.error ? job.reject(new Error(data.error)) : job.resolve(data);
  });
  async function nativeMask(source,key,progress) {
    progress('本机精细分割…',null);
    const id=String(++nextJob);
    const result=await new Promise((resolve,reject)=> {
      const timeout=setTimeout(()=>{jobs.delete(id);reject(new Error('本机分割超时，请尝试快速模式'));},180000);
      jobs.set(id,{resolve,reject,timeout});
      try { global.ArcNative.segment(id,key,source.toDataURL('image/png').split(',')[1]); }
      catch(e){clearTimeout(timeout);jobs.delete(id);reject(e);}
    });
    const image=new Image();image.src='data:image/png;base64,'+result.mask;await image.decode();
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const g=c.getContext('2d');g.drawImage(image,0,0);const data=g.getImageData(0,0,c.width,c.height).data;
    const mask=new Float32Array(c.width*c.height);for(let p=0;p<mask.length;p++)mask[p]=data[p*4]/255;
    return {mask,w:c.width,h:c.height};
  }
  async function cut(source,progress=()=>{},key='anime') {
    if(running) throw new Error('另一个抠图任务正在处理');
    if(!models[key])throw new Error('未知分割模型');
    running=true;const start=performance.now();
    try {
      let mask,w,h;
      if(global.ArcNative && typeof global.ArcNative.segment==='function') {
        ({mask,w,h}=await nativeMask(source,key,progress));
      } else {
        if(key==='birefnet') throw new Error('BiRefNet 使用 Android 本机精细引擎；当前可使用动漫精细模式');
        const sess=await getSession(key,progress), m=models[key], ort=global.ort;
        const c=document.createElement('canvas');c.width=c.height=1024;
        const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#000';g.fillRect(0,0,1024,1024);
        const scale=1024/Math.max(source.width,source.height);
        w=m.letterbox?Math.max(1,Math.round(source.width*scale)):1024;
        h=m.letterbox?Math.max(1,Math.round(source.height*scale)):1024;
        const ox=(1024-w)>>1,oy=(1024-h)>>1;
        g.imageSmoothingQuality='high';g.drawImage(source,ox,oy,w,h);
        const data=g.getImageData(0,0,1024,1024).data,n=1024*1024,x=new Float32Array(n*3);
        const mean=m.letterbox?[0,0,0]:[.485,.456,.406],std=m.letterbox?[1,1,1]:[.229,.224,.225];
        for(let p=0;p<n;p++)for(let channel=0;channel<3;channel++)x[p+channel*n]=(data[p*4+channel]/255-mean[channel])/std[channel];
        progress('精细分割中…',null);await new Promise(resolve=>setTimeout(resolve,16));
        const tensor=new ort.Tensor('float32',x,[1,3,1024,1024]);let outputs;
        try { outputs=await sess.run({[sess.inputNames[0]]:tensor}); } finally { tensor.dispose(); }
        const out=outputs[sess.outputNames[0]],raw=out.data;
        mask=new Float32Array(w*h);
        for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++) {
          const v=raw[(y+oy)*1024+xx+ox];mask[y*w+xx]=m.letterbox?v:1/(1+Math.exp(-v));
        }
        for(const value of Object.values(outputs))value.dispose();
      }
      progress('整理发丝与透明边缘…',null);
      const result=applyMask(source,mask,w,h);
      return {...result,model:models[key].name,ms:Math.round(performance.now()-start)};
    } finally { running=false; }
  }
  async function invalidate(key) {
    if(session && sessionKey===key){await session.release();session=null;sessionKey='';}
  }
  global.ARCAM_SEG={cut,models,guidedAlpha,boxMean,invalidate};
})(window);
