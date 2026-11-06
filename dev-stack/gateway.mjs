// Mimics the Supabase API gateway: /auth/v1 -> Auth server, /rest/v1 -> PostgREST.
import http from 'node:http';
const routes = [['/auth/v1', 9999], ['/rest/v1', 3001]];
http.createServer((req, res) => {
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
    return res.end();
  }
  if (!r) { res.statusCode = 404; return res.end('no route'); }
  const up = http.request({ host: '127.0.0.1', port: r[1], path: req.url.slice(r[0].length) || '/', method: req.method, headers: req.headers }, (u) => {
    res.writeHead(u.statusCode, { ...u.headers, 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' });
    u.pipe(res);
  });
  up.on('error', (e) => { res.statusCode = 502; res.end(String(e)); });
  req.pipe(up);
}).listen(54321, () => console.log('gateway on 54321'));
