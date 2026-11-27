/**
 * PRED-API v4.2.0 — Algorithm-only core / Tài Xỉu / Xóc Đĩa đa game
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
const AlgorithmOnly = require('./algorithm-only');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const POLL_MS = Math.max(10000, Number(process.env.POLL_MS) || 25000);
const SOURCE_LIMIT = Math.max(200, Number(process.env.SOURCE_LIMIT) || 1200);
const PRED_LIMIT = Math.max(20, Number(process.env.PRED_HISTORY_LIMIT) || 50);
// The extracted algorithm requires at least 15 distinct, usable source sessions.
const requestedMinHistory = Number(process.env.MIN_HISTORY_SESSIONS);
const MIN_HISTORY_SESSIONS = Math.max(AlgorithmOnly.MIN_HISTORY, Number.isFinite(requestedMinHistory) && requestedMinHistory > 0 ? requestedMinHistory : AlgorithmOnly.MIN_HISTORY);
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
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) return fallback;
    const value = JSON.parse(fs.readFileSync(full, 'utf8'));
    return value == null ? fallback : value;
  } catch (error) {
    console.error('[JSON-READ]', file, error.message);
    // Không để lần ghi kế tiếp đè mất dữ liệu: giữ bản hỏng để khôi phục thủ công.
    try {
      if (fs.existsSync(full)) fs.renameSync(full, `${full}.corrupt-${Date.now()}`);
    } catch (renameError) {
      console.error('[JSON-BACKUP]', file, renameError.message);
    }
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

function saveAlgorithmLearning() {
  const snapshot = {};
  for (const gameId of Object.keys(GAMES)) {
    snapshot[gameId] = AlgorithmOnly.getAlgorithmLearningState(gameId);
  }
  saveJSON('algorithm_learning.json', snapshot);
}

function loadAlgorithmLearning() {
  const saved = loadJSON('algorithm_learning.json', {});
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
  for (const [gameId, state] of Object.entries(saved)) {
    try { AlgorithmOnly.setAlgorithmLearningState(gameId, state); }
    catch (error) { console.error('[ALGO-LEARNING-LOAD]', gameId, error.message); }
  }
}

// Restore per-game pattern weights before the first prediction is generated.
loadAlgorithmLearning();

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
  // Phải thay cả "Đ" hoa trước khi chuyển thường: toLowerCase() biến "Đ" thành "đ"
  // (không còn khớp), làm "Đỏ" thành "đo" và bị bỏ qua khi nhận diện màu.
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd')
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
      if (field === 'synthetic') {
        // Cờ "dữ liệu cầu nhúng" chỉ dành cho phiên chưa có bản ghi thật.
        if (!old) merged.synthetic = value;
        else if (incomingQuality > 0) delete merged.synthetic;
        continue;
      }
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

/* =========================== ALGORITHM-ONLY ENGINE ======================= */
// The calculation core is exclusively algorithm-only.js, extracted from the
// supplied văn bản.txt. Each game receives an isolated learning profile key.
function getModelProfile(gameId) {
  const key = String(gameId || 'default').replace(/[^a-z0-9/_-]/gi, '');
  return {
    name: `${key.replace(/\//g, '-')}-${AlgorithmOnly.ALGO_VERSION}`,
    algorithm: AlgorithmOnly.ALGO_VERSION,
    minHistory: MIN_HISTORY_SESSIONS
  };
}

function algorithmLabelFromSide(side, gameType) {
  if (gameType === 'xocdia') return side === 'CHAN' ? 'Tài' : side === 'LE' ? 'Xỉu' : null;
  return side === 'T' ? 'Tài' : side === 'X' ? 'Xỉu' : null;
}

