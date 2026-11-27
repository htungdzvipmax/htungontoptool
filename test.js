'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

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

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-api-algo-only-'));
process.env.DATA_DIR = testDataDir;
const api = require('./server');
const algo = api.AlgorithmOnly;
const poll = gameId => { delete api._state.recentOk[gameId]; return api.runPredict(gameId); };

function txHistory(count, sideAt = i => (i % 4 < 2 ? 'T' : 'X')) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const side = sideAt(i - 1);
    const dice = side === 'T' ? [3, 4, 4] : [2, 3, 3];
    rows.push({
      session: String(10000 + i), side, sideSource: 'dice_sum',
      dice, sum: dice.reduce((a, b) => a + b, 0), synthetic: false
    });
  }
  return rows.reverse(); // newest-first for Engine.loadHistory
}

function xocdiaHistory(count) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const red = [0, 1, 2, 3, 4][i % 5];
    rows.push({
      session: String(20000 + i), side: red % 2 === 0 ? 'CHAN' : 'LE',
      sideSource: 'derived_color', doCount: red, trangCount: 4 - red,
      vi: `${red} đỏ - ${4 - red} trắng`, dice: [], sum: null
    });
  }
  return rows.reverse();
}

after(() => {
  Module._load = originalLoad;
  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch (_) {}
});

test('Keeps the 10 configured games and uses one independent extracted-algorithm profile per game', () => {
  assert.equal(Object.keys(api.GAMES).length, 10);
  const names = Object.keys(api.GAMES).map(id => api.getModelProfile(id).name);
  assert.equal(new Set(names).size, 10);
  assert.ok(names.every(name => name.includes(algo.ALGO_VERSION)));
});

test('The old PRED-API prediction model has been removed from the server exports', () => {
  assert.equal('modelProbability' in api, false);
  assert.equal('MODEL_PROFILES' in api, false);
  assert.equal('analyzeCauStructure' in api, false);
});

test('The imported algorithm requires at least 15 valid unique sessions', () => {
  assert.equal(api.getModelProfile('lc79/tx').minHistory, 15);
  const engine14 = new api.Engine('lc79/tx', 'tx');
  engine14.loadHistory(txHistory(14));
  assert.equal(engine14.predict().ready, false);
  const engine15 = new api.Engine('lc79/tx', 'tx');
  engine15.loadHistory(txHistory(15));
  assert.equal(engine15.predict().ready, true);
});

test('All TX/MD5 games call algorithm-only and return valid Tài/Xỉu without using the legacy engine', () => {
  const ids = Object.keys(api.GAMES).filter(id => api.GAMES[id].type === 'tx');
  for (const id of ids) {
    const engine = new api.Engine(id, 'tx');
    engine.loadHistory(txHistory(70));
    const result = engine.predict();
    assert.equal(result.ready, true, id);
    assert.ok(['Tài', 'Xỉu'].includes(result.label), id);
    assert.ok(Number.isFinite(result.conf) && result.conf >= 50 && result.conf <= 82, id);
    assert.equal(result.algorithmVersion, algo.ALGO_VERSION, id);
    assert.ok(Array.isArray(result.algorithmPatterns), id);
  }
});

test('Xóc Đĩa uses the extracted binary pattern core but exposes only Chẵn/Lẻ wording', () => {
  const engine = new api.Engine('lc79/xocdia', 'xocdia');
  engine.loadHistory(xocdiaHistory(80));
  const result = engine.predict();
  assert.equal(result.ready, true);
  assert.ok(['Chẵn', 'Lẻ'].includes(result.label));
  assert.doesNotMatch(result.lyDo, /Tài|Xỉu|xúc xắc|tổng điểm/i);
  assert.equal(result.vi, null);
  assert.deepEqual(result.topVi, []);
  assert.equal(result.algorithmVersion, algo.ALGO_VERSION);
});

test('Xóc Đĩa data without dice/sum cannot trigger the extracted dice or extreme-sum patterns', () => {
  const engine = new api.Engine('lc79/xocdia', 'xocdia');
  engine.loadHistory(xocdiaHistory(80));
  const result = engine.predict();
  assert.ok(!result.algorithmPatterns.some(pattern => /Cực Điểm|Kháng Cự|Hỗ Trợ|Biểu Đồ/.test(pattern.name || '')));
});

test('Algorithm-only random signal and random jitter are disabled in integrated PRED-API', () => {
  const engine = new api.Engine('betvip/tx', 'tx');
  engine.loadHistory(txHistory(80));
  const first = engine.predict();
  const second = engine.predict();
  assert.equal(first.label, second.label);
  assert.equal(first.conf, second.conf);
  assert.ok(!first.algorithmPatterns.some(pattern => pattern.patternId === 'virtual_organic_chaos'));
});

test('Settled prediction updates the matching game profile exactly once and persists learning state', () => {
  const gameId = 'lc79/tx';
  algo.resetAlgorithmLearning(gameId);
  api._state.predHistory[gameId] = [];
  api.pushPredLog(gameId, {
    phien: '50001', du_doan: 'Tài', pred_side: 'T', conf: 61,
    algorithm_patterns: [{ patternId: 'cau_bet', name: 'Cầu Bệt' }], ok: null
  });
  const source = [{
    session: '50001', side: 'T', sideSource: 'dice_sum', sum: 12,
    dice: [3, 4, 5], dataWarning: null
  }];
  api.settlePredictionLogs(gameId, source);
  let state = algo.getAlgorithmLearningState(gameId);
  assert.equal(state.totalPredictions, 1);
  assert.equal(state.correctPredictions, 1);
  assert.equal(api._state.predHistory[gameId][0].algorithm_learned, true);
  api.settlePredictionLogs(gameId, source);
  state = algo.getAlgorithmLearningState(gameId);
  assert.equal(state.totalPredictions, 1, 'same session must not train twice');
  const saved = JSON.parse(fs.readFileSync(path.join(testDataDir, 'algorithm_learning.json'), 'utf8'));
  assert.equal(saved[gameId].totalPredictions, 1);
});

