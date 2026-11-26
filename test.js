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

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-api-v5-test-'));
process.env.DATA_DIR = testDataDir;
const api = require('./server');

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
  assert.match(row.dataWarning, /Kết quả từ API là Xỉu/);
  assert.equal(row.time, '2026-11-26T04:58:06.000Z');
  assert.equal(row.apiSampleSize, 100);
});

test('Dice sum wins over a conflicting reported total', () => {
  const row = api.parseMax789({ data: [{
    Phien: 12, Xuc_xac: '1 - 2 - 3', Tong: 13, Ket_qua: 'Tài'
  }] })[0];
  assert.equal(row.sum, 6);
  assert.equal(row.side, 'X');
  assert.match(row.dataWarning, /Tổng từ API 13 lệch tổng xúc xắc 6/);
  assert.match(row.dataWarning, /Kết quả từ API là Tài/);
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
});

test('Sunhot one-result API response is parsed with next session', () => {
  const rows = api.parseSunhot({ phien_truoc: '55', phien_hien_tai: '56', ket_qua: 'Xỉu' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session, '55');
  assert.equal(rows[0].nextSession, '56');
  assert.equal(rows[0].side, 'X');
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
    sum: 13, dice: [5, 2, 6], dataWarning: 'Kết quả từ API là Xỉu nhưng tính từ xúc xắc ra Tài'
  }]);
  const row = api._state.predHistory['max789/md5'][0];
  assert.equal(row.actual, 'Tài');
  assert.equal(row.actual_side, 'T');
  assert.equal(row.actual_dice, '5 - 2 - 6');
  assert.equal(row.actual_sum, 13);
  assert.equal(row.ok, true);
  assert.match(row.data_warning, /Kết quả từ API/);
});

test('History display is one compact result-only line with no prediction', () => {
  const row = {
    phien: '500', du_doan: 'Tài', actual: 'Tài', actual_side: 'T',
    actual_dice: '5 - 2 - 6', actual_sum: 13, ok: true, conf: 58
  };
  const formatted = api.formatHistoryRow(row, api.GAMES['max789/md5']);
  assert.match(formatted, /^500 · 5-2-6 · Tài \(13\) · ✅$/);
  assert.doesNotMatch(formatted, /Dự đoán/);
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
  assert.equal(responseBody.thanh_cong, true);
  const settled = responseBody.cac_phien.find(item => String(item.phien) === '1919916');
  assert.ok(settled);
  assert.equal(settled.ket_qua, 'Tài');
  assert.equal(settled.xuc_xac, '5 - 2 - 6');
  assert.equal(settled.bieu_tuong, '✅');
  const embeddedSettled = responseBody.cac_phien.find(item => String(item.phien) === '1919915');
  assert.ok(embeddedSettled);
  assert.equal(embeddedSettled.ket_qua, 'Tài');
  assert.equal(embeddedSettled.bieu_tuong, '✅');
  assert.equal(responseBody.loi_lam_moi, null);
  assert.ok(responseBody.lich_su.every(line => !/Dự đoán/.test(line)));
  axiosState.data = null;
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
  assert.match(prediction.vi, /đỏ - .*trắng/);
  assert.ok(prediction.topVi.every(value => /đỏ - .*trắng/.test(value)));
});

test('Every game has an independent model profile (not the LC79 profile reused)', () => {
  const ids = Object.keys(api.GAMES);
  for (const id of ids) assert.ok(api.MODEL_PROFILES[id], `Missing profile for ${id}`);
  assert.notEqual(api.getModelProfile('lc79/tx').name, api.getModelProfile('max789/md5').name);
  assert.ok(!ids.includes('sunwin/sicbo'));
  assert.notEqual(api.getModelProfile('lc79/tx').shortWindow, api.getModelProfile('hitclub/tx').shortWindow);
  assert.notEqual(api.getModelProfile('lc79/md5').weights.pattern, api.getModelProfile('max789/md5').weights.pattern);
});

