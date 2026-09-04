// يحاكي llama-server بطيء على الهاتف: ~0.4 وحدة/ثانية مثل سجل المستخدم
import { createServer } from 'node:http';
const reply = 'أهلاً، هذا رد بطيء جداً يحاكي النموذج المحلي على الهاتف.';
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const stream = (() => { try { return JSON.parse(body).stream; } catch { return false; } })();
    if (!stream) { res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ choices:[{ message:{ content:'تم' } }] })); return; }
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    const chunks = reply.match(/.{1,4}/gs) || [];
    let i = 0;
    // أول وحدة بعد 6 ثوانٍ (معالجة البرومبت)، ثم وحدة كل 2.6 ثانية
    setTimeout(() => {
      const t = setInterval(() => {
        if (i >= chunks.length) { res.write('data: [DONE]\n\n'); res.end(); clearInterval(t); return; }
        res.write('data: ' + JSON.stringify({ choices:[{ delta:{ content: chunks[i++] } }] }) + '\n\n');
      }, 2600);
    }, 6000);
  });
}).listen(9922, '127.0.0.1', () => console.log('slow mock on 9922'));
