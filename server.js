/**
 * PRED-API v2.0 — TX / Sicbo / Xóc đĩa đa game
 * Node >= 18 | Render: npm install && npm start
 *
 * Lưu ý: dữ liệu kết quả là ngẫu nhiên/được tạo bởi hệ thống game. Bộ phân tích
 * chỉ thống kê và kiểm định các mẫu lịch sử, không thể bảo đảm dự đoán đúng.
 */
'use strict';

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const POLL_MS = Math.max(10000, Number(process.env.POLL_MS) || 25000);
const SOURCE_LIMIT = Math.max(200, Number(process.env.SOURCE_LIMIT) || 1200);
const PRED_LIMIT = Math.max(20, Number(process.env.PRED_HISTORY_LIMIT) || 50);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const IDOL = '@htungdzvipmax';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.set('json spaces', 2);

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json, text/plain, */*'
  }
});

/* ============================== GAME CONFIG ============================== */
const GAMES = {
  'sunwin/sicbo': {
    label: 'SUNWIN Sicbo', type: 'sicbo',
    url: 'https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1',
    parser: 'sunwinSicbo'
  },
  'sunhot/tx': {
    label: 'SUNHOT Tài Xỉu', type: 'tx',
    url: 'https://su-vipp-3.onrender.com/sun/khnguyen',
    parser: 'sunhot'
  },
  'lc79/tx': {
    label: 'LC79 Tài Xỉu', type: 'tx',
    url: 'https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=',
    parser: 'lc79List'
  },
  'lc79/md5': {
    label: 'LC79 MD5', type: 'tx',
    url: 'https://wtxmd52.tele68.com/v1/txmd5/sessions',
    parser: 'lc79List'
  },
  'lc79/xocdia': {
    label: 'LC79 Xóc Đĩa', type: 'xocdia',
    url: 'https://wcl.tele68.com/v1/chanlefull/lite-sessions',
    parser: 'lc79Xocdia'
  },
  'betvip/tx': {
    label: 'BETVIP Tài Xỉu', type: 'tx',
    url: 'https://wtx.macminim6.online/v1/tx/sessions',
    parser: 'lc79List'
  },
  'betvip/md5': {
    label: 'BETVIP MD5', type: 'tx',
    url: 'https://wtxmd52.macminim6.online/v1/txmd5/sessions',
    parser: 'lc79List'
  },
  'max789/tx': {
    label: 'MAX789 Tài Xỉu', type: 'tx',
    url: 'https://taixiu.maksh3979madfw.com/api/luckydice/GetSoiCau',
    parser: 'max789'
  },
  'max789/md5': {
    label: 'MAX789 MD5', type: 'tx',
    url: 'https://taixiumd5.maksh3979madfw.com/api/md5luckydice/GetSoiCau',
    parser: 'max789'
  },
  'max789/kubet': {
    label: 'MAX789 Kubet Live', type: 'tx',
    url: 'https://txkubet.maksh3979madfw.com/api/taixiukubet/GetSoiCau',
    parser: 'max789'
  },
  'hitclub/tx': {
    label: 'HITCLUB Tài Xỉu', type: 'tx',
    url: 'https://apihitclubhihi.onrender.com/api/hitclub/hu',
    parser: 'hitclub'
  },
  'hitclub/md5': {
    label: 'HITCLUB MD5', type: 'tx',
    url: 'https://apihitclubhihi.onrender.com/api/hitclub/md5',
    parser: 'hitclub'
  }
};

/* ================================ STORAGE ================================ */
function loadJSON(file, fallback) {
  try {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    const value = JSON.parse(fs.readFileSync(full, 'utf8'));
    return value == null ? fallback : value;
  } catch (error) {
    console.error('[JSON-READ]', file, error.message);
    return fallback;
  }
}

