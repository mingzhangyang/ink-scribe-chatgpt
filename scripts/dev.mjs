/** Zero-dependency local preview. Live AI requires `npx wrangler dev --remote`. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {handleRequest} from '../worker/router.js';
const root=resolve(import.meta.dirname,'../public');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.PORT)||8787;
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://localhost:${port}`);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await handleRequest(new Request(url, {method:req.method,headers:req.headers,
        ...(req.method==='GET'||req.method==='HEAD'?{}:{body:Buffer.concat(chunks)})}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    let path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!path.startsWith(root+sep) && path!==root){res.writeHead(403);res.end();return;}
    if((await stat(path).catch(()=>null))?.isDirectory())path=resolve(path,'index.html');
    const data=await readFile(path).catch(()=>null);
    if(!data){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(data);
  }catch(e){console.error(e);res.writeHead(500);res.end('Server error');}
});
server.listen(port,()=>console.log(`InkScribe preview: http://localhost:${port} (AI disabled; use Wrangler remote for AI)`));
