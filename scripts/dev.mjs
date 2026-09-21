import './build.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('dist');
const types = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'
};
createServer(async (req,res)=>{
  try {
    const url = new URL(req.url,'http://localhost');
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const path = resolve(root,'.'+decodeURIComponent(requested));
    if (!path.startsWith(root+'/')) { res.writeHead(403).end(); return; }
    const body = await readFile(path);
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(3000,()=>console.log('ATTA! local development: http://localhost:3000'));
