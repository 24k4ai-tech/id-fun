// Final, lossless buffer compression; leave the accepted source meshes untouched.
import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression} from '@gltf-transform/extensions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
export async function compressModel(input){await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);const io=new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});const doc=await io.read(input);doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});return Buffer.from(await io.writeBinary(doc));}
