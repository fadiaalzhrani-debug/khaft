# أدوات مساعدة

- `browser/cdp.js`: يفتح Microsoft Edge بدون واجهة عبر CDP لأخذ لقطات شاشة وتنفيذ JS في الصفحة (`const {open} = require("./tools/browser/cdp.js")`). يحتاج Edge مثبتًا على ويندوز؛ على ماك عدّل مسار المتصفح في أول الملف.
- `db/q.js`: يشغّل استعلام SELECT على قاعدة خافت بعد `supabase login` و`supabase link --project-ref zulogtqxbuqxmdmjpzqj` من داخل مجلد المستودع: `node tools/db/q.js "select count(*) from khafet_orders"`. للقراءة فقط.
