require('./register-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LAB_CASES, evaluateLabCase, loadLabCase } = require('../src/lib/learningLab.ts');
const { decodeFrame } = require('../src/lib/engine/sequence.ts');
const { readViewState, viewQuery } = require('../src/lib/engine/viewState.ts');
const { evidenceText } = require('../src/lib/evidenceReport.ts');
const root = path.resolve(__dirname, '../public');
const frame = (slug, key) => {
  const bytes = fs.readFileSync(path.join(root, `cache/${slug}/frames/${key}_0.2.bin`));
  return decodeFrame(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

test('learning cases reproduce supported, insignificant and refused brightness results from real images', () => {
  for (const [i, expected] of ['supported', 'no-change', 'unreliable'].entries()) {
    const c = LAB_CASES[i];
    const field = JSON.parse(fs.readFileSync(path.join(root, `cache/${c.slug}/calib_stars.json`), 'utf8'));
    const frames = c.keys.map((key) => frame(c.slug, key));
    const r = evaluateLabCase(c.id, frames, field);
    assert.equal(r.interpretation, expected);
    if (i === 0) assert(Math.abs(r.calibration.last.dmag + 0.52) < 0.02);
    if (i === 1) assert(r.calibration.significance < 3);
    if (i === 2) { assert.equal(r.calibration.ok, false); assert.match(r.calibration.reason, /neighbouring star/); }
    const state = readViewState(new URL(r.comparisonUrl, 'http://local').searchParams);
    assert(state.measurement);
    assert.equal(state.size, 0.1, 'handoff uses prepared 6-arcmin observation menu');
    assert.equal(state.before, c.keys[0]); assert.equal(state.after, c.keys[1]);
    assert.equal(state.start, frames[0].meta.dateAvg.slice(0, 10));
    assert.throws(() => evaluateLabCase(c.id, [...frames].reverse(), field), /do not match/);
  }
});

test('the prepared activity needs only local saved files and does not manufacture a result after a load failure', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    assert.match(url, /^\/cache\/(rwaur|epsindib)\//);
    return new Response(fs.readFileSync(path.join(root, url)));
  };
  assert.equal((await loadLabCase('blend', new AbortController().signal)).interpretation, 'unreliable');
  assert.equal(calls.length, 3);
  global.fetch = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(loadLabCase('rwaur', new AbortController().signal), /could not be loaded/);
});

test('shared measurement keeps source, motion, partner and observation-time context; invalid input is ignored', () => {
  const measurement = { ra: 76.93, dec: 30.4, label: 'Selected & measured source', pm: [0.02, -6.6], epochYear: 2016, mjd: 60920, when: '2025-09-02', partner: { ra: 76.94, dec: 30.41 } };
  const state = { ...readViewState(new URLSearchParams()), measurement };
  const q = viewQuery({ ra: 76.95, dec: 30.4, slug: 'rwaur' }, state);
  assert.deepEqual(readViewState(q).measurement, measurement);
  for (const value of [null, [], { ...measurement, ra: 360 }, { ...measurement, pm: ['oops', 0] }, { ...measurement, partner: { ra: 1, dec: 91 } }, { ...measurement, mjd: 1e200 }, { ...measurement, epochYear: undefined }])
    assert.equal(readViewState(new URLSearchParams({ measure: JSON.stringify(value) })).measurement, undefined);
  assert.equal(readViewState(new URLSearchParams({ measure: '{bad json' })).measurement, undefined);
});

test('readable handoff retains open and failed checks, original sources, notes and the exact investigation link', () => {
  const sheet = { verdict: { level: 'unresolved', title: "Can't tell yet", text: 'Calibration was refused.' }, changed: ['No calibrated result.'], support: ['Two dates inspected.'], checks: [{ id: 'blend', label: 'Neighbour', status: 'fail', detail: 'Overlapping light.' }, { id: 'known', label: 'Catalogue', status: 'open', detail: 'Service unavailable.' }], unknown: ['Physical cause.'], next: ['Sharper independent images.'] };
  const input = { exportedAt: '2026-11-15', investigationUrl: 'http://local/timetravel?target=rwaur&measure=exact', release: 'SPHEREx DR1', engine: 'test', target: { ra: 76.93, dec: 30.4, label: 'Control' }, brightness: 'Refused.', position: 'No reliable shift.', sheet, notes: ['', '', '', '', 'Check the neighbour first.'], limitations: ['No deblending.'], measurements: [{ date: '2025-09-02', wl: 0.744, bw: 0.017, sourceFits: 'https://irsa.ipac.caltech.edu/original.fits', flagsHere: ['SOURCE'], usableForBrightness: false }] };
  const text = evidenceText(input);
  for (const expected of ['[Problem] Neighbour', '[Not checked] Catalogue', 'Service unavailable.', input.investigationUrl, input.measurements[0].sourceFits, input.notes[4], 'No deblending.', 'not in the link']) assert(text.includes(expected), expected);
});
