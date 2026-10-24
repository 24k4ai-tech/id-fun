// Offline only. Dependencies are isolated from the game's runtime.
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const [input, output, targetArg = '60000', errorArg = '0.005'] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error('Use distinct input and output GLB paths');
const target = Number(targetArg);
const error = Number(errorArg);
if (!(error > 0 && error <= 0.02)) throw new Error('Error must be in (0, 0.02]');
if (!Number.isInteger(target) || target < 10000 || target > 80000) throw new Error('Target must be 10000–80000 triangles');
const bytes = await readFile(input);
if (bytes.subarray(0, 4).toString() !== 'glTF') throw new Error('GLB required');
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
if (json.buffers?.some(b => b.uri) || json.images?.some(i => i.uri)) throw new Error('External resources forbidden');
const io = new NodeIO();
const document = await io.readBinary(bytes);
const triangleCount = () => document.getRoot().listMeshes().reduce((n, mesh) => n + mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0), 0);
const before = triangleCount();
await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / before), error }), prune());
// Generated meshes contain many tiny normal/UV splits. Only if the conservative
// pass stalls, use attribute-aware collapses with explicit UV and normal costs.
if (triangleCount() > 80000) {
  for (const mesh of document.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const positions = p.getAttribute('POSITION').getArray();
    const normals = p.getAttribute('NORMAL').getArray();
    const uv = p.getAttribute('TEXCOORD_0').getArray();
    const attributes = new Float32Array(positions.length / 3 * 5);
    for (let i = 0; i < positions.length / 3; i++) attributes.set([normals[i*3],normals[i*3+1],normals[i*3+2],uv[i*2],uv[i*2+1]],i*5);
    const [indices, achievedError] = MeshoptSimplifier.simplifyWithAttributes(
      new Uint32Array(p.getIndices().getArray()), positions, 3, attributes, 5,
      [0.5,0.5,0.5,8,8], null, target*3, error, ['Permissive']);
    p.getIndices().setArray(indices);
    compactPrimitive(p);
    console.log(JSON.stringify({ attributeAwareError: achievedError }));
  }
  await document.transform(prune());
}
const after = triangleCount();
await io.write(output, document);
console.log(JSON.stringify({ input, output, trianglesBefore: before, trianglesAfter: after, rigLimitPassed: after <= 80000 }));
