/**
 * PRED-API v4.0 — Tài Xỉu / Xóc Đĩa đa game
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
// Never emit a forecast from fewer than five distinct, usable source sessions.
const MIN_HISTORY_SESSIONS = Math.max(5, Number(process.env.MIN_HISTORY_SESSIONS) || 5);
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

function makeModelProfile(name, options = {}) {
  return {
    name,
    shortWindow: options.shortWindow || 12,
    mediumWindow: options.mediumWindow || 35,
    longWindow: options.longWindow || 80,
    ewmaAlpha: options.ewmaAlpha || 0.10,
    markovPriors: options.markovPriors || [8, 12, 16],
    patternMaxOrder: options.patternMaxOrder || 6,
    patternMinMatches: options.patternMinMatches || 2,
    patternPrior: options.patternPrior || 7,
    runPrior: options.runPrior || 8,
    sumBandPrior: options.sumBandPrior || 10,
    diceMaxReliability: options.diceMaxReliability || 0.45,
    evalWindow: options.evalWindow || 55,
    backtestMin: options.backtestMin || 12,
    weights: options.weights || {}
  };
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
  const value = Number(sum);
  if (!Number.isInteger(value) || value < 3 || value > 18) return null;
  // Với luật 3 xúc xắc phổ biến, tổng 3 hoặc 18 là bộ ba, không xếp Tài/Xỉu.
  if (value === 3 || value === 18) return null;
  return value >= 11 ? 'T' : 'X';
}

function isTriple(dice) {
  return Array.isArray(dice) && dice.length === 3 &&
    dice.every(value => Number.isInteger(Number(value))) &&
    Number(dice[0]) === Number(dice[1]) && Number(dice[1]) === Number(dice[2]);
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

function getReportedSum(row) {
  const raw = firstValue(row, ['sum', 'Sum', 'tong', 'Tong', 'point', 'Point', 'DiceSum', 'score', 'Score']);
  const parsed = toNumber(raw);
  return Number.isInteger(parsed) && parsed >= 3 && parsed <= 18 ? parsed : null;
}

function normalizeDiceNumbers(dice) {
  return (Array.isArray(dice) ? dice : []).map(toNumber)
    .filter(n => n !== null && Number.isInteger(n) && n >= 1 && n <= 6);
}

function getSum(row, dice) {
  const numbers = normalizeDiceNumbers(dice);
  // Nếu API gửi đủ 3 mặt xúc xắc, tổng tự tính là nguồn có thể kiểm chứng nhất.
  if (numbers.length === 3 && Array.isArray(dice) && dice.length === 3) return sumArray(numbers);
  return getReportedSum(row);
}

function resolveTxOutcome(row, dice, sum) {
  const declared = parseKetQua(firstValue(row, [
    'resultTruyenThong', 'ResultTruyenThong', 'ket_qua', 'Ket_qua',
    'result', 'Result', 'side', 'Side', 'name', 'Name'
  ]));
  const validDice = Array.isArray(dice) && dice.length === 3 && dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6);
  const triple = validDice ? isTriple(dice) : (sum === 3 || sum === 18);
  const sourceSum = validDice ? sumArray(dice) : sum;
  let side = null;
  let sideSource = 'missing';
  if (triple) {
    sideSource = 'triple';
  } else if (sourceSum !== null && sourceSum !== undefined) {
    side = sideFromSum(sourceSum);
    sideSource = validDice ? 'dice_sum' : 'reported_sum';
  } else if (declared === 'T' || declared === 'X') {
    side = declared;
    sideSource = 'declared';
  }

  const reportedSum = getReportedSum(row);
  const warnings = [];
  if (validDice && reportedSum !== null && reportedSum !== sourceSum) {
    warnings.push(`Tong API ${reportedSum} lệch tổng xúc xắc ${sourceSum}`);
  }
  if (declared === 'T' || declared === 'X') {
    if (triple) warnings.push(`Ket_qua API ${sideLabel(declared)} nhưng xúc xắc là bộ ba`);
    else if (side && declared !== side) warnings.push(`Ket_qua API ${sideLabel(declared)} lệch kết quả tính từ xúc xắc ${sideLabel(side)}`);
  }
  return {
    side,
    sideSource,
    declaredSide: declared === 'T' || declared === 'X' ? declared : null,
    reportedSum,
    dataWarning: warnings.length ? warnings.join('; ') : null
  };
}


function normalizeTime(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  let date;
  if (Number.isFinite(numeric)) {
    date = new Date(numeric > 0 && numeric < 100000000000 ? numeric * 1000 : numeric);
  } else {
    const text = String(value).trim();
    // MAX789 có lúc trả `HH:mm:ss DD/MM/YYYY`; diễn giải theo giờ Việt Nam.
    const vn = text.match(/^(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vn) {
      const [, hh, mm, ss, dd, month, year] = vn;
      date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss}+07:00`);
    } else {
      date = new Date(text);
    }
  }
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
  const declaredSide = parseKetQua(firstValue(row, [
    'resultTruyenThong', 'ResultTruyenThong', 'ket_qua', 'Ket_qua', 'result', 'Result', 'side', 'Side'
  ]));
  const derivedSide = redCount === null ? null : (redCount % 2 === 0 ? 'CHAN' : 'LE');
  const side = derivedSide || (declaredSide === 'CHAN' || declaredSide === 'LE' ? declaredSide : null);
  const dataWarning = derivedSide && (declaredSide === 'CHAN' || declaredSide === 'LE') && derivedSide !== declaredSide
    ? `Kết quả API ${sideLabel(declaredSide)} lệch mẫu màu ${formatXocdia(redCount)}` : null;
  return {
    session: getSession(row),
    side,
    sideSource: derivedSide ? 'derived_color' : side ? 'declared' : 'missing',
    dataWarning,
    dice,
    doCount: redCount,
    trangCount: whiteCount,
    vi: formatXocdia(redCount),
    time: normalizeTime(firstValue(row, ['time', 'Time', 'createdAt', 'CreatedAt', 'timestamp']))
  };
}

/* ================================= PARSERS ================================ */
function parseTxRow(row, timeKeys = []) {
  const rawDice = getDice(row);
  const dice = normalizeDiceNumbers(rawDice);
  const validDice = rawDice.length === 3 && dice.length === 3;
  const sum = validDice ? sumArray(dice) : getReportedSum(row);
  const outcome = resolveTxOutcome(row, validDice ? dice : [], sum);
  const time = normalizeTime(firstValue(row, timeKeys.length ? timeKeys : [
    'time', 'Time', 'createdAt', 'CreatedAt', 'timestamp', 'CreatedDate', 'createdDate'
  ]));
  return {
    session: getSession(row), dice: validDice ? dice : [], sum,
    side: outcome.side, sideSource: outcome.sideSource,
    declaredSide: outcome.declaredSide, reportedSum: outcome.reportedSum,
    dataWarning: outcome.dataWarning, time,
    nextSession: firstValue(row, ['nextSession', 'next_session', 'phien_hien_tai', 'Phien_tiep']) || null,
    cau: firstValue(row, ['Cau_hien_tai', 'cau_hien_tai', 'currentCau', 'current_cau']) || null,
    apiSampleSize: toNumber(firstValue(row, ['Sample_size', 'sample_size', 'sampleSize']))
  };
}