function saveJSON(file, data) {
  const full = path.join(DATA_DIR, file);
  const temp = `${full}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temp, full);
  } catch (error) {
    console.error('[JSON-WRITE]', file, error.message);
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {}
  }
}

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, '_');
}

function nowVN() {
  return new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour12: false
  });
}

/* ================================ HELPERS ================================ */
function normText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .trim();
}

function firstValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumArray(values) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function parseKetQua(value) {
  const s = normText(value);
  if (!s) return null;
  if (s === 't' || s.includes('tai')) return 'T';
  if (s === 'x' || s.includes('xiu')) return 'X';
  if (s === 'c' || s.includes('chan')) return 'CHAN';
  if (s === 'l' || s === 'le' || s.includes('le ')) return 'LE';
  if (s.includes('odd')) return 'LE';
  if (s.includes('even')) return 'CHAN';
  return null;
}

function sideFromSum(sum) {
  if (!Number.isFinite(Number(sum)) || Number(sum) < 3 || Number(sum) > 18) return null;
  return Number(sum) >= 11 ? 'T' : 'X';
}

function sideLabel(side) {
  if (side === 'T') return 'Tài';
  if (side === 'X') return 'Xỉu';
  if (side === 'CHAN') return 'Chẵn';
  if (side === 'LE') return 'Lẻ';
  return side || null;
}

function isNumericSession(value) {
  return /^-?\d+$/.test(String(value == null ? '' : value).trim());
}

function getSession(row) {
  const value = firstValue(row, [
    'session', 'Session', 'phien', 'Phien', 'sessionId', 'SessionId',
    'gameNum', 'GameNum', 'id', 'ID', '_id', 'issue', 'issueNo', 'round', 'roundId'
  ]);
  return value == null ? '' : String(value).replace(/^#/, '').trim();
}

function getRows(raw, depth = 0) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object' || depth > 4) return [];
  const preferred = [
    'list', 'resultList', 'sessions', 'items', 'rows', 'history',
    'records', 'results', 'dataList', 'sessionList', 'gameList'
  ];
  let emptyArray = null;
  for (const key of preferred) {
    if (Array.isArray(raw[key])) {
      if (raw[key].length) return raw[key];
      emptyArray = raw[key];
    }
  }
  if (Array.isArray(raw.data) && raw.data.length) return raw.data;
  if (Array.isArray(raw.data) && !emptyArray) emptyArray = raw.data;
  for (const key of ['data', 'result', 'payload', 'response']) {
    if (raw[key] && typeof raw[key] === 'object') {
      const found = getRows(raw[key], depth + 1);
      if (found.length) return found;
    }
  }
  // Nhiều API trả trực tiếp một kết quả thay vì mảng.
  if (getSession(raw) || raw.phien_truoc != null || raw.Phien_truoc != null) return [raw];
  return emptyArray || [];
}

function getDice(row) {
  let value = firstValue(row, [
    'dices', 'Dices', 'dice', 'Dice', 'xuc_xac', 'Xuc_xac',
    'facesList', 'FacesList', 'diceList', 'DiceList'
  ]);
  if (!Array.isArray(value) && typeof value === 'string') {
    value = value.split(/[\s,;|/-]+/).filter(Boolean);
  }
  if (!Array.isArray(value)) {
    const keys = [
      ['Xuc_xac_1', 'Xuc_xac_2', 'Xuc_xac_3'],
      ['xuc_xac_1', 'xuc_xac_2', 'xuc_xac_3'],
      ['FirstDice', 'SecondDice', 'ThirdDice'],
      ['firstDice', 'secondDice', 'thirdDice']
    ];
    for (const trio of keys) {
      if (trio.some(k => row && row[k] !== undefined && row[k] !== null)) {
        value = trio.map(k => row[k]).filter(v => v !== undefined && v !== null);
        break;
      }
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(v => {
    if (v && typeof v === 'object') {
      return firstValue(v, ['value', 'face', 'name', 'color', 'result']) ?? '';
    }
    return v;
  });
}

function getSum(row, dice) {
  const raw = firstValue(row, ['sum', 'Sum', 'tong', 'Tong', 'point', 'Point', 'DiceSum', 'score', 'Score']);
  const parsed = toNumber(raw);
  if (parsed !== null) return parsed;
  const numbers = dice.map(toNumber).filter(n => n !== null && n >= 1 && n <= 6);
  return numbers.length === 3 ? sumArray(numbers) : null;
}

function normalizeDiceNumbers(dice) {
  return dice.map(toNumber).filter(n => n !== null && n >= 1 && n <= 6);
}


function normalizeTime(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 0 && numeric < 100000000000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* =============================== XÓC ĐĨA ================================ */
function normalizeColor(value) {
  const s = normText(value);
  if (!s) return null;
  if (s.includes('trang') || s.includes('white') || s === 'w') return 'trang';
  if (s.includes('do') || s.includes('red') || s === 'r') return 'do';
  return null;
}

function redCountFromVi(value) {
  const s = normText(value).replace(/[_-]/g, ' ');
  if (!s) return null;
  const digit = s.match(/\b([0-4])\b/);
  const wordMap = { zero: 0, one: 1, two: 2, three: 3, four: 4, mot: 1, hai: 2, ba: 3, bon: 4 };
  let count = digit ? Number(digit[1]) : null;
  if (count === null) {
    for (const [word, num] of Object.entries(wordMap)) {
      if (new RegExp(`\\b${word}\\b`).test(s)) { count = num; break; }
    }
  }
  if (count === null) return null;
  const redMatch = s.match(/([0-4])\s*(do|red)/);
  if (redMatch) return Number(redMatch[1]);
  const isWhite = s.includes('trang') || s.includes('white');
  const isRed = s.includes('do') || s.includes('red');
  if (isWhite && !isRed) count = 4 - count;
  if (isRed || isWhite) return count;
  // Chuỗi chỉ có số, không có màu: không tự đoán màu.
  return null;
}

function formatXocdia(redCount) {
  if (!Number.isInteger(redCount) || redCount < 0 || redCount > 4) return null;
  return `${redCount} đỏ - ${4 - redCount} trắng`;
}

function parseXocdiaRow(row) {
  const rawDice = getDice(row);
  const dice = rawDice.map(v => normalizeColor(v) || String(v));
  const colors = rawDice.map(normalizeColor).filter(Boolean);
  let redCount = rawDice.length === 4 && colors.length === 4 ? colors.filter(c => c === 'do').length : null;
  const rawVi = firstValue(row, ['resultVi', 'ResultVi', 'vi', 'Vi', 'result_vi', 'pattern', 'Pattern']);
  if (redCount === null) redCount = redCountFromVi(rawVi);
  const whiteCount = redCount === null ? null : 4 - redCount;
  let side = parseKetQua(firstValue(row, [
    'resultTruyenThong', 'ResultTruyenThong', 'ket_qua', 'Ket_qua', 'result', 'Result', 'side', 'Side'
  ]));
  if (side !== 'CHAN' && side !== 'LE') side = redCount === null ? null : (redCount % 2 === 0 ? 'CHAN' : 'LE');
  return {
    session: getSession(row),
    side,
    dice,
    doCount: redCount,
    trangCount: whiteCount,
    vi: formatXocdia(redCount) || (rawVi == null ? null : String(rawVi)),
    time: normalizeTime(firstValue(row, ['time', 'Time', 'createdAt', 'CreatedAt', 'timestamp']))
  };
}

/* ================================= PARSERS ================================ */
function parseSunwinSicbo(raw) {
  const list = getRows(raw && raw.data && raw.data.resultList ? raw.data.resultList : raw);
  return list.map(row => {
    const rawDice = getDice(row);
    const dice = normalizeDiceNumbers(rawDice);
    const sum = getSum(row, dice);
    let side = parseKetQua(firstValue(row, [
      'resultTruyenThong', 'ket_qua', 'Ket_qua', 'result', 'Result', 'side'
    ]));
    if (side !== 'T' && side !== 'X') side = sideFromSum(sum);
    return {
      session: getSession(row), dice, sum, side,
      time: normalizeTime(firstValue(row, ['timeMilli', 'time', 'Time', 'createdAt']))
    };
  }).filter(row => row.session);
}

function parseSunhot(raw) {
  const list = getRows(raw);
  const rows = list.map(row => {
    const side = parseKetQua(firstValue(row, ['ket_qua', 'Ket_qua', 'result', 'Result', 'side']));
    const session = String(firstValue(row, ['phien_truoc', 'Phien_truoc', 'session', 'phien', 'Phien', 'id']) || '');
    const nextSession = String(firstValue(row, ['phien_hien_tai', 'Phien_hien_tai', 'nextSession', 'next_session']) || '');
    return { session, side: side === 'T' || side === 'X' ? side : null, dice: [], sum: null, nextSession: nextSession || null, time: normalizeTime(firstValue(row, ['time', 'Time', 'createdAt', 'timestamp'])) };
  }).filter(row => row.session);
  return rows;
}

function parseLc79List(raw) {
  const list = getRows(raw);
  return list.map(row => {
    const dice = normalizeDiceNumbers(getDice(row));
    const sum = getSum(row, dice);
    let side = parseKetQua(firstValue(row, [
      'resultTruyenThong', 'ResultTruyenThong', 'ket_qua', 'Ket_qua',
      'result', 'Result', 'side', 'Side', 'name'
    ]));
    if (side !== 'T' && side !== 'X') {
      const betSide = firstValue(row, ['BetSide', 'betSide', 'bet_side']);
      if (betSide === 1 || betSide === '1' || normText(betSide) === 'tai') side = 'T';
      else if (betSide === 0 || betSide === '0' || normText(betSide) === 'xiu') side = 'X';
    }
    if (side !== 'T' && side !== 'X') side = sideFromSum(sum);
    return {
      session: getSession(row), dice, sum, side,
      time: normalizeTime(firstValue(row, ['time', 'Time', 'createdAt', 'CreatedAt', 'timestamp'])),
      nextSession: firstValue(row, ['nextSession', 'next_session', 'phien_hien_tai']) || null
    };
  }).filter(row => row.session);
}

function parseLc79Xocdia(raw) {
  return getRows(raw).map(parseXocdiaRow).filter(row => row.session);
}

function parseMax789(raw) {
  return getRows(raw).map(row => {
    const dice = normalizeDiceNumbers(getDice(row));
    const sum = getSum(row, dice);
    let side = parseKetQua(firstValue(row, ['result', 'Result', 'ket_qua', 'Ket_qua', 'side', 'Side']));
    if (side !== 'T' && side !== 'X') {
      const betSide = firstValue(row, ['BetSide', 'betSide']);
      if ((betSide === 1 || betSide === '1') && sum !== null) side = 'T';
      else if ((betSide === 0 || betSide === '0') && sum !== null) side = 'X';
    }
    if (side !== 'T' && side !== 'X') side = sideFromSum(sum);
    return {
      session: getSession(row), dice, sum, side,
      time: normalizeTime(firstValue(row, ['CreatedDate', 'createdDate', 'time', 'Time']))
    };
  }).filter(row => row.session);
}

function parseHitclub(raw) {
  return getRows(raw).map(row => {
    const dice = normalizeDiceNumbers(getDice(row));
    const sum = getSum(row, dice);
    let side = parseKetQua(firstValue(row, [
      'ket_qua', 'Ket_qua', 'result', 'Result', 'name', 'Name', 'side', 'Side'
    ]));
    if (side !== 'T' && side !== 'X') side = sideFromSum(sum);
    return {
      session: getSession(row), dice, sum, side,
      time: normalizeTime(firstValue(row, ['time', 'Time', 'createdAt', 'CreatedAt']))
    };
  }).filter(row => row.session);
}

const PARSERS = {
  sunwinSicbo: parseSunwinSicbo,
  sunhot: parseSunhot,
  lc79List: parseLc79List,
  lc79Xocdia: parseLc79Xocdia,
  max789: parseMax789,
  hitclub: parseHitclub
};

/* ======================= SOURCE HISTORY (HỌC NGẦM) ======================= */
// Lịch sử thô đã chuẩn hóa được lưu riêng trong source_*.json, không trả ra
// endpoint history của người dùng. Mỗi game tự học trên dữ liệu nguồn của mình.
function sourceFile(gameId) {
  return `source_${safeFilePart(gameId)}.json`;
}

function compareSourceRows(a, b) {
  if (isNumericSession(a.session) && isNumericSession(b.session)) {
    const aa = BigInt(String(a.session));
    const bb = BigInt(String(b.session));
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  }
  const ta = a.time ? Date.parse(a.time) : NaN;
  const tb = b.time ? Date.parse(b.time) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  return (Number(a._order) || 0) - (Number(b._order) || 0);
}

function mergeSourceHistory(gameId, incomingRows) {
  const previous = loadJSON(sourceFile(gameId), []);
  const store = Array.isArray(previous) ? previous : [];
  const map = new Map();
  let order = 0;
  for (const row of store) {
    if (!row || !row.session) continue;
    const item = { ...row, _order: Number(row._order) || ++order };
    map.set(String(item.session), item);
    order = Math.max(order, item._order);
  }

  // API phổ biến trả phiên mới nhất trước. Đảo lại khi thêm để giữ thứ tự cũ → mới.
  const rows = Array.isArray(incomingRows) ? incomingRows : [];
  for (const row of [...rows].reverse()) {
    if (!row || !row.session) continue;
    const key = String(row.session);
    const old = map.get(key);
    const merged = { ...(old || {}), ...row, session: key };
    if (old && old._order) merged._order = old._order;
    else merged._order = ++order;
    map.set(key, merged);
  }

  let mergedRows = Array.from(map.values()).sort(compareSourceRows);
  if (mergedRows.length > SOURCE_LIMIT) mergedRows = mergedRows.slice(-SOURCE_LIMIT);
  saveJSON(sourceFile(gameId), mergedRows);
  return mergedRows.reverse(); // newest-first
}

/* =========================== PREDICTION ENGINE =========================== */
function binarySide(side, type) {
  if (type === 'xocdia') {
    if (side === 'CHAN') return 'T';
    if (side === 'LE') return 'X';
    return null;
  }
  return side === 'T' || side === 'X' ? side : null;
}

function smoothedRate(values, base, prior = 8) {
  if (!values.length) return base;
  const countT = values.filter(v => v === 'T').length;
  return (countT + base * prior) / (values.length + prior);
}

function currentRun(sides) {
  if (!sides.length) return 0;
  const last = sides[sides.length - 1];
  let run = 1;
  for (let i = sides.length - 2; i >= 0 && sides[i] === last; i--) run++;
  return run;
}

function markovRate(sides, order, base, prior) {
  if (sides.length <= order) return base;
  const context = sides.slice(-order);
  let count = 0;
  let countT = 0;
  for (let i = 0; i + order < sides.length; i++) {
    let match = true;
    for (let j = 0; j < order; j++) {
      if (sides[i + j] !== context[j]) { match = false; break; }
    }
    if (match) {
      count++;
      if (sides[i + order] === 'T') countT++;
    }
  }
  return (countT + base * prior) / (count + prior);
}

function patternRate(sides, base) {
  for (let order = Math.min(6, sides.length - 1); order >= 2; order--) {
    const context = sides.slice(-order);
    let count = 0;
    let countT = 0;
    for (let i = 0; i + order < sides.length; i++) {
      let match = true;
      for (let j = 0; j < order; j++) {
        if (sides[i + j] !== context[j]) { match = false; break; }
      }
      if (match) {
        count++;
        if (sides[i + order] === 'T') countT++;
      }
    }
    if (count >= 2) return (countT + base * 7) / (count + 7);
  }
  return base;
}

function runRate(sides, base) {
  if (!sides.length) return base;
  const lastSide = sides[sides.length - 1];
  const wanted = Math.min(7, currentRun(sides));
  const runLengths = Array(sides.length).fill(1);
  for (let i = 1; i < sides.length; i++) {
    runLengths[i] = sides[i] === sides[i - 1] ? runLengths[i - 1] + 1 : 1;
  }
  let count = 0;
  let countT = 0;
  for (let i = 0; i < sides.length - 1; i++) {
    // Chỉ so các chuỗi bệt cùng cửa với trạng thái hiện tại.
    if (sides[i] === lastSide && Math.min(7, runLengths[i]) === wanted) {
      count++;
      if (sides[i + 1] === 'T') countT++;
    }
  }
  return (countT + base * 8) / (count + 8);
}

function sumBand(sum) {
  if (!Number.isFinite(Number(sum))) return null;
  const n = Number(sum);
  if (n <= 7) return 'low';
  if (n <= 13) return 'mid';
  return 'high';
}

function sumBandRate(rows, binaryRows, base) {
  const latest = rows[rows.length - 1];
  const bucket = latest ? sumBand(latest.sum) : null;
  if (!bucket) return base;
  let count = 0;
  let countT = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    if (sumBand(rows[i].sum) !== bucket || !binaryRows[i + 1]) continue;
    count++;
    if (binaryRows[i + 1] === 'T') countT++;
  }
  return (countT + base * 10) / (count + 10);
}

function diceDistributionRate(rows) {
  const recent = rows.slice(-120).filter(row => Array.isArray(row.dice) && row.dice.length === 3);
  if (recent.length < 12) return null;
  const counts = [0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const row of recent) {
    for (const face of row.dice) {
      const n = Number(face);
      if (n >= 1 && n <= 6) { counts[n - 1]++; total++; }
    }
  }
  if (!total) return null;
  // Prior 3 lần mỗi mặt giúp tránh phản ứng quá mạnh với mẫu nhỏ.
  const probs = counts.map(c => (c + 3) / (total + 18));
  let dist = [1];
  for (let die = 0; die < 3; die++) {
    const next = Array(19).fill(0);
    for (let sum = 0; sum < dist.length; sum++) {
      for (let face = 1; face <= 6; face++) next[sum + face] += dist[sum] * probs[face - 1];
    }
    dist = next;
  }
  let low = 0;
  let high = 0;
  for (let sum = 3; sum <= 18; sum++) {
    if (sum >= 11) high += dist[sum] || 0;
    else low += dist[sum] || 0;
  }
  return high + low > 0 ? high / (high + low) : null;
}

const MODEL_WEIGHTS = {
  base: 0.16, short: 0.12, medium: 0.10, long: 0.07, ewma: 0.10,
  markov1: 0.11, markov2: 0.10, markov3: 0.07,
  pattern: 0.09, run: 0.08, sumBand: 0.04, dice: 0.06
};

function getComponents(history, type) {
  const usableRows = history.filter(row => binarySide(row.side, type));
  const sides = usableRows.map(row => binarySide(row.side, type));
  const n = sides.length;
  if (n < 5) return null;

  const tCount = sides.filter(side => side === 'T').length;
  const base = (tCount + 5) / (n + 10);
  const components = {
    base,
    short: smoothedRate(sides.slice(-12), base, 6),
    medium: smoothedRate(sides.slice(-35), base, 10),
    long: smoothedRate(sides.slice(-80), base, 16),
    markov1: markovRate(sides, 1, base, 8),
    markov2: markovRate(sides, 2, base, 12),
    markov3: markovRate(sides, 3, base, 16),
    pattern: patternRate(sides, base),
    run: runRate(sides, base),
    sumBand: sumBandRate(usableRows, sides, base)
  };

  let ewma = base;
  for (const side of sides.slice(-80)) ewma = 0.90 * ewma + 0.10 * (side === 'T' ? 1 : 0);
  const ewmaReliability = Math.min(1, n / 35);
  components.ewma = base * (1 - ewmaReliability) + ewma * ewmaReliability;

  if (type !== 'xocdia') {
    const diceRate = diceDistributionRate(usableRows);
    if (diceRate !== null) {
      // Giảm ảnh hưởng mô hình xúc xắc khi chưa đủ nhiều phiên.
      const diceReliability = Math.min(0.45, Math.max(0, (n - 10) / 180));
      components.dice = base * (1 - diceReliability) + diceRate * diceReliability;
    }
  }
  return { components, sides, n, run: currentRun(sides), last: sides[n - 1], usableRows };
}

function modelProbability(history, type) {
  const current = getComponents(history, type);
  if (!current) return null;
  const { components, sides, n, run, last, usableRows } = current;
  const adaptive = {};

  // Tự chấm từng mô hình trên các phiên đã xảy ra (walk-forward), không dùng
  // kết quả tương lai của phiên đang dự đoán. Độ tin cậy được co về 50% để
  // tránh một đoạn cầu ngắn làm thay đổi trọng số quá mạnh.
  const start = Math.max(12, n - 55);
  const wins = {};
  const trials = {};
  for (let i = start; i < n; i++) {
    const pastRows = usableRows.slice(0, i);
    const sample = getComponents(pastRows, type);
    if (!sample) continue;
    const actual = sides[i];
    for (const [key, probability] of Object.entries(sample.components)) {
      if (!Number.isFinite(probability)) continue;
      trials[key] = (trials[key] || 0) + 1;
      if ((probability >= 0.5 ? 'T' : 'X') === actual) wins[key] = (wins[key] || 0) + 1;
    }
  }

  let weighted = 0;
  let totalWeight = 0;
  const componentRows = [];
  for (const [key, probability] of Object.entries(components)) {
    if (!Number.isFinite(probability)) continue;
    const count = trials[key] || 0;
    const hit = wins[key] || 0;
    const accuracy = (hit + 5) / (count + 10); // prior tương đương 10 lần thử, 5 lần đúng
    const factor = count >= 8 ? Math.max(0.72, Math.min(1.28, accuracy / 0.5)) : 1;
    const weight = (MODEL_WEIGHTS[key] || 0.04) * factor;
    weighted += probability * weight;
    totalWeight += weight;
    componentRows.push({ key, p: probability, weight, accuracy: count ? accuracy : null, trials: count });
    adaptive[key] = count ? Math.round(accuracy * 100) : null;
  }

  let pT = totalWeight ? weighted / totalWeight : components.base;
  // Biên an toàn: không hiển thị độ tin cậy ảo kiểu 90–100% trên chuỗi ngẫu nhiên.
  pT = Math.max(0.37, Math.min(0.63, pT));
  const side = pT >= 0.5 ? 'T' : 'X';
  const confidence = Math.max(50, Math.min(63, Math.round(Math.max(pT, 1 - pT) * 100)));
  const strongest = componentRows
    .filter(row => row.key !== 'base')
    .sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5))
    .slice(0, 2);
  const reasons = [];
  if (run >= 4) reasons.push(`Đang bệt ${run} phiên ${last === 'T' ? 'Tài' : 'Xỉu'}; mô hình không mặc định đảo cầu`);
  if (strongest.length && Math.abs(strongest[0].p - 0.5) >= 0.035) {
    const label = strongest[0].key === 'markov1' || strongest[0].key === 'markov2' || strongest[0].key === 'markov3'
      ? 'chuyển tiếp chuỗi' : strongest[0].key === 'dice' ? 'phân bố mặt xúc xắc' :
        strongest[0].key === 'pattern' ? 'mẫu chuỗi tương tự' :
          strongest[0].key === 'run' ? 'thống kê độ dài bệt' : 'cửa sổ lịch sử';
    reasons.push(`${label} nghiêng ${strongest[0].p >= 0.5 ? 'Tài' : 'Xỉu'}`);
  }
  if (confidence <= 53) reasons.push('Tín hiệu yếu, xác suất hai cửa gần cân bằng');
  if (!reasons.length) reasons.push('Tổng hợp tần suất, chuỗi chuyển tiếp và kiểm định lịch sử');

  return {
    side, confidence, pT, n, run,
    lyDo: reasons.slice(0, 3).join(' · '),
    cau: sides.slice(-20).map(side => side === 'T' ? 'T' : 'X').join(''),
    adaptive,
    components: componentRows
  };
}

function xocdiaPatternRanking(history, side) {
  const allowed = side === 'CHAN' ? [0, 2, 4] : [1, 3];
  // Phân phối nhị thức 4 mặt đồng xác suất, có điều kiện theo Chẵn/Lẻ.
  const prior = side === 'CHAN'
    ? { 0: 0.125, 2: 0.75, 4: 0.125 }
    : { 1: 0.5, 3: 0.5 };
  const observed = {};
  let samples = 0;
  for (const row of history.slice(-160)) {
    let count = Number.isInteger(row.doCount) ? row.doCount : redCountFromVi(row.vi);
    if (count === null || !allowed.includes(count)) continue;
    observed[count] = (observed[count] || 0) + 1;
    samples++;
  }
  const priorStrength = 12;
  const total = samples + priorStrength;
  return allowed.map(count => ({
    count,
    vi: formatXocdia(count),
    probability: ((observed[count] || 0) + priorStrength * prior[count]) / total,
    observed: observed[count] || 0
  })).sort((a, b) => b.probability - a.probability);
}

function sicboTopSums(history, side) {
  const counts = {};
  for (const row of history.slice(-180)) {
    if (row.side === side && Number.isFinite(Number(row.sum))) {
      const sum = Number(row.sum);
      counts[sum] = (counts[sum] || 0) + 1;
    }
  }
  const ways = {
    3: 1, 4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25,
    10: 27, 11: 27, 12: 25, 13: 21, 14: 15, 15: 10, 16: 6, 17: 3, 18: 1
  };
  const candidates = [];
  for (let sum = 3; sum <= 18; sum++) {
    if (side === 'T' && sum < 11) continue;
    if (side === 'X' && sum > 10) continue;
    const score = (counts[sum] || 0) + (ways[sum] || 0) * 0.35;
    candidates.push({ sum, score });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.sum);
}

class Engine {
  constructor(gameId, type) {
    this.id = gameId;
    this.type = type;
    this.history = [];
  }

  loadHistory(newestFirstRows) {
    const chronological = [...newestFirstRows].reverse();
    this.history = chronological.filter(row => row && row.side).map(row => ({
      session: row.session,
      side: row.side,
      sum: toNumber(row.sum),
      dice: Array.isArray(row.dice) ? row.dice : [],
      vi: row.vi || null,
      doCount: Number.isInteger(row.doCount) ? row.doCount : redCountFromVi(row.vi),
      trangCount: Number.isInteger(row.trangCount) ? row.trangCount : null,
      time: row.time || null
    }));
    if (this.history.length > SOURCE_LIMIT) this.history = this.history.slice(-SOURCE_LIMIT);
  }

  currentCau(maxLen = 20) {
    return this.history.slice(-maxLen).map(row => {
      if (row.side === 'T') return 'T';
      if (row.side === 'X') return 'X';
      if (row.side === 'CHAN') return 'C';
      if (row.side === 'LE') return 'L';
      return '?';
    }).join('');
  }

  predict() {
    if (this.type === 'xocdia') {
      const model = modelProbability(this.history, 'xocdia');
      if (!model) {
        const side = 'CHAN';
        const ranked = xocdiaPatternRanking(this.history, side);
        return {
          side, label: 'Chẵn', conf: 50,
          vi: ranked[0].vi, topVi: ranked.map(x => x.vi),
          lyDo: 'Chưa đủ dữ liệu lịch sử để chấm mô hình',
          cau: this.currentCau(20), sampleSize: this.history.length
        };
      }
      const side = model.side === 'T' ? 'CHAN' : 'LE';
      const ranked = xocdiaPatternRanking(this.history, side);
      return {
        side, label: sideLabel(side), conf: model.confidence,
        pSide: model.pT, vi: ranked[0].vi,
        topVi: ranked.map(x => x.vi),
        viDetails: ranked.map(x => ({ vi: x.vi, probability: Math.round(x.probability * 1000) / 10 })),
        lyDo: model.lyDo, cau: this.currentCau(20), sampleSize: model.n,
        adaptive: model.adaptive
      };
    }

    const model = modelProbability(this.history, this.type);
    if (!model) {
      return {
        side: 'T', label: 'Tài', conf: 50,
        topSums: this.type === 'sicbo' ? [11, 12, 13] : [],
        lyDo: 'Chưa đủ dữ liệu lịch sử để chấm mô hình',
        cau: this.currentCau(20), sampleSize: this.history.length
      };
    }
    return {
      side: model.side,
      label: sideLabel(model.side),
      conf: model.confidence,
      pSide: model.pT,
      topSums: this.type === 'sicbo' ? sicboTopSums(this.history, model.side) : [],
      lyDo: model.lyDo,
      cau: this.currentCau(20),
      sampleSize: model.n,
      streak: model.run,
      adaptive: model.adaptive
    };
  }
}

/* ================================ STATE ================================== */
const engines = {};
const predHistoryRaw = loadJSON('pred_history.json', {});
const predHistory = predHistoryRaw && typeof predHistoryRaw === 'object' && !Array.isArray(predHistoryRaw)
  ? predHistoryRaw : {};
const lastStatus = {};
const inFlight = new Map();

function getEngine(gameId) {
  if (!engines[gameId]) {
    const game = GAMES[gameId];
    engines[gameId] = new Engine(gameId, game ? game.type : 'tx');
  }
  return engines[gameId];
}

function getPredictionSide(value) {
  return parseKetQua(value);
}

function findSourceResult(rows, session) {
  return rows.find(row => String(row.session) === String(session));
}

function actualDiceText(row, gameType) {
  if (!row) return null;
  if (gameType === 'xocdia') return row.vi || (Number.isInteger(row.doCount) ? formatXocdia(row.doCount) : null);
  if (Array.isArray(row.dice) && row.dice.length) return row.dice.join(' - ');
  return null;
}

function settlePredictionLogs(gameId, rows) {
  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  const game = GAMES[gameId];
  let changed = false;
  for (const log of logs) {
    if (!log || log.ok === true || log.ok === false || log.phien == null) continue;
    const actualRow = findSourceResult(rows, log.phien);
    if (!actualRow || !actualRow.side) continue;
    const predictedSide = log.pred_side || getPredictionSide(log.du_doan);
    log.actual = sideLabel(actualRow.side);
    log.actual_side = actualRow.side;
    log.actual_dice = actualDiceText(actualRow, game.type);
    log.actual_sum = actualRow.sum == null ? null : actualRow.sum;
    log.actual_vi = game.type === 'xocdia' ? actualDiceText(actualRow, game.type) : null;
    log.ok = predictedSide === actualRow.side;
    log.result_time = nowVN();
    changed = true;
  }
  if (changed) saveJSON('pred_history.json', predHistory);
}

function pushPredLog(gameId, entry) {
  if (!Array.isArray(predHistory[gameId])) predHistory[gameId] = [];
  const logs = predHistory[gameId];
  const phien = String(entry.phien);
  const exists = logs.findIndex(row => String(row.phien) === phien);
  if (exists >= 0) {
    // Một phiên chỉ có một dự đoán: không ghi đè dự đoán đang chờ bằng dự đoán mới.
    return logs[exists];
  }
  logs.unshift(entry);
  if (logs.length > PRED_LIMIT) logs.length = PRED_LIMIT;
  saveJSON('pred_history.json', predHistory);
  return entry;
}

function nextSessionOf(latest) {
  if (!latest) return '—';
  if (latest.nextSession !== undefined && latest.nextSession !== null && String(latest.nextSession) !== '') {
    return String(latest.nextSession);
  }
  const session = String(latest.session == null ? '' : latest.session);
  if (isNumericSession(session)) {
    try { return (BigInt(session) + 1n).toString(); } catch (_) {}
  }
  return session ? `${session}+1` : '—';
}

function predictionFromLog(log, game) {
  return {
    side: log.pred_side || getPredictionSide(log.du_doan) || 'T',
    label: log.du_doan || 'Tài',
    conf: Number(log.conf) || 50,
    lyDo: log.ly_do || 'Dự đoán đã lưu cho phiên này',
    cau: log.cau || '',
    vi: log.vi || null,
    topVi: Array.isArray(log.top_vi) ? log.top_vi : [],
    topSums: Array.isArray(log.top_sums) ? log.top_sums : []
  };
}

/* ============================== FETCH / PREDICT ========================== */
async function fetchGame(gameId) {
  const game = GAMES[gameId];
  if (!game) throw new Error('Game không tồn tại');
  const response = await http.get(game.url);
  const parser = PARSERS[game.parser];
  if (!parser) throw new Error(`Parser ${game.parser} không tồn tại`);
  const parsed = parser(response.data);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('API nguồn không trả về phiên hợp lệ hoặc cấu trúc JSON đã thay đổi');
  }
  const rows = mergeSourceHistory(gameId, parsed);
  if (!rows.length) throw new Error('Không có lịch sử phiên sau khi chuẩn hóa');
  return { game, rows };
}

async function runPredictInternal(gameId) {
  const { game, rows } = await fetchGame(gameId);
  const engine = getEngine(gameId);
  engine.loadHistory(rows);
  settlePredictionLogs(gameId, rows);

  // Chỉ dự đoán một lần cho mỗi phiên đích. Poll nhiều lần không làm thay đổi
  // dự đoán đang chờ và không tạo các dòng lịch sử trùng nhau.
  const latest = rows[0] || {};
  const nextSession = nextSessionOf(latest);
  if (nextSession === '—') throw new Error('Không xác định được phiên tiếp theo');
  const existingLogs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  let log = existingLogs.find(item => String(item.phien) === String(nextSession));

  let pred;
  if (log) {
    pred = predictionFromLog(log, game);
  } else {
    pred = engine.predict();
    log = pushPredLog(gameId, {
      phien: nextSession,
      du_doan: pred.label,
      pred_side: pred.side,
      conf: pred.conf,
      ly_do: pred.lyDo || null,
      cau: pred.cau || null,
      vi: pred.vi || null,
      top_vi: pred.topVi || [],
      top_sums: pred.topSums || [],
      actual: null,
      actual_side: null,
      actual_dice: null,
      ok: null,
      time: nowVN()
    });
  }

  const payload = {
    id: IDOL,
    Name: game.label,
    Phien: latest.session != null
      ? (isNumericSession(latest.session) ? Number(latest.session) : latest.session)
      : null,
    Xuc_xac: actualDiceText(latest, game.type),
    Tong: latest.sum == null ? null : latest.sum,
    Ket_qua: sideLabel(latest.side),
    Cau_hien_tai: pred.cau || engine.currentCau(20),
    Phien_tiep: isNumericSession(nextSession) ? Number(nextSession) : nextSession,
    Du_doan: pred.label,
    Du_doan_side: pred.side,
    do_tin_cay: pred.conf,
    Ly_do: pred.lyDo || 'Tổng hợp thống kê lịch sử',
    Sample_size: pred.sampleSize || engine.history.length,
    Time: nowVN()
  };

  if (game.type === 'sicbo') payload.Ba_tong_de_ra = pred.topSums || [];
  if (game.type === 'xocdia') {
    payload.Vi = pred.vi || null;
    payload.Top_vi = pred.topVi || [];
    payload.Top_vi_chi_tiet = pred.viDetails || [];
    payload.Du_doan_vi = pred.vi || null;
  }

  lastStatus[gameId] = { ok: true, error: null, time: nowVN() };
  return payload;
}

function runPredict(gameId) {
  if (inFlight.has(gameId)) return inFlight.get(gameId);
  const task = runPredictInternal(gameId)
    .catch(error => {
      lastStatus[gameId] = { ok: false, error: error.message, time: nowVN() };
      throw error;
    })
    .finally(() => inFlight.delete(gameId));
  inFlight.set(gameId, task);
  return task;
}

/* ============================== BACKGROUND =============================== */
async function backgroundTick() {
  const entries = Object.keys(GAMES);
  const results = await Promise.allSettled(entries.map(gameId => runPredict(gameId)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('[POLL]', entries[index], result.reason && result.reason.message);
    }
  });
}

let pollTimer = null;
let firstPollTimer = null;
function startPolling() {
  if (pollTimer) return;
  firstPollTimer = setTimeout(() => backgroundTick().catch(error => console.error('[POLL]', error.message)), 5000);
  pollTimer = setInterval(() => backgroundTick().catch(error => console.error('[POLL]', error.message)), POLL_MS);
  if (firstPollTimer.unref) firstPollTimer.unref();
  if (pollTimer.unref) pollTimer.unref();
}

/* ================================= ROUTES ================================ */
app.get('/', (_req, res) => {
  const games = Object.entries(GAMES).map(([id, game]) => {
    const status = lastStatus[id] || { ok: null, error: null, time: null };
    return {
      id: IDOL,
      game: id,
      name: game.label,
      type: game.type,
      status: status.ok === true ? 'online' : status.ok === false ? 'error' : 'pending',
      error: status.error || null,
      last_update: status.time,
      predict: `/${id}`,
      history: `/${id}/history`
    };
  });
  const online = games.filter(game => game.status === 'online').length;
  res.json({
    id: IDOL, name: 'PRED-API', version: '2.0.0', time: nowVN(),
    total_games: games.length, online, offline: games.length - online, games
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, id: IDOL, version: '2.0.0', time: nowVN(), games: Object.keys(GAMES).length });
});

app.get('/games', (_req, res) => {
  const list = Object.entries(GAMES).map(([id, game]) => ({
    id: IDOL,
    game: id,
    label: game.label,
    type: game.type,
    predict: `/${id}`,
    history: `/${id}/history`,
    status: lastStatus[id] && lastStatus[id].ok === true
      ? 'online' : lastStatus[id] && lastStatus[id].ok === false ? 'error' : 'pending'
  }));
  res.json({ id: IDOL, ok: true, total: list.length, games: list });
});

function formatHistoryRow(entry, game) {
  const phien = entry.phien != null ? String(entry.phien) : '—';
  const prediction = entry.du_doan || '—';
  const mark = entry.ok === true ? '✅' : entry.ok === false ? '❌' : '⏳';
  const actual = entry.actual || 'Đang chờ';
  const dice = entry.actual_dice ? ` | KQ xúc xắc: ${entry.actual_dice}` : '';
  const sum = entry.actual_sum != null && game.type !== 'xocdia' ? ` (${entry.actual_sum})` : '';
  const conf = entry.conf != null ? ` | ${entry.conf}%` : '';
  return `Phiên ${phien}${dice} | KQ: ${actual}${sum} | Dự đoán: ${prediction} | ${mark}${conf}`;
}

app.get('/:brand/:table/history', (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  const game = GAMES[gameId];
  if (!game) return res.status(404).json({ ok: false, error: 'Game không tồn tại' });
  const logs = (Array.isArray(predHistory[gameId]) ? predHistory[gameId] : []).slice(0, PRED_LIMIT);
  let correct = 0;
  let wrong = 0;
  let waiting = 0;
  for (const entry of logs) {
    if (entry.ok === true) correct++;
    else if (entry.ok === false) wrong++;
    else waiting++;
  }
  const settled = correct + wrong;
  const items = logs.map(entry => ({
    phien: entry.phien,
    du_doan: entry.du_doan || null,
    du_doan_side: entry.pred_side || getPredictionSide(entry.du_doan),
    ket_qua: entry.actual || null,
    ket_qua_side: entry.actual_side || null,
    xuc_xac: entry.actual_dice || null,
    tong: entry.actual_sum == null ? null : entry.actual_sum,
    vi: entry.actual_vi || null,
    dung: entry.ok === true,
    sai: entry.ok === false,
    trang_thai: entry.ok === true ? 'đúng' : entry.ok === false ? 'sai' : 'đang chờ',
    icon: entry.ok === true ? '✅' : entry.ok === false ? '❌' : '⏳',
    do_tin_cay: entry.conf == null ? null : entry.conf,
    thoi_gian_du_doan: entry.time || null,
    thoi_gian_ket_qua: entry.result_time || null
  }));
  res.json({
    id: IDOL,
    ok: true,
    game: gameId,
    total: logs.length,
    dung: correct,
    sai: wrong,
    cho: waiting,
    ti_le: settled ? Math.round((correct / settled) * 100) : 0,
    items,
    history: logs.map(entry => formatHistoryRow(entry, game))
  });
});

app.get('/:brand/:table', async (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  if (!GAMES[gameId]) {
    return res.status(404).json({ ok: false, error: 'Game không tồn tại', tip: 'Xem GET / hoặc GET /games' });
  }
  try {
    const data = await runPredict(gameId);
    res.json(data);
  } catch (error) {
    console.error('[PREDICT]', gameId, error.message);
    res.status(502).json({
      id: IDOL,
      ok: false,
      game: gameId,
      error: 'Không lấy được dữ liệu nguồn',
      detail: error.message,
      Time: nowVN()
    });
  }
});

/* ================================ START ================================== */
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`PRED-API v2.0 on :${PORT}`);
    console.log('Polling:', POLL_MS, 'ms');
    console.log('Games:', Object.keys(GAMES).join(', '));
  });
  startPolling();
}

module.exports = {
  app, GAMES, PARSERS, Engine, mergeSourceHistory,
  parseLc79List, parseLc79Xocdia, parseHitclub, parseMax789,
  parseSunwinSicbo, parseSunhot, modelProbability,
  formatXocdia, redCountFromVi, sideLabel,
  settlePredictionLogs, pushPredLog, formatHistoryRow, fetchGame, runPredict,
  _state: { engines, predHistory, lastStatus }
};
