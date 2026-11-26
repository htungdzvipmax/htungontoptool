'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-api-v2-test-'));
process.env.DATA_DIR = testDataDir;
const api = require('./server');

after(() => {
  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch (_) {}
});

test('LC79 TX parser reads sessions, dice, sum and result', () => {
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

test('Xocdia parser converts color patterns to Vietnamese', () => {
  const rows = api.parseLc79Xocdia({ list: [
    { id: '20', dices: ['đỏ', 'đỏ', 'đỏ', 'trắng'], resultTruyenThong: 'LẺ', resultVi: 'three_do' },
    { id: '19', dices: ['trắng', 'trắng', 'đỏ', 'đỏ'], resultTruyenThong: 'CHẴN', resultVi: 'two_trang' }
  ] });
  assert.equal(rows[0].side, 'LE');
  assert.equal(rows[0].vi, '3 đỏ - 1 trắng');
  assert.equal(rows[1].vi, '2 đỏ - 2 trắng');
  assert.equal(api.redCountFromVi('four_trang'), 0);
  assert.equal(api.redCountFromVi('one_trang'), 3);
  assert.equal(api.redCountFromVi('3 đỏ - 1 trắng'), 3);
});

test('Sunhot one-result API response is parsed with next session', () => {
  const rows = api.parseSunhot({
    phien_truoc: '55', phien_hien_tai: '56', ket_qua: 'Xỉu'
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session, '55');
  assert.equal(rows[0].nextSession, '56');
  assert.equal(rows[0].side, 'X');
});

test('Sunwin, Max789 and Hitclub parsers accept their common JSON shapes', () => {
  const sunwin = api.parseSunwinSicbo({ data: { resultList: [
    { gameNum: '#200', facesList: [2, 4, 5], score: 11, timeMilli: 1760000000000 }
  ] } });
  assert.equal(sunwin[0].session, '200');
  assert.deepEqual(sunwin[0].dice, [2, 4, 5]);
  assert.equal(sunwin[0].side, 'T');

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
    { session: '105', side: 'T' },
    { session: '104', side: 'X' },
    { session: '103', side: 'T' }
  ]);
  assert.deepEqual(rows.map(row => row.session), ['105', '104', '103']);
  rows = api.mergeSourceHistory('lc79/tx', [
    { session: '106', side: 'X' },
    { session: '105', side: 'T' }
  ]);
  assert.deepEqual(rows.map(row => row.session), ['106', '105', '104', '103']);
});

test('A settled forecast matches its exact session and records dice + icon data', () => {
  api._state.predHistory['lc79/tx'] = [{
    phien: '500', du_doan: 'Tài', pred_side: 'T', conf: 58, ok: null
  }];
  api.settlePredictionLogs('lc79/tx', [{
    session: '500', side: 'X', sum: 7, dice: [1, 2, 4]
  }]);
  const row = api._state.predHistory['lc79/tx'][0];
  assert.equal(row.ok, false);
  assert.equal(row.actual, 'Xỉu');
  assert.equal(row.actual_dice, '1 - 2 - 4');
  const formatted = api.formatHistoryRow(row, api.GAMES['lc79/tx']);
  assert.match(formatted, /Phiên 500/);
  assert.match(formatted, /1 - 2 - 4/);
  assert.match(formatted, /❌/);
});

test('Prediction remains stable for an already-created target session', () => {
  api._state.predHistory['betvip/tx'] = [];
  api.pushPredLog('betvip/tx', {
    phien: '900', du_doan: 'Xỉu', pred_side: 'X', conf: 54, ok: null
  });
  const result = api.pushPredLog('betvip/tx', {
    phien: '900', du_doan: 'Tài', pred_side: 'T', conf: 62, ok: null
  });
  assert.equal(result.du_doan, 'Xỉu');
});

test('Adaptive engine handles a long bệt and returns bounded confidence', () => {
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

test('Xocdia prediction provides red-white patterns in Vietnamese', () => {
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