test('Xóc Đĩa learning maps parity internally and stores public parity result unchanged', () => {
  const gameId = 'lc79/xocdia';
  algo.resetAlgorithmLearning(gameId);
  api._state.predHistory[gameId] = [];
  api.pushPredLog(gameId, {
    phien: '60001', du_doan: 'Chẵn', pred_side: 'CHAN', conf: 60,
    algorithm_patterns: [{ patternId: 'cau_dao_11' }], ok: null
  });
  api.settlePredictionLogs(gameId, [{
    session: '60001', side: 'CHAN', sideSource: 'derived_color',
    doCount: 2, vi: '2 đỏ - 2 trắng', dice: [], sum: null
  }]);
  assert.equal(api._state.predHistory[gameId][0].actual, 'Chẵn');
  assert.equal(algo.getAlgorithmLearningState(gameId).totalPredictions, 1);
});

test('Unsettled prediction from the removed engine is archived and regenerated by algorithm-only', async () => {
  const gameId = 'lc79/tx';
  const items = [];
  for (let i = 10015; i >= 10001; i--) {
    const dice = i % 2 ? [4, 4, 5] : [2, 3, 3];
    items.push({ id: i, dices: dice, point: dice.reduce((a, b) => a + b, 0), resultTruyenThong: i % 2 ? 'TAI' : 'XIU' });
  }
  axiosState.data = { list: items };
  api._state.predHistory[gameId] = [{
    phien: '10016', du_doan: 'Xỉu', pred_side: 'X', conf: 54,
    ly_do: 'legacy engine', ok: null, actual: null
  }];
  delete api._state.recentOk[gameId];
  const result = await api.runPredict(gameId);
  assert.equal(result.Phien_tiep, 10016);
  assert.equal(result.Algorithm_version, algo.ALGO_VERSION);
  assert.notEqual(result.Ly_do, 'legacy engine');
  assert.equal(api._state.predHistory[gameId].length, 1);
  assert.equal(api._state.predHistory[gameId][0].algorithm_version, algo.ALGO_VERSION);
  const archived = JSON.parse(fs.readFileSync(path.join(testDataDir, 'superseded_predictions.json'), 'utf8'));
  assert.equal(archived[0].phien, '10016');
  assert.match(archived[0].superseded_reason, /algorithm-only/);
  axiosState.data = null;
});

test('Algorithm learning state can be restored after a process restart', () => {
  const state = algo.getAlgorithmLearningState('hitclub/md5');
  state.totalPredictions = 17;
  state.correctPredictions = 9;
  state.patternWeights.cau_bet = 1.25;
  algo.setAlgorithmLearningState('hitclub/md5', state);
  const restored = algo.getAlgorithmLearningState('hitclub/md5');
  assert.equal(restored.totalPredictions, 17);
  assert.equal(restored.patternWeights.cau_bet, 1.25);
});

test('Three-dice triple remains void and is never trained as Tài/Xỉu', () => {
  const gameId = 'betvip/tx';
  algo.resetAlgorithmLearning(gameId);
  api._state.predHistory[gameId] = [{ phien: '70001', du_doan: 'Xỉu', pred_side: 'X', ok: null }];
  api.settlePredictionLogs(gameId, [{
    session: '70001', side: null, sideSource: 'triple', sum: 3,
    dice: [1, 1, 1], dataWarning: 'triple'
  }]);
  assert.equal(api._state.predHistory[gameId][0].void, true);
  assert.equal(algo.getAlgorithmLearningState(gameId).totalPredictions, 0);
});

test('Parser and compact history interfaces remain available after replacing the prediction engine', () => {
  const parsed = api.parseMax789([{ Phien: 99, Xuc_xac: '4 - 4 - 5', Tong: 13, Ket_qua: 'Tài' }]);
  assert.equal(parsed[0].session, '99');
  assert.equal(parsed[0].side, 'T');
  const row = api.formatCompactHistoryRow({
    phien: '2992', actual: 'Tài', actual_dice: '6 - 4 - 2', actual_sum: 12, ok: false
  }, api.GAMES['lc79/tx']);
  assert.deepEqual(row, { phien: 2992, d1: 6, d2: 4, d3: 2, ket_qua: 'Tài', icon: '❌' });
});

test('Health and games endpoints expose the new algorithm version and 15-session threshold', async () => {
  const health = registeredRoutes.get('GET /health');
  let healthBody;
  health({}, { json(value) { healthBody = value; return this; } });
  assert.equal(healthBody.version, '4.2.0');
  assert.equal(healthBody.min_history_sessions, 15);
  const games = registeredRoutes.get('GET /games');
  let gamesBody;
  games({}, { json(value) { gamesBody = value; return this; } });
  assert.equal(gamesBody.total, 10);
  assert.ok(gamesBody.games.every(game => game.required_samples === 15));
});

test('Root endpoint and overview/dashboard keep their existing presentation routes', () => {
  const root = registeredRoutes.get('GET /');
  let html = '';
  root({ headers: { accept: 'text/html' } }, {
    type(value) { this.contentType = value; return this; },
    send(value) { html = value; return this; }
  });
  assert.match(html, /PRED-API/);
  const overview = registeredRoutes.get('GET /overview');
  let body;
  overview({}, { json(value) { body = value; return this; } });
  assert.equal(body.total_games, 10);
  assert.ok(Array.isArray(body.games));
});
