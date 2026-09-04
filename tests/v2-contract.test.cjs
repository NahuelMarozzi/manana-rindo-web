const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'privacidad.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'terminos.html'), 'utf8');

test('V2 preserves the active n8n endpoints', () => {
  assert.match(app, /manana-rindo-subir-fotos-v5/);
  assert.match(app, /manana-rindo-analizar-v7/);
  assert.match(app, /manana-rindo-crear-checkout-prod-v1/);
});

test('upload, analysis and checkout keep a single order identity', () => {
  assert.match(app, /order_id: uploadOrderId/);
  assert.match(app, /state\.analysisOrderId = uploadOrderId/);
  assert.match(app, /state\.analysisOrderId !== state\.orderId/);
  assert.match(app, /order_id: state\.orderId/);
});

test('checkout includes every field required by production', () => {
  for (const field of ['pack_id', 'access_token', 'tipo_pack', 'materia', 'nivel', 'tiempo_estudio', 'fecha_examen', 'analysis', 'files']) {
    assert.match(app, new RegExp(`${field}:`));
  }
  assert.match(app, /mp_mode: "production"/);
  assert.match(app, /checkoutPending/);
  assert.match(app, /window\.addEventListener\("pageshow"/);
});

test('legal consent and legal pages are part of the purchase journey', () => {
  assert.match(app, /id="legalAccept"/);
  assert.match(index, /href="privacidad\.html"/);
  assert.match(index, /href="terminos\.html"/);
  assert.match(privacy, /dentro de las 24 horas/i);
  assert.match(privacy, /nunca se utilizan para entrenar modelos/i);
  assert.match(terms, /analizamos cada caso/i);
  assert.match(privacy, /mananarindo@gmail\.com/);
});

test('all static assets referenced by the landing exist', () => {
  const localRefs = [...index.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map(match => match[1])
    .filter(ref => !/^(?:https?:|mailto:)/.test(ref));
  for (const ref of localRefs) assert.ok(fs.existsSync(path.join(root, ref)), `missing ${ref}`);
});

test('workflow transitions return the viewport to the interactive card', () => {
  assert.match(app, /function scrollToAppStart/);
  assert.match(app, /function goToApp\(\) \{\s*scrollToAppStart\(\)/);
  assert.match(app, /function renderLoading[\s\S]*?scrollToAppStart\(\)/);
  assert.match(app, /function renderAnalysis[\s\S]*?scrollToAppStart\(\)/);
  assert.match(app, /function renderChoose[\s\S]*?scrollToAppStart\(\)/);
});

test('choosing a Pack updates in place without resetting consent or scroll', () => {
  const handler = app.match(/document\.querySelectorAll\("\[data-pack\]"\)[\s\S]*?document\.querySelector\("#backAnalysis"\)/)?.[0] || '';
  assert.match(handler, /classList\.toggle\("selected"/);
  assert.match(handler, /aria-pressed/);
  assert.doesNotMatch(handler, /renderChoose\(\)/);
});

test('mobile navigation uses one controlled scroll system and keeps the header CTA readable', () => {
  assert.doesNotMatch(styles, /html\s*\{[^}]*scroll-behavior:\s*smooth/);
  assert.match(app, /a\[href\^="#"\]:not\(\.skip-link\)/);
  assert.match(styles, /\.site-header \.button \{[^}]*font-size:\s*12px/);
  assert.doesNotMatch(styles, /\.site-header \.button \{[^}]*font-size:\s*0/);
});

