// تشغيل استعلام SELECT واحد على قاعدة البيانات الحية وطباعة الصفوف
// usage: node q.js "select ..."   أو   node q.js -f file.sql
const fs=require('fs'), path=require('path'), {execSync}=require('child_process');
const a=process.argv.slice(2);
const sql=a[0]==='-f'?fs.readFileSync(a[1],'utf8'):a.join(' ');
const tmp=path.join(__dirname,'_q_'+process.pid+'.sql');
fs.writeFileSync(tmp,sql);
let out='';
try{ out=execSync(`supabase db query --linked -f "${tmp}"`,{cwd:process.cwd(),encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024}); }
catch(e){ out=(e.stdout||'')+(e.stderr||''); }
fs.unlinkSync(tmp);
const i=out.indexOf('{');
try{ const j=JSON.parse(out.slice(i)); if(j.rows){ for(const r of j.rows){ const keys=Object.keys(r); if(keys.length===1) console.log(String(r[keys[0]])); else console.log(JSON.stringify(r)); } } else console.log(out); }
catch(e){ console.log(out); }
