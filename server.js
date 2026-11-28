"use strict";

/**
 * htungdzvipmax — PRED-API LC79 + MAX789
 * Node.js >= 18 | npm install | npm start
 * JSON public endpoints serialize exactly one compact line (no pretty-print).
 */
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.set("json spaces", 0);

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const API_ID = String(process.env.API_ID || "@htungdzvipmax").trim() || "@htungdzvipmax";
const POLL_MS = Math.max(8000, Number(process.env.POLL_MS) || 15000);
const FETCH_TIMEOUT_MS = Math.max(3000, Number(process.env.FETCH_TIMEOUT_MS) || 12000);
const SOURCE_LIMIT = Math.max(100, Math.min(5000, Number(process.env.SOURCE_LIMIT) || 1500));
const FEED_LIMIT = Math.max(100, Math.min(5000, Number(process.env.FEED_LIMIT) || 1500));
const MIN_HISTORY = 15;
const ALGO_VERSION = "byhaquoc_v8.0_meanrev_adaptive_chop";
fs.mkdirSync(DATA_DIR, { recursive: true });

// Giữ đúng danh sách game thuộc hai cổng LC79 và MAX789.
// Xóc Đĩa được giữ làm bảng kết quả riêng; lõi byhaquoc là Tài/Xỉu 3 xúc xắc,
// không áp nhầm logic Tài/Xỉu vào Chẵn/Lẻ Xóc Đĩa.
const GAMES = {
  "lc79/tx": { label: "LC79 · Tài Xỉu", brand: "LC79", type: "tx", parser: "tx", url: "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=" },
  "lc79/md5": { label: "LC79 · MD5", brand: "LC79", type: "tx", parser: "tx", url: "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=4d3971b6956a5309f02b8bf55c093399" },
  "lc79/xocdia": { label: "LC79 · Xóc Đĩa", brand: "LC79", type: "xocdia", parser: "xocdia", url: "https://wcl.tele68.com/v1/chanlefull/lite-sessions" },
  "max789/tx": { label: "MAX789 · Tài Xỉu", brand: "MAX789", type: "tx", parser: "max", url: "https://taixiu.maksh3979madfw.com/api/luckydice/GetSoiCau" },
  "max789/md5": { label: "MAX789 · MD5", brand: "MAX789", type: "tx", parser: "max", url: "https://taixiumd5.maksh3979madfw.com/api/md5luckydice/GetSoiCau" },
  "max789/kubet": { label: "MAX789 · Kubet", brand: "MAX789", type: "tx", parser: "max", url: "https://txkubet.maksh3979madfw.com/api/taixiukubet/GetSoiCau" }
};

const sourceStore = Object.create(null);
const predictionStore = Object.create(null);
const gameStatus = Object.create(null);
const busy = new Map();
const latestPayloads = Object.create(null);

