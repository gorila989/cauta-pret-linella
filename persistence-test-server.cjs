const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const seed = {generated_at:'2026-01-01 00:00:00', products:[{name:'Persistence A',price:1,category_slug:'lapte',url:'test:A'}]};
http.createServer((req,res)=>{
  const route = new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  if(route.startsWith('/api/') || route==='/products.json') {
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(route==='/api/manifest'?{generated_at:seed.generated_at}:seed));
    return;
  }
  const filename = path.join(__dirname,route==='/'?'index.html':route);
  if(!filename.startsWith(__dirname+path.sep)){res.writeHead(403);res.end();return;}
  const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'};
  res.setHeader('Content-Type',types[path.extname(filename)]||'text/plain');
  fs.readFile(filename,(err,data)=>{res.statusCode=err?404:200;res.end(err?'not found':data);});
}).listen(8765,'127.0.0.1',()=>console.log('Persistence test server 8765'));
