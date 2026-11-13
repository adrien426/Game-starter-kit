// Builds the character assets used by the game from the raw Mixamo files.
//
//   source/characters/*.glb   -> public/models/characters/<name>.glb
//   source/animations/*.gltf     -> public/models/characters/animations.glb
//   source/animations-fbx/*.fbx  -> (same file) Mixamo FBX "without skin" exports
//
// What it does:
//  - Renames every bone "mixamorig9:Hips", "mixamorig:Hips"... to plain "Hips",
//    so ONE animation file works on EVERY Mixamo character.
//  - Makes clips "in place" (removes the forward drift of the hips) because the
//    physics controller moves the character, not the animation.
//  - Normalizes the hips height (1.0 = rest height) so the game can rescale it
//    to the size of each character (see src/player/useCharacterAnimations.js).
//  - Compresses everything with meshopt.
//
// Usage:  npm run build:player
// To add an animation: drop a Mixamo .gltf/.glb in source/animations/ (the file
// name becomes the clip name) and run the command again.

import { readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, existsSync } from 'node:fs';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const SRC_CHAR = 'source/characters';
const SRC_ANIM = 'source/animations';
const SRC_FBX = 'source/animations-fbx';
const OUT = 'public/models/characters';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const cleanName = (name) => name.replace(/^mixamorig\d*[:_]?/, '');
const files = (dir) => readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f)).sort();

async function readAny(path) {
  if (path.endsWith('.gltf')) {
    // Files from Google Drive are plain JSON glTF with embedded base64 buffers.
    const { readFileSync } = await import('node:fs');
    const json = JSON.parse(readFileSync(path, 'utf8'));
    return io.readJSON({ json, resources: {} });
  }
  return io.read(path);
}

// ---------- 1. Characters ----------
for (const file of files(SRC_CHAR)) {
  const doc = await readAny(join(SRC_CHAR, file));
  for (const node of doc.getRoot().listNodes()) node.setName(cleanName(node.getName()));
  // Characters must not carry their own clips (they come from animations.glb).
  for (const anim of doc.getRoot().listAnimations()) anim.dispose();
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = join(OUT, basename(file, extname(file)) + '.glb');
  await io.write(out, doc);
  console.log('character', out);
}

// ---------- 2. Animation library ----------
const lib = new Document();
const buffer = lib.createBuffer();
const libScene = lib.createScene('Scene');
const libNodes = new Map(); // bone name -> node in the library

function cloneSkeleton(srcNode, parent) {
  const name = cleanName(srcNode.getName());
  const node = lib.createNode(name)
    .setTranslation(srcNode.getTranslation())
    .setRotation(srcNode.getRotation())
    .setScale(srcNode.getScale());
  libNodes.set(name, node);
  parent ? parent.addChild(node) : libScene.addChild(node);
  for (const child of srcNode.listChildren()) cloneSkeleton(child, node);
}

for (const file of files(SRC_ANIM)) {
  const clipName = basename(file, extname(file));
  const src = await readAny(join(SRC_ANIM, file));
  const srcNodes = src.getRoot().listNodes();
  const hips = srcNodes.find((n) => cleanName(n.getName()) === 'Hips');
  if (!hips) { console.warn('skip (no Hips):', file); continue; }
  if (libNodes.size === 0) cloneSkeleton(hips, null);
  const restY = hips.getTranslation()[1] || 1;

  for (const srcAnim of src.getRoot().listAnimations()) {
    const anim = lib.createAnimation(clipName);
    for (const ch of srcAnim.listChannels()) {
      const target = libNodes.get(cleanName(ch.getTargetNode()?.getName() ?? ''));
      if (!target) continue;
      const path = ch.getTargetPath();
      if (path === 'scale') continue; // Mixamo scale tracks are constant noise
      const s = ch.getSampler();
      const input = lib.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buffer);
      let values = s.getOutput().getArray().slice();
      if (path === 'translation') {
        if (target.getName() !== 'Hips') continue; // only the hips move
        // In place + normalized height.
        for (let i = 0; i < values.length; i += 3) {
          values[i] = 0;
          values[i + 1] = values[i + 1] / restY;
          values[i + 2] = 0;
        }
      }
      const output = lib.createAccessor()
        .setType(s.getOutput().getType())
        .setArray(values)
        .setBuffer(buffer);
      const sampler = lib.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler);
      anim.addChannel(lib.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(sampler));
    }
    console.log('clip', clipName, anim.listChannels().length, 'tracks');
  }
}
// ---------- 2b. Mixamo FBX clips (parsed with three.js FBXLoader) ----------
const fbxFiles = existsSync(SRC_FBX) ? readdirSync(SRC_FBX).filter((f) => /\.fbx$/i.test(f)).sort() : [];
const PATHS = { position: 'translation', quaternion: 'rotation' };
for (const file of fbxFiles) {
  const clipName = basename(file, extname(file));
  if (lib.getRoot().listAnimations().some((a) => a.getName() === clipName)) { console.warn('skip duplicate', clipName); continue; }
  const buf = readFileSync(join(SRC_FBX, file));
  let group;
  try {
    group = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  } catch (e) { console.warn('skip (cannot parse):', file, e.message); continue; }
  const clip = group.animations[0];
  if (!clip) { console.warn('skip (no animation):', file); continue; }
  let hipsObj = null;
  group.traverse((o) => { if (!hipsObj && cleanName(o.name) === 'Hips') hipsObj = o; });
  const restY = hipsObj?.position.y || 100; // FBX from Mixamo is in centimeters
  const anim = lib.createAnimation(clipName);
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = cleanName(track.name.slice(0, dot));
    const path = PATHS[track.name.slice(dot + 1)];
    const target = libNodes.get(bone);
    if (!target || !path) continue;
    if (path === 'translation' && bone !== 'Hips') continue;
    const values = Float32Array.from(track.values);
    if (path === 'translation') {
      for (let i = 0; i < values.length; i += 3) { values[i] = 0; values[i + 1] /= restY; values[i + 2] = 0; }
    }
    const input = lib.createAccessor().setType('SCALAR').setArray(Float32Array.from(track.times)).setBuffer(buffer);
    const output = lib.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(values).setBuffer(buffer);
    const sampler = lib.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(sampler);
    anim.addChannel(lib.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(sampler));
  }
  console.log('clip (fbx)', clipName, anim.listChannels().length, 'tracks', clip.duration.toFixed(2) + 's');
}

// Hips of the library skeleton also normalized.
const libHips = libNodes.get('Hips');
if (libHips) { const t = libHips.getTranslation(); libHips.setTranslation([0, 1, 0]); void t; }

lib.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await lib.transform(dedup());
await io.write(join(OUT, 'animations.glb'), lib);
console.log('animations', join(OUT, 'animations.glb'));
