import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'docs');
const port = Number(process.argv[3] ?? 8765);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
};

http.createServer((req, res) => {
  const rel = decodeURI((req.url ?? '/').split('?')[0]);
  let file = path.join(root, rel);
  if (rel.endsWith('/') || !path.extname(rel)) file = path.join(file, 'index.html');
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(`Not found: ${rel}`); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}`));
