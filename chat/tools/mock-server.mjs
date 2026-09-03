// خادم وهمي متوافق مع OpenAI للتحقّق من مسار البثّ end-to-end
import { createServer } from 'node:http';
const reply = 'أهلاً! هذا رد تجريبي من خادم وهمي.\n\n```python\nprint("مرحبا")\n```\n\nيعمل البثّ بشكل صحيح.';
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.url.endsWith('/models')) {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ data: [{id:'mock-small'},{id:'mock-large'}] })); return;
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const stream = (() => { try { return JSON.parse(body).stream; } catch { return false; } })();
    if (!stream) {
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ choices:[{ message:{ role:'assistant', content: reply } }] }));
      return;
    }
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    const chunks = reply.match(/.{1,6}/gs) || [];
    let i = 0;
    const t = setInterval(() => {
      if (i >= chunks.length) { res.write('data: [DONE]\n\n'); res.end(); clearInterval(t); return; }
      res.write('data: ' + JSON.stringify({ choices:[{ delta:{ content: chunks[i++] } }] }) + '\n\n');
    }, 12);
  });
}).listen(9911, '127.0.0.1', () => console.log('mock on 9911'));
