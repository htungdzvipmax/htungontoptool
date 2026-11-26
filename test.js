'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// Test parser/logic offline; external npm modules are stubbed because tests never
// open an HTTP server or make live API calls.
const originalLoad = Module._load;
const registeredRoutes = new Map();
const axiosState = { data: null };
Module._load = function(request, parent, isMain) {
  if (request === 'express') {
    const express = () => ({
      use() {}, set() {},
      get(route, handler) { registeredRoutes.set(`GET ${route}`, handler); },
      listen() { return { close() {} }; }
    });
    express.json = () => (_req, _res, next) => next && next();
    return express;
  }
  if (request === 'axios') return { create: () => ({ get: async () => {
    if (axiosState.data == null) throw new Error('offline test stub');
    return { data: axiosState.data };
  } }) };
  if (request === 'cors') return () => (_req, _res, next) => next && next();
  return originalLoad.call(this, request, parent, isMain);
};

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-api-v3-test-'));
process.env.DATA_DIR = testDataDir;
const api = require('./server');
// Tests simulate successive source polls, so each one must bypass the short result cache.
const poll = gameId => { delete api._state.recentOk[gameId]; return api.runPredict(gameId); };

after(() => {
  Module._load = originalLoad;
  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch (_) {}
});

test('MAX789 MD5: sample total 13 with declared Xỉu is corrected to Tài', () => {
  const row = api.parseMax789({
    id: '@htungdzvipmax',
    Name: 'MAX789 MD5',
    Phien: 1919916,
    Xuc_xac: '5 - 2 - 6',
    Tong: 13,
    Ket_qua: 'Xỉu',
    Cau_hien_tai: 'TTXXXXXTTTXXTTXXXXXX',
    Phien_tiep: 1919917,
    Du_doan: 'Xỉu',
    Du_doan_side: 'X',
    do_tin_cay: 54,
    Ly_do: 'Đang bệt 6 phiên Xỉu',
    Sample_size: 100,
    Time: '11:58:06 26/11/2026'
  })[0];
  assert.equal(row.session, '1919916');
  assert.deepEqual(row.dice, [5, 2, 6]);
  assert.equal(row.sum, 13);
  assert.equal(row.side, 'T');
  assert.equal(row.sideSource, 'dice_sum');
  assert.equal(row.nextSession, 1919917);
  assert.match(row.dataWarning, /Ket_qua API Xỉu lệch/);
  assert.equal(row.time, '2026-11-26T04:58:06.000Z');
  assert.equal(row.apiSampleSize, 100);
});

test('Dice sum wins over a conflicting reported total', () => {
  const row = api.parseMax789({ data: [{
    Phien: 12, Xuc_xac: '1 - 2 - 3', Tong: 13, Ket_qua: 'Tài'
  }] })[0];
  assert.equal(row.sum, 6);
  assert.equal(row.side, 'X');
  assert.match(row.dataWarning, /Tong API 13 lệch tổng xúc xắc 6/);
  assert.match(row.dataWarning, /Ket_qua API Tài lệch/);
});

test('A three-dice triple is not silently classified as Tài or Xỉu', () => {
  const row = api.parseMax789([{ Phien: 13, Xuc_xac: '6 - 6 - 6', Tong: 18, Ket_qua: 'Tài' }])[0];
  assert.equal(row.side, null);
  assert.equal(row.sideSource, 'triple');
});

test('LC79 parser reads and prioritizes dice evidence', () => {
  const rows = api.parseLc79List({ list: [
    { id: '103', dices: [2, 4, 6], point: 12, resultTruyenThong: 'TAI' },
    { id: '102', dices: [1, 2, 3], point: 6, resultTruyenThong: 'XIU' }
  ] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].session, '103');
  assert.deepEqual(rows[0].dice, [2, 4, 6]);
  assert.equal(rows[0].side, 'T');
  assert.equal(rows[1].side, 'X');
});

test('Xocdia parser converts patterns to Vietnamese', () => {
  const rows = api.parseLc79Xocdia({ list: [
    { id: '20', dices: ['đỏ', 'đỏ', 'đỏ', 'trắng'], resultTruyenThong: 'LẺ', resultVi: 'three_do' },
    { id: '19', dices: ['trắng', 'trắng', 'đỏ', 'đỏ'], resultTruyenThong: 'CHẴN', resultVi: 'two_trang' }
  ] });
  assert.equal(rows[0].side, 'LE');
  assert.equal(rows[0].vi, '3 đỏ - 1 trắng');
  assert.equal(rows[1].vi, '2 đỏ - 2 trắng');
  const mismatch = api.parseLc79Xocdia({ list: [
    { id: '21', dices: ['đỏ', 'đỏ', 'đỏ', 'trắng'], resultTruyenThong: 'CHẴN' }
  ] })[0];
  assert.equal(mismatch.side, 'LE');
  assert.match(mismatch.dataWarning, /lệch mẫu màu 3 đỏ - 1 trắng/);
  assert.equal(api.redCountFromVi('four_trang'), 0);
  assert.equal(api.redCountFromVi('one_trang'), 3);
  assert.equal(api.redCountFromVi('3 đỏ - 1 trắng'), 3);
  const unknown = api.parseLc79Xocdia({ list: [{ id: '22', resultVi: 'odd_red_pattern' }] })[0];
  assert.equal(unknown.vi, null);
});

