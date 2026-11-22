import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { build } from '../scripts/build.mjs';
import { UpdateService, routeFor } from '../src/navigation.js';

test('canonical lesson routes resolve identically at both Pages roots', () => {
  assert.equal(routeFor(''), 'observe');
  for (const route of ['observe', 'refactor', 'verify']) {
    assert.equal(routeFor('#/' + route), route);
  }
  for (const hash of ['#verify', '#/unknown', '#/observe/more', '#/__proto__']) {
    assert.equal(routeFor(hash), null);
  }
});

const shell = `<meta name="tutorial-build" content="__BUILD_ID__">
<link rel="stylesheet" href="__ASSET_BASE__styles/base.css?v=1">
<img src="__ASSET_BASE__assets/hero.webp"><script type="module" src="__ASSET_BASE__src/app.js"></script>`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'special-case-build-'));
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, data] of Object.entries({
    'index.html': shell,
    'styles/base.css': 'body { background: url(../assets/hero.webp) }',
    'assets/hero.webp': 'image',
    'src/app.js': 'import "./lesson.js";',
    'src/lesson.js': 'export const step = 1;'
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), data);
  }
  return root;
}

test('one reproducible build identity covers the shell and transitive assets', async t => {
  const root = await fixture(t);
  const dist = join(root, 'dist');
  const id = await build(root);
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.ok(html.includes(`content="${id}"`));
  for (const prefix of ['/', '/tutorial/']) {
    const page = new URL(prefix, 'https://example.org');
    const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => new URL(match[1], page));
    for (const url of urls) {
      assert.ok(url.pathname.startsWith(`${prefix}_build/${id}/`));
      assert.ok((await stat(join(dist, url.pathname.slice(prefix.length)))).isFile());
    }
    assert.equal(new URL('../assets/hero.webp', urls[0]).href, urls[1].href);
    assert.ok((await stat(join(dist, new URL('./lesson.js', urls[2]).pathname.slice(prefix.length)))).isFile());
  }
  const manifest = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  assert.equal(manifest.build, id);
  assert.ok((await stat(join(dist, '.nojekyll'))).isFile());
  await assert.rejects(stat(join(dist, '_build', id, 'src', 'missing.js')), { code: 'ENOENT' });
  assert.equal(await build(root), id);
  await writeFile(join(root, 'src', 'lesson.js'), 'export const step = 2;');
  const updated = await build(root);
  assert.notEqual(updated, id);
  await writeFile(join(root, 'index.html'), shell + '<h1>Special Case</h1>');
  assert.notEqual(await build(root), updated);
});

test('an invalid entry does not replace a good build', async t => {
  const root = await fixture(t);
  const id = await build(root);
  await writeFile(join(root, 'index.html'), shell.replace('__ASSET_BASE__assets/hero.webp', '__ASSET_BASE__assets/absent.png'));
  await assert.rejects(build(root), /absent.png/);
  assert.equal(JSON.parse(await readFile(join(root, 'dist', 'version.json'), 'utf8')).build, id);
});

test('publication retains one verified prior release through retries and rollbacks', async t => {
  const root = await fixture(t);
  const dist = join(root, 'dist');
  const retained = {
    retainFrom: 'https://example.org/tutorial',
    request: async url => {
      assert.equal(url.origin, 'https://example.org');
      assert.ok(url.pathname.startsWith('/tutorial/'));
      return new Response(await readFile(join(dist, url.pathname.slice('/tutorial/'.length))));
    }
  };
  const original = await build(root, { ...retained, request: () => new Response('', { status: 404 }) });
  await writeFile(join(root, 'src', 'lesson.js'), 'export const step = 2;');
  const newer = await build(root, retained);
  const originalAsset = join(dist, '_build', original, 'src', 'lesson.js');
  assert.equal(await readFile(originalAsset, 'utf8'), 'export const step = 1;');
  assert.equal(await build(root, retained), newer);
  assert.equal(await readFile(originalAsset, 'utf8'), 'export const step = 1;');
  await writeFile(join(root, 'src', 'lesson.js'), 'export const step = 1;');
  assert.equal(await build(root, retained), original);
  assert.equal(await readFile(join(dist, '_build', newer, 'src', 'lesson.js'), 'utf8'), 'export const step = 2;');
});

