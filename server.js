/**
 * PRED-API v5.0 — Tài Xỉu / Xóc Đĩa đa game
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
const PRED_LIMIT = Math.max(20, Number(process.env.PRED_HISTORY_LIMIT) || 80);
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

function gameSideLabel(side, type) {
  if (type === 'xocdia') return side === 'CHAN' ? 'Chẵn' : side === 'LE' ? 'Lẻ' : null;
  return sideLabel(side);
}

function analyzeRoad(history, type) {
  const sides = (Array.isArray(history) ? history : [])
    .map(row => binarySide(row.side, type)).filter(Boolean);
  const recent = sides.slice(-20);
  if (!recent.length) return {
    dang_cau: 'chưa đủ dữ liệu', do_dai_bet: 0,
    cua_dang_bet: null, chuoi_20_phien: []
  };
  const last = recent[recent.length - 1];
  let run = 1;
  for (let i = recent.length - 2; i >= 0 && recent[i] === last; i--) run++;
  const runs = [];
  for (const side of recent) {
    const tail = runs[runs.length - 1];
    if (tail && tail.side === side) tail.count++;
    else runs.push({ side, count: 1 });
  }
  let road = 'cầu hỗn hợp';
  if (run >= 3) road = `bệt ${run} phiên`;
  else if (runs.length >= 4) {
    const lastFour = runs.slice(-4);
    if (lastFour.every(item => item.count === lastFour[0].count)) {
      const block = lastFour[0].count;
      if (block >= 1 && block <= 3) road = `cầu ${block}-${block}`;
    }
  }
  const label = side => type === 'xocdia' ? (side === 'T' ? 'Chẵn' : 'Lẻ') : (side === 'T' ? 'Tài' : 'Xỉu');
  return {
    dang_cau: road,
    do_dai_bet: run,
    cua_dang_bet: label(last),
    chuoi_20_phien: recent.map(label)
  };
}

function currentRoadVietnamese(history, type, maxLen = 20) {
  const label = side => type === 'xocdia'
    ? (side === 'CHAN' ? 'Chẵn' : side === 'LE' ? 'Lẻ' : null)
    : (side === 'T' ? 'Tài' : side === 'X' ? 'Xỉu' : null);
  return (Array.isArray(history) ? history : [])
    .slice(-maxLen)
    .map(row => label(row.side))
    .filter(Boolean)
    .join(' → ');
}

function summarizeGameStats(gameId) {
  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  let correct = 0, wrong = 0, waiting = 0, voided = 0, paused = 0;
  for (const entry of logs) {
    if (!entry) continue;
    if (entry.risk_pause === true) paused++;
    else if (entry.ok === true) correct++;
    else if (entry.ok === false) wrong++;
    else if (entry.void === true) voided++;
    else waiting++;
  }
  const settled = correct + wrong;
  return {
    tong_phien: logs.length,
    dung: correct,
    sai: wrong,
    dang_cho: waiting,
    bo_qua: voided,
    tam_dung: paused,
    da_chot: settled,
    ti_le_dung: settled ? Math.round((correct / settled) * 1000) / 10 : 0
  };
}

function vietnameseGameStatus(id) {
  const status = lastStatus[id] || {};
  if (status.ok === true) return status.mode === 'protected' ? 'tạm dừng bảo vệ' : 'đang hoạt động';
  if (status.ok === false) return 'mất kết nối';
  if (status.mode === 'learning') return 'đang học dữ liệu';
  return 'đang chờ dữ liệu';
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
    warnings.push(`Tổng từ API ${reportedSum} lệch tổng xúc xắc ${sourceSum}`);
  }
  if (declared === 'T' || declared === 'X') {
    if (triple) warnings.push(`Kết quả từ API là ${sideLabel(declared)} nhưng xúc xắc là bộ ba`);
    else if (side && declared !== side) warnings.push(`Kết quả từ API là ${sideLabel(declared)} nhưng tính từ xúc xắc ra ${sideLabel(side)}`);
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
  if (value == null) return null;
  const s = normText(value).replace(/[_–—-]+/g, ' ').replace(/[,/]+/g, ' ');
  if (!s) return null;
  const redMatch = s.match(/([0-4])\s*(do|red)\b/);
  const whiteMatch = s.match(/([0-4])\s*(trang|white)\b/);
  if (redMatch) return Number(redMatch[1]);
  if (whiteMatch) return 4 - Number(whiteMatch[1]);
  const wordMap = { zero: 0, one: 1, two: 2, three: 3, four: 4, mot: 1, hai: 2, ba: 3, bon: 4, khong: 0 };
  for (const [word, number] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${word}\\s*(do|red)\\b`).test(s)) return number;
    if (new RegExp(`\\b${word}\\s*(trang|white)\\b`).test(s)) return 4 - number;
  }
  // Chuỗi kiểu "3-1" chỉ được hiểu khi trường nguồn xác định rõ thứ tự đỏ-trắng.
  const pair = s.match(/^([0-4])\s+([0-4])$/);
  if (pair && Number(pair[1]) + Number(pair[2]) === 4) return Number(pair[1]);
  return null;
}

function formatXocdia(redCount) {
  if (!Number.isInteger(redCount) || redCount < 0 || redCount > 4) return null;
  return `${redCount} đỏ - ${4 - redCount} trắng`;
}

function getXocdiaColorValues(row) {
  if (!row || typeof row !== 'object') return [];
  const raw = firstValue(row, [
    'colors', 'Colors', 'coinColors', 'CoinColors', 'coins', 'Coins',
    'discs', 'Discs', 'disks', 'Disks', 'colorList', 'ColorList',
    'faces', 'Faces', 'facesList', 'FacesList', 'resultList', 'ResultList',
    'dices', 'Dices', 'diceList', 'DiceList'
  ]);
  if (Array.isArray(raw)) return raw.map(value => {
    if (value && typeof value === 'object') return firstValue(value, ['color', 'Color', 'value', 'Value', 'name', 'Name', 'result', 'Result']);
    return value;
  }).filter(value => value != null);
  if (typeof raw === 'string') {
    const matches = raw.match(/đỏ|trắng|do|trang|red|white|\br\b|\bw\b/giu);
    if (matches && matches.length === 4) return matches;
  }
  return [];
}

function parseXocdiaRow(row) {
  // Xóc Đĩa dùng bốn quân màu, không phải ba xúc xắc. Chỉ đọc màu/mẫu kết quả.
  const rawPattern = firstValue(row, [
    'resultVi', 'ResultVi', 'vi', 'Vi', 'result_vi', 'pattern', 'Pattern',
    'ket_qua', 'Ket_qua', 'result', 'Result', 'outcome', 'Outcome',
    'resultName', 'ResultName', 'name', 'Name'
  ]);
  let colorValues = getXocdiaColorValues(row);
  if (!colorValues.length && Array.isArray(rawPattern)) colorValues = rawPattern;
  if (!colorValues.length && typeof rawPattern === 'string') {
    const tokens = normText(rawPattern).match(/\b(do|trang|red|white)\b/g);
    if (tokens && tokens.length === 4) colorValues = tokens;
  }
  const colors = colorValues.map(normalizeColor);
  let redCount = colorValues.length === 4 && colors.every(Boolean)
    ? colors.filter(color => color === 'do').length : null;

  // Một số API trả số lượng màu thay vì danh sách bốn quân.
  if (redCount === null) {
    const explicitRed = toNumber(firstValue(row, ['redCount', 'RedCount', 'soDo', 'SoDo', 'doCount', 'DoCount', 'red', 'Red']));
    const explicitWhite = toNumber(firstValue(row, ['whiteCount', 'WhiteCount', 'soTrang', 'SoTrang', 'trangCount', 'TrangCount', 'white', 'White']));
    if (Number.isInteger(explicitRed) && explicitRed >= 0 && explicitRed <= 4 &&
        (explicitWhite === null || explicitWhite === 4 - explicitRed)) redCount = explicitRed;
    else if (Number.isInteger(explicitWhite) && explicitWhite >= 0 && explicitWhite <= 4) redCount = 4 - explicitWhite;
  }
  if (redCount === null) redCount = redCountFromVi(rawPattern);

  const whiteCount = redCount === null ? null : 4 - redCount;
  const declaredValue = firstValue(row, [
    'resultTruyenThong', 'ResultTruyenThong', 'ket_qua', 'Ket_qua',
    'result', 'Result', 'side', 'Side', 'parity', 'Parity'
  ]);
  const declaredSide = parseKetQua(declaredValue) || parseKetQua(rawPattern);
  const derivedSide = redCount === null ? null : (redCount % 2 === 0 ? 'CHAN' : 'LE');
  const side = derivedSide || (declaredSide === 'CHAN' || declaredSide === 'LE' ? declaredSide : null);
  const patternText = formatXocdia(redCount) || null;
  const dataWarning = derivedSide && (declaredSide === 'CHAN' || declaredSide === 'LE') && derivedSide !== declaredSide
    ? `Kết quả API ${sideLabel(declaredSide)} lệch mẫu màu ${patternText}` : null;
  return {
    session: getSession(row),
    side,
    sideSource: derivedSide ? 'derived_color' : side ? 'declared' : 'missing',
    dataWarning,
    // Không lưu quân màu trong trường xúc xắc; giữ riêng mẫu đỏ/trắng.
    dice: [],
    coins: colors.length === 4 && colors.every(Boolean) ? colors : [],
    doCount: redCount,
    trangCount: whiteCount,
    vi: patternText || (rawPattern != null && (declaredSide === 'CHAN' || declaredSide === 'LE') ? sideLabel(declaredSide) : null),
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

function parseSunhot(raw) {
  const list = getRows(raw);
  return list.map(row => {
    const side = parseKetQua(firstValue(row, ['ket_qua', 'Ket_qua', 'result', 'Result', 'side']));
    const session = String(firstValue(row, ['phien_truoc', 'Phien_truoc', 'session', 'phien', 'Phien', 'id']) || '');
    const nextSession = String(firstValue(row, ['phien_hien_tai', 'Phien_hien_tai', 'nextSession', 'next_session']) || '');
    return {
      session, side: side === 'T' || side === 'X' ? side : null,
      sideSource: side === 'T' || side === 'X' ? 'declared' : 'missing',
      dice: [], sum: null, nextSession: nextSession || null,
      time: normalizeTime(firstValue(row, ['time', 'Time', 'createdAt', 'timestamp']))
    };
  }).filter(row => row.session);
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

function sourceSideQuality(row) {
  if (!row) return 0;
  const source = row.sideSource;
  if (source === 'dice_sum' || source === 'derived_color' || source === 'triple') return 3;
  if (source === 'reported_sum') return 2;
  if (source === 'declared') return 1;
  if (source === 'embedded_cau' || source === 'missing') return 0;
  // Compatibility with source files saved by v1/v2 before sideSource was stored.
  if ((Array.isArray(row.dice) && row.dice.length === 3) || (Array.isArray(row.coins) && row.coins.length === 4)) return 3;
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
  }),
  'sunhot/tx': makeModelProfile('sunhot-tx-short-medium', {
    shortWindow: 12, mediumWindow: 38, longWindow: 90, ewmaAlpha: 0.10,
    markovPriors: [8, 13, 18], patternMaxOrder: 5, patternMinMatches: 3,
    patternPrior: 8, runPrior: 9, sumBandPrior: 11, evalWindow: 58,
    weights: { short: 0.12, medium: 0.12, long: 0.09, ewma: 0.10, markov1: 0.12, markov2: 0.10, markov3: 0.06, pattern: 0.09, run: 0.07, sumBand: 0.03, dice: 0.07 }
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
        dice: Array.isArray(row.dice) ? row.dice : [], coins: Array.isArray(row.coins) ? row.coins : [], vi: row.vi || null,
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
  if (!row || gameType === 'xocdia') return null;
  if (Array.isArray(row.dice) && row.dice.length) return row.dice.join(' - ');
  return null;
}

function actualXocdiaText(row) {
  if (!row) return null;
  return row.vi && /do|trang/i.test(normText(row.vi))
    ? row.vi
    : (Number.isInteger(row.doCount) ? formatXocdia(row.doCount) : null);
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
        actual_vi: game.type === 'xocdia' ? actualXocdiaText(actualRow) : null,
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
      actual_vi: game.type === 'xocdia' ? actualXocdiaText(actualRow) : null,
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
      topVi: []
    };
  }
  return {
    side: log.pred_side || getPredictionSide(log.du_doan) || 'T',
    label: log.du_doan || 'Tài',
    conf: Number(log.conf) || 50,
    lyDo: log.ly_do || 'Dự đoán đã lưu cho phiên này',
    cau: log.cau || '',
    vi: log.vi || null,
    topVi: Array.isArray(log.top_vi) ? log.top_vi : []
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
    ma: IDOL,
    ten_game: game.label,
    phien: latest.session != null
      ? (isNumericSession(latest.session) ? Number(latest.session) : latest.session)
      : null,
    ket_qua: gameSideLabel(latest.side, game.type),
    chuoi_cau: currentRoadVietnamese(engine.history, game.type, 20),
    phien_tiep: isNumericSession(nextSession) ? Number(nextSession) : nextSession,
    thoi_gian: nowVN(),
    canh_bao_du_lieu: latest.dataWarning || null,
    so_mau_api: latest.apiSampleSize || null,
    so_phien_du_lieu: sampleCount,
    so_phien_toi_thieu: MIN_HISTORY_SESSIONS,
    thong_ke: summarizeGameStats(gameId),
    phan_tich_cau: analyzeRoad(engine.history, game.type)
  };

  if (game.type === 'xocdia') {
    basePayload.mau_ket_qua = actualXocdiaText(latest);
    basePayload.so_do = Number.isInteger(latest.doCount) ? latest.doCount : null;
    basePayload.so_trang = Number.isInteger(latest.trangCount) ? latest.trangCount : null;
  } else {
    basePayload.xuc_xac = actualDiceText(latest, game.type);
    basePayload.tong = latest.sum == null ? null : latest.sum;
  }

  // Warm-up applies independently to every game.
  if (sampleCount < MIN_HISTORY_SESSIONS) {
    const remaining = MIN_HISTORY_SESSIONS - sampleCount;
    lastStatus[gameId] = {
      ok: null, mode: 'learning', samples: sampleCount,
      required: MIN_HISTORY_SESSIONS, error: null, time: nowVN()
    };
    return {
      ...basePayload,
      trang_thai: 'đang học dữ liệu',
      san_sang: false,
      con_thieu: remaining,
      du_doan: null,
      du_doan_cua: null,
      do_tin_cay: null,
      ly_do: `Đang thu thập dữ liệu riêng cho ${game.label}: đã có ${sampleCount}/${MIN_HISTORY_SESSIONS} phiên hợp lệ; chưa phát dự đoán`,
      thong_ke: summarizeGameStats(gameId)
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
        vi: null,
        actual: null,
        actual_side: null,
        actual_dice: null,
        actual_vi: null,
        ok: null,
        void: false,
        risk_pause: true,
        loss_streak_before_pause: lossState.count,
        time: nowVN()
      });
      pred = predictionFromLog(log, game);
    } else {
      pred = engine.predict();
      if (!pred || pred.ready === false) throw new Error('Dữ liệu chưa đủ để khởi tạo mô hình dự đoán');
      log = pushPredLog(gameId, {
        phien: nextSession,
        du_doan: pred.label,
        pred_side: pred.side,
        conf: pred.conf,
        ly_do: pred.lyDo || null,
        cau: pred.cau || null,
        vi: pred.vi || null,
        top_vi: pred.topVi || [],
        model_profile: pred.profile || getModelProfile(gameId).name,
        training_sample_size: pred.sampleSize || sampleCount,
        actual: null,
        actual_side: null,
        actual_dice: null,
        actual_vi: null,
        ok: null,
        time: nowVN()
      });
    }
  }

  const payload = {
    ...basePayload,
    chuoi_cau: currentRoadVietnamese(engine.history, game.type, 20),
    du_doan: pred.paused ? null : pred.label,
    du_doan_cua: pred.paused ? null : gameSideLabel(pred.side, game.type),
    do_tin_cay: pred.paused ? null : pred.conf,
    ly_do: pred.lyDo || 'Tổng hợp thống kê lịch sử riêng của game',
    so_phien_phan_tich: pred.sampleSize || sampleCount,
    so_lan_sai_lien_tiep: pred.paused ? (log.loss_streak_before_pause || 3) : consecutiveLossState(gameId, nextSession).count,
    trang_thai: pred.paused ? 'tạm dừng bảo vệ' : 'đã sẵn sàng',
    san_sang: true,
    con_thieu: 0,
    thong_ke: summarizeGameStats(gameId)
  };

  if (game.type === 'xocdia') {
    payload.vi_du_doan = pred.paused ? null : (pred.vi || null);
    payload.top_mau_du_doan = pred.paused ? [] : (pred.topVi || []);
    payload.top_mau_chi_tiet = pred.paused ? [] : (pred.viDetails || []).map(item => ({
      mau: item.vi,
      xac_suat_phan_tram: item.probability
    }));
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

function formatHistoryRow(entry, game) {
  const phien = entry.phien != null ? String(entry.phien) : '—';
  if (entry.risk_pause === true) return `${phien} · tạm nghỉ · ⏸️`;
  const mark = entry.void === true ? '➖' : entry.ok === true ? '✅' : entry.ok === false ? '❌' : '⏳';
  const actual = entry.actual || 'đang chờ';
  if (game.type === 'xocdia') {
    const pattern = entry.actual_vi && /do|trang/i.test(normText(entry.actual_vi)) ? entry.actual_vi : null;
    const result = pattern ? `${pattern} · ${actual}` : actual;
    return `${phien} · ${result} · ${mark}`;
  }
  const dice = entry.actual_dice ? ` · ${String(entry.actual_dice).replace(/\s*-\s*/g, '-')}` : '';
  const sum = entry.actual_sum != null ? ` (${entry.actual_sum})` : '';
  return `${phien}${dice} · ${actual}${sum} · ${mark}`;
}

/* ================================= ROUTES ================================ */
function buildGameOverview(id, game) {
  const status = lastStatus[id] || {};
  return {
    ma_game: id,
    ten_game: game.label,
    loai_game: game.type === 'xocdia' ? 'xóc đĩa' : 'tài xỉu',
    trang_thai: vietnameseGameStatus(id),
    so_phien_du_lieu: status.samples || getEngine(id).validSampleCount(),
    so_phien_toi_thieu: status.required || MIN_HISTORY_SESSIONS,
    thong_ke: summarizeGameStats(id),
    cap_nhat_luc: status.time || null,
    loi: status.error || null,
    duong_dan_du_doan: `/${id}`,
    duong_dan_lich_su: `/${id}/history`
  };
}

app.get('/', (_req, res) => {
  const games = Object.entries(GAMES).map(([id, game]) => buildGameOverview(id, game));
  const count = status => games.filter(game => game.trang_thai === status).length;
  res.json({
    ma: IDOL,
    ten: 'PRED-API',
    phien_ban: '5.0.0',
    thoi_gian: nowVN(),
    tong_so_game: games.length,
    dang_hoat_dong: count('đang hoạt động'),
    dang_hoc_du_lieu: count('đang học dữ liệu'),
    tam_dung_bao_ve: count('tạm dừng bảo vệ'),
    mat_ket_noi: count('mất kết nối'),
    cac_game: games
  });
});

app.get('/health', (_req, res) => {
  res.json({
    hoat_dong: true,
    ma: IDOL,
    phien_ban: '5.0.0',
    thoi_gian: nowVN(),
    tong_so_game: Object.keys(GAMES).length,
    so_phien_toi_thieu: MIN_HISTORY_SESSIONS
  });
});

app.get('/games', (_req, res) => {
  const games = Object.entries(GAMES).map(([id, game]) => buildGameOverview(id, game));
  res.json({
    ma: IDOL,
    thanh_cong: true,
    tong_so_game: games.length,
    so_phien_toi_thieu: MIN_HISTORY_SESSIONS,
    cac_game: games
  });
});

app.get('/:brand/:table/history', async (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  const game = GAMES[gameId];
  if (!game) return res.status(404).json({ thanh_cong: false, loi: 'Game không tồn tại' });
  let refreshError = null;
  try {
    await runPredict(gameId);
  } catch (error) {
    refreshError = error.message;
  }

  const logs = (Array.isArray(predHistory[gameId]) ? predHistory[gameId] : []).slice(0, PRED_LIMIT);
  const items = logs.map(entry => {
    const item = {
      phien: entry.phien,
      ket_qua: entry.actual || null,
      dung: entry.ok === true,
      sai: entry.ok === false,
      bo_qua: entry.void === true,
      tam_dung: entry.risk_pause === true,
      trang_thai: entry.risk_pause === true ? 'tạm dừng' : entry.void === true ? 'bỏ qua' : entry.ok === true ? 'đúng' : entry.ok === false ? 'sai' : 'đang chờ',
      bieu_tuong: entry.risk_pause === true ? '⏸️' : entry.void === true ? '➖' : entry.ok === true ? '✅' : entry.ok === false ? '❌' : '⏳'
    };
    if (game.type === 'xocdia') {
      item.mau_ket_qua = entry.actual_vi || null;
    } else {
      item.xuc_xac = entry.actual_dice || null;
      item.tong = entry.actual_sum == null ? null : entry.actual_sum;
    }
    return item;
  });

  const stats = summarizeGameStats(gameId);
  res.json({
    ma: IDOL,
    thanh_cong: true,
    ten_game: game.label,
    ma_game: gameId,
    thong_ke: stats,
    san_sang_hoc: getEngine(gameId).validSampleCount() >= MIN_HISTORY_SESSIONS,
    so_phien_da_hoc: getEngine(gameId).validSampleCount(),
    so_phien_toi_thieu: MIN_HISTORY_SESSIONS,
    loi_lam_moi: refreshError,
    cap_nhat_luc: nowVN(),
    tong_dong_lich_su: items.length,
    cac_phien: items,
    // Dòng ngắn, không chứa dự đoán; phù hợp hiển thị nhỏ gọn trên một màn hình.
    lich_su: logs.map(entry => formatHistoryRow(entry, game))
  });
});

app.get('/:brand/:table', async (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  if (!GAMES[gameId]) {
    return res.status(404).json({ thanh_cong: false, loi: 'Game không tồn tại', goi_y: 'Xem GET / hoặc GET /games' });
  }
  try {
    const data = await runPredict(gameId);
    res.json(data);
  } catch (error) {
    console.error('[PREDICT]', gameId, error.message);
    res.status(502).json({
      ma: IDOL,
      thanh_cong: false,
      ma_game: gameId,
      loi: 'Không lấy được dữ liệu nguồn',
      chi_tiet: error.message,
      thoi_gian: nowVN()
    });
  }
});

/* ================================ START ================================== */
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`PRED-API v5.0 on :${PORT}`);
    console.log('Polling:', POLL_MS, 'ms');
    console.log('Games:', Object.keys(GAMES).join(', '));
  });
  startPolling();
}

module.exports = {
  app, GAMES, PARSERS, Engine, mergeSourceHistory,
  parseLc79List, parseLc79Xocdia, parseHitclub, parseMax789,
  parseSunhot, modelProbability, MODEL_PROFILES, getModelProfile,
  formatXocdia, redCountFromVi, sideLabel, sideFromSum,
  getSum, resolveTxOutcome,
  settlePredictionLogs, pushPredLog, formatHistoryRow, fetchGame, runPredict, expandEmbeddedCauRows,
  summarizeGameStats, analyzeRoad, actualXocdiaText, currentRoadVietnamese,
  consecutiveLossState,
  _state: { engines, predHistory, lastStatus }
};