test('A game with fewer than five source sessions remains in warm-up and emits no fake forecast', async () => {
  api._state.predHistory['sunhot/tx'] = [];
  let result;
  // This simulates a provider that exposes only the current result, not a history array.
  for (let session = 101; session <= 104; session++) {
    axiosState.data = {
      phien_truoc: String(session),
      phien_hien_tai: String(session + 1),
      ket_qua: session % 2 ? 'Tài' : 'Xỉu'
    };
    result = await api.runPredict('sunhot/tx');
    assert.equal(result.trang_thai, 'đang học dữ liệu');
    assert.equal(result.so_phien_du_lieu, session - 100);
    assert.equal(result.du_doan, null);
  }
  assert.equal(result.san_sang, false);
  assert.equal(result.so_phien_du_lieu, 4);
  assert.equal(result.con_thieu, 1);
  assert.equal(result.du_doan_cua, null);
  assert.equal(api._state.predHistory['sunhot/tx'].length, 0);
});

test('A game starts forecasting only after the fifth distinct valid session is saved', async () => {
  // Only the fifth current result is returned; the previous four must have been retained locally.
  axiosState.data = {
    phien_truoc: '105', phien_hien_tai: '106', ket_qua: 'Tài'
  };
  const result = await api.runPredict('sunhot/tx');
  assert.equal(result.trang_thai, 'đã sẵn sàng');
  assert.equal(result.san_sang, true);
  assert.equal(result.so_phien_du_lieu, 5);
  assert.ok(['Tài', 'Xỉu'].includes(result.du_doan));
  assert.equal(result.phien_tiep, 106);
  assert.equal(api._state.predHistory['sunhot/tx'].length, 1);
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
  const paused = await api.runPredict('betvip/tx');
  assert.equal(paused.trang_thai, 'tạm dừng bảo vệ');
  assert.equal(paused.du_doan, null);
  assert.equal(paused.so_lan_sai_lien_tiep, 3);
  assert.equal(api._state.predHistory['betvip/tx'][0].risk_pause, true);

  axiosState.data = [
    { Phien: 305, Xuc_xac_1: 6, Xuc_xac_2: 2, Xuc_xac_3: 4, Tong: 12, Ket_qua: 'Tài', Phien_tiep: 306 },
    { Phien: 304, Xuc_xac_1: 4, Xuc_xac_2: 4, Xuc_xac_3: 5, Tong: 13, Ket_qua: 'Tài' },
    { Phien: 303, Xuc_xac_1: 1, Xuc_xac_2: 2, Xuc_xac_3: 3, Tong: 6, Ket_qua: 'Xỉu' },
    { Phien: 302, Xuc_xac_1: 2, Xuc_xac_2: 3, Xuc_xac_3: 4, Tong: 9, Ket_qua: 'Xỉu' },
    { Phien: 301, Xuc_xac_1: 5, Xuc_xac_2: 4, Xuc_xac_3: 3, Tong: 12, Ket_qua: 'Tài' },
    { Phien: 300, Xuc_xac_1: 1, Xuc_xac_2: 3, Xuc_xac_3: 4, Tong: 8, Ket_qua: 'Xỉu' }
  ];
  const resumed = await api.runPredict('betvip/tx');
  assert.equal(resumed.trang_thai, 'đã sẵn sàng');
  assert.ok(['Tài', 'Xỉu'].includes(resumed.du_doan));
  assert.equal(resumed.phien_tiep, 306);
});

test('Risk-pause history is labeled separately and is not counted as a loss', () => {
  const row = { phien: '888', du_doan: 'Tạm dừng bảo vệ', risk_pause: true, pause_reason: 'test', ok: null };
  assert.match(api.formatHistoryRow(row, api.GAMES['lc79/tx']), /888 · tạm nghỉ · ⏸️/);
  api._state.predHistory['max789/kubet'] = [row,
    { phien: '887', du_doan: 'Tài', pred_side: 'T', ok: false },
    { phien: '886', du_doan: 'Tài', pred_side: 'T', ok: false }
  ];
  assert.equal(api.consecutiveLossState('max789/kubet').count, 0);
});


test('Xocdia accepts a result-only Vietnamese pattern without reading dice', () => {
  const row = api.parseLc79Xocdia({ data: [{
    Phien: 777,
    Ket_qua: '3 đỏ - 1 trắng',
    Phien_tiep: 778
  }] })[0];
  assert.equal(row.session, '777');
  assert.equal(row.side, 'LE');
  assert.equal(row.vi, '3 đỏ - 1 trắng');
  assert.equal(row.doCount, 3);
  assert.equal(row.trangCount, 1);
  assert.deepEqual(row.dice, []);
});