test('a damaged published asset aborts deployment before replacing dist', async t => {
  const root = await fixture(t);
  const dist = join(root, 'dist');
  const original = await build(root);
  const manifest = await readFile(join(dist, 'version.json'));
  await writeFile(join(root, 'index.html'), shell + '<p>Change</p>');
  await assert.rejects(build(root, {
    retainFrom: 'https://example.org/',
    request: url => new Response(url.pathname === '/version.json' ? manifest : 'damaged')
  }), /checksum/);
  assert.equal(JSON.parse(await readFile(join(dist, 'version.json'), 'utf8')).build, original);
});

const page = 'https://example.org/tutorial/index.html?lang=ko#intro';
const release = build => Response.json({ build });

test('an old document detects a new deployment and preserves the target route', async () => {
  let request;
  const updates = new UpdateService(page, 'A', async (url, options) => {
    request = { url: new URL(url), options };
    return release('B');
  });
  assert.equal(await updates.check(), true);
  assert.equal(request.url.pathname, '/tutorial/version.json');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.redirect, 'error');
  const target = new URL(updates.targetUrl('#lab'));
  assert.equal(target.pathname, '/tutorial/index.html');
  assert.equal(target.hash, '#lab');
  assert.equal(target.searchParams.get('lang'), 'ko');
  assert.equal(target.searchParams.get('__build'), 'B');
  assert.throws(() => updates.targetUrl('https://another.example/lab'));
});

test('rollback is an update and returning to the loaded build clears it', async () => {
  let serverBuild = 'A';
  const updates = new UpdateService(page, 'B', async () => release(serverBuild));
  assert.equal(await updates.check(), true);
  serverBuild = 'B';
  assert.equal(await updates.check(), false);
  assert.equal(updates.targetUrl('#lab'), new URL('#lab', page).href);
});

test('an old shell cached under the target build URL still gets a document navigation', async () => {
  const cached = 'https://example.org/?__build=B#/observe';
  const updates = new UpdateService(cached, 'A', () => release('B'));
  assert.equal(await updates.check(), true);
  const next = new URL(updates.targetUrl('#/verify'));
  assert.notEqual(next.search, new URL(cached).search);
  assert.equal(next.hash, '#/verify');
});

test('overlapping checks share a single request and can retry afterwards', async () => {
  let resolve;
  let calls = 0;
  const updates = new UpdateService(page, 'A', () => {
    calls++;
    return new Promise(done => { resolve = done; });
  });
  const first = updates.check();
  const next = updates.check();
  assert.equal(calls, 1);
  resolve(release('B'));
  assert.deepEqual(await Promise.all([first, next]), [true, true]);
  const retry = updates.check();
  assert.equal(calls, 2);
  resolve(release('A'));
  assert.equal(await retry, false);
});

test('failed, invalid and offline checks leave the current document usable', async () => {
  let response;
  const updates = new UpdateService(page, 'A', () => response());
  for (response of [
    () => Promise.reject(new TypeError('offline')),
    () => new Response('', { status: 404 }),
    () => new Response('<html></html>'),
    () => Response.json({ build: 42 }),
    () => Response.json({ build: '../invalid' })
  ]) {
    assert.equal(await updates.check(), false);
    assert.equal(updates.targetUrl('#lab'), new URL('#lab', page).href);
  }
  response = () => release('restored');
  assert.equal(await updates.check(), true);
});

test('a source checkout skips deployment requests', async () => {
  let requests = 0;
  const updates = new UpdateService(page, 'dev', () => { requests++; });
  assert.equal(await updates.check(), false);
  assert.equal(requests, 0);
});
