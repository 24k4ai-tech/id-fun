import { NodeIO } from '@gltf-transform/core';
const doc = await new NodeIO().read(process.argv[2]);
for (const skin of doc.getRoot().listSkins()) for (const node of skin.listJoints()) console.log(JSON.stringify({name:node.getName(),position:node.getWorldTranslation().map(n=>+n.toFixed(4)),children:node.listChildren().map(c=>c.getName())}));