test('MAX789 and Hitclub parsers support nested source JSON', () => {
  const max = api.parseMax789({ data: [
    { SessionId: 7, FirstDice: 6, SecondDice: 5, ThirdDice: 1, DiceSum: 12, BetSide: 1 }
  ] });
  assert.equal(max[0].side, 'T');
  assert.equal(max[0].sum, 12);

  const hitclub = api.parseHitclub({ data: { list: [
    { Phien: 8, Xuc_xac_1: 1, Xuc_xac_2: 2, Xuc_xac_3: 3, Tong: 6, Ket_qua: 'Xỉu' }
  ] } });
  assert.equal(hitclub[0].session, '8');
  assert.equal(hitclub[0].side, 'X');
  assert.equal(hitclub[0].sum, 6);
});

test('Source history merges by session and returns newest-first', () => {
  let rows = api.mergeSourceHistory('lc79/tx', [
    { session: '105', side: 'T', sideSource: 'dice_sum' },
    { session: '104', side: 'X', sideSource: 'dice_sum' },
    { session: '103', side: 'T', sideSource: 'dice_sum' }
  ]);
  assert.deepEqual(rows.map(row => row.session), ['105', '104', '103']);
  rows = api.mergeSourceHistory('lc79/tx', [
    { session: '106', side: 'X', sideSource: 'dice_sum' },
    { session: '105', side: null, sideSource: 'missing', dice: [] }
  ]);
  assert.deepEqual(rows.map(row => row.session), ['106', '105', '104', '103']);
  assert.equal(rows[1].side, 'T');
});

test('Embedded sequence cannot overwrite legacy source results from v1/v2 files', () => {
  api.mergeSourceHistory('legacy/test', [{ session: '199', side: 'T', dice: [], sum: null }]);
  const rows = api.mergeSourceHistory('legacy/test', [{
    session: '199', side: 'X', sideSource: 'embedded_cau', synthetic: true
  }]);
  assert.equal(rows[0].side, 'T');
});

test('Settled prediction is recalculated when source result is corrected', () => {
  api._state.predHistory['max789/md5'] = [{
    phien: '1919916', du_doan: 'Tài', pred_side: 'T', conf: 54,
    actual: 'Xỉu', actual_side: 'X', ok: false, result_time: 'old'
  }];
  api.settlePredictionLogs('max789/md5', [{
    session: '1919916', side: 'T', sideSource: 'dice_sum',
    sum: 13, dice: [5, 2, 6], dataWarning: 'Ket_qua API Xỉu lệch kết quả tính từ xúc xắc Tài'
  }]);
  const row = api._state.predHistory['max789/md5'][0];
  assert.equal(row.actual, 'Tài');
  assert.equal(row.actual_side, 'T');
  assert.equal(row.actual_dice, '5 - 2 - 6');
  assert.equal(row.actual_sum, 13);
  assert.equal(row.ok, true);
  assert.match(row.data_warning, /Ket_qua API/);
});

test('History display includes session, dice, result and status icon', () => {
  const row = {
    phien: '500', du_doan: 'Tài', actual: 'Tài', actual_side: 'T',
    actual_dice: '5 - 2 - 6', actual_sum: 13, ok: true, conf: 58
  };
  const formatted = api.formatHistoryRow(row, api.GAMES['max789/md5']);
  assert.match(formatted, /Phiên 500/);
  assert.match(formatted, /5 - 2 - 6/);
  assert.match(formatted, /Tài/);
  assert.match(formatted, /✅/);
});

