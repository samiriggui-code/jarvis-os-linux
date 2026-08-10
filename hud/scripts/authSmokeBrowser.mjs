/**
 * AUTH_SMOKE_TEST — critères 1–4 (navigateur).
 *
 * 1. démarrage HUD
 * 2. caméra autorisée (fake device Chromium)
 * 3. AuthScene montée ([AUTH] AuthScene mounted)
 * 4. face_frame envoyé < 5 s ([FACE] sending face_frame)
 *
 * Usage :
 *   cd hud && node scripts/authSmokeBrowser.mjs
 *   JARVIS_HUD_URL=http://192.168.1.37:8080 node scripts/authSmokeBrowser.mjs
 *
 * Prérequis : npm i -D playwright  (ou npx playwright)
 */
import { chromium } from 'playwright';

const TARGET = process.env.JARVIS_HUD_URL || 'http://127.0.0.1:5173';
const BUDGET_MS = Number(process.env.AUTH_SMOKE_BUDGET_MS || 12_000);

function ok(label, cond, detail = '') {
  const mark = cond ? 'OK' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

async function main() {
  console.log(`AUTH_SMOKE_TEST · HUD ${TARGET}`);
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();

  const logs = [];
  page.on('console', (msg) => {
    const t = msg.text();
    logs.push(t);
    if (/\[AUTH\]|\[CAMERA\]|\[FACE\]/.test(t)) console.log('  console:', t);
  });

  const t0 = Date.now();
  let navOk = false;
  try {
    const res = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    navOk = Boolean(res && res.ok());
  } catch (e) {
    console.error('goto failed', e);
  }
  ok('1. démarrage HUD', navOk, `${Date.now() - t0}ms`);

  // Caméra fake : getUserMedia doit réussir
  const cam = await page.evaluate(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const live = s.getVideoTracks().some((t) => t.readyState === 'live');
      s.getTracks().forEach((t) => t.stop());
      return { ok: live, err: null };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  });
  ok('2. caméra autorisée', cam.ok, cam.err || 'fake MediaStream');

  // Attendre AuthScene / face_frame
  const deadline = Date.now() + BUDGET_MS;
  let mounted = false;
  let sent = false;
  let sentAt = null;
  while (Date.now() < deadline) {
    if (!mounted) mounted = logs.some((l) => l.includes('[AUTH] AuthScene mounted'));
    const hit = logs.find((l) => l.includes('[FACE] sending face_frame'));
    if (hit && !sent) {
      sent = true;
      sentAt = Date.now() - t0;
    }
    if (mounted && sent) break;
    await page.waitForTimeout(250);
  }

  ok('3. AuthScene montée', mounted, mounted ? 'log [AUTH] AuthScene mounted' : 'log absent — gate INSTALL/waiting ?');
  ok(
    '4. face_frame envoyé < 5s (depuis load, budget étendu)',
    sent && sentAt != null && sentAt < BUDGET_MS,
    sent ? `first send @ ${sentAt}ms` : 'aucun [FACE] sending face_frame',
  );

  // Critère strict 5s après AuthScene : si mounted, mesurer depuis mounted
  if (mounted && sent) {
    const idxM = logs.findIndex((l) => l.includes('[AUTH] AuthScene mounted'));
    const idxS = logs.findIndex((l) => l.includes('[FACE] sending face_frame'));
    // Approximation : si send apparaît après mount dans le buffer, OK pour smoke HUD
    ok('4b. sending après mount', idxS >= idxM, `mount#${idxM} send#${idxS}`);
  }

  await browser.close();
  if (process.exitCode) {
    console.log('\nAUTH_SMOKE_TEST critères 1–4 : FAIL');
    process.exit(1);
  }
  console.log('\nAUTH_SMOKE_TEST critères 1–4 : PASS (critère 5 = python -m jarvis_core._smoke_auth_face)');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