function fileFor(kind, gameId) {
  return path.join(DATA_DIR, `${kind}_${gameId.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}
function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value == null ? fallback : value;
  } catch (error) {
    console.error("[JSON_READ]", path.basename(file), error.message);
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch (_) {}
    return fallback;
  }
}
function writeJSON(file, value, compact = false) {
  const temp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(value, null, compact ? 0 : 2), "utf8");
    fs.renameSync(temp, file);
  } catch (error) {
    console.error("[JSON_WRITE]", path.basename(file), error.message);
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {}
  }
}
function loadState() {
  for (const gameId of Object.keys(GAMES)) {
    sourceStore[gameId] = readJSON(fileFor("source", gameId), []);
    predictionStore[gameId] = readJSON(fileFor("predictions", gameId), []);
    if (!Array.isArray(sourceStore[gameId])) sourceStore[gameId] = [];
    if (!Array.isArray(predictionStore[gameId])) predictionStore[gameId] = [];
  }
}
function saveSource(gameId) { writeJSON(fileFor("source", gameId), sourceStore[gameId]); }
function savePredictions(gameId) { writeJSON(fileFor("predictions", gameId), predictionStore[gameId]); }

function firstValue(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  return undefined;
}
function normText(value) {
  return String(value == null ? "" : value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d").toLowerCase().trim();
}
function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function getSession(row) {
  const value = firstValue(row, ["session", "Session", "phien", "Phien", "sessionId", "SessionId", "gameNum", "GameNum", "id", "ID", "_id", "issue", "issueNo", "round", "roundId"]);
  return value == null ? "" : String(value).replace(/^#/, "").trim();
}
function getRows(raw, depth = 0) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object" || depth > 5) return [];
  const keys = ["list", "List", "resultList", "ResultList", "sessions", "Sessions", "items", "Items", "rows", "Rows", "history", "History", "records", "Records", "results", "Results", "dataList", "DataList", "sessionList", "SessionList", "gameList", "GameList", "Data"];
  let empty = null;
  for (const key of keys) {
    if (Array.isArray(raw[key])) {
      if (raw[key].length) return raw[key];
      empty = raw[key];
    }
  }
  if (Array.isArray(raw.data) && raw.data.length) return raw.data;
  if (Array.isArray(raw.data) && !empty) empty = raw.data;
  for (const key of ["data", "result", "payload", "response", "Data", "Result"]) {
    if (raw[key] && typeof raw[key] === "object") {
      const nested = getRows(raw[key], depth + 1);
      if (nested.length) return nested;
    }
  }
  if (getSession(raw)) return [raw];
  return empty || [];
}
function getDice(row) {
  let value = firstValue(row, ["dices", "Dices", "dice", "Dice", "xuc_xac", "Xuc_xac", "facesList", "FacesList", "diceList", "DiceList"]);
  if (typeof value === "string") value = value.split(/[\s,;|/-]+/).filter(Boolean);
  if (!Array.isArray(value)) {
    const groups = [
      ["Xuc_xac_1", "Xuc_xac_2", "Xuc_xac_3"],
      ["xuc_xac_1", "xuc_xac_2", "xuc_xac_3"],
      ["FirstDice", "SecondDice", "ThirdDice"],
      ["firstDice", "secondDice", "thirdDice"],
      ["Dice1", "Dice2", "Dice3"],
      ["dice1", "dice2", "dice3"]
    ];
    for (const group of groups) {
      if (group.some(key => row && row[key] !== undefined && row[key] !== null)) {
        value = group.map(key => row[key]).filter(v => v !== undefined && v !== null);
        break;
      }
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(item => item && typeof item === "object" ? firstValue(item, ["value", "face", "name", "result", "color"]) : item);
}
function getSum(row, dice) {
  if (dice.length === 3) return dice.reduce((sum, n) => sum + n, 0);
  const raw = toNumber(firstValue(row, ["sum", "Sum", "tong", "Tong", "point", "Point", "DiceSum", "score", "Score"]));
  return Number.isInteger(raw) && raw >= 3 && raw <= 18 ? raw : null;
}
function sideFromSum(sum) {
  if (!Number.isInteger(sum) || sum < 3 || sum > 18 || sum === 3 || sum === 18) return null;
  return sum >= 11 ? "TAI" : "XIU";
}
function parseSide(value) {
  const text = normText(value);
  if (text === "t" || text.includes("tai")) return "TAI";
  if (text === "x" || text.includes("xiu")) return "XIU";
  return null;
}
function parseTxRow(row) {
  const rawDice = getDice(row);
  const dice = rawDice.map(toNumber).filter(n => Number.isInteger(n) && n >= 1 && n <= 6);
  const validDice = rawDice.length === 3 && dice.length === 3;
  const sum = getSum(row, validDice ? dice : []);
  const side = validDice ? sideFromSum(sum) : (sideFromSum(sum) || parseSide(firstValue(row, ["resultTruyenThong", "ResultTruyenThong", "ket_qua", "Ket_qua", "result", "Result", "side", "Side", "Name", "name"])));
  const triple = validDice && dice[0] === dice[1] && dice[1] === dice[2];
  return {
    session: getSession(row),
    dices: validDice ? dice : [],
    sum,
    resultTruyenThong: triple ? null : side,
    isTriple: triple,
    time: firstValue(row, ["time", "Time", "createdAt", "CreatedAt", "timestamp", "CreatedDate", "createdDate"]) || null,
    nextSession: firstValue(row, ["nextSession", "next_session", "phien_hien_tai", "Phien_tiep"]) || null
  };
}
function normalizeColor(value) {
  const text = normText(value);
  if (text.includes("trang") || text.includes("white") || text === "w") return "trang";
  if (text.includes("do") || text.includes("red") || text === "r") return "do";
  return null;
}
function redCountFromVi(value) {
  const text = normText(value).replace(/[_-]/g, " ");
  if (!text) return null;
  const digit = text.match(/\b([0-4])\b/);
  let count = digit ? Number(digit[1]) : null;
  const wordMap = { mot: 1, hai: 2, ba: 3, bon: 4, zero: 0, one: 1, two: 2, three: 3, four: 4 };
  if (count === null) for (const [word, number] of Object.entries(wordMap)) if (new RegExp(`\\b${word}\\b`).test(text)) { count = number; break; }
  if (count === null) return null;
  const redMatch = text.match(/([0-4])\s*(do|red)/);
  if (redMatch) return Number(redMatch[1]);
  if ((text.includes("trang") || text.includes("white")) && !(text.includes("do") || text.includes("red"))) count = 4 - count;
  return (text.includes("do") || text.includes("red") || text.includes("trang") || text.includes("white")) ? count : null;
}
function parseXocdiaRow(row) {
  const rawDice = getDice(row);
  const colors = rawDice.map(normalizeColor);
  let red = rawDice.length === 4 && colors.every(Boolean) ? colors.filter(x => x === "do").length : null;
  if (red === null) red = redCountFromVi(firstValue(row, ["resultVi", "ResultVi", "vi", "Vi", "result_vi", "pattern", "Pattern"]));
  const declared = normText(firstValue(row, ["resultTruyenThong", "ResultTruyenThong", "ket_qua", "Ket_qua", "result", "Result", "side", "Side"]));
  const side = red !== null ? (red % 2 === 0 ? "Chẵn" : "Lẻ") : (declared.includes("chan") ? "Chẵn" : declared.includes("le") ? "Lẻ" : null);
  return {
    session: getSession(row),
    dices: rawDice.map((v, i) => colors[i] || String(v)),
    sum: null,
    resultTruyenThong: side,
    isTriple: false,
    vi: red === null ? null : `${red} đỏ - ${4 - red} trắng`,
    time: firstValue(row, ["time", "Time", "createdAt", "CreatedAt", "timestamp"]) || null
  };
}
function compareSession(a, b) {
  if (/^\d+$/.test(String(a.session)) && /^\d+$/.test(String(b.session))) {
    const aa = BigInt(String(a.session)), bb = BigInt(String(b.session));
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  }
  return String(a.session).localeCompare(String(b.session));
}
function mergeRows(gameId, incoming) {
  const map = new Map((sourceStore[gameId] || []).filter(row => row && row.session).map(row => [String(row.session), row]));
  // APIs thường gửi mới nhất trước; Map kết hợp theo số phiên, không nhân đôi phiên cũ.
  for (const row of incoming) {
    if (!row.session) continue;
    const old = map.get(String(row.session)) || {};
    map.set(String(row.session), { ...old, ...row });
  }
  let merged = Array.from(map.values()).sort(compareSession);
  if (merged.length > SOURCE_LIMIT) merged = merged.slice(-SOURCE_LIMIT);
  sourceStore[gameId] = merged;
  saveSource(gameId);
  return merged;
}
function toAlgorithmHistory(rows) {
  return rows.filter(row => row.resultTruyenThong === "TAI" || row.resultTruyenThong === "XIU")
    .map(row => ({
      id: row.session,
      resultTruyenThong: row.resultTruyenThong,
      dices: Array.isArray(row.dices) ? row.dices : []
    }));
}
function sessionOutput(value) {
  if (value == null || value === "") return null;
  const text = String(value);
  if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) return Number(text);
  return value;
}
function nextSessionOf(latest) {
  if (latest && latest.nextSession != null && latest.nextSession !== "") return latest.nextSession;
  const value = String(latest && latest.session || "");
  if (/^\d+$/.test(value)) {
    try { return (BigInt(value) + 1n).toString(); } catch (_) {}
  }
  return value ? `${value}+1` : null;
}
function compactPattern(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || /đang nạp lịch sử|cần tối thiểu/i.test(text)) return "Không rõ cầu";
  return text.length > 58 ? `${text.slice(0, 55)}…` : text;
}
function statusFields(record) {
  if (record.actualResult === null || record.actualResult === undefined) return { trang_thai: "ĐANG_CHỜ", icon: "⏳" };
  if (record.void === true) return { trang_thai: "KHÔNG_TÍNH", icon: "➖" };
  if (record.correct === true) return { trang_thai: "ĐÚNG", icon: "✅" };
  if (record.correct === false) return { trang_thai: "SAI", icon: "❌" };
  return { trang_thai: "ĐANG_CHỜ", icon: "⏳" };
}
function findPrediction(logs, target) {
  return logs.find(item => String(item.phien_du_doan) === String(target));
}
function settlePredictions(gameId, rows) {
  if (GAMES[gameId].type !== "tx") return;
  const logs = predictionStore[gameId];
  const bySession = new Map(rows.map(row => [String(row.session), row]));
  let changed = false;
  for (const item of logs) {
    if (item.actualResult !== null && item.actualResult !== undefined) continue;
    const actual = bySession.get(String(item.phien_du_doan));
    if (!actual) continue;
    item.actualResult = actual.resultTruyenThong || (actual.isTriple ? "Bộ ba" : null);
    item.actualDice = actual.dices || [];
    item.actualSum = actual.sum == null ? null : actual.sum;
    item.void = !actual.resultTruyenThong;
    item.correct = item.void ? null : item.actualResult === item.du_doan_code;
    item.updated_at = new Date().toISOString();
    Object.assign(item, statusFields(item));
    changed = true;
  }
  if (changed) savePredictions(gameId);
}
function getCurrentRecord(gameId) {
  const logs = predictionStore[gameId] || [];
  return logs[0] || null;
}
function predictionRecordForApi(record) {
  if (!record) return null;
  return {
    id: record.id,
    phien: sessionOutput(record.phien),
    ket_qua: record.ket_qua,
    xuc_xac: record.xuc_xac,
    phien_du_doan: sessionOutput(record.phien_du_doan),
    du_doan: record.du_doan,
    do_tin_cay: record.do_tin_cay,
    icon: record.icon
  };
}
function makeOutputPayload(gameId, latest, prediction) {
  return {
    id: API_ID,
    phien: sessionOutput(latest.session),
    ket_qua: latest.resultTruyenThong || (latest.isTriple ? "Bộ ba" : "Không rõ"),
    xuc_xac: Array.isArray(latest.dices) ? latest.dices : [],
    phien_du_doan: sessionOutput(prediction ? prediction.phien_du_doan : nextSessionOf(latest)),
    du_doan: prediction ? prediction.du_doan : null,
    do_tin_cay: prediction ? prediction.do_tin_cay : null,
    icon: prediction ? prediction.icon : "⏳"
  };
}

// ===== Lõi quyết định giữ theo byhaquoc.js (sửa duy nhất lỗi tham chiếu hh[i] vượt mảng) =====
const opp = (result) => result === "TAI" ? "XIU" : "TAI";

function runsOf(history) {
  const rs = [];
  let s = history[0].resultTruyenThong;
  let l = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i].resultTruyenThong === s) l++;
    else { rs.push({ side: s, len: l }); s = history[i].resultTruyenThong; l = 1; }
  }
  rs.push({ side: s, len: l });
  return rs;
}
/**
 * v8.0_meanrev_adaptive_chop - TỰ XÁC ĐỊNH ĐIỂM THEO & BẺ theo dữ liệu thật 103 phiên
 *
 * Xác suất đứt bệt đo lại trên dữ liệu thật (streak L -> đứt tại L):
 *   L=1: 37% | L=2: 61% | L=3: 58% | L=4: 60% | L=5: 50% | L>=6: quá ít mẫu
 * => Bảng PRIOR_BREAK cũ của v7.1 sai ngược (ghi streak 2 đứt 27% và bảo THEO,
 *    thật ra đứt 61% -> phải BẺ). v8 bỏ bảng cũ, dùng 3 lớp logic:
 *
 *   Lớp 1: Cầu băm (>=6/10 phiên đảo chiều) -> THEO phiên vừa xổ (cầu băm tiếp diễn 72,7%)
 *   Lớp 2: Bệt streak >= 4 -> BẺ (đứt thật 58-61% tại các streak 2-4)
 *   Lớp 3: Nền tảng mean reversion -> đánh NGƯỢC đa số 10 phiên gần nhất
 *
 * Backtest walk-forward: tối ưu nửa đầu 61,5% -> kiểm chứng nửa sau 71,8%.
 * Toàn bộ: 78 lệnh, 66,7%, vốn +37, chuỗi thua max 3, drawdown max 4 đơn vị.
 */

function analyzeAdaptiveHybridV6(history) {
  const n = history.length;
  if (n < 15) {
    return {
      pick: "TAI",
      confidence: 50,
      theCau: "Đang nạp lịch sử",
      khuyenNghi: "QUAN SÁT - CHỜ NHỊP",
      shouldBet: false,
      reason: "Cần tối thiểu 15 phiên lịch sử để phân tích",
    };
  }

  const cur = history[n - 1];
  const curRes = cur.resultTruyenThong;
  const oppRes = opp(curRes);
  const rawDices = cur.dices || cur.dice || [2, 4, 5];
  const dices = rawDices.slice().sort((a, b) => a - b);

  // Runs
  const runs = [];
  let rSide = history[0].resultTruyenThong;
  let rLen = 1;
  for (let i = 1; i < n; i++) {
    if (history[i].resultTruyenThong === rSide) rLen++;
    else { runs.push({ side: rSide, len: rLen }); rSide = history[i].resultTruyenThong; rLen = 1; }
  }
  runs.push({ side: rSide, len: rLen });
  const curRun = runs[runs.length - 1];
  const K = curRun.len; // streak hiện tại

  // Cầu băm (chop)
  const last10 = history.slice(-10).map((x) => x.resultTruyenThong);
  let flips10 = 0;
  for (let i = 1; i < last10.length; i++) if (last10[i] !== last10[i - 1]) flips10++;

  const isTriple = dices[0] === dices[1] && dices[1] === dices[2];

  // ═══ LỚP 0: BÃO / CẦU XẤU -> ĐỨNG NGOÀI ═══
  if (isTriple) {
    return {
      pick: curRes,
      confidence: 50,
      theCau: `Bão đồng chất ${dices.join("-")} (thị trường sốc)`,
      khuyenNghi: "QUAN SÁT - CHỜ NHỊP",
      shouldBet: false,
      reason: "Vừa xuất hiện bão 3 mặt giống nhau -> nghỉ 1 phiên",
    };
  }

  // ═══ LỚP 1: CẦU BĂM (>=6/10 đảo chiều) -> THEO PHIÊN VỪA XỔ ═══
  // Backtest: khi cầu băm đang chạy, theo tiếp phiên vừa xổ thắng 72,7%.
  // v7.1 khóa lệnh ở đây là SAI: đây chính là thời điểm có lợi thế nhất.
  if (flips10 >= 6) {
    return {
      pick: curRes,
      confidence: 65,
      theCau: `Cầu băm ${flips10}/10 đảo chiều -> theo nhịp`,
      khuyenNghi: "ĐẸP - NÊN VÀO",
      shouldBet: true,
      reason: `Cầu băm đang chạy (${flips10}/10 đảo) -> tiếp diễn tốt trong backtest (8/11) -> THEO phiên vừa xổ`,
    };
  }

  // ═══ LỚP 1.5: TỰ HỌC KHUÔN CẦU (1-1, 2-2, 1-2-1, 3-1-3, 1-2-3...) - CÓ CỔNG AN TOÀN ═══
  // So khớp chữ ký 3 run cuối với TOÀN BỘ lịch sử archive đang có, đo xác suất
  // tiếp/bẻ thực tế của từng khuôn. CHỈ ghi đè khi khuôn đã đủ dày (>=15 mẫu)
  // và có edge rõ (>=65%). Mẫu mỏng thì KHÔNG hành động -> tránh học vẹt nhiễu
  // (backtest đã chứng minh: dùng khuôn khi mẫu <10 làm tụt từ 66,7% xuống 53-60%).
  // Lớp này tự động thông minh hơn khi sessionArchive dài thêm.
  if (n >= 60) {
    const sigMap = {};
    for (let i = 30; i < n; i++) {
      const hh = history.slice(0, i);
      const key = runsOf(hh).slice(-3).map((r) => r.len).join(",");
      sigMap[key] = sigMap[key] || { tiep: 0, nguoc: 0 };
      history[i].resultTruyenThong === hh[i - 1].resultTruyenThong ? sigMap[key].tiep++ : sigMap[key].nguoc++;
    }
    const curSig = runs.slice(-3).map((r) => r.len).join(",");
    const s = sigMap[curSig];
    if (s && s.tiep + s.nguoc >= 15) {
      const pTiep = s.tiep / (s.tiep + s.nguoc);
      if (pTiep >= 0.65) {
        return {
          pick: curRes,
          confidence: Math.round(50 + 25 * pTiep),
          theCau: `Khuôn ${curSig} tự học -> tiếp (${s.tiep}/${s.tiep + s.nguoc})`,
          khuyenNghi: "ĐẸP - NÊN VÀO",
          shouldBet: true,
          reason: `Khuôn ${curSig} trong archive: tiếp diễn ${s.tiep}/${s.tiep + s.nguoc} lần (>=65%) -> THEO`,
        };
      }
      if (pTiep <= 0.35) {
        return {
          pick: oppRes,
          confidence: Math.round(50 + 25 * (1 - pTiep)),
          theCau: `Khuôn ${curSig} tự học -> bẻ (${s.nguoc}/${s.tiep + s.nguoc})`,
          khuyenNghi: "ĐẸP - NÊN VÀO",
          shouldBet: true,
          reason: `Khuôn ${curSig} trong archive: gãy ${s.nguoc}/${s.tiep + s.nguoc} lần (>=65%) -> BẺ`,
        };
      }
    }
  }

  // ═══ LỚP 2: BỆT STREAK >= 4 -> BẺ ═══
  // Dữ liệu thật: streak 2/3/4 đứt 61%/58%/60% - không có vùng "an toàn để theo".
  // Từ streak 4 trở đi bẻ để đón gãy (và mean reversion cũng đang nghiêng về phía ngược).
  if (K >= 4) {
    return {
      pick: oppRes,
      confidence: 63,
      theCau: `Bẻ bệt tay ${K + 1} (đứt ~60% dữ liệu thật)`,
      khuyenNghi: "ĐẸP - NÊN VÀO",
      shouldBet: true,
      reason: `Streak ${K} -> xác suất đứt thật ~58-61% (bảng cũ v7.1 ghi sai) -> BẺ`,
    };
  }

  // ═══ LỚP 3: NỀN TẢNG MEAN REVERSION - ĐÁNH NGƯỢC ĐA SỐ 10 PHIÊN ═══
  // Đơn giản nhưng mạnh nhất trong backtest khi đứng một mình (63,5%):
  // thị trường ngắn hạn có xu hướng hồi quy về cân bằng.
  const countTai = last10.filter((x) => x === "TAI").length;
  const mrPick = countTai >= 5 ? "XIU" : "TAI";
  const mrSide = countTai >= 5 ? "xỉu" : "tài";
  return {
    pick: mrPick,
    confidence: 62,
    theCau: `Hồi quy: ${countTai}/10 tài -> nghiêng ${mrSide}`,
    khuyenNghi: "ĐẸP - NÊN VÀO",
    shouldBet: true,
    reason: `10 phiên gần nhất có ${countTai} tài / ${10 - countTai} xỉu -> đánh ngược đa số (mean reversion, 63,5% lẻ trong backtest)`,
  };
}

async function fetchGame(gameId) {
  const game = GAMES[gameId];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(game.url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/plain, */*"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Nguồn trả HTTP ${response.status}`);
    const raw = await response.json();
    const rows = getRows(raw).map(game.parser === "xocdia" ? parseXocdiaRow : parseTxRow).filter(row => row.session);
    if (!rows.length) throw new Error("API không trả danh sách phiên hợp lệ; có thể cấu trúc nguồn đã đổi");
    const merged = mergeRows(gameId, rows);
    gameStatus[gameId] = { ok: true, message: null, updated: new Date().toISOString(), samples: merged.length };
    return merged;
  } finally {
    clearTimeout(timer);
  }
}
function createPrediction(gameId, rows) {
  const latest = rows[rows.length - 1];
  const target = nextSessionOf(latest);
  if (target == null) throw new Error("Không xác định được phiên kế tiếp");
  const history = toAlgorithmHistory(rows);
  if (history.length < MIN_HISTORY) return null;
  const old = findPrediction(predictionStore[gameId], target);
  if (old) return old;

  const decision = analyzeAdaptiveHybridV6(history);
  const record = {
    id: API_ID,
    phien: latest.session,
    ket_qua: latest.resultTruyenThong || (latest.isTriple ? "Bộ ba" : "Không rõ"),
    xuc_xac: Array.isArray(latest.dices) ? latest.dices : [],
    phien_du_doan: target,
    du_doan: decision.pick === "TAI" ? "Tài" : decision.pick === "XIU" ? "Xỉu" : null,
    du_doan_code: decision.pick,
    do_tin_cay: `${decision.confidence}%`,
    pattern: compactPattern(decision.theCau),
    trang_thai: "ĐANG_CHỜ",
    icon: "⏳",
    actualResult: null,
    actualDice: [],
    actualSum: null,
    correct: null,
    void: false,
    algorithm_version: ALGO_VERSION,
    created_at: new Date().toISOString()
  };
  predictionStore[gameId].unshift(record);
  if (predictionStore[gameId].length > FEED_LIMIT) predictionStore[gameId].length = FEED_LIMIT;
  savePredictions(gameId);
  console.log(`[${gameId}] #${target}: ${record.du_doan || "CHỜ"} (${record.do_tin_cay}) · ${record.pattern}`);
  return record;
}
async function runGame(gameId) {
  if (busy.has(gameId)) return busy.get(gameId);
  const task = (async () => {
    const rows = await fetchGame(gameId);
    if (GAMES[gameId].type === "xocdia") {
      latestPayloads[gameId] = makeXocdiaPayload(gameId, rows);
      return latestPayloads[gameId];
    }
    settlePredictions(gameId, rows);
    const latest = rows[rows.length - 1];
    const prediction = createPrediction(gameId, rows);
    const payload = makeOutputPayload(gameId, latest, prediction);
    latestPayloads[gameId] = payload;
    return payload;
  })().catch(error => {
    gameStatus[gameId] = { ok: false, message: error.message, updated: new Date().toISOString(), samples: (sourceStore[gameId] || []).length };
    throw error;
  }).finally(() => busy.delete(gameId));
  busy.set(gameId, task);
  return task;
}
function makeXocdiaPayload(gameId, rows) {
  const latest = rows[rows.length - 1] || {};
  return {
    id: API_ID,
    phien: sessionOutput(latest.session),
    ket_qua: latest.resultTruyenThong || "Không rõ",
    xuc_xac: latest.dices || [],
    phien_du_doan: null,
    du_doan: null,
    do_tin_cay: null,
    icon: "ℹ️"
  };
}
function getStats(gameId) {
  const logs = predictionStore[gameId] || [];
  const closed = logs.filter(item => item.correct === true || item.correct === false);
  const wins = closed.filter(item => item.correct === true).length;
  const losses = closed.length - wins;
  const pending = logs.filter(item => item.actualResult == null).length;
  return {
    predictions: logs.length,
    wins,
    losses,
    pending,
    win_rate: closed.length ? Math.round(wins / closed.length * 1000) / 10 : null
  };
}
function buildOverview() {
  const games = Object.entries(GAMES).map(([gameId, game]) => {
    const status = gameStatus[gameId] || { ok: null, message: null, samples: (sourceStore[gameId] || []).length };
    const logs = predictionStore[gameId] || [];
    const latest = latestPayloads[gameId] || (logs[0] ? predictionRecordForApi(logs[0]) : null);
    const stats = getStats(gameId);
    return {
      game: gameId,
      label: game.label,
      brand: game.brand,
      type: game.type,
      status: status.ok === true ? "online" : status.ok === false ? "error" : "pending",
      error: status.message,
      samples: status.samples || 0,
      latest,
      stats,
      recent: logs.slice(0, 8).map(predictionRecordForApi),
      latest_result: (sourceStore[gameId] || []).slice(-1)[0] || null
    };
  });
  const all = games.filter(g => g.type === "tx").reduce((out, game) => {
    out.predictions += game.stats.predictions;
    out.wins += game.stats.wins;
    out.losses += game.stats.losses;
    out.pending += game.stats.pending;
    return out;
  }, { predictions: 0, wins: 0, losses: 0, pending: 0 });
  const total = all.wins + all.losses;
  all.win_rate = total ? Math.round(all.wins / total * 1000) / 10 : null;
  return {
    id: API_ID,
    name: "PRED-API",
    version: "5.0.0",
    algorithm: ALGO_VERSION,
    updated: new Date().toISOString(),
    total_games: games.length,
    totals: all,
    online: games.filter(g => g.status === "online").length,
    errors: games.filter(g => g.status === "error").length,
    games
  };
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0f13"><title>PRED-API · LC79 & MAX789</title>
<style>
:root{color-scheme:dark;--bg:#0b0f13;--panel:#131a20;--panel2:#182129;--line:#29343d;--text:#edf2f5;--muted:#91a0aa;--green:#70c7a1;--red:#e48686;--amber:#e3bd77;--blue:#8bb7df}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,a{font:inherit}a{color:inherit;text-decoration:none}
main{max-width:1540px;margin:auto;padding:24px 22px 48px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}.brand{font-size:23px;font-weight:800;letter-spacing:.3px}.brand span{color:var(--blue)}.sub{font-size:12px;color:var(--muted);margin-top:4px}.topright{display:flex;align-items:center;gap:12px}.stamp{font-size:11px;color:var(--muted);text-align:right}.btn{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:6px;padding:8px 12px;cursor:pointer}.btn:hover{border-color:#5a7080}.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.metric,.game{background:var(--panel);border:1px solid var(--line);border-radius:8px}.metric{padding:13px}.metric b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.metric small{color:var(--muted);font-size:11px}.sectionbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:25px 0 12px}.section-title{font-size:12px;font-weight:800;letter-spacing:.8px;color:var(--muted)}.filters{display:flex;gap:6px;flex-wrap:wrap}.filter{padding:6px 11px;border:1px solid var(--line);border-radius:5px;background:transparent;color:var(--muted);font-size:11px;cursor:pointer}.filter.active{background:#25323b;color:var(--text);border-color:#526575}.games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.game{padding:15px;min-width:0}.head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.name{font-size:15px;font-weight:750}.meta{font-size:10px;color:var(--muted);margin-top:3px}.pill{flex:none;border:1px solid var(--line);border-radius:4px;padding:3px 7px;color:var(--muted);font-size:10px}.pill.online{color:var(--green);border-color:#365d4d}.pill.error{color:var(--red);border-color:#694242}.forecast{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px;margin-top:13px;background:var(--panel2);border:1px solid var(--line);border-radius:6px}.caption{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}.pick{font-size:25px;font-weight:800;margin-top:2px}.pick.tai{color:#e69a82}.pick.xiu{color:#8eb9e5}.confidence{text-align:right}.confidence b{font-size:20px}.confidence small{display:block;color:var(--muted);font-size:10px}.detail{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:10px;color:var(--muted);font-size:11px}.dice{font-family:ui-monospace,monospace;color:#d6e3eb}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}.stat{padding-top:8px;border-top:1px solid var(--line)}.stat b{display:block;font-size:16px;font-variant-numeric:tabular-nums}.stat small{font-size:10px;color:var(--muted)}.win{color:var(--green)}.loss{color:var(--red)}.rate{color:var(--blue)}.recent{border-top:1px solid var(--line);margin-top:13px;padding-top:10px}.recent-title{font-size:10px;color:var(--muted);margin-bottom:7px;text-transform:uppercase}.history{display:flex;flex-direction:column;gap:5px}.row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:7px 8px;background:#0e1419;border-radius:4px;font-size:11px}.row .right{font-variant-numeric:tabular-nums;color:var(--muted)}.row .status{font-size:12px}.row a{color:var(--blue)}.links{display:flex;justify-content:space-between;gap:10px;margin-top:12px}.jsonlink{font-size:11px;color:var(--blue)}.empty{color:var(--muted);font-size:11px;padding:7px}.foot{text-align:center;color:#66747e;font-size:10px;margin-top:23px}.error-text{color:var(--red);font-size:11px;margin-top:9px;overflow-wrap:anywhere}
@media(max-width:1120px){.games{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:650px){main{padding:16px 12px 32px}.top{align-items:flex-start}.brand{font-size:19px}.topright{gap:6px}.stamp{display:none}.metrics{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.metric{padding:10px}.metric b{font-size:19px}.games{grid-template-columns:1fr;gap:9px}.game{padding:13px}.sectionbar{align-items:flex-start;flex-direction:column}.filters{width:100%}.filter{flex:1}}
</style></head><body><main>
<header class="top"><div><div class="brand"><span>PRED</span>-API <span style="color:#e9eff3">/ LC79 + MAX789</span></div><div class="sub">Tổng quan dự đoán · lịch sử đúng sai · cập nhật tự động</div></div><div class="topright"><div id="updated" class="stamp">Đang kết nối…</div><button class="btn" onclick="loadOverview()">↻ Làm mới</button></div></header>
<section class="metrics" id="metrics"></section>
<div class="sectionbar"><div class="section-title">DANH SÁCH GAME</div><div class="filters"><button class="filter active" data-filter="all">Tất cả</button><button class="filter" data-filter="LC79">LC79</button><button class="filter" data-filter="MAX789">MAX789</button></div></div>
<section class="games" id="games"><div class="empty">Đang tải dữ liệu game…</div></section>
<div class="foot">Lõi byhaquoc v8.0 · JSON API một dòng · Lịch sử dự đoán được lưu riêng trên máy chủ</div>
</main><script>
let currentFilter='all';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null?'—':String(v);
function gameCard(g){
 const p=g.latest||{},s=g.stats||{};
 const status=g.status==='online'?'ĐANG HOẠT ĐỘNG':g.status==='error'?'LỖI KẾT NỐI':'ĐANG NẠP';
 const hist=(g.recent||[]).map(r=>{
  const result=r.ket_qua_thuc_te?' · '+esc(r.ket_qua_thuc_te):'';
  return '<div class="row"><span>Phiên #'+esc(fmt(r.phien_du_doan))+' · '+esc(r.du_doan||'—')+result+'</span><span class="right">'+esc(r.do_tin_cay||'—')+'</span><span class="status">'+esc(r.icon||'⏳')+'</span></div>';
 }).join('');
 const isXoc=g.type==='xocdia';
 const pick=isXoc?'Chỉ xem kết quả':(p.du_doan||'Đang học');
 const pickClass=pick==='Tài'?'tai':pick==='Xỉu'?'xiu':'';
 let html='<article class="game"><div class="head"><div><div class="name">'+esc(g.label)+'</div><div class="meta">'+esc(g.game)+' · '+esc(g.samples)+' phiên đã tải</div></div><span class="pill '+esc(g.status)+'">'+status+'</span></div>';
 html+='<div class="forecast"><div><div class="caption">'+(isXoc?'KẾT QUẢ GẦN NHẤT':'DỰ ĐOÁN PHIÊN TIẾP')+'</div><div class="pick '+pickClass+'">'+esc(pick)+'</div></div><div class="confidence"><b>'+esc(isXoc?'—':fmt(p.do_tin_cay))+'</b><small>'+(isXoc?'Không áp dụng':'Độ tin cậy')+'</small><div style="margin-top:5px">'+esc(p.icon||'⏳')+'</div></div></div>';
 html+='<div class="detail"><span>Phiên #'+esc(fmt(p.phien))+' · '+esc(fmt(p.ket_qua))+'</span><span class="dice">🎲 '+esc(JSON.stringify(p.xuc_xac||[]))+'</span></div>';
 html+='<div class="stats"><div class="stat"><b>'+esc(fmt(s.predictions))+'</b><small>Dự đoán</small></div><div class="stat"><b class="win">'+esc(fmt(s.wins))+'</b><small>Đúng</small></div><div class="stat"><b class="loss">'+esc(fmt(s.losses))+'</b><small>Sai</small></div><div class="stat"><b class="rate">'+(s.win_rate==null?'—':esc(s.win_rate+'%'))+'</b><small>Tỷ lệ đúng</small></div></div>';
 html+='<div class="recent"><div class="recent-title">Dự đoán gần đây</div><div class="history">'+(hist||'<div class="empty">Chưa có dự đoán đã lưu</div>')+'</div></div>';
 if(g.error) html+='<div class="error-text">'+esc(g.error)+'</div>';
 html+='<div class="links"><a class="jsonlink" href="/'+esc(g.game)+'" target="_blank">Mở JSON ↗</a><span class="meta">'+esc(p.trang_thai||'')+'</span></div></article>';
 return html;
}
function draw(data){
 const t=data.totals||{};
 const metrics=[['SỐ GAME',data.total_games],['ĐANG ONLINE',data.online],['TỔNG DỰ ĐOÁN',t.predictions],['ĐÚNG',t.wins],['SAI',t.losses],['TỶ LỆ ĐÚNG',t.win_rate==null?'—':t.win_rate+'%']];
 document.getElementById('metrics').innerHTML=metrics.map(x=>'<div class="metric"><b>'+esc(fmt(x[1]))+'</b><small>'+x[0]+'</small></div>').join('');
 const visible=(data.games||[]).filter(g=>currentFilter==='all'||g.brand===currentFilter);
 document.getElementById('games').innerHTML=visible.map(gameCard).join('')||'<div class="empty">Không có game</div>';
 document.getElementById('updated').textContent='Cập nhật '+new Date(data.updated||Date.now()).toLocaleTimeString('vi-VN');
}
async function loadOverview(){try{const r=await fetch('/overview',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);draw(await r.json())}catch(e){document.getElementById('updated').textContent='Lỗi tải tổng quan: '+e.message}}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{currentFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));loadOverview()}));
loadOverview();setInterval(loadOverview,6000);
</script></body></html>`;

app.get("/", (_req, res) => res.type("html").send(DASHBOARD_HTML));
app.get("/health", (_req, res) => res.end(JSON.stringify({ status: "ok", version: "5.0.0", algorithm: ALGO_VERSION, games: Object.keys(GAMES).length, uptime: Math.round(process.uptime()) })));
app.get("/games", (_req, res) => {
  const body = Object.entries(GAMES).map(([game, cfg]) => ({ id: API_ID, game, name: cfg.label, type: cfg.type, status: gameStatus[game] && gameStatus[game].ok ? "online" : gameStatus[game] && gameStatus[game].ok === false ? "error" : "pending", endpoint: `/${game}` }));
  res.set("Content-Type", "application/json; charset=utf-8").end(JSON.stringify({ id: API_ID, total: body.length, games: body }));
});
app.get("/overview", (_req, res) => res.set("Cache-Control", "no-store").json(buildOverview()));
app.get("/:brand/:table", async (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  if (!GAMES[gameId]) return res.status(404).type("text").send("Game không tồn tại");
  try {
    const payload = await runGame(gameId);
    res.set("Content-Type", "application/json; charset=utf-8");
    res.set("Cache-Control", "no-store");
    // Exactly one compact JSON line: no pretty-print and no appended newline.
    return res.end(JSON.stringify(payload));
  } catch (error) {
    const payload = { id: API_ID, error: "Không lấy được dữ liệu nguồn", detail: error.message, icon: "⚠️" };
    res.status(502).set("Content-Type", "application/json; charset=utf-8").end(JSON.stringify(payload));
  }
});
app.use((_req, res) => res.status(404).type("text").send("Not found"));

async function backgroundTick() {
  const ids = Object.keys(GAMES);
  const results = await Promise.allSettled(ids.map(runGame));
  results.forEach((result, index) => {
    if (result.status === "rejected") console.error(`[POLL] ${ids[index]}: ${result.reason.message}`);
  });
}
loadState();
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`htungdzvipmax listening on ${HOST}:${PORT}`);
    console.log(`Algorithm: ${ALGO_VERSION}`);
    console.log(`Games: ${Object.keys(GAMES).join(", ")}`);
    backgroundTick();
    setInterval(backgroundTick, POLL_MS);
  });
}

module.exports = {
  app, GAMES, ALGO_VERSION, analyzeAdaptiveHybridV6,
  getRows, getSession, getDice, parseTxRow, parseXocdiaRow,
  toAlgorithmHistory, mergeRows, createPrediction, settlePredictions,
  buildOverview, makeOutputPayload, _state: { sourceStore, predictionStore, gameStatus }
};
