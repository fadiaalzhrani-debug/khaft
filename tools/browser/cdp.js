// أداة مشتركة: تفتح صفحة من نسخة الاختبار في Edge بمحاكاة جوال، وتنفّذ خطوات، وتجمع النصوص العربية الظاهرة
const fs=require('fs'), path=require('path'), {spawn,execFileSync}=require('child_process');
const EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(fileUrl,{width=390,height=844,scale=1}={}){
  const PORT=9400+Math.floor(Math.random()*500);
  const prof=path.join(process.env.TEMP,'edgeprof_'+Math.random().toString(36).slice(2));
  const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--allow-file-access-from-files','--remote-debugging-port='+PORT,'--user-data-dir='+prof,'about:blank'],{stdio:'ignore'});
  let target=null;
  for(let k=0;k<80&&!target;k++){ await sleep(250); try{ const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target=l.find(t=>t.type==='page'); }catch(e){} }
  if(!target) throw new Error('no target');
  const ws=new WebSocket(target.webSocketDebuggerUrl); let id=0; const pend=new Map();
  ws.onmessage=m=>{ const d=JSON.parse(m.data); if(d.id&&pend.has(d.id)){ pend.get(d.id)(d); pend.delete(d.id); } };
  await new Promise(r=>ws.onopen=r);
  const cmd=(method,params={})=>new Promise(r=>{ const n=++id; pend.set(n,r); ws.send(JSON.stringify({id:n,method,params})); });
  const ev=async e=>{ const r=await cmd('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if(r.result&&r.result.exceptionDetails) return {__err:(r.result.exceptionDetails.exception||{}).description||r.result.exceptionDetails.text}; return r.result&&r.result.result&&r.result.result.value; };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:true});
  await cmd('Page.navigate',{url:fileUrl});
  const shot=async out=>{ const r=await cmd('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(out,Buffer.from(r.result.data,'base64')); };
  // الإغلاق يقتل شجرة Edge كاملة ويمسح ملف التعريف المؤقت (قبلها كان يقتل الأب بس، فتتراكم مئات النسخ وتعبّي C:)
  //  أولًا Browser.close من منفذ المتصفح نفسه (Edge الجديد يطلع من الأب، فقتل الأب ما يكفي)، وبعدها أي نسخة باقية بنفس ملف التعريف
  const close=async()=>{
    try{
      const v=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      await new Promise(res=>{ const bw=new WebSocket(v.webSocketDebuggerUrl); bw.onopen=()=>{ bw.send(JSON.stringify({id:1,method:'Browser.close'})); setTimeout(res,500); }; bw.onerror=res; setTimeout(res,2500); });
    }catch(e){}
    try{ws.close()}catch(e){}
    try{ edge.kill(); }catch(e){}
    try{ execFileSync('powershell',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(prof)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],{stdio:'ignore'}); }catch(e){}
    try{ fs.rmSync(prof,{recursive:true,force:true,maxRetries:8,retryDelay:250}); }catch(e){}
  };
  return {ev,cmd,shot,close,sleep};
}
// تنظيف ملفات تعريف قديمة تركتها تشغيلات سابقة (أقدم من ساعتين، والمستخدَم حاليًا يفشل حذفه بصمت)
try{
  for(const n of fs.readdirSync(process.env.TEMP)){
    if(!n.startsWith('edgeprof_')) continue;
    const p=path.join(process.env.TEMP,n);
    try{ if(Date.now()-fs.statSync(p).mtimeMs>2*3600e3) fs.rmSync(p,{recursive:true,force:true}); }catch(e){}
  }
}catch(e){}
const COLLECT=`(()=>{ const AR=/[\\u0600-\\u06FF]/; const out=[];
  const vis=el=>{ if(!el) return false; if(el.closest('script,style,noscript,.notr')) return false; const r=el.getClientRects(); if(!r.length) return false; const cs=getComputedStyle(el); return cs.visibility!=='hidden' && cs.display!=='none' && +cs.opacity!==0; };
  const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while(n=w.nextNode()){ const v=n.nodeValue.replace(/\\s+/g,' ').trim(); if(!v||!AR.test(v)) continue; if(!vis(n.parentElement)) continue; out.push(v); }
  document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{ if(!vis(el)) return; ['placeholder','title','aria-label'].forEach(a=>{ const v=el.getAttribute(a); if(v&&AR.test(v)) out.push('@'+a+'='+v); }); });
  return [...new Set(out)]; })()`;
module.exports={open,COLLECT,sleep};
