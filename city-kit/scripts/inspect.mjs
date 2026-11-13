import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const p of process.argv.slice(2)) {
  const doc = await io.read(p);
  const root = doc.getRoot();
  console.log(p, 'meshes', root.listMeshes().length, 'skins', root.listSkins().length, 'anims', root.listAnimations().map(a=>a.getName()));
  for (const n of root.listNodes().filter(n => !n.getName().includes(':') || /Hips$/.test(n.getName())).slice(0,12))
    console.log('  ', n.getName(), n.getTranslation().map(v=>+v.toFixed(3)), n.getScale().map(v=>+v.toFixed(3)), n.getRotation().map(v=>+v.toFixed(3)), n.getMesh()?'mesh':'');
}
