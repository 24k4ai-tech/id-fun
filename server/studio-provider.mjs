import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';

const HF='https://api.higgsfield.ai',PI='https://api.piapi.ai';
export function validateGlb(bytes,triangleLimit=800000,character=false) {
  if(bytes.length<24||bytes.length>80*1024*1024||bytes.subarray(0,4).toString()!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.subarray(16,20).toString()!=='JSON')throw new Error('studio_invalid_model');
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  if(!doc.buffers?.length||doc.buffers.some(b=>b.uri)||doc.buffers.length>2||doc.buffers.length===2&&!doc.buffers[1].extensions?.EXT_meshopt_compression?.fallback||doc.images?.some(i=>i.uri)||doc.extensionsRequired?.some(e=>e!=='EXT_meshopt_compression'))throw new Error('studio_invalid_model');
  let triangles=0;for(const mesh of doc.meshes||[])for(const p of mesh.primitives){if((p.mode??4)!==4)throw new Error('studio_invalid_model');triangles+=doc.accessors[p.indices??p.attributes.POSITION].count/3;}
  if(triangles<10||triangles>triangleLimit)throw new Error('studio_invalid_model');
  if(character){const clips=new Set((doc.animations||[]).map(a=>a.name)),nodes=new Set((doc.nodes||[]).map(n=>n.name));
    if(!doc.skins?.length||!['Idle_Loop','Jog_Fwd_Loop','Sword_Attack','Spell_Simple_Shoot','Roll','Hit_Chest','Death01'].every(n=>clips.has(n))||!['weapon_hand_r','weapon_hand_l'].every(n=>nodes.has(n)))throw new Error('studio_invalid_model');}
  return doc;
}
async function download(url,kind){
  const u=new URL(url),allowed=kind==='model'?['img.theapi.app']:['d3u0tzju9qaucj.cloudfront.net','d3snorpfx4xhv8.cloudfront.net'];
  if(u.protocol!=='https:'||u.username||u.password||u.port||!allowed.includes(u.hostname))throw new Error('studio_unexpected_asset_host');
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error('studio_download_unavailable');
  const cap=kind==='model'?80*1024*1024:20*1024*1024,parts=[];let size=0;
  for await(const part of r.body){size+=part.length;if(size>cap)throw new Error('studio_asset_too_large');parts.push(part);}const bytes=Buffer.concat(parts);
  if(kind==='model')validateGlb(bytes);return bytes;
}
export function createStudioProvider(settings) {
  async function request(base,path,body){const u=new URL(path,base);if(u.origin!==base)throw new Error('studio_provider_origin');
    const r=await fetch(u,{method:body?'POST':'GET',headers:{...(base===PI?{'x-api-key':settings.piapiKey}:{Authorization:'Key '+settings.higgsKey}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(60000)});
    const j=await r.json().catch(()=>({}));if(!r.ok||(base===PI&&j.code&&j.code!==200))throw new Error('studio_provider_unavailable');return base===PI?j.data:j;
  }
  return {
    async hasBalance(need){const b=await request(PI,'/account/info');return b.is_enable&&Number(b.equivalent_in_usd)>=need;},
    async image(job,referencePath){
      let reference;
      if(referencePath){const bytes=await sharp(await readFile(referencePath)).png().toBuffer();const slot=await request(HF,'/files/generate-upload-url',{content_type:'image/png'});
        const upload=new URL(slot.upload_url),pub=new URL(slot.public_url);
        if(upload.protocol!=='https:'||pub.protocol!=='https:'||upload.username||upload.password||!(/\.amazonaws\.com$|\.cloudfront\.net$/.test(upload.hostname)))throw new Error('studio_provider_origin');
        const response=await fetch(upload,{method:'PUT',headers:slot.upload_headers,body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('studio_upload_unavailable');reference=pub.href;
      }
      const brief=job.kind==='character'
        ? 'A premium stylized realistic 3D game character reference, exactly one full body person, head to feet visible, relaxed symmetric A-pose with arms separated from torso, fingers separated, feet shoulder width, no weapons or held props. Preserve the uploaded person\'s recognizable face if provided. Detailed clean anatomy, attractive material design, grounded wearable outfit. Neutral plain warm grey background, even studio light, no text, no logos, no watermark. '
        : 'A premium 3D game environment prop reference, one complete small personal pavilion or home with surrounding garden on a compact round island base, three-quarter view with whole structure visible, beautiful fantasy craftsmanship, gold accents, rich but harmonious colors. Plain pale background, no people, no text, no logos, no watermark. ';
      const body={prompt:brief+'Player design: '+job.prompt,aspect_ratio:'3:4',resolution:'2k',quality:'medium',...(reference?{image_urls:[reference]}:{})};
      const j=await request(HF,'/xai/grok-imagine-image-2.0',body);
      if(!j.request_id||!j.status_url)throw new Error('studio_submission_uncertain');return {requestId:j.request_id,statusUrl:j.status_url};
    },
    async imageStatus(data){const j=await request(HF,data.statusUrl);return {state:j.status,url:j.images?.[0]?.url};},
    async saveImage(url,path){const image=await download(url,'image');await sharp(image,{limitInputPixels:20_000_000}).resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png().toFile(path);},
    async mesh(path){const bytes=await readFile(path);const j=await request(PI,'/api/v1/task',{model:'Qubico/trellis2',task_type:'image-to-3d',input:{image:'data:image/png;base64,'+bytes.toString('base64'),seed:42}});if(!j.task_id)throw new Error('studio_submission_uncertain');return {taskId:j.task_id};},
    async rig(path){const bytes=await readFile(path);validateGlb(bytes,80000);const j=await request(PI,'/api/v1/task',{model:'Qubico/skin-tokens',task_type:'rig',input:{model:'data:model/gltf-binary;base64,'+bytes.toString('base64'),seed:42,bone_names:'mixamo'}});if(!j.task_id)throw new Error('studio_submission_uncertain');return {taskId:j.task_id};},
    async taskStatus(data){if(!/^[a-zA-Z0-9-]+$/.test(data.taskId))throw new Error('studio_provider_origin');const j=await request(PI,'/api/v1/task/'+data.taskId);return {state:j.status,url:j.output?.model_file};},
    async saveModel(url,path){await writeFile(path,await download(url,'model'));},
  };
}
