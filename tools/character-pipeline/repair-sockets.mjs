import {NodeIO} from '@gltf-transform/core';
import {resolve} from 'node:path';
import {stat} from 'node:fs/promises';
const io=new NodeIO(),root=resolve(import.meta.dirname,'../..');
for(const id of ['ember','shadow','maker','trader','cz','heyi','sbf','musk','jensen','vitalik','trump','afeng']){
  const path=resolve(root,`output/piapi/${id}-ready-${id==='ember'?'v2':'v1'}.glb`);if(!await stat(path).catch(()=>null))continue;
  const doc=await io.read(path),source=await io.read(resolve(root,`output/piapi/${id}-animated-v1.glb`));
  for(const side of ['r','l']){
    const name='weapon_hand_'+side;if(doc.getRoot().listNodes().some(n=>n.getName()===name))continue;
    const socket=source.getRoot().listNodes().find(n=>n.getName()===name),hand=doc.getRoot().listNodes().find(n=>n.getName()==='hand_'+side);
    if(!socket||!hand)throw new Error('Missing verified socket: '+id);
    hand.addChild(doc.createNode(name).setTranslation(socket.getTranslation()).setRotation(socket.getRotation()).setScale(socket.getScale()));
  }
  await io.write(path,doc);console.log(id+' sockets preserved');
}
