import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const assetFolders = ['assets', 'src', 'styles'];
const marker = '__BUILD_ID__';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function collect(root, folder, files) {
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const name = folder + '/' + entry.name;
    if (entry.isDirectory()) await collect(root, name, files);
    else if (entry.isFile()) files.push(name);
    else throw new Error('Expected a regular asset: ' + name);
  }
}

async function write(root, name, bytes) {
  const destination = join(root, name);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

function render(shell, id, assets) {
  if (shell.split(marker).length !== 2) throw new Error('Expected one embedded build identifier');
  const html = shell.replace(marker, id).replace(/__ASSET_BASE__([\p{L}\p{N}_.\/-]+)/gu, (_, name) => {
    if (!Object.hasOwn(assets, name)) throw new Error('Missing entry asset: ' + name);
    return `./_build/${id}/${name}`;
  });
  if (html.includes('__ASSET_BASE__')) throw new Error('Expected an asset path after __ASSET_BASE__');
  return html;
}

function identity(shellHash, assets) {
  return sha256(JSON.stringify([shellHash, assets])).slice(0, 20);
}

function validAssetPath(name) {
  const [folder, ...parts] = name.split('/');
  return assetFolders.includes(folder) && parts.length > 0 &&
    parts.every(part => /^[\p{L}\p{N}_-][\p{L}\p{N}._-]*$/u.test(part));
}

async function retainLive(baseUrl, output, currentId, request) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  if (base.protocol !== 'https:') throw new Error('Expected an HTTPS Pages base URL');
  const version = new URL('version.json', base);
  version.searchParams.set('_t', Date.now().toString());
  const options = () => ({ cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
  const response = await request(version, options());
  if (response.status === 404) return; // First publication.
  if (!response.ok) throw new Error('Could not read the published version: ' + response.status);
  const live = await response.json();
  const retained = live.build === currentId ? live.previous : live;
  if (!retained && live.build === currentId) return;
  const { build, shellHash, assets } = retained;
  if (!/^[a-f0-9]{20}$/.test(build) || !/^[a-f0-9]{64}$/.test(shellHash) ||
      !assets || Array.isArray(assets) || typeof assets !== 'object' || identity(shellHash, assets) !== build) {
    throw new Error('Invalid published release manifest');
  }
  if (build === currentId) return;
  for (const [name, digest] of Object.entries(assets)) {
    if (!validAssetPath(name) || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error('Invalid published asset: ' + name);
    }
    const path = `_build/${build}/${name}`;
    const asset = await request(new URL(path, base), options());
    if (!asset.ok) throw new Error('Could not retain ' + path + ': ' + asset.status);
    const bytes = Buffer.from(await asset.arrayBuffer());
    if (sha256(bytes) !== digest) throw new Error('Published asset checksum mismatch: ' + name);
    await write(output, path, bytes);
  }
  return { build, shellHash, assets };
}

export async function build(root = project, { retainFrom, request = fetch } = {}) {
  const source = await realpath(root);
  const files = [];
  for (const folder of assetFolders) await collect(source, folder, files);
  files.sort();
  const shell = await readFile(join(source, 'index.html'), 'utf8');
  const shellHash = sha256(shell);
  const assets = {};
  const contents = new Map();
  for (const name of files) {
    if (!validAssetPath(name)) throw new Error('Invalid asset name: ' + name);
    const bytes = await readFile(join(source, name));
    assets[name] = sha256(bytes);
    contents.set(name, bytes);
  }
  const id = identity(shellHash, assets);
  const html = render(shell, id, assets);
  // Assemble outside dist so a failed asset verification preserves the last good build.
  const stage = await mkdtemp(join(source, '.pages-build-'));
  const output = join(stage, 'output');
  const previous = join(stage, 'previous');
  const dist = join(source, 'dist');
  if (dirname(stage) !== source || dirname(dist) !== source) throw new Error('Invalid build directory');
  try {
    for (const [name, bytes] of contents) await write(output, `_build/${id}/${name}`, bytes);
    await write(output, 'index.html', html);
    await write(output, '.nojekyll', '');
    const prior = retainFrom ? await retainLive(retainFrom, output, id, request) : undefined;
    await write(output, 'version.json', JSON.stringify({ build: id, shellHash, assets, previous: prior }) + '\n');
    let hadBuild = true;
    try {
      await rename(dist, previous);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hadBuild = false;
    }
    try {
      await rename(output, dist);
    } catch (error) {
      if (hadBuild) await rename(previous, dist);
      throw error;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const id = await build(project, { retainFrom: process.env.RETAIN_PAGES_BASE });
  console.log('Built dist for release ' + id);
}