test('Xocdia prefers the derived red/white parity when API parity conflicts', () => {
  const row = api.parseLc79Xocdia({ list: [{
    Phien: 779,
    resultVi: '3 đỏ - 1 trắng',
    Ket_qua: 'Chẵn'
  }] })[0];
  assert.equal(row.side, 'LE');
  assert.match(row.dataWarning, /lệch mẫu màu 3 đỏ - 1 trắng/);
});

test('Xocdia can parse four color values and never labels them as dice', () => {
  const row = api.parseLc79Xocdia({ list: [{
    Phien: 778,
    Ket_qua: ['đỏ', 'trắng', 'đỏ', 'đỏ']
  }] })[0];
  assert.equal(row.vi, '3 đỏ - 1 trắng');
  assert.equal(row.side, 'LE');
  assert.deepEqual(row.dice, []);
});

test('Game root exposes per-game correct/wrong/rate statistics in Vietnamese', () => {
  api._state.predHistory['lc79/tx'] = [
    { phien: '3', ok: true },
    { phien: '2', ok: false },
    { phien: '1', ok: null }
  ];
  const handler = registeredRoutes.get('GET /');
  let body;
  handler({}, { json(value) { body = value; } });
  assert.equal(body.phien_ban, '5.0.0');
  assert.ok(!Object.hasOwn(body, 'games'));
  const lc79 = body.cac_game.find(game => game.ma_game === 'lc79/tx');
  assert.deepEqual(lc79.thong_ke, {
    tong_phien: 3, dung: 1, sai: 1, dang_cho: 1,
    bo_qua: 0, tam_dung: 0, da_chot: 2, ti_le_dung: 50
  });
  assert.ok(!body.cac_game.some(game => game.ma_game === 'sunwin/sicbo'));
});

test('History response has compact result-only rows and Xocdia never includes dice fields', async () => {
  api._state.predHistory['lc79/xocdia'] = [
    { phien: '900', du_doan: 'Lẻ', pred_side: 'LE', actual: 'Lẻ', actual_side: 'LE', actual_vi: '3 đỏ - 1 trắng', ok: true, actual_dice: null }
  ];
  axiosState.data = { Phien: 901, Ket_qua: '2 đỏ - 2 trắng', Phien_tiep: 902 };
  const handler = registeredRoutes.get('GET /:brand/:table/history');
  let body = null;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { body = value; return this; } };
  await handler({ params: { brand: 'lc79', table: 'xocdia' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(body.lich_su.some(line => line === '900 · 3 đỏ - 1 trắng · Lẻ · ✅'));
  assert.ok(body.cac_phien.every(row => !Object.hasOwn(row, 'xuc_xac')));
  assert.ok(body.lich_su.every(line => !/Dự đoán|xúc xắc/i.test(line)));
  axiosState.data = null;
});


test('Xocdia prediction JSON is Vietnamese and contains no dice or sum keys', async () => {
  api._state.predHistory['lc79/xocdia'] = [];
  axiosState.data = { list: [
    { Phien: 1005, Ket_qua: '3 đỏ - 1 trắng' },
    { Phien: 1004, Ket_qua: '2 đỏ - 2 trắng' },
    { Phien: 1003, Ket_qua: '1 đỏ - 3 trắng' },
    { Phien: 1002, Ket_qua: '4 đỏ - 0 trắng' },
    { Phien: 1001, Ket_qua: '3 đỏ - 1 trắng' }
  ] };
  const result = await api.runPredict('lc79/xocdia');
  assert.equal(result.ten_game, 'LC79 Xóc Đĩa');
  assert.equal(result.ket_qua, 'Lẻ');
  assert.equal(result.san_sang, true);
  assert.ok(result.chuoi_cau.includes('Chẵn') || result.chuoi_cau.includes('Lẻ'));
  assert.match(result.mau_ket_qua, /đỏ - .*trắng/);
  assert.ok(result.vi_du_doan === '2 đỏ - 2 trắng' || /đỏ - .*trắng/.test(result.vi_du_doan));
  assert.ok(!Object.hasOwn(result, 'xuc_xac'));
  assert.ok(!Object.hasOwn(result, 'tong'));
  assert.ok(!Object.keys(result).some(key => /^(id|Name|Phien|Ket_qua|Du_doan|Time|Sample_size)$/.test(key)));
  axiosState.data = null;
});