function parseLc79List(raw) {
  return getRows(raw).map(row => parseTxRow(row))
    .filter(row => row.session);
}

function parseLc79Xocdia(raw) {
  return getRows(raw).map(parseXocdiaRow).filter(row => row.session);
}

function parseMax789(raw) {
  return getRows(raw).map(row => parseTxRow(row, ['CreatedDate', 'createdDate', 'time', 'Time']))
    .filter(row => row.session);
}

function parseHitclub(raw) {
  return getRows(raw).map(row => parseTxRow(row, ['time', 'Time', 'createdAt', 'CreatedAt']))
    .filter(row => row.session);
}

const PARSERS = {
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

function sourceSideQuality(row) {
  if (!row) return 0;
  const source = row.sideSource;
  if (source === 'dice_sum' || source === 'derived_color' || source === 'triple') return 3;
  if (source === 'reported_sum') return 2;
  if (source === 'declared') return 1;
  if (source === 'embedded_cau' || source === 'missing') return 0;
  // Compatibility with source files saved by v1/v2 before sideSource was stored.
  if (Array.isArray(row.dice) && (row.dice.length === 3 || row.dice.length === 4)) return 3;
  if ((row.sum !== null && row.sum !== undefined && Number.isFinite(Number(row.sum))) ||
      (row.doCount !== null && row.doCount !== undefined && Number.isFinite(Number(row.doCount)))) return 2;
  return row.side ? 1 : 0;
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
    const merged = { ...(old || {}), session: key };
    const incomingQuality = sourceSideQuality(row);
    const oldQuality = sourceSideQuality(old);
    const acceptOutcome = !old || incomingQuality >= oldQuality;
    for (const [field, value] of Object.entries(row)) {
      if (field === 'session' || field === '_order') continue;
      if (field === 'side') {
        // Kết quả có bằng chứng mạnh hơn không bị ghi đè bởi cầu nhúng/nhãn yếu hơn.
        if (acceptOutcome && row.sideSource !== 'missing') merged.side = value;
        continue;
      }
      if (field === 'dataWarning') {
        if (acceptOutcome && row.sideSource && row.sideSource !== 'missing' && row.sideSource !== 'embedded_cau') {
          merged.dataWarning = value || null;
        }
        continue;
      }
      if (field === 'sideSource' && !acceptOutcome) continue;
      if (value === null || value === undefined || value === '') {
        if (old && old[field] !== undefined && old[field] !== null && old[field] !== '') continue;
      }
      if (Array.isArray(value) && value.length === 0 && old && Array.isArray(old[field]) && old[field].length) continue;
      merged[field] = value;
    }
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

function patternRate(sides, base, profile) {
  for (let order = Math.min(profile.patternMaxOrder, sides.length - 1); order >= 2; order--) {
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
    if (count >= profile.patternMinMatches) {
      return (countT + base * profile.patternPrior) / (count + profile.patternPrior);
    }
  }
  return base;
}

function runRate(sides, base, profile) {
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
  return (countT + base * profile.runPrior) / (count + profile.runPrior);
}

function sumBand(sum) {
  if (!Number.isFinite(Number(sum))) return null;
  const n = Number(sum);
  if (n <= 7) return 'low';
  if (n <= 13) return 'mid';
  return 'high';
}

function sumBandRate(rows, binaryRows, base, profile) {
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
  return (countT + base * profile.sumBandPrior) / (count + profile.sumBandPrior);
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

const DEFAULT_MODEL_WEIGHTS = {
  base: 0.15, short: 0.11, medium: 0.10, long: 0.08, ewma: 0.10,
  markov1: 0.11, markov2: 0.10, markov3: 0.07,
  pattern: 0.08, run: 0.06, sumBand: 0.02, dice: 0.02
};

// Every endpoint has its own profile and learns only from that game's source file.
// The profiles start with different time horizons; walk-forward scores then adjust
// component weights independently for each game.
const MODEL_PROFILES = {
  'lc79/tx': makeModelProfile('lc79-tx-adaptive', {
    shortWindow: 10, mediumWindow: 30, longWindow: 72, ewmaAlpha: 0.13,
    markovPriors: [7, 11, 15], patternMaxOrder: 6, patternMinMatches: 2,
    patternPrior: 6, runPrior: 7, sumBandPrior: 10, evalWindow: 64,
    weights: { short: 0.15, medium: 0.09, long: 0.05, ewma: 0.11, markov1: 0.11, markov2: 0.11, markov3: 0.08, pattern: 0.12, run: 0.08, sumBand: 0.03, dice: 0.06 }
  }),
  'lc79/md5': makeModelProfile('lc79-md5-adaptive', {
    shortWindow: 12, mediumWindow: 34, longWindow: 78, ewmaAlpha: 0.11,
    markovPriors: [8, 12, 16], patternMaxOrder: 6, patternMinMatches: 2,
    patternPrior: 7, runPrior: 7, sumBandPrior: 10, evalWindow: 64,
    weights: { short: 0.13, medium: 0.10, long: 0.06, ewma: 0.10, markov1: 0.11, markov2: 0.11, markov3: 0.09, pattern: 0.11, run: 0.08, sumBand: 0.03, dice: 0.07 }
  }),
  'lc79/xocdia': makeModelProfile('lc79-xocdia-parity', {
    shortWindow: 16, mediumWindow: 42, longWindow: 96, ewmaAlpha: 0.09,
    markovPriors: [9, 13, 17], patternMaxOrder: 5, patternMinMatches: 3,
    patternPrior: 8, runPrior: 9, sumBandPrior: 12, evalWindow: 60,
    weights: { short: 0.10, medium: 0.11, long: 0.09, ewma: 0.10, markov1: 0.12, markov2: 0.11, markov3: 0.06, pattern: 0.08, run: 0.08 }
  }),
  'betvip/tx': makeModelProfile('betvip-tx-balanced', {
    shortWindow: 14, mediumWindow: 40, longWindow: 90, ewmaAlpha: 0.10,
    markovPriors: [8, 13, 17], patternMaxOrder: 5, patternMinMatches: 3,
    patternPrior: 8, runPrior: 9, sumBandPrior: 11, evalWindow: 58,
    weights: { short: 0.12, medium: 0.12, long: 0.08, ewma: 0.11, markov1: 0.12, markov2: 0.10, markov3: 0.06, pattern: 0.09, run: 0.07, sumBand: 0.03, dice: 0.05 }
  }),
  'betvip/md5': makeModelProfile('betvip-md5-context', {
    shortWindow: 12, mediumWindow: 36, longWindow: 84, ewmaAlpha: 0.11,
    markovPriors: [8, 12, 16], patternMaxOrder: 6, patternMinMatches: 2,
    patternPrior: 7, runPrior: 8, sumBandPrior: 10, evalWindow: 60,
    weights: { short: 0.12, medium: 0.10, long: 0.07, ewma: 0.11, markov1: 0.11, markov2: 0.11, markov3: 0.08, pattern: 0.10, run: 0.07, sumBand: 0.03, dice: 0.06 }
  }),
  'max789/tx': makeModelProfile('max789-tx-longer-context', {
    shortWindow: 18, mediumWindow: 48, longWindow: 112, ewmaAlpha: 0.075,
    markovPriors: [10, 15, 20], patternMaxOrder: 5, patternMinMatches: 3,
    patternPrior: 9, runPrior: 10, sumBandPrior: 12, evalWindow: 64,
    weights: { short: 0.08, medium: 0.12, long: 0.11, ewma: 0.08, markov1: 0.13, markov2: 0.11, markov3: 0.06, pattern: 0.08, run: 0.07, sumBand: 0.03, dice: 0.08 }
  }),
  'max789/md5': makeModelProfile('max789-md5-longer-context', {
    shortWindow: 16, mediumWindow: 46, longWindow: 108, ewmaAlpha: 0.08,
    markovPriors: [9, 14, 19], patternMaxOrder: 5, patternMinMatches: 3,
    patternPrior: 9, runPrior: 10, sumBandPrior: 12, evalWindow: 64,
    weights: { short: 0.09, medium: 0.12, long: 0.10, ewma: 0.09, markov1: 0.12, markov2: 0.11, markov3: 0.07, pattern: 0.09, run: 0.07, sumBand: 0.03, dice: 0.08 }
  }),
  'max789/kubet': makeModelProfile('max789-kubet-context', {
    shortWindow: 14, mediumWindow: 42, longWindow: 96, ewmaAlpha: 0.09,
    markovPriors: [8, 13, 18], patternMaxOrder: 5, patternMinMatches: 3,
    patternPrior: 8, runPrior: 9, sumBandPrior: 11, evalWindow: 60,
    weights: { short: 0.10, medium: 0.12, long: 0.09, ewma: 0.10, markov1: 0.12, markov2: 0.11, markov3: 0.07, pattern: 0.09, run: 0.07, sumBand: 0.03, dice: 0.08 }
  }),
  'hitclub/tx': makeModelProfile('hitclub-tx-recent-context', {
    shortWindow: 12, mediumWindow: 36, longWindow: 88, ewmaAlpha: 0.11,
    markovPriors: [8, 12, 17], patternMaxOrder: 6, patternMinMatches: 2,
    patternPrior: 7, runPrior: 8, sumBandPrior: 10, evalWindow: 58,
    weights: { short: 0.13, medium: 0.11, long: 0.07, ewma: 0.11, markov1: 0.12, markov2: 0.10, markov3: 0.07, pattern: 0.10, run: 0.07, sumBand: 0.03, dice: 0.06 }
  }),
  'hitclub/md5': makeModelProfile('hitclub-md5-pattern-context', {
    shortWindow: 10, mediumWindow: 34, longWindow: 80, ewmaAlpha: 0.12,
    markovPriors: [7, 12, 16], patternMaxOrder: 6, patternMinMatches: 2,
    patternPrior: 7, runPrior: 8, sumBandPrior: 10, evalWindow: 58,
    weights: { short: 0.14, medium: 0.10, long: 0.06, ewma: 0.12, markov1: 0.11, markov2: 0.10, markov3: 0.08, pattern: 0.11, run: 0.07, sumBand: 0.03, dice: 0.06 }
  })
};

function getModelProfile(gameId) {
  return MODEL_PROFILES[gameId] || makeModelProfile('default-balanced', { weights: DEFAULT_MODEL_WEIGHTS });
}

function getComponents(history, type, profile) {
  const usableRows = history.filter(row => binarySide(row.side, type));
  const sides = usableRows.map(row => binarySide(row.side, type));
  const n = sides.length;
  if (n < 5) return null;

  const tCount = sides.filter(side => side === 'T').length;
  const base = (tCount + 5) / (n + 10);
  const components = {
    base,
    short: smoothedRate(sides.slice(-profile.shortWindow), base, 6),
    medium: smoothedRate(sides.slice(-profile.mediumWindow), base, 10),
    long: smoothedRate(sides.slice(-profile.longWindow), base, 16),
    markov1: markovRate(sides, 1, base, profile.markovPriors[0]),
    markov2: markovRate(sides, 2, base, profile.markovPriors[1]),
    markov3: markovRate(sides, 3, base, profile.markovPriors[2]),
    pattern: patternRate(sides, base, profile),
    run: runRate(sides, base, profile),
    sumBand: sumBandRate(usableRows, sides, base, profile)
  };

  let ewma = base;
  for (const side of sides.slice(-profile.longWindow)) {
    ewma = (1 - profile.ewmaAlpha) * ewma + profile.ewmaAlpha * (side === 'T' ? 1 : 0);
  }
  const ewmaReliability = Math.min(1, n / 35);
  components.ewma = base * (1 - ewmaReliability) + ewma * ewmaReliability;

  if (type !== 'xocdia') {
    const diceRate = diceDistributionRate(usableRows);
    if (diceRate !== null) {
      // Giảm ảnh hưởng mô hình xúc xắc khi chưa đủ nhiều phiên.
      const diceReliability = Math.min(profile.diceMaxReliability, Math.max(0, (n - 10) / 180));
      components.dice = base * (1 - diceReliability) + diceRate * diceReliability;
    }
  }
  return { components, sides, n, run: currentRun(sides), last: sides[n - 1], usableRows };
}

function modelProbability(history, type, gameId = 'default') {
  const profile = getModelProfile(gameId);
  const current = getComponents(history, type, profile);
  if (!current) return null;
  const { components, sides, n, run, last, usableRows } = current;
  const adaptive = {};

  // Tự chấm từng mô hình trên các phiên đã xảy ra (walk-forward), không dùng
  // kết quả tương lai của phiên đang dự đoán. Độ tin cậy được co về 50% để
  // tránh một đoạn cầu ngắn làm thay đổi trọng số quá mạnh.
  const start = Math.max(profile.backtestMin, n - profile.evalWindow);
  const wins = {};
  const trials = {};
  for (let i = start; i < n; i++) {
    const pastRows = usableRows.slice(0, i);
    const sample = getComponents(pastRows, type, profile);
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
    const weight = (profile.weights[key] || DEFAULT_MODEL_WEIGHTS[key] || 0.04) * factor;
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
    side, confidence, pT, n, run, profile: profile.name,
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


class Engine {
  constructor(gameId, type) {
    this.id = gameId;
    this.type = type;
    this.history = [];
  }

  loadHistory(newestFirstRows) {
    const chronological = [...newestFirstRows].reverse();
    const bySession = new Map();
    for (const row of chronological) {
      if (!row || !row.side) continue;
      bySession.set(String(row.session), {
        session: row.session, side: row.side, sum: toNumber(row.sum),
        dice: Array.isArray(row.dice) ? row.dice : [], vi: row.vi || null,
        doCount: Number.isInteger(row.doCount) ? row.doCount : redCountFromVi(row.vi),
        trangCount: Number.isInteger(row.trangCount) ? row.trangCount : null,
        time: row.time || null,
        synthetic: row.synthetic === true || row.sideSource === 'embedded_cau'
      });
    }

    const latest = chronological[chronological.length - 1];
    const embedded = latest && typeof latest.cau === 'string'
      ? latest.cau.toUpperCase().replace(/[^TX]/g, '') : '';
    if (embedded.length >= 5 && isNumericSession(latest.session) && (latest.side === 'T' || latest.side === 'X')) {
      let sequence = embedded;
      if (sequence[0] === latest.side && sequence[sequence.length - 1] !== latest.side) sequence = sequence.split('').reverse().join('');
      if (sequence[sequence.length - 1] === latest.side) {
        try {
          const end = BigInt(String(latest.session));
          const first = end - BigInt(sequence.length - 1);
          if (first >= 0n) {
            for (let i = 0; i < sequence.length; i++) {
              const session = (first + BigInt(i)).toString();
              if (!bySession.has(session)) bySession.set(session, {
                session, side: sequence[i], sum: null, dice: [], vi: null,
                doCount: null, trangCount: null, time: null, synthetic: true
              });
            }
          }
        } catch (_) { /* ignore malformed session sequence */ }
      }
    }

    this.history = Array.from(bySession.values()).sort((a, b) => {
      if (isNumericSession(a.session) && isNumericSession(b.session)) {
        const aa = BigInt(String(a.session)), bb = BigInt(String(b.session));
        return aa < bb ? -1 : aa > bb ? 1 : 0;
      }
      return String(a.session).localeCompare(String(b.session));
    });
    if (this.history.length > SOURCE_LIMIT) this.history = this.history.slice(-SOURCE_LIMIT);
  }

  validSampleCount() {
    return this.history.filter(row => binarySide(row.side, this.type)).length;
  }

  isReady() {
    return this.validSampleCount() >= MIN_HISTORY_SESSIONS;
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
    if (!this.isReady()) {
      return {
        ready: false,
        sampleSize: this.validSampleCount(),
        requiredSamples: MIN_HISTORY_SESSIONS,
        lyDo: `Đang học dữ liệu: cần tối thiểu ${MIN_HISTORY_SESSIONS} phiên hợp lệ`
      };
    }
    if (this.type === 'xocdia') {
      const model = modelProbability(this.history, 'xocdia', this.id);
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

    const model = modelProbability(this.history, this.type, this.id);
    if (!model) {
      return {
        side: 'T', label: 'Tài', conf: 50,
        lyDo: 'Chưa đủ dữ liệu lịch sử để chấm mô hình',
        cau: this.currentCau(20), sampleSize: this.history.length
      };
    }
    return {
      side: model.side,
      label: sideLabel(model.side),
      conf: model.confidence,
      pSide: model.pT,
      topSums: [],
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

function formatCauForApi(value, gameType) {
  if (gameType !== 'xocdia' || value == null) return value;
  return String(value).split('').map(char => char === 'C' ? 'Chẵn' : char === 'L' ? 'Lẻ' : null)
    .filter(Boolean).join(' → ');
}

function settlePredictionLogs(gameId, rows) {
  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  const game = GAMES[gameId];
  let changed = false;
  for (const log of logs) {
    if (!log || log.phien == null) continue;
    // A protected skip is not a bet and must never be settled as a win/loss.
    if (log.risk_pause === true) continue;
    const actualRow = findSourceResult(rows, log.phien);
    if (!actualRow) continue;
    const predictedSide = log.pred_side || getPredictionSide(log.du_doan);

    if (actualRow.sideSource === 'triple') {
      const next = {
        actual: 'Bộ ba', actual_side: null,
        actual_dice: actualDiceText(actualRow, game.type),
        actual_sum: actualRow.sum == null ? null : actualRow.sum,
        actual_vi: game.type === 'xocdia' ? actualDiceText(actualRow, game.type) : null,
        ok: null, void: true, data_warning: actualRow.dataWarning || null
      };
      const rowChanged = Object.keys(next).some(key => log[key] !== next[key]);
      if (rowChanged) changed = true;
      Object.assign(log, next);
      if (rowChanged || !log.result_time) log.result_time = nowVN();
      continue;
    }
    if (!actualRow.side || !predictedSide) continue;

    const next = {
      actual: sideLabel(actualRow.side), actual_side: actualRow.side,
      actual_dice: actualDiceText(actualRow, game.type),
      actual_sum: actualRow.sum == null ? null : actualRow.sum,
      actual_vi: game.type === 'xocdia' ? actualDiceText(actualRow, game.type) : null,
      ok: predictedSide === actualRow.side, void: false,
      data_warning: actualRow.dataWarning || null
    };
    const rowChanged = Object.keys(next).some(key => log[key] !== next[key]);
    if (rowChanged) changed = true;
    const wasSettled = log.ok === true || log.ok === false;
    Object.assign(log, next);
    if (!wasSettled || rowChanged || log.result_time == null) log.result_time = nowVN();
  }
  if (changed) saveJSON('pred_history.json', predHistory);
  return changed;
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

function consecutiveLossState(gameId, ignorePendingSession = null) {
  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  let count = 0;
  for (const entry of logs) {
    if (!entry) continue;
    if (ignorePendingSession != null && String(entry.phien) === String(ignorePendingSession) &&
        entry.risk_pause !== true && entry.ok == null) continue;
    // A skipped forecast creates a deliberate gap and breaks the active loss run.
    if (entry.risk_pause === true) return { count: 0, lastLossSession: null, protectedGap: true };
    if (entry.void === true) continue;
    if (entry.ok === false) {
      count++;
      if (count === 1) var lastLossSession = String(entry.phien);
      continue;
    }
    // A win or an unsettled result ends the consecutive settled-loss sequence.
    break;
  }
  return { count, lastLossSession: count ? lastLossSession : null, protectedGap: false };
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
  if (log && log.risk_pause === true) {
    return {
      paused: true,
      side: null,
      label: null,
      conf: null,
      lyDo: log.pause_reason || 'Tạm dừng bảo vệ sau chuỗi dự đoán sai',
      cau: log.cau || '',
      vi: null,
      topVi: [],
      topSums: []
    };
  }
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

/* ======================= EMBEDDED SOURCE HISTORY ======================== */
function expandEmbeddedCauRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const candidates = rows.filter(row => row && row.cau && isNumericSession(row.session) && (row.side === 'T' || row.side === 'X'));
  if (!candidates.length) return [];
  candidates.sort((a, b) => {
    if (isNumericSession(a.session) && isNumericSession(b.session)) {
      const aa = BigInt(String(a.session)), bb = BigInt(String(b.session));
      return aa > bb ? -1 : aa < bb ? 1 : 0;
    }
    return 0;
  });
  const latest = candidates[0];
  let sequence = String(latest.cau).toUpperCase().replace(/[^TX]/g, '');
  if (sequence.length < 5) return [];
  if (sequence[sequence.length - 1] !== latest.side && sequence[0] === latest.side) {
    sequence = sequence.split('').reverse().join('');
  }
  // Chỉ import nếu một đầu chuỗi khớp kết quả đã kiểm chứng của phiên hiện tại.
  if (sequence[sequence.length - 1] !== latest.side) return [];
  try {
    const end = BigInt(String(latest.session));
    const first = end - BigInt(sequence.length - 1);
    if (first < 0n) return [];
    const expanded = [];
    for (let i = 0; i < sequence.length - 1; i++) {
      expanded.push({
        session: (first + BigInt(i)).toString(), side: sequence[i],
        sideSource: 'embedded_cau', synthetic: true,
        dice: [], sum: null, time: null
      });
    }
    return expanded;
  } catch (_) {
    return [];
  }
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
  const embeddedRows = expandEmbeddedCauRows(parsed);
  const rows = mergeSourceHistory(gameId, [...parsed, ...embeddedRows]);
  if (!rows.length) throw new Error('Không có lịch sử phiên sau khi chuẩn hóa');
  return { game, rows };
}

async function runPredictInternal(gameId) {
  const { game, rows } = await fetchGame(gameId);
  const engine = getEngine(gameId);
  engine.loadHistory(rows);
  settlePredictionLogs(gameId, rows);

  const latest = rows[0] || {};
  const nextSession = nextSessionOf(latest);
  if (nextSession === '—') throw new Error('Không xác định được phiên tiếp theo');

  const sampleCount = engine.validSampleCount();
  const basePayload = {
    id: IDOL,
    Name: game.label,
    Phien: latest.session != null
      ? (isNumericSession(latest.session) ? Number(latest.session) : latest.session)
      : null,
    Ket_qua: game.type === 'xocdia'
      ? (latest.vi || sideLabel(latest.side))
      : sideLabel(latest.side),
    Cau_hien_tai: formatCauForApi(engine.currentCau(20), game.type),
    Phien_tiep: isNumericSession(nextSession) ? Number(nextSession) : nextSession,
    Time: nowVN(),
    Data_warning: latest.dataWarning || null,
    API_sample_size: latest.apiSampleSize || null,
    Sample_size: sampleCount,
    So_phien_toi_thieu: MIN_HISTORY_SESSIONS
  };
  if (game.type !== 'xocdia') {
    basePayload.Xuc_xac = actualDiceText(latest, game.type);
    basePayload.Tong = latest.sum == null ? null : latest.sum;
  } else {
    // Xóc Đĩa có bốn quân đỏ/trắng, không có xúc xắc hoặc tổng điểm.
    basePayload.Chan_le = sideLabel(latest.side);
    basePayload.Vi = latest.vi || null;
  }

  // Warm-up applies independently to every game. Existing persisted source
  // sessions are reused; APIs that return only the current round accumulate
  // distinct sessions through polling until five valid outcomes exist.
  if (sampleCount < MIN_HISTORY_SESSIONS) {
    const remaining = MIN_HISTORY_SESSIONS - sampleCount;
    lastStatus[gameId] = {
      ok: null, mode: 'learning', samples: sampleCount,
      required: MIN_HISTORY_SESSIONS, error: null, time: nowVN()
    };
    return {
      ...basePayload,
      Trang_thai: 'DANG_HOC_DU_LIEU',
      Is_ready: false,
      Con_thieu: remaining,
      Du_doan: null,
      Du_doan_side: null,
      do_tin_cay: null,
      Ly_do: `Đang thu thập dữ liệu riêng cho ${game.label}: đã có ${sampleCount}/${MIN_HISTORY_SESSIONS} phiên hợp lệ; chưa phát dự đoán`,
      Model_profile: getModelProfile(gameId).name
    };
  }

  // One forecast (or one deliberate skip) per target session.
  const existingLogs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  let log = existingLogs.find(item => String(item.phien) === String(nextSession));
  let pred;

  if (log) {
    pred = predictionFromLog(log, game);
  } else {
    const lossState = consecutiveLossState(gameId);
    if (lossState.count >= 3) {
      const reason = `Tạm dừng 1 phiên để hiệu chỉnh sau ${lossState.count} dự đoán sai liên tiếp; không tiếp tục đuổi cầu`;
      log = pushPredLog(gameId, {
        phien: nextSession,
        du_doan: 'Tạm dừng bảo vệ',
        pred_side: null,
        conf: null,
        ly_do: reason,
        pause_reason: reason,
        cau: engine.currentCau(20),
        actual: null,
        actual_side: null,
        actual_dice: null,
        ok: null,
        void: false,
        risk_pause: true,
        loss_streak_before_pause: lossState.count,
        time: nowVN()
      });
      pred = predictionFromLog(log, game);
    } else {
      pred = engine.predict();
      if (!pred || pred.ready === false) {
        throw new Error('Dữ liệu chưa đủ để khởi tạo mô hình dự đoán');
      }
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
        model_profile: pred.profile || getModelProfile(gameId).name,
        training_sample_size: pred.sampleSize || sampleCount,
        actual: null,
        actual_side: null,
        actual_dice: null,
        ok: null,
        time: nowVN()
      });
    }
  }

  const payload = {
    ...basePayload,
    Cau_hien_tai: formatCauForApi(pred.cau || engine.currentCau(20), game.type),
    Du_doan: pred.paused ? null : pred.label,
    Du_doan_side: pred.paused ? null : (game.type === 'xocdia' ? sideLabel(pred.side) : pred.side),
    do_tin_cay: pred.paused ? null : pred.conf,
    Ly_do: pred.lyDo || 'Tổng hợp thống kê lịch sử riêng của game',
    Sample_size: pred.sampleSize || sampleCount,
    Model_profile: log.model_profile || getModelProfile(gameId).name,
    Consecutive_losses: pred.paused ? (log.loss_streak_before_pause || 3) : consecutiveLossState(gameId, nextSession).count,
    Trang_thai: pred.paused ? 'TAM_DUNG_BAO_VE' : 'DA_SAN_SANG',
    Is_ready: true,
    Con_thieu: 0
  };

  if (game.type === 'xocdia') {
    payload.Vi = pred.paused ? null : (pred.vi || null);
    payload.Top_vi = pred.paused ? [] : (pred.topVi || []);
    payload.Top_vi_chi_tiet = pred.paused ? [] : (pred.viDetails || []).map(item => ({ vi: item.vi, ti_le: item.probability }));
    payload.Du_doan_vi = pred.paused ? null : (pred.vi || null);
  }

  lastStatus[gameId] = {
    ok: true,
    mode: pred.paused ? 'protected' : 'online',
    samples: sampleCount,
    required: MIN_HISTORY_SESSIONS,
    error: null,
    time: nowVN()
  };
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
function getGamePredictionStats(gameId) {
  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  const settled = logs.filter(row => row && row.risk_pause !== true && row.void !== true && (row.ok === true || row.ok === false));
  const wins = settled.filter(row => row.ok === true).length;
  const losses = settled.filter(row => row.ok === false).length;
  const pending = logs.filter(row => row && row.risk_pause !== true && row.void !== true && row.ok == null).length;
  const skipped = logs.filter(row => row && row.risk_pause === true).length;
  const voided = logs.filter(row => row && row.void === true).length;
  const decided = wins + losses;
  const rate = decided ? Math.round((wins / decided) * 1000) / 10 : null;
  return {
    tong_phien: logs.length,
    dung: wins,
    sai: losses,
    dang_cho: pending,
    tam_dung: skipped,
    bo_qua: voided,
    ti_le_dung: rate,
    ti_le: rate == null ? '—' : `${rate}%`
  };
}

function buildOverview() {
  const games = Object.entries(GAMES).map(([id, game]) => {
    const status = lastStatus[id] || { ok: null, error: null, time: null };
    return {
      id: IDOL,
      game: id,
      name: game.label,
      type: game.type,
      status: status.ok === true
        ? (status.mode === 'protected' ? 'protected' : 'online')
        : status.ok === false ? 'error' : status.mode === 'learning' ? 'learning' : 'pending',
      sample_size: status.samples || 0,
      required_samples: status.required || MIN_HISTORY_SESSIONS,
      error: status.error || null,
      last_update: status.time,
      thong_ke: getGamePredictionStats(id),
      predict: `/${id}`,
      history: `/${id}/history`
    };
  });
  return {
    id: IDOL, name: 'PRED-API', version: '4.0.0', time: nowVN(),
    total_games: games.length,
    online: games.filter(game => game.status === 'online').length,
    learning: games.filter(game => game.status === 'learning' || game.status === 'pending').length,
    protected: games.filter(game => game.status === 'protected').length,
    offline: games.filter(game => game.status === 'error').length,
    games
  };
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PRED-API · Tổng quan</title>
<style>
:root{color-scheme:dark;--bg:#101419;--panel:#171e25;--line:#29333d;--muted:#91a0ad;--text:#e7edf2;--green:#5dc69a;--red:#e47d7d;--amber:#dfb66b;--blue:#8bb8e8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1120px;margin:0 auto;padding:24px 16px 40px}.top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:18px}.brand{font-size:21px;font-weight:700;letter-spacing:.2px}.sub,.muted{color:var(--muted);font-size:12px}.stamp{color:var(--muted);font-size:11px;text-align:right}
.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:16px 0 20px}.metric,.game{background:var(--panel);border:1px solid var(--line);border-radius:8px}.metric{padding:12px}.num{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}.metric small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
.section{font-size:12px;color:var(--muted);font-weight:650;letter-spacing:.5px;text-transform:uppercase;margin:22px 0 10px}.games{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.game{padding:14px;min-width:0}.ghead{display:flex;justify-content:space-between;align-items:center;gap:8px}.gname{font-size:14px;font-weight:700}.status{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:3px 7px;color:var(--muted);white-space:nowrap}.status.online{color:var(--green);border-color:#32634f}.status.learning,.status.pending{color:var(--amber);border-color:#655333}.status.error{color:var(--red);border-color:#693d3d}.status.protected{color:var(--blue);border-color:#3d5874}
.progress{height:4px;background:#27313b;border-radius:5px;overflow:hidden;margin:11px 0 5px}.bar{height:100%;background:var(--blue)}.sample{font-size:11px;color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:13px}.stat{border-top:1px solid var(--line);padding-top:8px}.stat b{display:block;font-size:16px;font-variant-numeric:tabular-nums}.stat span{color:var(--muted);font-size:10px}.wins{color:var(--green)}.losses{color:var(--red)}.rate{color:var(--blue)}.links{display:flex;gap:14px;margin-top:12px;font-size:11px}.links a{color:var(--blue);text-decoration:none}.links a:hover{text-decoration:underline}.error-text{color:var(--red);font-size:11px;margin-top:8px;overflow-wrap:anywhere}.footer{margin-top:18px;color:var(--muted);font-size:11px}
@media(max-width:640px){main{padding:17px 11px 28px}.top{align-items:flex-start}.summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.games{grid-template-columns:1fr}.metric{padding:10px}.num{font-size:20px}}
</style></head><body><main>
<header class="top"><div><div class="brand">PRED-API <span class="muted">/ v4.0</span></div><div class="sub">Tổng quan game · thống kê dự đoán · trạng thái dữ liệu</div></div><div class="stamp" id="updated">Đang tải…</div></header>
<section class="summary" id="summary"><div class="metric"><div class="num">—</div><small>Đang tải dữ liệu</small></div></section>
<div class="section">Danh sách game</div><section class="games" id="games"><div class="game muted">Đang tải danh sách game…</div></section>
<div class="footer">Tỉ lệ đúng tính trên các phiên đã chốt trong lịch sử dự đoán đang lưu. Tối thiểu 5 phiên hợp lệ trước khi phát dự đoán.</div>
</main><script>
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText={online:'Đang chạy',learning:'Đang học',pending:'Chờ dữ liệu',protected:'Tạm dừng bảo vệ',error:'Lỗi API'};
async function load(){try{const r=await fetch('/overview',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();
$('updated').textContent='Cập nhật: '+(d.time||'—');
$('summary').innerHTML=[['total_games','Tổng game'],['online','Đang chạy'],['learning','Đang học'],['offline','Lỗi API']].map(([k,l])=>'<div class="metric"><div class="num">'+Number(d[k]||0)+'</div><small>'+l+'</small></div>').join('');
$('games').innerHTML=(d.games||[]).map(g=>{const s=g.thong_ke||{};const n=Math.max(0,Math.min(100,100*Number(g.sample_size||0)/Math.max(1,Number(g.required_samples||5))));return '<article class="game"><div class="ghead"><div class="gname">'+esc(g.name)+'</div><span class="status '+esc(g.status)+'">'+(statusText[g.status]||'Chưa rõ')+'</span></div><div class="progress"><div class="bar" style="width:'+n+'%"></div></div><div class="sample">Dữ liệu: '+Number(g.sample_size||0)+'/'+Number(g.required_samples||5)+' phiên hợp lệ</div><div class="stats"><div class="stat"><b class="wins">'+Number(s.dung||0)+'</b><span>Đúng</span></div><div class="stat"><b class="losses">'+Number(s.sai||0)+'</b><span>Sai</span></div><div class="stat"><b>'+Number(s.dang_cho||0)+'</b><span>Đang chờ</span></div><div class="stat"><b class="rate">'+esc(s.ti_le||'—')+'</b><span>Tỉ lệ đúng</span></div></div><nav class="links"><a href="'+esc(g.predict)+'">Xem dự đoán</a><a href="'+esc(g.history)+'">Lịch sử</a></nav>'+(g.error?'<div class="error-text">'+esc(g.error)+'</div>':'')+'</article>'}).join('')||'<div class="game muted">Chưa có game được cấu hình.</div>';
}catch(e){$('updated').textContent='Không tải được dữ liệu';$('games').textContent='Lỗi tải tổng quan: '+e.message;}}
load();setInterval(load,15000);
</script></body></html>`;

app.get('/overview', (_req, res) => res.json(buildOverview()));
app.get('/', (req, res) => {
  const accept = String(req && req.headers && req.headers.accept || '');
  if (accept.includes('text/html')) return res.type('html').send(DASHBOARD_HTML);
  return res.json(buildOverview());
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, id: IDOL, version: '4.0.0', time: nowVN(), games: Object.keys(GAMES).length, min_history_sessions: MIN_HISTORY_SESSIONS });
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
      ? (lastStatus[id].mode === 'protected' ? 'protected' : 'online')
      : lastStatus[id] && lastStatus[id].ok === false ? 'error'
        : lastStatus[id] && lastStatus[id].mode === 'learning' ? 'learning' : 'pending',
    sample_size: lastStatus[id] && lastStatus[id].samples || 0,
    required_samples: MIN_HISTORY_SESSIONS
  }));
  res.json({ id: IDOL, ok: true, total: list.length, min_history_sessions: MIN_HISTORY_SESSIONS, games: list });
});

// Legacy formatter remains exported for older direct consumers. The /history
// endpoint below exclusively uses the compact formatter and never exposes this.
function formatHistoryRow(entry, game) {
  const phien = entry.phien != null ? String(entry.phien) : '—';
  if (entry.risk_pause === true) {
    return `Phiên ${phien} | TẠM DỪNG BẢO VỆ: ${entry.pause_reason || 'nghỉ 1 phiên sau chuỗi sai'} | ⏸️`;
  }
  const prediction = entry.du_doan || '—';
  const mark = entry.void === true ? '➖' : entry.ok === true ? '✅' : entry.ok === false ? '❌' : '⏳';
  const actual = entry.actual || 'Đang chờ';
  const dice = entry.actual_dice ? ` | KQ xúc xắc: ${entry.actual_dice}` : '';
  const sum = entry.actual_sum != null && game.type !== 'xocdia' ? ` (${entry.actual_sum})` : '';
  const conf = entry.conf != null ? ` | ${entry.conf}%` : '';
  return `Phiên ${phien}${dice} | KQ: ${actual}${sum} | Dự đoán: ${prediction} | ${mark}${conf}`;
}

function formatCompactHistoryRow(entry, game) {
  if (!entry || entry.phien == null || entry.risk_pause === true) return null;
  // Chỉ đưa phiên đã có kết quả thực tế vào /history; phiên dự đoán đang chờ
  // không phải lịch sử kết quả và sẽ xuất hiện sau khi nguồn chốt phiên.
  const hasActual = entry.actual != null || entry.actual_vi != null || entry.actual_dice != null;
  if (!hasActual) return null;

  const sessionText = String(entry.phien);
  const sessionNumber = Number(sessionText);
  const sessionValue = /^\d+$/.test(sessionText) && Number.isSafeInteger(sessionNumber)
    ? sessionNumber : entry.phien;
  const row = { phien: sessionValue };
  if (game.type === 'xocdia') {
    // Xóc Đĩa là bốn quân đỏ/trắng, không phải xúc xắc.
    row.ket_qua = entry.actual_vi || entry.actual || '—';
  } else {
    const dice = String(entry.actual_dice || '').match(/[1-6]/g) || [];
    if (dice.length === 3) {
      row.d1 = Number(dice[0]);
      row.d2 = Number(dice[1]);
      row.d3 = Number(dice[2]);
    }
    row.ket_qua = entry.actual || '—';
  }
  row.icon = entry.void === true ? '➖' : entry.ok === true ? '✅' : entry.ok === false ? '❌' : '⏳';
  return row;
}

app.get('/:brand/:table/history', async (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  const game = GAMES[gameId];
  if (!game) return res.status(404).json({ ok: false, error: 'Game không tồn tại' });
  try {
    // Giữ nguyên cơ chế tự làm mới và khóa request của v4.0.
    await runPredict(gameId);
  } catch (error) {
    // Khi API nguồn tạm lỗi, vẫn trả lịch sử đã lưu.
    console.error('[HISTORY_REFRESH]', gameId, error.message);
  }
  const logs = (Array.isArray(predHistory[gameId]) ? predHistory[gameId] : []).slice(0, PRED_LIMIT);
  const history = logs
    .map(entry => formatCompactHistoryRow(entry, game))
    .filter(Boolean);
  // /history chỉ chứa các dòng kết quả thực tế, không trả dự đoán, lý do,
  // độ tin cậy, thống kê phụ hoặc dữ liệu phân tích nội bộ.
  res.json({ history });
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
    console.log(`PRED-API v4.0 on :${PORT}`);
    console.log('Polling:', POLL_MS, 'ms');
    console.log('Games:', Object.keys(GAMES).join(', '));
  });
  startPolling();
}

module.exports = {
  app, GAMES, PARSERS, Engine, mergeSourceHistory,
  parseLc79List, parseLc79Xocdia, parseHitclub, parseMax789,
  modelProbability, MODEL_PROFILES, getModelProfile,
  formatXocdia, redCountFromVi, sideLabel, sideFromSum, formatCauForApi,
  getSum, resolveTxOutcome,
  settlePredictionLogs, pushPredLog, formatHistoryRow, formatCompactHistoryRow, fetchGame, runPredict, expandEmbeddedCauRows,
  consecutiveLossState, getGamePredictionStats, buildOverview, DASHBOARD_HTML,
  _state: { engines, predHistory, lastStatus }
};