test('Compact history row contains only session, actual result and verdict icon', () => {
  const tx = api.formatCompactHistoryRow({
    phien: '2992', actual: 'Tài', actual_dice: '6 - 4 - 2',
    actual_sum: 12, du_doan: 'Xỉu', ly_do: 'internal only', conf: 55, ok: false
  }, api.GAMES['lc79/tx']);
  assert.deepEqual(tx, {
    phien: 2992, d1: 6, d2: 4, d3: 2, ket_qua: 'Tài', icon: '❌'
  });
  const xocdia = api.formatCompactHistoryRow({
    phien: '2991', actual: 'Lẻ', actual_vi: '3 đỏ - 1 trắng',
    actual_dice: null, actual_sum: null, ok: true
  }, api.GAMES['lc79/xocdia']);
  assert.deepEqual(xocdia, {
    phien: 2991, ket_qua: '3 đỏ - 1 trắng', chan_le: 'Lẻ', icon: '✅'
  });
  const pending = api.formatCompactHistoryRow({ phien: '2993', actual: null, ok: null }, api.GAMES['lc79/tx']);
  assert.equal(pending, null);
  const paused = api.formatCompactHistoryRow({ phien: '2994', risk_pause: true }, api.GAMES['lc79/tx']);
  assert.equal(paused, null);
});

test('Prediction remains stable for an already-created target session', () => {
  api._state.predHistory['betvip/tx'] = [];
  api.pushPredLog('betvip/tx', { phien: '900', du_doan: 'Xỉu', pred_side: 'X', conf: 54, ok: null });
  const result = api.pushPredLog('betvip/tx', { phien: '900', du_doan: 'Tài', pred_side: 'T', conf: 62, ok: null });
  assert.equal(result.du_doan, 'Xỉu');
});

test('Engine learns embedded Cau_hien_tai sequence only when it matches latest result', () => {
  const engine = new api.Engine('max789/md5', 'tx');
  engine.loadHistory([{
    session: '200', side: 'X', sum: 8, dice: [2, 2, 4],
    cau: 'TTXXX'
  }]);
  assert.deepEqual(engine.history.map(row => row.side), ['T', 'T', 'X', 'X', 'X']);
  const mismatch = new api.Engine('max789/md5', 'tx');
  mismatch.loadHistory([{
    session: '200', side: 'T', sum: 13, dice: [5, 2, 6],
    cau: 'XTTXX'
  }]);
  assert.deepEqual(mismatch.history.map(row => row.side), ['T']);
});

test('Embedded Cau_hien_tai is imported as hidden source sessions only when anchored', () => {
  const expanded = api.expandEmbeddedCauRows([{
    session: '200', side: 'T', sideSource: 'dice_sum', cau: 'TTXXX'
  }]);
  assert.deepEqual(expanded.map(row => row.session), ['196', '197', '198', '199']);
  assert.deepEqual(expanded.map(row => row.side), ['X', 'X', 'X', 'T']);
  assert.ok(expanded.every(row => row.sideSource === 'embedded_cau' && row.synthetic === true));
  assert.deepEqual(api.expandEmbeddedCauRows([{
    session: '200', side: 'T', sideSource: 'dice_sum', cau: 'XTTXX'
  }]), []);
});

test('Adaptive engine handles a long bệt without forcing an automatic reversal', () => {
  const history = [];
  for (let i = 1; i <= 160; i++) {
    const side = i < 80 ? 'T' : (i % 2 ? 'T' : 'X');
    history.push({ session: String(i), side, sum: side === 'T' ? 12 : 8, dice: [4, 4, 4] });
  }
  const engine = new api.Engine('lc79/tx', 'tx');
  engine.loadHistory([...history].reverse());
  const prediction = engine.predict();
  assert.ok(['T', 'X'].includes(prediction.side));
  assert.ok(prediction.conf >= 50 && prediction.conf <= 63);
});

