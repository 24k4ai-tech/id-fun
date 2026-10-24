import sharp from 'sharp';
import { resolve } from 'node:path';
const [input,output]=process.argv.slice(2);
if(!input||!output||resolve(input)===resolve(output))throw new Error('Use distinct paths');
await sharp(input,{limitInputPixels:20000000}).resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toFile(output);
console.log(JSON.stringify({output,...await sharp(output).metadata()}));
