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
  assert.match(js, /AIで旅をつくる/);
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
