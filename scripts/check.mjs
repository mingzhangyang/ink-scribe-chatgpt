import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const files = [];
async function visit(dir) {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const path = join(dir,entry.name);
    if(entry.isDirectory()) await visit(path);
    else if(/\.(m?js)$/.test(entry.name)) files.push(path);
  }
}
for(const dir of ['public','worker','scripts','tests']) await visit(join(root,dir));
for(const path of files) {
  execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
  const source = await readFile(path,'utf8');
  for(const match of source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(path),match[1]);
    if(!files.includes(target))throw new Error(`${relative(root,path)} imports missing file ${match[1]}`);
    if(relative(join(root,'public'),path).startsWith('assets/') && !target.startsWith(join(root,'public'))) {
      throw new Error(`Browser module accesses private file: ${relative(root,path)}`);
    }
  }
}
const html = await readFile(join(root,'public/index.html'),'utf8');
for(const name of ['assets/app.js','assets/style.css','favicon.svg']) {
  if(!html.includes(`/${name}`))throw new Error(`HTML missing asset ${name}`);
}
const wrangler = JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'));
if (wrangler.assets?.binding!=='ASSETS' || !wrangler.ai ||
    !wrangler.assets.run_worker_first?.includes('/api/*') || !wrangler.ratelimits?.length) {
  throw new Error('Wrangler bindings/routing are incomplete');
}
console.log(`Static checks passed (${files.length} JS modules; Worker assets and AI bindings configured).`);