test('History endpoint refreshes API data and settles the exact pending session', async () => {
  api._state.predHistory['max789/md5'] = [
    { phien: '1919916', du_doan: 'Tài', pred_side: 'T', conf: 54, actual: null, actual_side: null, actual_dice: null, ok: null },
    { phien: '1919915', du_doan: 'Tài', pred_side: 'T', conf: 54, actual: null, actual_side: null, actual_dice: null, ok: null }
  ];
  axiosState.data = {
    Name: 'MAX789 MD5', Phien: 1919916, Xuc_xac: '5 - 2 - 6',
    Tong: 13, Ket_qua: 'Xỉu', Cau_hien_tai: 'TTXXX', Phien_tiep: 1919917
  };
  const handler = registeredRoutes.get('GET /:brand/:table/history');
  assert.equal(typeof handler, 'function');
  let responseBody = null;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { responseBody = body; return this; } };
  await handler({ params: { brand: 'max789', table: 'md5' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(responseBody), ['history']);
  const settled = responseBody.history.find(item => String(item.phien) === '1919916');
  assert.ok(settled);
  assert.equal(settled.ket_qua, 'Tài');
  assert.deepEqual([settled.d1, settled.d2, settled.d3], [5, 2, 6]);
  assert.equal(settled.icon, '✅');
  const embeddedSettled = responseBody.history.find(item => String(item.phien) === '1919915');
  assert.ok(embeddedSettled);
  assert.equal(embeddedSettled.ket_qua, 'Tài');
  assert.equal(embeddedSettled.icon, '✅');
  assert.equal('du_doan' in settled, false);
  assert.equal('ly_do' in settled, false);
  assert.equal('conf' in settled, false);
  assert.equal('items' in responseBody, false);
  axiosState.data = null;
});

test('Root dashboard exposes per-game stats and excludes Sunhot/Sunwin Sicbo', () => {
  api._state.predHistory['lc79/tx'] = [
    { phien: '3', ok: true, actual: 'Tài' },
    { phien: '2', ok: false, actual: 'Xỉu' },
    { phien: '1', ok: null, actual: null }
  ];
  const overview = api.buildOverview();
  assert.equal(overview.games.some(game => game.game === 'sunhot/tx' || game.game === 'sunwin/sicbo'), false);
  const lc79 = overview.games.find(game => game.game === 'lc79/tx');
  assert.deepEqual(lc79.thong_ke, {
    tong_phien: 3, dung: 1, sai: 1, dang_cho: 1,
    tam_dung: 0, bo_qua: 0, ti_le_dung: 50, ti_le: '50%'
  });
  assert.match(api.DASHBOARD_HTML, /Danh sách game/);
  assert.match(api.DASHBOARD_HTML, /Tỉ lệ đúng/);
});

test('Browser root returns a dashboard while API clients retain JSON overview', () => {
  const root = registeredRoutes.get('GET /');
  let html = '';
  const htmlRes = {
    type(value) { this.contentType = value; return this; },
    send(value) { html = value; return this; },
    json() { throw new Error('expected HTML response'); }
  };
  root({ headers: { accept: 'text/html,application/xhtml+xml' } }, htmlRes);
  assert.equal(htmlRes.contentType, 'html');
  assert.match(html, /PRED-API/);

  let json = null;
  const jsonRes = { json(value) { json = value; return this; } };
  root({ headers: { accept: 'application/json' } }, jsonRes);
  assert.equal(json.name, 'PRED-API');
  assert.ok(Array.isArray(json.games));
});

test('/overview endpoint returns the same per-game statistics JSON used by the dashboard', () => {
  const handler = registeredRoutes.get('GET /overview');
  let body = null;
  handler({}, { json(value) { body = value; return this; } });
  assert.ok(Array.isArray(body.games));
  const lc79 = body.games.find(game => game.game === 'lc79/tx');
  assert.equal(lc79.thong_ke.dung, 1);
  assert.equal(lc79.thong_ke.sai, 1);
  assert.equal(lc79.thong_ke.ti_le, '50%');
});

test('Xoc Dia public cầu sequence is written as Vietnamese labels', () => {
  assert.equal(api.formatCauForApi('CLLCCL', 'xocdia'), 'Chẵn → Lẻ → Lẻ → Chẵn → Chẵn → Lẻ');
  assert.equal(api.formatCauForApi('TXTXT', 'tx'), 'TXTXT');
});

test('Retired Sunhot and Sunwin Sicbo endpoints are no longer registered as games', () => {
  assert.equal(Object.hasOwn(api.GAMES, 'sunhot/tx'), false);
  assert.equal(Object.hasOwn(api.GAMES, 'sunwin/sicbo'), false);
  assert.equal(Object.hasOwn(api.PARSERS, 'sunhot'), false);
  assert.equal(Object.hasOwn(api.PARSERS, 'sunwinSicbo'), false);
});

test('Xocdia prediction provides Vietnamese red-white pattern labels', () => {
  const history = [];
  for (let i = 1; i <= 100; i++) {
    const red = [0, 1, 2, 3, 4][i % 5];
    history.push({
      session: String(i), side: red % 2 === 0 ? 'CHAN' : 'LE',
      doCount: red, trangCount: 4 - red, vi: `${red} đỏ - ${4 - red} trắng`
    });
  }
  const engine = new api.Engine('lc79/xocdia', 'xocdia');
  engine.loadHistory([...history].reverse());
  const prediction = engine.predict();
  assert.ok(['Chẵn', 'Lẻ'].includes(prediction.label));
  assert.ok(['3 đỏ - 1 trắng', '2 đỏ - 2 trắng', '1 đỏ - 3 trắng', '4 đỏ - 0 trắng', '0 đỏ - 4 trắng'].includes(prediction.vi));
  assert.ok(['Chẵn', 'Lẻ'].includes(api.sideLabel(prediction.side)));
  assert.match(prediction.vi, /đỏ - .*trắng/);
  assert.ok(prediction.topVi.every(value => /đỏ - .*trắng/.test(value)));
});

test('Live Xoc Dia JSON is fully Vietnamese and does not expose dice or total fields', async () => {
  axiosState.data = { list: [
    { id: 105, dices: ['đỏ', 'đỏ', 'trắng', 'trắng'] },
    { id: 104, dices: ['đỏ', 'trắng', 'trắng', 'trắng'] },
    { id: 103, dices: ['đỏ', 'đỏ', 'đỏ', 'trắng'] },
    { id: 102, dices: ['trắng', 'trắng', 'trắng', 'trắng'] },
    { id: 101, dices: ['đỏ', 'đỏ', 'đỏ', 'đỏ'] }
  ] };
  const result = await poll('lc79/xocdia');
  assert.equal(Object.hasOwn(result, 'Xuc_xac'), false);
  assert.equal(Object.hasOwn(result, 'Tong'), false);
  assert.equal(result.Ket_qua, '2 đỏ - 2 trắng');
  assert.equal(result.Chan_le, 'Chẵn');
  assert.ok(['Chẵn', 'Lẻ'].includes(result.Du_doan));
  assert.ok(['Chẵn', 'Lẻ'].includes(result.Du_doan_side));
  assert.match(result.Vi, /đỏ - .*trắng/);
  assert.match(result.Du_doan_vi, /đỏ - .*trắng/);
  assert.ok(result.Top_vi.every(value => /đỏ - .*trắng/.test(value)));
  assert.ok(result.Top_vi_chi_tiet.every(item => Object.hasOwn(item, 'ti_le') && !Object.hasOwn(item, 'probability')));
  assert.ok(result.Cau_hien_tai.includes('Chẵn') || result.Cau_hien_tai.includes('Lẻ'));
  axiosState.data = null;
});

test('Every game has an independent model profile (not the LC79 profile reused)', () => {
  const ids = Object.keys(api.GAMES);
  for (const id of ids) assert.ok(api.MODEL_PROFILES[id], `Missing profile for ${id}`);
  assert.notEqual(api.getModelProfile('lc79/tx').name, api.getModelProfile('max789/md5').name);
  assert.equal(ids.some(id => id.startsWith('sunhot/') || id.startsWith('sunwin/')), false);
  assert.notEqual(api.getModelProfile('lc79/md5').weights.pattern, api.getModelProfile('max789/md5').weights.pattern);
});

test('A game with fewer than five source sessions remains in warm-up and emits no fake forecast', async () => {
  api._state.predHistory['max789/kubet'] = [];
  let result;
  // This simulates a provider that exposes only the current result, not a history array.
  for (let session = 101; session <= 104; session++) {
    axiosState.data = {
      Phien: session,
      Phien_tiep: session + 1,
      Xuc_xac: session % 2 ? '2 - 3 - 4' : '1 - 2 - 3',
      Tong: session % 2 ? 9 : 6,
      Ket_qua: session % 2 ? 'Xỉu' : 'Xỉu'
    };
    result = await poll('max789/kubet');
    assert.equal(result.Trang_thai, 'DANG_HOC_DU_LIEU');
    assert.equal(result.Sample_size, session - 100);
    assert.equal(result.Du_doan, null);
  }
  assert.equal(result.Is_ready, false);
  assert.equal(result.Sample_size, 4);
  assert.equal(result.Con_thieu, 1);
  assert.equal(result.Du_doan_side, null);
  assert.equal(api._state.predHistory['max789/kubet'].length, 0);
});

test('A game starts forecasting only after the fifth distinct valid session is saved', async () => {
  // Only the fifth current result is returned; the previous four must have been retained locally.
  axiosState.data = {
    Phien: 105, Phien_tiep: 106, Xuc_xac: '4 - 4 - 5', Tong: 13, Ket_qua: 'Tài'
  };
  const result = await poll('max789/kubet');
  assert.equal(result.Trang_thai, 'DA_SAN_SANG');
  assert.equal(result.Is_ready, true);
  assert.equal(result.Sample_size, 5);
  assert.ok(['Tài', 'Xỉu'].includes(result.Du_doan));
  assert.equal(result.Phien_tiep, 106);
  assert.equal(api._state.predHistory['max789/kubet'].length, 1);
});

test('Three consecutive settled misses trigger one protected skipped session, then learning resumes', async () => {
  api._state.predHistory['betvip/tx'] = [
    { phien: '206', du_doan: 'Tài', pred_side: 'T', actual: 'Xỉu', actual_side: 'X', ok: false },
    { phien: '205', du_doan: 'Xỉu', pred_side: 'X', actual: 'Tài', actual_side: 'T', ok: false },
    { phien: '204', du_doan: 'Tài', pred_side: 'T', actual: 'Xỉu', actual_side: 'X', ok: false }
  ];
  axiosState.data = [
    { Phien: 304, Xuc_xac_1: 4, Xuc_xac_2: 4, Xuc_xac_3: 5, Tong: 13, Ket_qua: 'Tài', Phien_tiep: 305 },
    { Phien: 303, Xuc_xac_1: 1, Xuc_xac_2: 2, Xuc_xac_3: 3, Tong: 6, Ket_qua: 'Xỉu' },
    { Phien: 302, Xuc_xac_1: 2, Xuc_xac_2: 3, Xuc_xac_3: 4, Tong: 9, Ket_qua: 'Xỉu' },
    { Phien: 301, Xuc_xac_1: 5, Xuc_xac_2: 4, Xuc_xac_3: 3, Tong: 12, Ket_qua: 'Tài' },
    { Phien: 300, Xuc_xac_1: 1, Xuc_xac_2: 3, Xuc_xac_3: 4, Tong: 8, Ket_qua: 'Xỉu' }
  ];
  const paused = await poll('betvip/tx');
  assert.equal(paused.Trang_thai, 'TAM_DUNG_BAO_VE');
  assert.equal(paused.Du_doan, null);
  assert.equal(paused.Consecutive_losses, 3);
  assert.equal(api._state.predHistory['betvip/tx'][0].risk_pause, true);

  axiosState.data = [
    { Phien: 305, Xuc_xac_1: 6, Xuc_xac_2: 2, Xuc_xac_3: 4, Tong: 12, Ket_qua: 'Tài', Phien_tiep: 306 },
    { Phien: 304, Xuc_xac_1: 4, Xuc_xac_2: 4, Xuc_xac_3: 5, Tong: 13, Ket_qua: 'Tài' },
    { Phien: 303, Xuc_xac_1: 1, Xuc_xac_2: 2, Xuc_xac_3: 3, Tong: 6, Ket_qua: 'Xỉu' },
    { Phien: 302, Xuc_xac_1: 2, Xuc_xac_2: 3, Xuc_xac_3: 4, Tong: 9, Ket_qua: 'Xỉu' },
    { Phien: 301, Xuc_xac_1: 5, Xuc_xac_2: 4, Xuc_xac_3: 3, Tong: 12, Ket_qua: 'Tài' },
    { Phien: 300, Xuc_xac_1: 1, Xuc_xac_2: 3, Xuc_xac_3: 4, Tong: 8, Ket_qua: 'Xỉu' }
  ];
  const resumed = await poll('betvip/tx');
  assert.equal(resumed.Trang_thai, 'DA_SAN_SANG');
  assert.ok(['Tài', 'Xỉu'].includes(resumed.Du_doan));
  assert.equal(resumed.Phien_tiep, 306);
});

test('Risk-pause history is labeled separately and is not counted as a loss', () => {
  const row = { phien: '888', du_doan: 'Tạm dừng bảo vệ', risk_pause: true, pause_reason: 'test', ok: null };
  assert.match(api.formatHistoryRow(row, api.GAMES['lc79/tx']), /TẠM DỪNG BẢO VỆ/);
  api._state.predHistory['max789/kubet'] = [row,
    { phien: '887', du_doan: 'Tài', pred_side: 'T', ok: false },
    { phien: '886', du_doan: 'Tài', pred_side: 'T', ok: false }
  ];
  assert.equal(api.consecutiveLossState('max789/kubet').count, 0);
});

/* ===================== Regression tests for audit fixes ===================== */

test('Xoc Dia reason text uses Chẵn/Lẻ and never Tài/Xỉu', () => {
  const pattern = [1, 3, 1, 1, 3, 1, 3, 1, 1, 1, 3, 1, 3, 3, 1, 1, 1, 3, 1, 3];
  const rows = pattern.map((red, i) => ({
    session: String(9000 - i), side: red % 2 === 0 ? 'CHAN' : 'LE',
    sideSource: 'derived_color', doCount: red, vi: api.formatXocdia(red),
    dice: [], sum: null, time: null
  }));
  const engine = new api.Engine('lc79/xocdia', 'xocdia');
  engine.loadHistory(rows);
  const result = engine.predict();
  assert.equal(result.ready, undefined, 'engine should be ready with 20 samples');
  assert.ok(['Chẵn', 'Lẻ'].includes(result.label));
  assert.doesNotMatch(result.lyDo, /Tài|Xỉu|xúc|tổng/i);
  assert.match(result.lyDo, /Chẵn|Lẻ/);
});

test('Protected-skip session stays in /history with its real result and no win/loss', () => {
  const gameId = 'lc79/xocdia';
  const game = api.GAMES[gameId];
  const src = (session, red) => ({
    session, side: red % 2 === 0 ? 'CHAN' : 'LE', sideSource: 'derived_color',
    doCount: red, vi: api.formatXocdia(red), dataWarning: null, dice: [], sum: null, time: null
  });
  // Newest first, as the source returns it.
  const rows = [src('8128126', 1), src('8128125', 2), src('8128124', 3)];
  api._state.sourceCache[gameId] = rows;
  api._state.predHistory[gameId] = [
    { phien: '8128126', du_doan: 'Lẻ', pred_side: 'LE', conf: 55, ok: null, void: false },
    { phien: '8128125', du_doan: 'Tạm dừng bảo vệ', pred_side: null, conf: null, risk_pause: true, ok: null },
    { phien: '8128124', du_doan: 'Chẵn', pred_side: 'CHAN', conf: 52, ok: null, void: false }
  ];
  api.settlePredictionLogs(gameId, rows);
  const history = api.buildGameHistory(gameId, game);
  assert.deepEqual(history.map(row => row.phien), [8128126, 8128125, 8128124],
    'skipped session 8128125 must not disappear from history');
  const skipped = history.find(row => row.phien === 8128125);
  assert.equal(skipped.chan_le, 'Chẵn');
  assert.equal(skipped.icon, '⏸️');
  // Stats must not count the protected skip as a loss.
  const stats = api.getGamePredictionStats(gameId);
  assert.equal(stats.sai + stats.dung, 2);
  assert.equal(stats.tam_dung, 1);
});

test('/history also lists source sessions that were never logged as forecasts', () => {
  const gameId = 'lc79/xocdia';
  const game = api.GAMES[gameId];
  const src = (session, red) => ({
    session, side: red % 2 === 0 ? 'CHAN' : 'LE', sideSource: 'derived_color',
    doCount: red, vi: api.formatXocdia(red), dataWarning: null, dice: [], sum: null, time: null
  });
  const rows = [src('700', 3), src('699', 2)];
  api._state.sourceCache[gameId] = rows;
  api._state.predHistory[gameId] = [];
  const history = api.buildGameHistory(gameId, game);
  assert.deepEqual(history.map(row => row.phien), [700, 699]);
  assert.equal(history[0].ket_qua, '3 đỏ - 1 trắng');
  assert.equal(history[0].icon, '➖', 'no forecast recorded: neutral icon, never a fake verdict');
});

test('A three-dice triple shows Bộ ba instead of null Ket_qua', async () => {
  axiosState.data = { list: [{ session: 5000, Xuc_xac: '1 - 1 - 1', Ket_qua: null }] };
  const result = await poll('betvip/tx');
  assert.equal(result.Ket_qua, 'Bộ ba');
  assert.equal(result.Xuc_xac, '1 - 1 - 1');
});

test('Corrupt source file is backed up before a new write can overwrite it', () => {
  const gameId = 'lc79/md5';
  const file = path.join(testDataDir, `source_${gameId.replace('/', '_')}.json`);
  fs.writeFileSync(file, '[{"session":"1","side":"T"', 'utf8'); // truncated JSON
  const merged = api.mergeSourceHistory(gameId, [{ session: '2', side: 'X', sideSource: 'dice_sum', dice: [1, 2, 3], sum: 6 }]);
  assert.equal(merged.length, 1);
  const backups = fs.readdirSync(testDataDir).filter(name => name.startsWith(`source_${gameId.replace('/', '_')}.json.corrupt-`));
  assert.equal(backups.length, 1, 'the corrupted file must be preserved as a .corrupt- backup');
  assert.match(fs.readFileSync(path.join(testDataDir, backups[0]), 'utf8'), /"session":"1"/);
});

test('Embedded cầu rows never stamp synthetic:true onto a real session', () => {
  const gameId = 'hitclub/md5';
  api.mergeSourceHistory(gameId, [{ session: '500', side: 'T', sideSource: 'dice_sum', dice: [4, 5, 6], sum: 15 }]);
  api.mergeSourceHistory(gameId, [
    { session: '499', side: 'X', sideSource: 'embedded_cau', synthetic: true, dice: [], sum: null, time: null },
    { session: '500', side: 'X', sideSource: 'embedded_cau', synthetic: true, dice: [], sum: null, time: null }
  ]);
  const file = path.join(testDataDir, 'source_hitclub_md5.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  const real = stored.find(row => row.session === '500');
  assert.equal(real.side, 'T', 'a weaker embedded label must not override the real outcome');
  assert.equal(real.sideSource, 'dice_sum');
  assert.notEqual(real.synthetic, true, 'real session must not be flagged synthetic');
  const hidden = stored.find(row => row.session === '499');
  assert.equal(hidden.synthetic, true, 'purely embedded session keeps its synthetic flag');
});

test('Fresh source result is reused briefly so bursts of requests do not each hit the source', async () => {
  const gameId = 'hitclub/tx';
  delete api._state.recentOk[gameId];
  axiosState.data = { list: [{ session: 7000, Xuc_xac: '2 - 3 - 4', Ket_qua: 'Tài' }] };
  const first = await api.runPredict(gameId);
  axiosState.data = { list: [{ session: 7001, Xuc_xac: '5 - 5 - 6', Ket_qua: 'Tài' }] };
  const second = await api.runPredict(gameId);
  assert.equal(second, first, 'second call inside the cache window returns the same payload');
  delete api._state.recentOk[gameId];
  const third = await api.runPredict(gameId);
  assert.equal(third.Phien, 7001, 'after the window the source is read again');
});

test('Engine no longer fabricates a forecast when history is insufficient', () => {
  const engine = new api.Engine('betvip/tx', 'tx');
  engine.loadHistory([]);
  const result = engine.predict();
  assert.equal(result.ready, false);
  assert.equal(result.side, undefined);
  assert.equal(result.label, undefined);
});

test('Capital Vietnamese colour Đỏ is recognised (Xóc Đĩa sides are not dropped)', () => {
  const rows = api.parseLc79Xocdia({ list: [
    { session: 11, dices: ['Đỏ', 'Trắng', 'Đỏ', 'Trắng'] },
    { session: 12, dices: ['đỏ', 'trắng', 'trắng', 'trắng'] },
    { session: 13, dices: ['Trắng', 'Trắng', 'Trắng', 'Trắng'] }
  ] });
  const bySession = Object.fromEntries(rows.map(row => [row.session, row]));
  assert.equal(bySession['11'].doCount, 2);
  assert.equal(bySession['11'].side, 'CHAN');
  assert.equal(bySession['12'].doCount, 1);
  assert.equal(bySession['12'].side, 'LE');
  assert.equal(bySession['13'].doCount, 0);
  assert.equal(bySession['13'].side, 'CHAN');
});

/* ===================== New tests for advanced cầu analysis ===================== */
test('analyzeCauStructure detects long bệt', () => {
  const sides = ['X','X','T','T','T','T','T','T','T'];
  const info = api.analyzeCauStructure(sides);
  assert.equal(info.regime, 'BET');
  assert.equal(info.run, 7);
  assert.ok(info.stability >= 0.7);
});

test('analyzeCauStructure detects 1-1 đảo', () => {
  const sides = ['T','X','T','X','T','X','T','X','T','X'];
  const info = api.analyzeCauStructure(sides);
  assert.equal(info.regime, 'DAO_11');
  assert.ok(info.stability >= 0.9);
});

test('analyzeCauStructure detects cycle period 2', () => {
  const sides = ['T','X','T','X','T','X','T','X','T','X','T','X'];
  const info = api.analyzeCauStructure(sides);
  // Can be DAO_11 or CYCLE depending on order of checks
  assert.ok(info.regime === 'DAO_11' || (info.regime === 'CYCLE' && info.cycle && info.cycle.period === 2));
});

test('analyzeCauStructure marks mixed / high switch', () => {
  const sides = ['T','X','T','T','X','T','X','X','T','X','T','X','T'];
  const info = api.analyzeCauStructure(sides);
  assert.ok(['MIXED', 'CUM', 'DAO_11', 'BET'].includes(info.regime));
  assert.ok(typeof info.switchRate === 'number');
  assert.ok(typeof info.entropy === 'number');
});

test('modelProbability exposes regime and cauStructure', () => {
  const history = [];
  for (let i = 0; i < 30; i++) {
    history.push({ session: String(1000 + i), side: i % 2 === 0 ? 'T' : 'X', sum: 10 + (i % 5), dice: [1, 2, 3 + (i % 3)] });
  }
  const model = api.modelProbability(history, 'tx', 'lc79/tx');
  assert.ok(model);
  assert.ok(model.regime);
  assert.ok(model.cauStructure);
  assert.ok(model.cauStructure.description);
});

test('MAX789 profile remains independent and unchanged in structure', () => {
  const p = api.getModelProfile('max789/tx');
  assert.equal(p.name, 'max789-tx-longer-context');
  assert.equal(p.shortWindow, 18);
  assert.equal(p.mediumWindow, 48);
  assert.equal(p.longWindow, 112);
  assert.ok(p.weights.markov1 >= 0.12);
});