function translateParityText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/Tài/g, 'Chẵn').replace(/Xỉu/g, 'Lẻ').replace(/tài/g, 'chẵn').replace(/xỉu/g, 'lẻ');
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
    return this.history.filter(row => this.type === 'xocdia' ? (row.side === 'CHAN' || row.side === 'LE') : (row.side === 'T' || row.side === 'X')).length;
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
    const sampleSize = this.validSampleCount();
    if (sampleSize < MIN_HISTORY_SESSIONS) {
      return {
        ready: false,
        sampleSize,
        requiredSamples: MIN_HISTORY_SESSIONS,
        lyDo: `Đang học dữ liệu: cần tối thiểu ${MIN_HISTORY_SESSIONS} phiên hợp lệ`
      };
    }

    const toAlgorithmResult = side => algorithmLabelFromSide(side, this.type);
    const newestFirst = [...this.history].reverse();
    const dataDesc = newestFirst.map(row => {
      const result = toAlgorithmResult(row.side);
      const dice = this.type === 'xocdia' ? [] : (Array.isArray(row.dice) ? row.dice : []);
      return {
        Phien: row.session,
        Ket_qua: result,
        Xuc_xac_1: dice[0],
        Xuc_xac_2: dice[1],
        Xuc_xac_3: dice[2],
        Tong: this.type === 'xocdia' ? null : row.sum,
        dices: dice
      };
    }).filter(row => row.Ket_qua === 'Tài' || row.Ket_qua === 'Xỉu');

    const historyAsc = this.history.map(row => ({
      id: row.session,
      resultTruyenThong: row.side === 'T' || row.side === 'CHAN' ? 'TAI' : row.side === 'X' || row.side === 'LE' ? 'XIU' : null,
      dices: this.type === 'xocdia' ? [] : (Array.isArray(row.dice) ? row.dice : []),
      point: this.type === 'xocdia' ? null : row.sum
    })).filter(row => row.resultTruyenThong);

    const learning = AlgorithmOnly.getAlgorithmLearningState(this.id);
    const calculated = AlgorithmOnly.calculateAdvancedPrediction(dataDesc, this.id, {
      historyAsc,
      currentStreak: Number(learning.streakAnalysis && learning.streakAnalysis.currentStreak) || 0,
      gameType: this.type,
      diceModel: this.id.endsWith('/md5') ? 'md5' : 'hu',
      allowRandomJitter: false,
      includeExperimentalRandomSignal: false
    });

    if (!calculated || calculated.ready !== true || !calculated.prediction) {
      return {
        ready: false,
        sampleSize,
        requiredSamples: MIN_HISTORY_SESSIONS,
        lyDo: calculated && calculated.lyDo || 'Thuật toán chưa đủ dữ liệu hợp lệ để dự đoán'
      };
    }

    const algorithmSide = calculated.prediction === 'Tài' ? 'T' : 'X';
    const side = this.type === 'xocdia'
      ? (algorithmSide === 'T' ? 'CHAN' : 'LE')
      : algorithmSide;
    const translate = this.type === 'xocdia' ? translateParityText : value => value;
    const translatedPatterns = (calculated.allPatterns || []).map(item => ({
      ...item,
      prediction: item.prediction ? translate(item.prediction) : item.prediction,
      name: translate(item.name),
      patternId: item.patternId || null
    }));
    const algorithmPatterns = translatedPatterns.filter(item => item.patternId);

    return {
      ready: true,
      side,
      label: sideLabel(side),
      conf: calculated.confidence,
      pSide: calculated.confidence / 100,
      vi: null,
      topVi: [],
      viDetails: [],
      topSums: [],
      lyDo: translate(calculated.lyDo || calculated.theCau || 'Phân tích chuỗi lịch sử bằng algorithm-only'),
      cau: this.currentCau(20),
      cauStructure: null,
      regime: null,
      sampleSize: calculated.detailedAnalysis && calculated.detailedAnalysis.validSamples || sampleSize,
      streak: Number(learning.streakAnalysis && learning.streakAnalysis.currentStreak) || 0,
      adaptive: null,
      profile: getModelProfile(this.id).name,
      theCau: translate(calculated.theCau || ''),
      khuyenNghi: calculated.khuyenNghi || (calculated.nenDanh ? 'ĐẸP - NÊN VÀO' : 'QUAN SÁT - CHỜ NHỊP'),
      nenDanh: calculated.nenDanh === true,
      algorithmVersion: AlgorithmOnly.ALGO_VERSION,
      algorithmPatterns,
      factors: (calculated.factors || []).map(translate),
      detailedAnalysis: calculated.detailedAnalysis || null
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
// Lịch sử nguồn mới nhất (newest-first) của từng game, cập nhật sau mỗi lần tải thành công.
const sourceCache = {};
// Kết quả thành công gần nhất, dùng lại trong vài giây để nhiều request không gọi nguồn liên tục.
const recentOk = {};
const REQUEST_CACHE_MS = 4000;

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
  let algorithmUpdated = false;
  for (const log of logs) {
    if (!log || log.phien == null) continue;
    const actualRow = findSourceResult(rows, log.phien);
    if (!actualRow) continue;

    if (log.risk_pause === true) {
      // Phiên bỏ qua để bảo vệ không phải lượt cược: chỉ ghi kết quả thật của
      // nguồn để /history không bị thiếu phiên, không tính đúng/sai.
      if (!actualRow.side && actualRow.sideSource !== 'triple') continue;
      const next = {
        actual: actualRow.sideSource === 'triple' ? 'Bộ ba' : sideLabel(actualRow.side),
        actual_side: actualRow.side || null,
        actual_dice: actualDiceText(actualRow, game.type),
        actual_sum: actualRow.sum == null ? null : actualRow.sum,
        actual_vi: game.type === 'xocdia' ? actualDiceText(actualRow, game.type) : null,
        data_warning: actualRow.dataWarning || null
      };
      const rowChanged = Object.keys(next).some(key => log[key] !== next[key]);
      if (rowChanged) { changed = true; Object.assign(log, next); }
      continue;
    }

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

    // Train the extracted algorithm exactly once after the actual result is valid.
    // Xóc Đĩa maps Chẵn/Lẻ to the source algorithm's binary Tài/Xỉu alphabet only
    // internally; the public API and stored game result remain Chẵn/Lẻ.
    if (log.algorithm_learned !== true) {
      const predictedForLearning = algorithmLabelFromSide(predictedSide, game.type);
      const actualForLearning = algorithmLabelFromSide(actualRow.side, game.type);
      if (predictedForLearning && actualForLearning) {
        try {
          const learned = AlgorithmOnly.learnFromSettledPrediction(gameId, {
            prediction: predictedForLearning,
            patterns: Array.isArray(log.algorithm_patterns) ? log.algorithm_patterns : [],
            verified: false
          }, actualForLearning);
          if (learned && learned.updated) {
            log.algorithm_learned = true;
            log.algorithm_learned_at = new Date().toISOString();
            log.algorithm_learning_result = {
              isCorrect: learned.isCorrect,
              updatedPatterns: learned.updatedPatterns || [],
              recentAccuracy: learned.recentAccuracy
            };
            changed = true;
            algorithmUpdated = true;
          }
        } catch (error) {
          console.error('[ALGO-LEARNING]', gameId, log.phien, error.message);
        }
      }
    }
  }
  if (changed) saveJSON('pred_history.json', predHistory);
  if (algorithmUpdated) saveAlgorithmLearning();
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
  let lastLossSession = null;
  for (const entry of logs) {
    if (!entry) continue;
    if (ignorePendingSession != null && String(entry.phien) === String(ignorePendingSession) &&
        entry.risk_pause !== true && entry.ok == null) continue;
    // A skipped forecast creates a deliberate gap and breaks the active loss run.
    if (entry.risk_pause === true) return { count: 0, lastLossSession: null, protectedGap: true };
    if (entry.void === true) continue;
    if (entry.ok === false) {
      count++;
      if (count === 1) lastLossSession = String(entry.phien);
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
  sourceCache[gameId] = rows;
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
      : (latest.side ? sideLabel(latest.side) : (latest.sideSource === 'triple' ? 'Bộ ba' : null)),
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
  // distinct sessions through polling until the extracted algorithm minimum is met.
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
      Model_profile: getModelProfile(gameId).name,
      Algorithm_version: AlgorithmOnly.ALGO_VERSION
    };
  }

  // One forecast (or one deliberate skip) per target session.
  const existingLogs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  let log = existingLogs.find(item => String(item.phien) === String(nextSession));
  let pred;

  // Do not keep an un-settled forecast produced by the removed PRED-API engine.
  // Archive it for traceability, then compute this target session with algorithm-only.
  if (log && log.algorithm_version !== AlgorithmOnly.ALGO_VERSION &&
      log.ok == null && log.actual == null && log.actual_vi == null && log.actual_dice == null &&
      log.risk_pause !== true && log.void !== true) {
    const archive = loadJSON('superseded_predictions.json', []);
    archive.unshift({ ...log, superseded_at: new Date().toISOString(),
      superseded_reason: `Replaced by algorithm-only ${AlgorithmOnly.ALGO_VERSION}` });
    if (archive.length > 2000) archive.length = 2000;
    saveJSON('superseded_predictions.json', archive);
    const staleIndex = existingLogs.indexOf(log);
    if (staleIndex >= 0) existingLogs.splice(staleIndex, 1);
    saveJSON('pred_history.json', predHistory);
    log = null;
  }

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
        algorithm_version: pred.algorithmVersion || AlgorithmOnly.ALGO_VERSION,
        algorithm_patterns: Array.isArray(pred.algorithmPatterns) ? pred.algorithmPatterns : [],
        algorithm_factors: Array.isArray(pred.factors) ? pred.factors : [],
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
    Algorithm_version: log.algorithm_version || AlgorithmOnly.ALGO_VERSION,
    Consecutive_losses: pred.paused ? (log.loss_streak_before_pause || 3) : consecutiveLossState(gameId, nextSession).count,
    Trang_thai: pred.paused ? 'TAM_DUNG_BAO_VE' : 'DA_SAN_SANG',
    Is_ready: true,
    Con_thieu: 0,
    Regime: pred.paused ? null : (pred.regime || null),
    Cau_structure: pred.paused ? null : (pred.cauStructure ? {
      regime: pred.cauStructure.regime,
      run: pred.cauStructure.run,
      switch_rate: pred.cauStructure.switchRate,
      stability: pred.cauStructure.stability,
      description: pred.cauStructure.description
    } : null)
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
  const cached = recentOk[gameId];
  if (cached && Date.now() - cached.at < REQUEST_CACHE_MS) return Promise.resolve(cached.payload);
  const task = runPredictInternal(gameId)
    .then(payload => {
      recentOk[gameId] = { at: Date.now(), payload };
      return payload;
    })
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
  const totals = games.reduce((acc, game) => {
    const t = game.thong_ke || {};
    acc.tong += Number(t.tong_phien) || 0;
    acc.dung += Number(t.dung) || 0;
    acc.sai += Number(t.sai) || 0;
    acc.dang_cho += Number(t.dang_cho) || 0;
    return acc;
  }, { tong: 0, dung: 0, sai: 0, dang_cho: 0 });
  const decided = totals.dung + totals.sai;
  totals.ti_le_dung = decided ? Math.round((totals.dung / decided) * 1000) / 10 : null;
  return {
    id: IDOL, name: 'PRED-API', version: '4.2.0', time: nowVN(),
    total_games: games.length,
    thong_ke_tong: totals,
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
<header class="top"><div><div class="brand">PRED-API <span class="muted">/ v4.1.2</span></div><div class="sub">Tổng quan game · thống kê dự đoán · trạng thái dữ liệu</div></div><div class="stamp" id="updated">Đang tải…</div></header>
<section class="summary" id="summary"><div class="metric"><div class="num">—</div><small>Đang tải dữ liệu</small></div></section>
<div class="section">Danh sách game</div><section class="games" id="games"><div class="game muted">Đang tải danh sách game…</div></section>
<div class="footer">Tỉ lệ đúng tính trên các phiên đã chốt trong lịch sử dự đoán đang lưu. Tối thiểu 15 phiên hợp lệ trước khi phát dự đoán.</div>
</main><script>
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText={online:'Đang chạy',learning:'Đang học',pending:'Chờ dữ liệu',protected:'Tạm dừng bảo vệ',error:'Lỗi API'};
async function load(){try{const r=await fetch('/overview',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();
$('updated').textContent='Cập nhật: '+(d.time||'—');
const t=d.thong_ke_tong||{};const rateTxt=t.ti_le_dung==null?'—':t.ti_le_dung+'%';$('summary').innerHTML=[[d.total_games||0,'Tổng game'],[d.online||0,'Đang chạy'],[d.learning||0,'Đang học'],[d.offline||0,'Lỗi API'],[t.tong||0,'Dự đoán đã lưu'],[t.dung||0,'Đúng'],[t.sai||0,'Sai'],[rateTxt,'Tỉ lệ đúng']].map(([v,l])=>'<div class=\"metric\"><div class=\"num\">'+esc(v)+'</div><small>'+l+'</small></div>').join('');
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
  res.json({ ok: true, id: IDOL, version: '4.2.0', time: nowVN(), games: Object.keys(GAMES).length, min_history_sessions: MIN_HISTORY_SESSIONS });
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

function historyIcon(entry) {
  if (!entry) return '➖';
  if (entry.prediction_missing === true || entry.void === true) return '➖';
  if (entry.risk_pause === true) return '⏸️';
  if (entry.ok === true) return '✅';
  if (entry.ok === false) return '❌';
  return '⏳';
}

function formatCompactHistoryRow(entry, game) {
  if (!entry || entry.phien == null) return null;
  // Chỉ đưa phiên đã có kết quả thật vào /history; phiên dự đoán đang chờ
  // sẽ xuất hiện sau khi nguồn chốt phiên.
  const hasActual = entry.actual != null || entry.actual_vi != null || entry.actual_dice != null;
  if (!hasActual) return null;

  const sessionText = String(entry.phien);
  const sessionNumber = Number(sessionText);
  const sessionValue = /^\d+$/.test(sessionText) && Number.isSafeInteger(sessionNumber)
    ? sessionNumber : entry.phien;
  const row = { phien: sessionValue };
  if (game.type === 'xocdia') {
    // Xóc Đĩa là bốn quân đỏ/trắng, không phải xúc xắc.
    row.ket_qua = entry.actual_vi || '—';
    row.chan_le = entry.actual || '—';
  } else {
    const dice = String(entry.actual_dice || '').match(/[1-6]/g) || [];
    if (dice.length === 3) {
      row.d1 = Number(dice[0]);
      row.d2 = Number(dice[1]);
      row.d3 = Number(dice[2]);
    }
    row.ket_qua = entry.actual || '—';
  }
  row.icon = historyIcon(entry);
  return row;
}

// Dựng lịch sử từ DỮ LIỆU NGUỒN (không chỉ từ log dự đoán), để một phiên không
// biến mất chỉ vì lần poll trước đã bỏ lỡ hoặc phiên đó bị tạm dừng bảo vệ.
// Log dự đoán chỉ bổ sung trạng thái đúng/sai/tạm dừng cho phiên tương ứng.
function buildGameHistory(gameId, game) {
  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  const byPhien = new Map();
  for (const log of logs) if (log && log.phien != null) byPhien.set(String(log.phien), log);

  let source = sourceCache[gameId];
  if (!Array.isArray(source)) {
    const stored = loadJSON(sourceFile(gameId), []);
    source = Array.isArray(stored) ? [...stored].reverse() : [];
  }

  const entries = new Map();
  for (const row of source) {
    if (!row || row.session == null) continue;
    if (!row.side && row.sideSource !== 'triple') continue;
    const phien = String(row.session);
    const log = byPhien.get(phien);
    entries.set(phien, {
      phien,
      actual: row.sideSource === 'triple' ? 'Bộ ba' : sideLabel(row.side),
      actual_dice: game.type === 'xocdia'
        ? (row.vi || (Number.isInteger(row.doCount) ? formatXocdia(row.doCount) : null))
        : (Array.isArray(row.dice) && row.dice.length === 3 ? row.dice.join(' - ') : null),
      actual_vi: game.type === 'xocdia'
        ? (row.vi || (Number.isInteger(row.doCount) ? formatXocdia(row.doCount) : null))
        : null,
      ok: log ? log.ok : null,
      void: log ? log.void === true : row.sideSource === 'triple',
      risk_pause: log ? log.risk_pause === true : false,
      prediction_missing: !log
    });
  }
  // Phiên đã có log nhưng nguồn chưa còn trong bộ đệm: vẫn giữ nếu có kết quả thật.
  for (const log of logs) {
    const phien = String(log.phien);
    if (entries.has(phien)) continue;
    if (log.actual == null && log.actual_vi == null && log.actual_dice == null) continue;
    entries.set(phien, { ...log, phien });
  }

  const ordered = Array.from(entries.values()).sort((a, b) => {
    if (isNumericSession(a.phien) && isNumericSession(b.phien)) {
      const aa = BigInt(a.phien), bb = BigInt(b.phien);
      return aa > bb ? -1 : aa < bb ? 1 : 0;
    }
    return String(b.phien).localeCompare(String(a.phien));
  });
  return ordered.slice(0, PRED_LIMIT)
    .map(entry => formatCompactHistoryRow(entry, game))
    .filter(Boolean);
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
  const history = buildGameHistory(gameId, game);
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
    console.log(`PRED-API v4.2.0 on :${PORT}`);
    console.log('Polling:', POLL_MS, 'ms');
    console.log('Games:', Object.keys(GAMES).join(', '));
  });
  startPolling();
}

module.exports = {
  app, GAMES, PARSERS, Engine, mergeSourceHistory,
  parseLc79List, parseLc79Xocdia, parseHitclub, parseMax789,
  getModelProfile, AlgorithmOnly, saveAlgorithmLearning,
  formatXocdia, redCountFromVi, sideLabel, sideFromSum, formatCauForApi,
  getSum, resolveTxOutcome,
  settlePredictionLogs, pushPredLog, formatHistoryRow, formatCompactHistoryRow, buildGameHistory, fetchGame, runPredict, expandEmbeddedCauRows,
  consecutiveLossState, getGamePredictionStats, buildOverview, DASHBOARD_HTML,
  _state: { engines, predHistory, lastStatus, sourceCache, recentOk }
};
