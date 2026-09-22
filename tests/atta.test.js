import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ATTA production shell contains Golden Path entry points', async () => {
  const html = await readFile('atta/index.html','utf8');
  const js = await readFile('atta/app.js','utf8');
  const css = await readFile('atta/styles.css','utf8');

  assert.match(html, /ATTA!/);
  assert.match(html, /app\.js/);
  assert.match(html, /styles\.css/);
  assert.match(js, /しるべと旅をつくる/);
  assert.match(js, /竹林を歩こう/);
  assert.match(js, /旅をシェア/);
  assert.match(js, /navigator\.geolocation/);
  assert.match(js, /navigator\.share/);
  assert.match(css, /--navy:#052d46/);
  assert.match(css, /--red:#f52b55/);
});

test('ATTA protects live location in share copy', async () => {
  const js = await readFile('atta/app.js','utf8');
  assert.match(js, /現在地はリアルタイムでは共有しません/);
});


test('ATTA live map is wired to Mapbox GL JS with Kyoto coordinates', async () => {
  const html = await readFile('atta/index.html','utf8');
  const js = await readFile('atta/app.js','utf8');
  const build = await readFile('scripts/build.mjs','utf8');

  assert.match(html, /mapbox-gl-js\/v3\.30\.0\/mapbox-gl\.js/);
  assert.match(html, /mapbox-gl-js\/v3\.30\.0\/mapbox-gl\.css/);
  assert.match(html, /maplibre-gl@5\.12\.0\/dist\/maplibre-gl\.js/);
  assert.match(js, /135\.67133,35\.01718/);
  assert.match(js, /directions\/v5\/mapbox\/walking/);
  assert.match(js, /tile\.openstreetmap\.org/);
  assert.match(js, /window\.maplibregl/);
  assert.match(build, /MAPBOX_PUBLIC_TOKEN/);
  assert.match(build, /MAPBOX_STYLE_URL/);
});


test('Silva conversation API is wired for structured trip requirements', async () => {
  const api = await readFile('api/silva.js','utf8');
  const js = await readFile('atta/app.js','utf8');

  assert.match(api, /generateText/);
  assert.match(api, /Output\.object/);
  assert.match(api, /openai\/gpt-5\.6-luna/);
  assert.match(api, /readyToGenerate/);
  assert.match(js, /\/api\/silva/);
  assert.match(js, /silva-chat-send/);
  assert.match(js, /しるべに相談/);
});
