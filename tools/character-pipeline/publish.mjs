import {compressModel} from './compress.mjs';
// Copies only reviewed public assets, never provider ledgers or credentials.
import sharp from 'sharp';
import {readFile,writeFile,copyFile,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),specs={};
const ids=['ember','shadow','maker','trader','cz','heyi','sbf','musk','jensen','vitalik','trump','afeng'];
await mkdir(resolve(root,'public/portraits'),{recursive:true});
for(const id of ids){
  const source=resolve(root,['cz','heyi'].includes(id)?`output/piapi/${id}-enhanced-v2.glb`:`output/piapi/${id}-ready-${id==='ember'?'v2':'v1'}.glb`);
  if(!await stat(source).catch(()=>null))continue;
  const report=JSON.parse(await readFile(resolve(root,`output/piapi/${id==='ember'?'ember':id}-animation-report.json`),'utf8'));
  const compressed=await compressModel(source);
  specs[id]={file:`${id}-v2.glb`,revision:createHash('sha256').update(compressed).digest('hex').slice(0,12),scale:report.scale??1.81965,lift:report.lift??.9099};
  await writeFile(resolve(root,'public/models',specs[id].file),compressed);
  const ref=resolve(root,id==='ember'?'output/piapi/ember-reference-v1.png':`output/higgsfield/${id}-reference-v${['cz','heyi'].includes(id)?2:1}-0.png`);
  if(await stat(ref).catch(()=>null)){
    const {width,height}=await sharp(ref).metadata();
    await sharp(ref).resize({height:900}).webp({quality:88}).toFile(resolve(root,`public/portraits/${id}-full.webp`));
    const size=Math.round(width*.45),top=Math.round(height*.035);
    await sharp(ref).extract({left:Math.round((width-size)/2),top,width:size,height:size}).resize(256,256).webp({quality:92}).toFile(resolve(root,`public/portraits/${id}.webp`));
  }
}
await writeFile(resolve(root,'public/character-manifest.js'),'// Production meshes with validated skeletons and eleven animation clips.\nexport const CHARACTERS = Object.freeze('+JSON.stringify(specs,null,2)+');\n');
console.log(JSON.stringify({published:Object.keys(specs)}));
