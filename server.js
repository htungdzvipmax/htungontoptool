/**
 * PRED-API v4.5.0 — compact prediction feed API / adaptive ensemble / Tài Xỉu / Xóc Đĩa đa game
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
const AlgorithmOnly = (() => {
  'use strict';
/**
 * ALGORITHM-ONLY EXTRACTION
 * Extracted from the supplied văn bản.txt source.
 * Contains no Express routes, API clients, file I/O, database, branding locks,
 * betting/capital management, or old-project dependencies.
 *
 * Input convention for calculateAdvancedPrediction:
 *   dataDesc: newest-first array of { Phien, Ket_qua, Xuc_xac_1, Xuc_xac_2,
 *             Xuc_xac_3, Tong }
 *   type: isolated learning profile key, e.g. "lc79_tx", "lc79_md5".
 *
 * All pattern rules and the V8 adaptive hybrid decision logic originate from
 * the supplied file. Only integration dependencies and unsafe/non-deterministic
 * defaults have been isolated. The historical in-file learning bug where
 * hh[i] referenced past the end of the sliced prefix is corrected.
 */

const ALGO_VERSION = "v8.2_adaptive_weighted_consensus";
const MIN_HISTORY = 15;

const toUpperCode = (r) => {
  if (r === "TAI" || r === "Tài" || r === "tài") return "TAI";
  if (r === "XIU" || r === "Xỉu" || r === "xỉu" || r === "Xiu" || r === "xiu") return "XIU";
  return null;
};
const toTitleLabel = (r) => toUpperCode(r) === "TAI" ? "Tài" : (toUpperCode(r) === "XIU" ? "Xỉu" : null);
const oppCode = (r) => toUpperCode(r) === "TAI" ? "XIU" : (toUpperCode(r) === "XIU" ? "TAI" : null);
const oppTitle = (r) => toTitleLabel(r) === "Tài" ? "Xỉu" : (toTitleLabel(r) === "Xỉu" ? "Tài" : null);

function normalizeResult(result) {
  return toTitleLabel(result);
}

const DEFAULT_PATTERN_WEIGHTS = {
  'adaptive_v8_chop': 1.5,
  'adaptive_v8_pattern_self_learn': 1.4,
  'adaptive_v8_break_streak4': 1.35,
  'adaptive_v8_mean_reversion': 1.3,
  'adaptive_v8_triple_guard': 1.2,
  'cau_bet': 1.0,
  'cau_dao_11': 1.0,
  'cau_22': 1.0,
  'cau_33': 1.0,
  'cau_121': 1.0,
  'cau_123': 1.0,
  'cau_321': 1.0,
  'cau_nhay_coc': 1.0,
  'cau_nhip_nghieng': 1.0,
  'cau_3van1': 1.0,
  'cau_be_cau': 1.0,
  'cau_chu_ky': 1.0,
  'distribution': 1.0,
  'dice_pattern': 1.0,
  'sum_trend': 1.0,
  'edge_cases': 1.0,
  'momentum': 1.0,
  'cau_tu_nhien': 1.0,
  'dice_trend_line': 1.0,
  'dice_trend_line_md5': 1.0,
  'break_pattern_hu': 1.0,
  'break_pattern_md5': 1.0,
  'fibonacci': 1.0,
  'resistance_support': 1.0,
  'wave': 1.0,
  'golden_ratio': 1.0,
  'day_gay': 1.0,
  'day_gay_md5': 1.0,
  'cau_44': 1.0,
  'cau_55': 1.0,
  'cau_212': 1.0,
  'cau_1221': 1.0,
  'cau_2112': 1.0,
  'cau_gap': 1.0,
  'cau_ziczac': 1.0,
  'cau_doi': 1.0,
  'cau_rong': 1.0,
  'smart_bet': 1.0,
  'break_pattern_advanced': 1.0,
  'break_streak': 1.0,
  'alternating_break': 1.0,
  'double_pair_break': 1.0,
  'triple_pattern': 1.0,
};


function runsOf(historyAsc) {
  const rs = [];
  if (!Array.isArray(historyAsc) || historyAsc.length === 0) return rs;
  let side = historyAsc[0].resultTruyenThong;
  let len = 1;
  for (let i = 1; i < historyAsc.length; i++) {
    if (historyAsc[i].resultTruyenThong === side) len++;
    else {
      rs.push({ side, len });
      side = historyAsc[i].resultTruyenThong;
      len = 1;
    }
  }
  rs.push({ side, len });
  return rs;
}

function analyzeAdaptiveHybridV6(historyAsc) {
  const n = historyAsc.length;
  if (n < MIN_HISTORY) {
    return {
      pick: "TAI", pickTitle: "Tài", confidence: 52,
      theCau: "Đang nạp lịch sử", khuyenNghi: "QUAN SÁT - CHỜ NHỊP",
      shouldBet: false, patternId: "cau_tu_nhien",
      reason: `Cần tối thiểu ${MIN_HISTORY} phiên lịch sử hợp lệ để phân tích`
    };
  }

  const cur = historyAsc[n - 1];
  const curRes = cur.resultTruyenThong;
  const oppRes = oppCode(curRes);
  const rawDices = Array.isArray(cur.dices) ? cur.dices : (Array.isArray(cur.dice) ? cur.dice : null);
  const dices = rawDices && rawDices.length === 3 && rawDices.every(v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 6)
    ? rawDices.map(Number).sort((a, b) => a - b)
    : null;

  const runs = runsOf(historyAsc);
  const K = runs[runs.length - 1].len;
  const last10 = historyAsc.slice(-10).map(x => x.resultTruyenThong);
  let flips10 = 0;
  for (let i = 1; i < last10.length; i++) if (last10[i] !== last10[i - 1]) flips10++;

  const isTriple = !!dices && dices[0] === dices[1] && dices[1] === dices[2];
  if (isTriple) {
    return {
      pick: curRes, pickTitle: toTitleLabel(curRes), confidence: 50,
      theCau: `Bão đồng chất ${dices.join('-')} (thị trường sốc)`,
      khuyenNghi: "QUAN SÁT - CHỜ NHỊP", shouldBet: false,
      patternId: "adaptive_v8_triple_guard",
      reason: "Vừa xuất hiện bộ ba đồng nhất -> tạm quan sát, không tự suy diễn phiên kế tiếp"
    };
  }

  if (flips10 >= 6) {
    return {
      pick: curRes, pickTitle: toTitleLabel(curRes), confidence: 65,
      theCau: `Cầu băm ${flips10}/9 lần đổi cửa -> theo nhịp`,
      khuyenNghi: "ĐẸP - NÊN VÀO", shouldBet: true,
      patternId: "adaptive_v8_chop",
      reason: `10 phiên gần nhất có ${flips10} lần đổi cửa; mô hình gốc chọn theo kết quả vừa xuất hiện`
    };
  }

  if (n >= 60) {
    const sigMap = Object.create(null);
    for (let i = 30; i < n; i++) {
      const prefix = historyAsc.slice(0, i);
      const key = runsOf(prefix).slice(-3).map(r => r.len).join(",");
      if (!sigMap[key]) sigMap[key] = { tiep: 0, nguoc: 0 };
      // Corrected: outcome at i is outside prefix; source mistakenly read prefix[i].
      if (historyAsc[i].resultTruyenThong === historyAsc[i - 1].resultTruyenThong) sigMap[key].tiep++;
      else sigMap[key].nguoc++;
    }
    const curSig = runs.slice(-3).map(r => r.len).join(",");
    const s = sigMap[curSig];
    if (s && s.tiep + s.nguoc >= 15) {
      const pTiep = s.tiep / (s.tiep + s.nguoc);
      if (pTiep >= 0.65) {
        return {
          pick: curRes, pickTitle: toTitleLabel(curRes),
          confidence: Math.round(50 + 25 * pTiep),
          theCau: `Khuôn ${curSig} tự học -> tiếp (${s.tiep}/${s.tiep + s.nguoc})`,
          khuyenNghi: "ĐẸP - NÊN VÀO", shouldBet: true,
          patternId: "adaptive_v8_pattern_self_learn",
          reason: `Khuôn ${curSig}: tiếp diễn ${s.tiep}/${s.tiep + s.nguoc} lần trong dữ liệu trước đó`
        };
      }
      if (pTiep <= 0.35) {
        return {
          pick: oppRes, pickTitle: toTitleLabel(oppRes),
          confidence: Math.round(50 + 25 * (1 - pTiep)),
          theCau: `Khuôn ${curSig} tự học -> bẻ (${s.nguoc}/${s.tiep + s.nguoc})`,
          khuyenNghi: "ĐẸP - NÊN VÀO", shouldBet: true,
          patternId: "adaptive_v8_pattern_self_learn",
          reason: `Khuôn ${curSig}: gãy ${s.nguoc}/${s.tiep + s.nguoc} lần trong dữ liệu trước đó`
        };
      }
    }
  }

  if (K >= 4) {
    return {
      pick: oppRes, pickTitle: toTitleLabel(oppRes), confidence: 63,
      theCau: `Bẻ bệt sau ${K} phiên`, khuyenNghi: "ĐẸP - NÊN VÀO",
      shouldBet: true, patternId: "adaptive_v8_break_streak4",
      reason: `Đang có chuỗi ${K} kết quả giống nhau; quy tắc gốc chọn cửa đối diện, đây không phải bảo đảm chuỗi sẽ gãy`
    };
  }

  const countTai = last10.filter(x => x === "TAI").length;
  const mrPick = countTai >= 5 ? "XIU" : "TAI";
  const mrSide = countTai >= 5 ? "xỉu" : "tài";
  return {
    pick: mrPick, pickTitle: toTitleLabel(mrPick), confidence: 62,
    theCau: `Hồi quy: ${countTai}/10 tài -> nghiêng ${mrSide}`,
    khuyenNghi: "ĐẸP - NÊN VÀO", shouldBet: true,
    patternId: "adaptive_v8_mean_reversion",
    reason: `10 phiên gần nhất có ${countTai} tài / ${10 - countTai} xỉu -> quy tắc hồi quy trung bình của mã nguồn`
  };
}


const learningData = Object.create(null);

function createLearningProfile() {
  return {
    predictions: [],
    patternStats: {},
    totalPredictions: 0,
    correctPredictions: 0,
    patternWeights: { ...DEFAULT_PATTERN_WEIGHTS },
    lastUpdate: null,
    streakAnalysis: { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, worstStreak: 0 },
    adaptiveThresholds: {},
    recentAccuracy: []
  };
}

function getProfile(type = "default") {
  const key = String(type || "default");
  if (!learningData[key]) learningData[key] = createLearningProfile();
  return learningData[key];
}

function initializePatternStats(type) {
  const profile = getProfile(type);
  if (!profile.patternWeights || Object.keys(profile.patternWeights).length === 0) {
    profile.patternWeights = { ...DEFAULT_PATTERN_WEIGHTS };
  }
  for (const pattern of Object.keys(DEFAULT_PATTERN_WEIGHTS)) {
    if (!profile.patternStats[pattern]) {
      profile.patternStats[pattern] = {
        total: 0,
        correct: 0,
        accuracy: 0.5,
        recentResults: [],
        lastAdjustment: null
      };
    }
    if (!Number.isFinite(profile.patternWeights[pattern])) {
      profile.patternWeights[pattern] = DEFAULT_PATTERN_WEIGHTS[pattern];
    }
  }
  return profile;
}

function getPatternWeight(type, patternId) {
  const profile = initializePatternStats(type);
  const weight = profile.patternWeights[patternId];
  return Number.isFinite(weight) && weight > 0 ? weight : 1.0;
}

function updatePatternPerformance(type, patternId, isCorrect) {
  if (typeof isCorrect !== "boolean") throw new TypeError("isCorrect must be boolean");
  const profile = initializePatternStats(type);
  if (!profile.patternStats[patternId]) {
    profile.patternStats[patternId] = {
      total: 0, correct: 0, accuracy: 0.5, recentResults: [], lastAdjustment: null
    };
  }
  const stats = profile.patternStats[patternId];
  stats.total++;
  if (isCorrect) stats.correct++;
  stats.recentResults.push(isCorrect ? 1 : 0);
  if (stats.recentResults.length > 20) stats.recentResults.shift();

  const recentAccuracy = stats.recentResults.reduce((a, b) => a + b, 0) / stats.recentResults.length;
  stats.accuracy = stats.correct / stats.total;

  const oldWeight = getPatternWeight(type, patternId);
  let newWeight = oldWeight;
  if (stats.recentResults.length >= 10) {
    const smoothedAccuracy = (stats.recentResults.reduce((a, b) => a + b, 0) + 2) / (stats.recentResults.length + 4);
    if (smoothedAccuracy > 0.62) newWeight = Math.min(2.0, oldWeight * 1.02);
    else if (smoothedAccuracy < 0.38) newWeight = Math.max(0.3, oldWeight * 0.98);
  }
  profile.patternWeights[patternId] = newWeight;
  stats.lastAdjustment = new Date().toISOString();
  return { ...stats, weight: newWeight, recentAccuracy };
}

function getPatternIdFromName(name) {
  if (!name) return null;
  const mapping = {
    'Cầu băm': 'adaptive_v8_chop',
    'Khuôn': 'adaptive_v8_pattern_self_learn',
    'Bẻ bệt tay': 'adaptive_v8_break_streak4',
    'Hồi quy': 'adaptive_v8_mean_reversion',
    'Bão đồng chất': 'adaptive_v8_triple_guard',
    'Cầu Bệt': 'cau_bet',
    'Cầu Đảo 1-1': 'cau_dao_11',
    'Cầu 2-2': 'cau_22',
    'Cầu 3-3': 'cau_33',
    'Cầu 4-4': 'cau_44',
    'Cầu 5-5': 'cau_55',
    'Cầu 1-2-1': 'cau_121',
    'Cầu 1-2-3': 'cau_123',
    'Cầu 3-2-1': 'cau_321',
    'Cầu 2-1-2': 'cau_212',
    'Cầu 1-2-2-1': 'cau_1221',
    'Cầu 2-1-1-2': 'cau_2112',
    'Cầu Nhảy Cóc': 'cau_nhay_coc',
    'Cầu Nhịp Nghiêng': 'cau_nhip_nghieng',
    'Cầu 3 Ván 1': 'cau_3van1',
    'Cầu Bẻ Cầu': 'cau_be_cau',
    'Cầu Chu Kỳ': 'cau_chu_ky',
    'Cầu Gấp': 'cau_gap',
    'Cầu Ziczac': 'cau_ziczac',
    'Cầu Đôi': 'cau_doi',
    'Cầu Rồng': 'cau_rong',
    'Đảo Xu Hướng': 'smart_bet',
    'Cực Điểm': 'edge_cases',
    'Biến động': 'momentum',
    'Cầu Tự Nhiên': 'cau_tu_nhien',
    'Biểu Đồ Đường': 'dice_trend_line',
    'MD5 Biểu Đồ': 'dice_trend_line_md5',
    'Bẻ Cầu Liên Tục': 'break_pattern_hu',
    'MD5 Bẻ Cầu': 'break_pattern_md5',
    'Dây Gãy': 'day_gay',
    'MD5 Dây Gãy': 'day_gay_md5',
  };
  for (const [label, id] of Object.entries(mapping)) {
    if (name.includes(label)) return id;
  }
  return null;
}

function analyzeCauBet(results, type) {
  if (results.length < 3) return { detected: false };
  const streakType = results[0];
  let streakLength = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === streakType) streakLength++;
    else break;
  }
  if (streakLength >= 3) {
    const weight = getPatternWeight(type, 'cau_bet');
    const shouldBreak = streakLength >= 4;
    return {
      detected: true,
      type: streakType,
      length: streakLength,
      prediction: shouldBreak ? oppTitle(streakType) : streakType,
      confidence: Math.round((shouldBreak ? Math.min(14, streakLength * 2.5) : Math.min(15, streakLength * 3)) * weight),
      name: `Cầu Bệt ${streakLength} phiên`,
      patternId: 'cau_bet'
    };
  }
  return { detected: false };
}

function analyzeCauDao11(results, type) {
  if (results.length < 4) return { detected: false };
  let alternatingLength = 1;
  for (let i = 1; i < Math.min(results.length, 10); i++) {
    if (results[i] !== results[i - 1]) alternatingLength++;
    else break;
  }
  if (alternatingLength >= 4) {
    const weight = getPatternWeight(type, 'cau_dao_11');
    return {
      detected: true,
      length: alternatingLength,
      prediction: oppTitle(results[0]),
      confidence: Math.round(Math.min(14, alternatingLength * 2 + 4) * weight),
      name: `Cầu Đảo 1-1 (${alternatingLength} phiên)`,
      patternId: 'cau_dao_11'
    };
  }
  return { detected: false };
}

function recentRunsNewestFirst(results) {
  const runs = [];
  if (!Array.isArray(results) || !results.length) return runs;
  let side = results[0];
  let len = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === side) len++;
    else {
      runs.push({ side, len });
      side = results[i];
      len = 1;
    }
  }
  runs.push({ side, len });
  return runs;
}

// Detect run-length ladders from the newest end, not by array-length modulo.
// The two prior completed runs must support the same alternating run length.
function analyzeRunLengthPattern(results, targetLen, type, patternId, label) {
  const runs = recentRunsNewestFirst(results);
  if (runs.length < 3) return { detected: false };
  const [current, previous, older] = runs;
  if (current.len > targetLen || previous.len !== targetLen || older.len !== targetLen) {
    return { detected: false };
  }
  if (previous.side === older.side || current.side !== older.side) return { detected: false };
  const prediction = current.len < targetLen ? current.side : oppTitle(current.side);
  const weight = getPatternWeight(type, patternId);
  return {
    detected: true,
    prediction,
    confidence: Math.round((9 + targetLen) * weight),
    name: `${label} (${runs.slice(0, 3).map(r => r.len).join('-')})`,
    patternId
  };
}

function analyzeCau22(results, type) {
  return analyzeRunLengthPattern(results, 2, type, 'cau_22', 'Cầu 2-2');
}

function analyzeCau33(results, type) {
  return analyzeRunLengthPattern(results, 3, type, 'cau_33', 'Cầu 3-3');
}

function analyzeCau121(results, type) {
  if (results.length < 4) return { detected: false };
  const p = results.slice(0, 4);
  if (p[0] !== p[1] && p[1] === p[2] && p[2] !== p[3] && p[0] === p[3]) {
    const weight = getPatternWeight(type, 'cau_121');
    return { detected: true, prediction: p[0], confidence: Math.round(10 * weight), name: 'Cầu 1-2-1', patternId: 'cau_121' };
  }
  return { detected: false };
}

function analyzeCau123(results, type) {
  if (results.length < 6) return { detected: false };
  const first = results[5], nextTwo = results.slice(3, 5), lastThree = results.slice(0, 3);
  if (nextTwo[0] === nextTwo[1] && nextTwo[0] !== first && lastThree.every(r => r === lastThree[0]) && lastThree[0] !== nextTwo[0]) {
    const weight = getPatternWeight(type, 'cau_123');
    return { detected: true, prediction: first, confidence: Math.round(11 * weight), name: 'Cầu 1-2-3', patternId: 'cau_123' };
  }
  return { detected: false };
}

function analyzeCau321(results, type) {
  if (results.length < 6) return { detected: false };
  const first3 = results.slice(3, 6), next2 = results.slice(1, 3), last1 = results[0];
  if (first3.every(r => r === first3[0]) && next2.every(r => r === next2[0]) && first3[0] !== next2[0] && last1 !== next2[0]) {
    const weight = getPatternWeight(type, 'cau_321');
    return { detected: true, prediction: next2[0], confidence: Math.round(12 * weight), name: 'Cầu 3-2-1', patternId: 'cau_321' };
  }
  return { detected: false };
}

function analyzeCauNhayCoc(results, type) {
  if (results.length < 6) return { detected: false };
  const skipPattern = [];
  for (let i = 0; i < Math.min(results.length, 12); i += 2) skipPattern.push(results[i]);
  if (skipPattern.length >= 3 && skipPattern.slice(0, 3).every(r => r === skipPattern[0])) {
    const weight = getPatternWeight(type, 'cau_nhay_coc');
    return { detected: true, prediction: skipPattern[0], confidence: Math.round(8 * weight), name: 'Cầu Nhảy Cóc', patternId: 'cau_nhay_coc' };
  }
  return { detected: false };
}

function analyzeCauNhipNghieng(results, type) {
  if (results.length < 5) return { detected: false };
  const last5 = results.slice(0, 5), taiCount5 = last5.filter(r => r === 'Tài').length;
  const weight = getPatternWeight(type, 'cau_nhip_nghieng');
  if (taiCount5 >= 4) return { detected: true, prediction: 'Tài', confidence: Math.round(9 * weight), name: `Cầu Nhịp Nghiêng 5 (${taiCount5} Tài)`, patternId: 'cau_nhip_nghieng' };
  if (taiCount5 <= 1) return { detected: true, prediction: 'Xỉu', confidence: Math.round(9 * weight), name: `Cầu Nhịp Nghiêng 5 (${5 - taiCount5} Xỉu)`, patternId: 'cau_nhip_nghieng' };
  return { detected: false };
}

function analyzeCau3Van1(results, type) {
  if (results.length < 4) return { detected: false };
  const last4 = results.slice(0, 4), taiCount = last4.filter(r => r === 'Tài').length;
  const weight = getPatternWeight(type, 'cau_3van1');
  if (taiCount === 3) return { detected: true, prediction: 'Xỉu', confidence: Math.round(8 * weight), name: 'Cầu 3 Ván 1 (3T-1X)', patternId: 'cau_3van1' };
  if (taiCount === 1) return { detected: true, prediction: 'Tài', confidence: Math.round(8 * weight), name: 'Cầu 3 Ván 1 (3X-1T)', patternId: 'cau_3van1' };
  return { detected: false };
}

function analyzeCauBeCau(results, type) {
  if (results.length < 8) return { detected: false };
  const recentStreak = analyzeCauBet(results, type);
  if (recentStreak.detected && recentStreak.length >= 4) {
    const beforeStreak = results.slice(recentStreak.length, recentStreak.length + 4);
    const previousPattern = analyzeCauBet(beforeStreak, type);
    if (previousPattern.detected && previousPattern.type !== recentStreak.type) {
      const weight = getPatternWeight(type, 'cau_be_cau');
      return { detected: true, prediction: oppTitle(recentStreak.type), confidence: Math.round(11 * weight), name: 'Cầu Bẻ Cầu', patternId: 'cau_be_cau' };
    }
  }
  return { detected: false };
}

function analyzeCau44(results, type) {
  return analyzeRunLengthPattern(results, 4, type, 'cau_44', 'Cầu 4-4');
}

function analyzeCau55(results, type) {
  return analyzeRunLengthPattern(results, 5, type, 'cau_55', 'Cầu 5-5');
}

function analyzeCau212(results, type) {
  if (results.length < 5) return { detected: false };
  const p = results.slice(0, 5), weight = getPatternWeight(type, 'cau_212');
  if (p[0] === p[1] && p[1] !== p[2] && p[2] === p[3] && p[3] === p[4]) {
    return { detected: true, prediction: p[0], confidence: Math.round(11 * weight), name: 'Cầu 2-1-2', patternId: 'cau_212' };
  }
  return { detected: false };
}

function analyzeCau1221(results, type) {
  if (results.length < 6) return { detected: false };
  const p = results.slice(0, 6), weight = getPatternWeight(type, 'cau_1221');
  if (p[0] !== p[1] && p[1] === p[2] && p[2] === p[3] && p[3] !== p[4] && p[4] === p[5]) {
    return { detected: true, prediction: p[0], confidence: Math.round(12 * weight), name: 'Cầu 1-2-2-1', patternId: 'cau_1221' };
  }
  return { detected: false };
}

function analyzeCau2112(results, type) {
  if (results.length < 6) return { detected: false };
  const p = results.slice(0, 6), weight = getPatternWeight(type, 'cau_2112');
  if (p[0] === p[1] && p[1] !== p[2] && p[2] !== p[3] && p[3] === p[4] && p[4] === p[5]) {
    return { detected: true, prediction: p[0], confidence: Math.round(11 * weight), name: 'Cầu 2-1-1-2', patternId: 'cau_2112' };
  }
  return { detected: false };
}

function analyzeCauZiczac(results, type) {
  if (results.length < 8) return { detected: false };
  let zigzagCount = 0;
  for (let i = 0; i < results.length - 2; i++) {
    if (results[i] !== results[i + 1] && results[i + 1] !== results[i + 2] && results[i] === results[i + 2]) zigzagCount++;
    else break;
  }
  if (zigzagCount >= 3) {
    const weight = getPatternWeight(type, 'cau_ziczac');
    return { detected: true, prediction: oppTitle(results[0]), confidence: Math.round(12 * weight), name: 'Cầu Ziczac', patternId: 'cau_ziczac' };
  }
  return { detected: false };
}

function analyzeCauDoi(results, type) {
  if (results.length < 4) return { detected: false };
  const weight = getPatternWeight(type, 'cau_doi');
  if (results[0] === results[1] && results[2] === results[3] && results[0] !== results[2]) {
    return { detected: true, prediction: oppTitle(results[0]), confidence: Math.round(11 * weight), name: 'Cầu Đôi Đảo', patternId: 'cau_doi' };
  }
  return { detected: false };
}

function analyzeCauRong(results, type) {
  if (results.length < 6) return { detected: false };
  let streakLength = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === results[0]) streakLength++;
    else break;
  }
  if (streakLength >= 6) {
    const weight = getPatternWeight(type, 'cau_rong');
    return { detected: true, prediction: oppTitle(results[0]), confidence: Math.round(16 * weight), name: `Cầu Rồng ${streakLength} phiên`, patternId: 'cau_rong' };
  }
  return { detected: false };
}

function analyzeSmartBet(results, type) {
  if (results.length < 10) return { detected: false };
  const last5 = results.slice(0, 5), prev5 = results.slice(5, 10);
  const taiLast5 = last5.filter(r => r === 'Tài').length, taiPrev5 = prev5.filter(r => r === 'Tài').length;
  if ((taiLast5 >= 4 && taiPrev5 <= 1) || (taiLast5 <= 1 && taiPrev5 >= 4)) {
    const weight = getPatternWeight(type, 'smart_bet');
    return { detected: true, prediction: taiLast5 >= 4 ? 'Xỉu' : 'Tài', confidence: Math.round(13 * weight), name: 'Đảo Xu Hướng SmartBet', patternId: 'smart_bet' };
  }
  return { detected: false };
}

function detectCyclePattern(results, type) {
  if (!Array.isArray(results) || results.length < 12) return { detected: false };
  // results is newest-first. The next chronological result is the oldest
  // element of the repeated backward-looking cycle window, not length % L.
  for (let cycleLen = 2; cycleLen <= 5; cycleLen++) {
    if (results.length < cycleLen * 3) continue;
    const pattern = results.slice(0, cycleLen);
    const checkLength = Math.min(cycleLen * 4, results.length);
    let matches = true;
    for (let i = cycleLen; i < checkLength; i++) {
      if (results[i] !== pattern[i % cycleLen]) { matches = false; break; }
    }
    if (matches) {
      const weight = getPatternWeight(type, 'cau_chu_ky');
      return {
        detected: true,
        prediction: pattern[cycleLen - 1],
        confidence: Math.round(10 * weight),
        name: `Cầu Chu Kỳ ${cycleLen}`,
        patternId: 'cau_chu_ky',
        cycleLength: cycleLen,
        verifiedWindow: checkLength
      };
    }
  }
  return { detected: false };
}

function wilsonLowerBound(successes, total, z = 1.96) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denominator);
}

function analyzeHistoricalSuffix(historyAsc, minMatches = 30) {
  const sequence = historyAsc.map(row => row.resultTruyenThong)
    .filter(value => value === 'TAI' || value === 'XIU');
  const n = sequence.length;
  if (n < MIN_HISTORY + 4) return null;

  // Pre-commit to the longest context with enough *prior* matches. The
  // target outcome must occur before the current suffix begins, preventing
  // overlap/look-ahead leakage.
  for (let length = Math.min(5, Math.floor((n - 1) / 3)); length >= 1; length--) {
    const suffix = sequence.slice(n - length);
    let tai = 0, xiu = 0;
    for (let target = length; target <= n - length; target++) {
      let matched = true;
      for (let j = 0; j < length; j++) {
        if (sequence[target - length + j] !== suffix[j]) { matched = false; break; }
      }
      if (!matched) continue;
      if (sequence[target] === 'TAI') tai++;
      else xiu++;
    }
    const total = tai + xiu;
    if (total < minMatches) continue;
    const side = tai >= xiu ? 'TAI' : 'XIU';
    const wins = Math.max(tai, xiu);
    const rate = wins / total;
    const lowerBound = wilsonLowerBound(wins, total);
    return {
      source: 'suffix', contextLength: length, samples: total,
      tai, xiu, side, rate, lowerBound,
      qualified: total >= minMatches && lowerBound >= 0.55
    };
  }
  return null;
}

function analyzeRunContinuation(historyAsc, minMatches = 25) {
  const sequence = historyAsc.map(row => row.resultTruyenThong)
    .filter(value => value === 'TAI' || value === 'XIU');
  if (sequence.length < MIN_HISTORY) return null;

  const currentSide = sequence[sequence.length - 1];
  let currentRun = 1;
  for (let i = sequence.length - 2; i >= 0 && sequence[i] === currentSide; i--) currentRun++;

  const priorRuns = [];
  for (let i = 0; i < sequence.length - currentRun;) {
    const side = sequence[i];
    let end = i + 1;
    while (end < sequence.length - currentRun && sequence[end] === side) end++;
    priorRuns.push({ side, len: end - i });
    i = end;
  }

  let continueCount = 0, breakCount = 0;
  for (const run of priorRuns) {
    if (run.side !== currentSide || run.len < currentRun) continue;
    if (run.len > currentRun) continueCount++;
    else breakCount++;
  }
  const total = continueCount + breakCount;
  if (total < minMatches) return null;
  const continueRate = continueCount / total;
  const sameSideIsFavoured = continueCount >= breakCount;
  const wins = Math.max(continueCount, breakCount);
  return {
    source: 'run_length', currentRun, samples: total,
    side: sameSideIsFavoured ? currentSide : (currentSide === 'TAI' ? 'XIU' : 'TAI'),
    rate: wins / total,
    lowerBound: wilsonLowerBound(wins, total),
    continueRate,
    continueCount,
    breakCount,
    qualified: total >= minMatches && wilsonLowerBound(wins, total) >= 0.55
  };
}

function combineEmpiricalEvidence(historyAsc) {
  // Keep the model responsive: old sessions remain stored for learning, but
  // empirical matching is bounded to the latest 300 verified outcomes.
  const window = Array.isArray(historyAsc) ? historyAsc.slice(-300) : [];
  const suffix = analyzeHistoricalSuffix(window, 30);
  const runLength = analyzeRunContinuation(window, 25);
  const qualified = [suffix, runLength].filter(item => item && item.qualified);
  if (!qualified.length) return { suffix, runLength, selected: null, conflict: false, windowSize: window.length };
  const sides = new Set(qualified.map(item => item.side));
  if (sides.size > 1) return { suffix, runLength, selected: null, conflict: true, windowSize: window.length };
  const selected = qualified.sort((a, b) => (b.samples - a.samples) || (b.lowerBound - a.lowerBound))[0];
  return { suffix, runLength, selected, conflict: false, windowSize: window.length };
}

function getPatternReliability(type, patternId) {
  const profile = initializePatternStats(type);
  const stats = profile.patternStats[patternId];
  const recent = stats && Array.isArray(stats.recentResults) ? stats.recentResults.slice(-20) : [];
  if (recent.length < 8) return 1;
  const wins = recent.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  // Bayesian smoothing prevents a short lucky/unlucky run from dominating.
  const accuracy = (wins + 4) / (recent.length + 8);
  return Math.max(0.65, Math.min(1.25, 0.75 + (accuracy - 0.5) * 1.5));
}

function calculatePatternConsensus(predictions, type) {
  const unique = new Map();
  for (const item of Array.isArray(predictions) ? predictions : []) {
    if (!item || !item.patternId || !['Tài', 'Xỉu'].includes(item.prediction)) continue;
    // A pattern contributes once per decision, even if accidentally emitted twice.
    if (!unique.has(item.patternId)) unique.set(item.patternId, item);
  }
  let tai = 0, xiu = 0;
  for (const [patternId, item] of unique) {
    const base = Math.max(0.3, Math.min(2, getPatternWeight(type, patternId)));
    const reliability = getPatternReliability(type, patternId);
    const weight = Math.max(0.2, Math.min(2.2, base * reliability));
    if (item.prediction === 'Tài') tai += weight;
    else xiu += weight;
  }
  const total = tai + xiu;
  const prediction = total === 0 ? null : (tai >= xiu ? 'Tài' : 'Xỉu');
  const support = total === 0 ? 0 : Math.max(tai, xiu) / total;
  return {
    prediction,
    tai_weight: Math.round(tai * 100) / 100,
    xiu_weight: Math.round(xiu * 100) / 100,
    support: Math.round(support * 1000) / 1000,
    patterns: unique.size,
    conflictWith(side) {
      if (unique.size < 3 || !side) return false;
      const selected = side === 'Tài' ? tai : xiu;
      const opposite = side === 'Tài' ? xiu : tai;
      return opposite > selected * 1.15;
    }
  };
}

function analyzeEdgeCases(data, type) {
  if (data.length < 10) return { detected: false };
  const sums = data.slice(0, 10)
    .map(d => d && d.Tong != null && d.Tong !== '' ? Number(d.Tong) : NaN)
    .filter(Number.isFinite);
  if (sums.length < 10) return { detected: false };
  const high = sums.filter(t => t >= 14).length, low = sums.filter(t => t <= 7).length;
  const weight = getPatternWeight(type, 'edge_cases');
  if (high >= 4) return { detected: true, prediction: 'Xỉu', confidence: Math.round(8 * weight), name: 'Cực Điểm Cao', patternId: 'edge_cases' };
  if (low >= 4) return { detected: true, prediction: 'Tài', confidence: Math.round(8 * weight), name: 'Cực Điểm Thấp', patternId: 'edge_cases' };
  return { detected: false };
}

function analyzeDiceTrendLineHu(data, type) {
  if (data.length < 3) return { detected: false };
  const currentDices = [data[0].Xuc_xac_1, data[0].Xuc_xac_2, data[0].Xuc_xac_3].map(Number);
  if (!currentDices.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) return { detected: false };
  const weight = getPatternWeight(type, 'dice_trend_line');
  if (currentDices[0] === currentDices[1] && currentDices[1] === currentDices[2]) {
    return { detected: true, prediction: currentDices[0] >= 4 ? 'Xỉu' : 'Tài', confidence: Math.round(13 * weight), name: 'Biểu Đồ Đường (3 hột trùng)', patternId: 'dice_trend_line' };
  }
  return { detected: false };
}

function analyzeDiceTrendLineMd5(data, type) {
  if (data.length < 3) return { detected: false };
  const currentDices = [data[0].Xuc_xac_1, data[0].Xuc_xac_2, data[0].Xuc_xac_3].map(Number);
  if (!currentDices.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) return { detected: false };
  currentDices.sort((a, b) => b - a);
  const weight = getPatternWeight(type, 'dice_trend_line_md5');
  if (currentDices[0] === currentDices[1] && currentDices[0] >= 5) {
    return { detected: true, prediction: 'Xỉu', confidence: Math.round(13 * weight), name: 'MD5 Biểu Đồ (2 hột cao)', patternId: 'dice_trend_line_md5' };
  }
  return { detected: false };
}

function analyzeResistanceSupport(data, type) {
  if (data.length < 20) return { detected: false };
  if (!data[0] || data[0].Tong == null || data[0].Tong === '') return { detected: false };
  const sum = Number(data[0].Tong);
  if (!Number.isFinite(sum)) return { detected: false };
  const weight = getPatternWeight(type, 'resistance_support');
  if (sum >= 15) return { detected: true, prediction: 'Xỉu', confidence: Math.round(13 * weight), name: 'Vùng Kháng Cự', patternId: 'resistance_support' };
  if (sum <= 6) return { detected: true, prediction: 'Tài', confidence: Math.round(13 * weight), name: 'Vùng Hỗ Trợ', patternId: 'resistance_support' };
  return { detected: false };
}


function calculateAdvancedPrediction(dataDesc, type = "default", options = {}) {
  if (!Array.isArray(dataDesc)) throw new TypeError("dataDesc must be an array");

  const seenSessions = new Set();
  const validDesc = [];
  for (const item of dataDesc) {
    if (!item || typeof item !== 'object') continue;
    const label = normalizeResult(item.Ket_qua ?? item.ket_qua ?? item.result);
    if (!label) continue;
    const session = item.Phien ?? item.phien ?? item.id ?? null;
    if (session != null) {
      const key = String(session);
      if (seenSessions.has(key)) continue;
      seenSessions.add(key);
    }
    validDesc.push({
      ...item,
      Phien: session,
      Ket_qua: label,
      Tong: item.Tong == null ? null : Number(item.Tong)
    });
  }

  if (!validDesc.length) {
    return {
      ready: false, prediction: null, confidence: 0,
      theCau: 'Chưa có dữ liệu hợp lệ', khuyenNghi: 'QUAN SÁT - CHỜ DỮ LIỆU',
      nenDanh: false, lyDo: 'Không có kết quả Tài/Xỉu hợp lệ để phân tích',
      factors: [], allPatterns: [], detailedAnalysis: { algoVersion: ALGO_VERSION, validSamples: 0 }
    };
  }

  const last50Desc = validDesc.slice(0, 50);
  const resultsDesc = last50Desc.map(row => row.Ket_qua);
  initializePatternStats(type);

  const suppliedHistory = Array.isArray(options.historyAsc) && options.historyAsc.length
    ? options.historyAsc : validDesc.slice().reverse().map(row => ({
        id: row.Phien,
        resultTruyenThong: toUpperCode(row.Ket_qua),
        dices: [row.Xuc_xac_1, row.Xuc_xac_2, row.Xuc_xac_3],
        point: row.Tong
      }));
  const seenHistory = new Set();
  const historyAsc = suppliedHistory.map(row => ({
    ...row,
    resultTruyenThong: toUpperCode(row.resultTruyenThong ?? row.Ket_qua ?? row.ket_qua)
  })).filter(row => {
    if (!row.resultTruyenThong) return false;
    const id = row.id ?? row.Phien ?? row.phien;
    if (id == null) return true;
    const key = String(id);
    if (seenHistory.has(key)) return false;
    seenHistory.add(key);
    return true;
  });

  if (historyAsc.length < MIN_HISTORY) {
    return {
      ready: false, prediction: null, confidence: 0,
      theCau: 'Đang nạp lịch sử', khuyenNghi: 'QUAN SÁT - CHỜ DỮ LIỆU',
      nenDanh: false, lyDo: `Cần tối thiểu ${MIN_HISTORY} phiên hợp lệ`,
      factors: [], allPatterns: [], detailedAnalysis: { algoVersion: ALGO_VERSION, validSamples: historyAsc.length }
    };
  }

  const v8Decision = analyzeAdaptiveHybridV6(historyAsc);
  const predictions = [{
    prediction: v8Decision.pickTitle,
    confidence: v8Decision.confidence,
    priority: 1,
    name: v8Decision.theCau,
    patternId: v8Decision.patternId
  }].filter(item => item.prediction === 'Tài' || item.prediction === 'Xỉu');
  const factors = [v8Decision.theCau];
  const allPatterns = [{
    detected: true, prediction: v8Decision.pickTitle,
    confidence: v8Decision.confidence, name: v8Decision.theCau,
    patternId: v8Decision.patternId
  }];

  const parityMode = options.gameType === 'xocdia';
  const secondaryAnalyzers = [
    () => analyzeCauBet(resultsDesc, type),
    () => analyzeCauDao11(resultsDesc, type),
    () => analyzeCau22(resultsDesc, type),
    () => analyzeCau33(resultsDesc, type),
    () => analyzeCau121(resultsDesc, type),
    () => analyzeCau123(resultsDesc, type),
    () => analyzeCau321(resultsDesc, type),
    () => analyzeCauNhayCoc(resultsDesc, type),
    () => analyzeCauNhipNghieng(resultsDesc, type),
    () => analyzeCau3Van1(resultsDesc, type),
    () => analyzeCauBeCau(resultsDesc, type),
    () => detectCyclePattern(resultsDesc, type),
    () => analyzeCau44(resultsDesc, type),
    () => analyzeCau55(resultsDesc, type),
    () => analyzeCau212(resultsDesc, type),
    () => analyzeCau1221(resultsDesc, type),
    () => analyzeCau2112(resultsDesc, type),
    () => analyzeCauZiczac(resultsDesc, type),
    () => analyzeCauDoi(resultsDesc, type),
    () => analyzeCauRong(resultsDesc, type),
    () => analyzeSmartBet(resultsDesc, type),
    ...(parityMode ? [] : [
      () => analyzeEdgeCases(last50Desc, type),
      () => analyzeResistanceSupport(last50Desc, type),
      () => (options.diceModel === 'hu' ? analyzeDiceTrendLineHu(last50Desc, type) : analyzeDiceTrendLineMd5(last50Desc, type))
    ])
  ];
  for (const fn of secondaryAnalyzers) {
    const result = fn();
    if (result && result.detected && (result.prediction === 'Tài' || result.prediction === 'Xỉu')) {
      predictions.push({ prediction: result.prediction, confidence: result.confidence, priority: 1, name: result.name, patternId: result.patternId });
      factors.push(result.name);
      allPatterns.push(result);
    }
  }

  const evidence = combineEmpiricalEvidence(historyAsc);
  const patternConsensus = calculatePatternConsensus(predictions, type);
  const selected = evidence.selected;
  const heuristic = v8Decision.pickTitle;
  let finalPrediction = heuristic;
  let shouldBet = false;
  let finalConfidence = 50;
  let theCau = v8Decision.theCau;
  let reason;

  if (evidence.conflict) {
    reason = 'Các mẫu lịch sử độc lập đang cho tín hiệu trái chiều; chưa có cơ sở thống kê đủ mạnh để xác nhận cửa dự đoán';
  } else if (selected) {
    finalPrediction = selected.side === 'TAI' ? 'Tài' : 'Xỉu';
    const agreesWithHeuristic = finalPrediction === heuristic;
    const patternConflict = patternConsensus.conflictWith(finalPrediction);
    shouldBet = selected.samples >= 40 && selected.lowerBound >= 0.55 && agreesWithHeuristic && !patternConflict;
    finalConfidence = Math.max(50, Math.min(68, Math.round(50 + (selected.lowerBound - 0.5) * 100)));
    if (!shouldBet) finalConfidence = Math.min(finalConfidence, 54);
    theCau = selected.source === 'suffix'
      ? `Mẫu hậu tố ${selected.contextLength} phiên · ${selected.samples} lần khớp`
      : `Cầu độ dài bệt ${selected.currentRun} · ${selected.samples} mẫu lịch sử`;
    reason = `Mẫu lịch sử nghiêng ${finalPrediction}: ${selected.samples} lần khớp, tỷ lệ quan sát ${(selected.rate * 100).toFixed(1)}%, cận dưới Wilson ${(selected.lowerBound * 100).toFixed(1)}%${agreesWithHeuristic ? '' : '; khác tín hiệu heuristic'}${patternConflict ? '; các pattern phụ đang phản đối' : ''}`;
  } else {
    finalConfidence = 50;
    reason = `Heuristic gợi ý ${heuristic}, nhưng chưa tìm thấy mẫu lịch sử lặp đủ số lần và đủ độ tin cậy thống kê; chỉ nên xem là tham khảo`;
  }

  const cooldown = Math.max(0, Number(options.inCooldown || 0));
  let khuyenNghi = shouldBet ? 'TÍN HIỆU ĐƯỢC LỊCH SỬ ỦNG HỘ' : 'QUAN SÁT - CHỜ TÍN HIỆU RÕ';
  if (cooldown > 0) {
    khuyenNghi = `COOLDOWN (${cooldown} phiên)`;
    shouldBet = false;
  }

  return {
    ready: true,
    prediction: finalPrediction,
    confidence: finalConfidence,
    theCau,
    khuyenNghi,
    nenDanh: shouldBet,
    lyDo: reason,
    factors,
    allPatterns,
    detailedAnalysis: {
      algoVersion: ALGO_VERSION,
      totalPatterns: predictions.length,
      taiVotes: predictions.filter(item => item.prediction === 'Tài').length,
      xiuVotes: predictions.filter(item => item.prediction === 'Xỉu').length,
      validSamples: historyAsc.length,
      learningProfile: String(type),
      empiricalEvidence: evidence,
      patternConsensus: {
        prediction: patternConsensus.prediction,
        tai_weight: patternConsensus.tai_weight,
        xiu_weight: patternConsensus.xiu_weight,
        support: patternConsensus.support,
        patterns: patternConsensus.patterns
      },
      heuristicPrediction: heuristic,
      confidenceMeaning: 'Chỉ số tín hiệu bảo thủ, không phải xác suất thắng được bảo đảm'
    }
  };
}

function learnFromSettledPrediction(type, predictionRecord, actualResult) {
  if (!predictionRecord || typeof predictionRecord !== "object") {
    throw new TypeError("predictionRecord must be an object");
  }
  if (predictionRecord.verified === true) {
    return { updated: false, reason: "already_verified", isCorrect: predictionRecord.isCorrect };
  }

  const predicted = normalizeResult(predictionRecord.prediction ?? predictionRecord.du_doan);
  const actual = normalizeResult(actualResult);
  if (!predicted || !actual) {
    return { updated: false, reason: "invalid_result", isCorrect: null };
  }

  const profile = initializePatternStats(type);
  const isCorrect = predicted === actual;
  profile.totalPredictions = (Number(profile.totalPredictions) || 0) + 1;
  predictionRecord.verified = true;
  predictionRecord.actual = actual;
  predictionRecord.isCorrect = isCorrect;

  if (isCorrect) {
    profile.correctPredictions++;
    profile.streakAnalysis.wins++;
    profile.streakAnalysis.currentStreak = profile.streakAnalysis.currentStreak >= 0
      ? profile.streakAnalysis.currentStreak + 1 : 1;
    profile.streakAnalysis.bestStreak = Math.max(
      profile.streakAnalysis.bestStreak,
      profile.streakAnalysis.currentStreak
    );
  } else {
    profile.streakAnalysis.losses++;
    profile.streakAnalysis.currentStreak = profile.streakAnalysis.currentStreak <= 0
      ? profile.streakAnalysis.currentStreak - 1 : -1;
    profile.streakAnalysis.worstStreak = Math.min(
      profile.streakAnalysis.worstStreak,
      profile.streakAnalysis.currentStreak
    );
  }

  profile.recentAccuracy.push(isCorrect ? 1 : 0);
  if (profile.recentAccuracy.length > 50) profile.recentAccuracy.shift();

  const suppliedPatterns = Array.isArray(predictionRecord.patterns)
    ? predictionRecord.patterns
    : (Array.isArray(predictionRecord.factors) ? predictionRecord.factors : []);
  const patternIds = new Set();
  for (const item of suppliedPatterns) {
    const value = typeof item === "string" ? item : item?.patternId;
    if (!value) continue;
    const id = DEFAULT_PATTERN_WEIGHTS[value] !== undefined ? value : getPatternIdFromName(value);
    if (id) patternIds.add(id);
  }
  for (const id of patternIds) updatePatternPerformance(type, id, isCorrect);

  profile.lastUpdate = new Date().toISOString();
  return {
    updated: true,
    isCorrect,
    actual,
    predicted,
    updatedPatterns: Array.from(patternIds),
    streak: profile.streakAnalysis.currentStreak,
    recentAccuracy: profile.recentAccuracy.length
      ? profile.recentAccuracy.reduce((a, b) => a + b, 0) / profile.recentAccuracy.length
      : 0
  };
}

function getAlgorithmLearningState(type = "default") {
  return JSON.parse(JSON.stringify(getProfile(type)));
}

function setAlgorithmLearningState(type, state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("state must be an object");
  }
  const profile = createLearningProfile();
  const allowed = [
    "predictions", "patternStats", "totalPredictions", "correctPredictions",
    "patternWeights", "lastUpdate", "streakAnalysis", "adaptiveThresholds", "recentAccuracy"
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(state, key)) profile[key] = state[key];
  }
  if (!profile.predictions || !Array.isArray(profile.predictions)) profile.predictions = [];
  if (!profile.patternStats || typeof profile.patternStats !== "object") profile.patternStats = {};
  if (!profile.patternWeights || typeof profile.patternWeights !== "object") profile.patternWeights = { ...DEFAULT_PATTERN_WEIGHTS };
  if (!Array.isArray(profile.recentAccuracy)) profile.recentAccuracy = [];
  profile.streakAnalysis = { ...createLearningProfile().streakAnalysis, ...(profile.streakAnalysis || {}) };
  learningData[String(type || "default")] = profile;
  initializePatternStats(type);
  return getAlgorithmLearningState(type);
}

function setPatternWeight(type, patternId, weight) {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric) || numeric < 0.3 || numeric > 2.0) {
    throw new RangeError("Pattern weight must be between 0.3 and 2.0");
  }
  const profile = initializePatternStats(type);
  profile.patternWeights[patternId] = numeric;
  return numeric;
}

function resetAlgorithmLearning(type) {
  if (type == null) {
    for (const key of Object.keys(learningData)) delete learningData[key];
  } else {
    delete learningData[String(type)];
  }
}

  return {
  ALGO_VERSION, MIN_HISTORY, DEFAULT_PATTERN_WEIGHTS,
  calculateAdvancedPrediction, analyzeAdaptiveHybridV6, runsOf,
  updatePatternPerformance, learnFromSettledPrediction, getPatternWeight,
  setPatternWeight, getPatternIdFromName, getAlgorithmLearningState,
  setAlgorithmLearningState, resetAlgorithmLearning,
  analyzeHistoricalSuffix, analyzeRunContinuation, detectCyclePattern,
  analyzeRunLengthPattern, wilsonLowerBound
};
})();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const POLL_MS = Math.max(10000, Number(process.env.POLL_MS) || 25000);
const SOURCE_LIMIT = Math.max(200, Number(process.env.SOURCE_LIMIT) || 1200);
const PRED_LIMIT = Math.max(100, Math.min(5000, Number(process.env.PRED_HISTORY_LIMIT) || 1000));
const FEED_LIMIT = Math.max(100, Math.min(10000, Number(process.env.PREDICTION_FEED_LIMIT) || 3000));
// The extracted algorithm requires at least 15 distinct, usable source sessions.
const requestedMinHistory = Number(process.env.MIN_HISTORY_SESSIONS);
const MIN_HISTORY_SESSIONS = Math.max(AlgorithmOnly.MIN_HISTORY, Number.isFinite(requestedMinHistory) && requestedMinHistory > 0 ? requestedMinHistory : AlgorithmOnly.MIN_HISTORY);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const IDOL = String(process.env.API_ID || '@sewdangcap').trim() || '@sewdangcap';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.set('json spaces', 0);

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json, text/plain, */*'
  }
});

/* Algorithm-only lõi v8.2 được nhúng trực tiếp trong server.js; không cần algorithm-only.js. */

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

function saveCompactJSON(file, data) {
  const full = path.join(DATA_DIR, file);
  const temp = `${full}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data), 'utf8');
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
const predictionFeedRaw = loadJSON('prediction_feed.json', {});
const predictionFeedStore = predictionFeedRaw && typeof predictionFeedRaw === 'object' && !Array.isArray(predictionFeedRaw)
  ? predictionFeedRaw : {};
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
    persistPredictionFeed(gameId, rows);
    return {
      ...basePayload,
      Trang_thai: 'DANG_HOC_DU_LIEU',
      Is_ready: false,
      Con_thieu: remaining,
      Du_doan: null,
      Du_doan_side: null,
      do_tin_cay: null,
      Du_doan_icon: '⏳',
      Algorithm_version: AlgorithmOnly.ALGO_VERSION
    };
  }

  // One forecast (or one deliberate skip) per target session.
  const existingLogs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  let log = existingLogs.find(item => String(item.phien) === String(nextSession));
  let pred;

  // Preserve pending forecasts produced by the compatible v8 algorithm family so
  // a version upgrade never changes a session after it has already been predicted.
  // Only archive pending forecasts created by the removed legacy prediction engine.
  const isCompatibleAlgorithm = typeof (log && log.algorithm_version) === 'string' && /^v8\./.test(log.algorithm_version);
  if (log && !isCompatibleAlgorithm &&
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
    if (log.source_phien == null && String(nextSessionOf(latest)) === String(log.phien)) {
      log.source_phien = latest.session == null ? null : String(latest.session);
      log.source_result = latest.side ? sideLabel(latest.side) : (latest.sideSource === 'triple' ? 'Bộ ba' : null);
      log.source_dice = Array.isArray(latest.dice) ? latest.dice : [];
      log.source_vi = latest.vi || null;
      if (!log.pattern) log.pattern = compactPatternLabel(log.the_cau || log.theCau);
      saveJSON('pred_history.json', predHistory);
    }
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
        pattern: compactPatternLabel(pred.theCau),
        source_phien: latest.session == null ? null : String(latest.session),
        source_result: latest.side ? sideLabel(latest.side) : (latest.sideSource === 'triple' ? 'Bộ ba' : null),
        source_dice: Array.isArray(latest.dice) ? latest.dice : [],
        source_vi: latest.vi || null,
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
    Du_doan_icon: pred.paused ? '⏸️' : '⏳',
    Sample_size: pred.sampleSize || sampleCount,
    Algorithm_version: log.algorithm_version || AlgorithmOnly.ALGO_VERSION,
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
  persistPredictionFeed(gameId, rows);
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
    const recent = buildRecentPredictionRecords(id, 5);
    const latest = recent[0] || null;
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
      du_doan_hien_tai: latest ? latest.du_doan : null,
      du_doan_icon: latest ? latest.icon : '⏳',
      ti_le_hien_tai: latest ? latest.do_tin_cay : null,
      recent_predictions: recent,
      predict: `/${id}`
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
    id: IDOL, name: 'PRED-API', version: '4.5.0', algorithm_version: AlgorithmOnly.ALGO_VERSION, time: nowVN(),
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
<meta name="theme-color" content="#10151b"><title>PRED-API · Tổng quan</title>
<style>
:root{color-scheme:dark;--bg:#10151b;--panel:#171f28;--panel2:#1b2530;--line:#2a3743;--text:#e8eef3;--muted:#92a1ae;--green:#75c9a4;--red:#e58d8d;--amber:#e1bd79;--blue:#91b9df}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{font:inherit}
main{max-width:1440px;margin:0 auto;padding:24px 20px 42px}.top{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:20px}.brand{font-size:22px;font-weight:750;letter-spacing:.2px}.version{font-size:11px;color:var(--muted);font-weight:500;margin-left:7px}.sub{font-size:12px;color:var(--muted);margin-top:3px}.topright{display:flex;align-items:center;gap:12px}.stamp{font-size:11px;color:var(--muted);text-align:right}.refresh{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:8px 12px;border-radius:6px;cursor:pointer}.refresh:hover{border-color:#506477}
.summary{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:9px}.metric{background:var(--panel);border:1px solid var(--line);padding:12px 13px;min-width:0;border-radius:7px}.num{font-size:22px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap}.metric small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.sectionbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:24px 0 10px}.section{font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.7px;text-transform:uppercase}.filters{display:flex;gap:5px;flex-wrap:wrap}.filter{background:transparent;border:1px solid var(--line);color:var(--muted);padding:5px 10px;border-radius:5px;font-size:11px;cursor:pointer}.filter.active{background:#263544;color:var(--text);border-color:#506477}
.games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.game{background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:14px;min-width:0}.ghead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.gname{font-weight:700;font-size:14px;min-width:0}.gsub{font-size:10px;color:var(--muted);margin-top:3px}.status{flex:none;font-size:10px;border:1px solid var(--line);border-radius:4px;padding:3px 7px;color:var(--muted);white-space:nowrap}.status.online{color:var(--green);border-color:#345c4c}.status.learning,.status.pending{color:var(--amber);border-color:#655638}.status.error{color:var(--red);border-color:#6a4141}.status.protected{color:var(--blue);border-color:#425b74}
.forecast{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;margin-top:12px;background:var(--panel2);border:1px solid var(--line);border-radius:5px}.forecast-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.55px}.forecast-value{font-size:21px;font-weight:750;margin-top:2px}.confidence{text-align:right;font-variant-numeric:tabular-nums}.confidence b{font-size:18px}.confidence small{display:block;color:var(--muted);font-size:10px}.progress{height:4px;background:#293641;overflow:hidden;border-radius:4px;margin:12px 0 5px}.bar{height:100%;background:var(--blue)}.sample{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:13px}.stat{border-top:1px solid var(--line);padding-top:8px;min-width:0}.stat b{display:block;font-size:16px;font-variant-numeric:tabular-nums}.stat span{display:block;color:var(--muted);font-size:10px;margin-top:1px}.wins{color:var(--green)}.losses{color:var(--red)}.rate{color:var(--blue)}.recent{margin-top:12px;border-top:1px solid var(--line);padding-top:9px}.recent-title{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}.record{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;font-size:11px}.record+.record{border-top:1px solid rgba(42,55,67,.55)}.record-detail{min-width:0;flex:1}.record-main{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.record-pattern{display:block;color:var(--muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.record-sub{color:var(--muted)}.mark{font-size:14px}.error-text{color:var(--red);font-size:10px;margin-top:9px;overflow-wrap:anywhere}.empty{padding:28px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:7px}.footer{margin-top:16px;color:var(--muted);font-size:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media(max-width:1100px){.summary{grid-template-columns:repeat(4,minmax(0,1fr))}.games{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){main{padding:16px 11px 28px}.top{align-items:flex-start}.brand{font-size:19px}.topright{align-items:flex-end;flex-direction:column;gap:6px}.summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.metric{padding:10px}.num{font-size:20px}.games{grid-template-columns:1fr;gap:8px}.game{padding:12px}.sectionbar{align-items:flex-start;flex-direction:column;margin-top:20px}.filters{width:100%}.filter{flex:1}.forecast{padding:10px}.forecast-value{font-size:20px}}
</style></head><body><main>
<header class="top"><div><div class="brand">PRED-API <span class="version">v4.5.0 · LIVE OVERVIEW</span></div><div class="sub">Toàn cảnh hệ thống · dự đoán · kết quả · độ chính xác</div></div><div class="topright"><div class="stamp" id="updated">Đang tải dữ liệu…</div><button class="refresh" id="refresh" type="button">↻ Làm mới</button></div></header>
<section class="summary" id="summary"><div class="metric"><div class="num">—</div><small>Đang tải dữ liệu</small></div></section>
<div class="sectionbar"><div class="section">Tình trạng từng game</div><div class="filters"><button class="filter active" data-filter="all">Tất cả</button><button class="filter" data-filter="online">Đang chạy</button><button class="filter" data-filter="learning">Đang học</button><button class="filter" data-filter="error">Lỗi API</button></div></div>
<section class="games" id="games"><div class="empty">Đang tải danh sách game…</div></section>
<footer class="footer"><span>✅ Đúng · ❌ Sai · ⏳ Đang chờ · ➖ Phiên bỏ qua</span><span>API tự cập nhật định kỳ · dữ liệu lịch sử chỉ hiển thị 2 phiên gần nhất trong JSON</span></footer>
</main><script>
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText={online:'Đang chạy',learning:'Đang học',pending:'Chờ dữ liệu',protected:'Tạm dừng',error:'Lỗi API'};let gamesCache=[];let activeFilter='all';
function recordHtml(r){const status=r&&r.icon?r.icon:'⏳';const from=(r&&r.phien!=null)?'#'+r.phien:'—';const target=(r&&r.phien_du_doan!=null)?'#'+r.phien_du_doan:'—';const outcome=(r&&r.ket_qua)||'—';const side=(r&&r.du_doan)||'—';const rate=(r&&r.do_tin_cay)||'—';const pattern=(r&&r.pattern)||'Không rõ cầu';return '<div class="record"><div class="record-detail"><span class="record-main">'+esc(from)+' → '+esc(target)+' · '+esc(outcome)+' → '+esc(side)+' · '+esc(rate)+'</span><small class="record-pattern">'+esc(pattern)+'</small></div><b class="mark">'+status+'</b></div>'; }
function render(){const selected=gamesCache.filter(g=>activeFilter==='all'||g.status===activeFilter||(activeFilter==='learning'&&g.status==='pending'));if(!selected.length){$('games').innerHTML='<div class="empty">Không có game thuộc bộ lọc này.</div>';return;}
$('games').innerHTML=selected.map(g=>{const s=g.thong_ke||{};const n=Math.max(0,Math.min(100,100*Number(g.sample_size||0)/Math.max(1,Number(g.required_samples||15))));const recent=Array.isArray(g.recent_predictions)?g.recent_predictions:[];const prediction=g.du_doan_hien_tai||'Chưa sẵn sàng';const confidence=g.ti_le_hien_tai||'—';return '<article class="game"><div class="ghead"><div><div class="gname">'+esc(g.name)+'</div><div class="gsub">'+esc(g.game)+'</div></div><span class="status '+esc(g.status)+'">'+(statusText[g.status]||'Chưa rõ')+'</span></div><div class="forecast"><div><div class="forecast-label">Dự đoán mới nhất</div><div class="forecast-value">'+esc(prediction)+'</div></div><div class="confidence"><b>'+esc(confidence)+'</b><small>Chỉ số tín hiệu</small></div></div><div class="progress"><div class="bar" style="width:'+n+'%"></div></div><div class="sample"><span>Dữ liệu '+Number(g.sample_size||0)+' / '+Number(g.required_samples||15)+' phiên</span><span>'+g.du_doan_icon+'</span></div><div class="stats"><div class="stat"><b class="wins">'+Number(s.dung||0)+'</b><span>✅ Đúng</span></div><div class="stat"><b class="losses">'+Number(s.sai||0)+'</b><span>❌ Sai</span></div><div class="stat"><b>'+Number(s.dang_cho||0)+'</b><span>Chờ</span></div><div class="stat"><b class="rate">'+esc(s.ti_le||'—')+'</b><span>Tỉ lệ đúng</span></div></div><div class="recent"><div class="recent-title">5 dự đoán gần nhất</div>'+(recent.length?recent.map(recordHtml).join(''):'<div class="record"><span class="record-sub">Chưa có bản ghi</span><span>—</span></div>')+'</div>'+(g.error?'<div class="error-text">'+esc(g.error)+'</div>':'')+'</article>';}).join('');}
async function load(){const btn=$('refresh');btn.disabled=true;try{const r=await fetch('/overview',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();$('updated').textContent='Cập nhật: '+(d.time||'—');const t=d.thong_ke_tong||{};const rate=t.ti_le_dung==null?'—':t.ti_le_dung+'%';const metrics=[[d.total_games||0,'Tổng game'],[d.online||0,'Đang chạy'],[d.learning||0,'Đang học'],[d.offline||0,'Lỗi API'],[t.tong||0,'Lượt dự đoán'],[t.dung||0,'Đúng'],[t.sai||0,'Sai'],[rate,'Tỉ lệ đúng']];$('summary').innerHTML=metrics.map(([v,l])=>'<div class="metric"><div class="num">'+esc(v)+'</div><small>'+l+'</small></div>').join('');gamesCache=Array.isArray(d.games)?d.games:[];render();}catch(e){$('updated').textContent='Không tải được dữ liệu';$('games').innerHTML='<div class="empty">Lỗi tải tổng quan: '+esc(e.message)+'</div>';}finally{btn.disabled=false;}}
document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{activeFilter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('active',el===btn));render();}));$('refresh').addEventListener('click',load);load();setInterval(load,15000);
</script></body></html>`;

app.get('/overview', (_req, res) => res.json(buildOverview()));
app.get('/', (req, res) => {
  const accept = String(req && req.headers && req.headers.accept || '');
  if (accept.includes('text/html')) return res.type('html').send(DASHBOARD_HTML);
  return res.json(buildOverview());
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, id: IDOL, version: '4.5.0', time: nowVN(), games: Object.keys(GAMES).length, min_history_sessions: MIN_HISTORY_SESSIONS, algorithm_version: AlgorithmOnly.ALGO_VERSION });
});

app.get('/games', (_req, res) => {
  const list = Object.entries(GAMES).map(([id, game]) => ({
    id: IDOL,
    game: id,
    label: game.label,
    type: game.type,
    predict: `/${id}`,
    status: lastStatus[id] && lastStatus[id].ok === true
      ? (lastStatus[id].mode === 'protected' ? 'protected' : 'online')
      : lastStatus[id] && lastStatus[id].ok === false ? 'error'
        : lastStatus[id] && lastStatus[id].mode === 'learning' ? 'learning' : 'pending',
    sample_size: lastStatus[id] && lastStatus[id].samples || 0,
    required_samples: MIN_HISTORY_SESSIONS
  }));
  res.json({ id: IDOL, ok: true, total: list.length, min_history_sessions: MIN_HISTORY_SESSIONS, games: list });
});

// Compact prediction log embedded in each prediction response. The source and
// scoring logs stay private so the learning engine can retain its training data.
function compactPatternLabel(value) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!text || text.length > 58 || /đang nạp lịch sử|chưa đủ dữ liệu/i.test(text)) return 'Không rõ cầu';
  return text;
}

function sessionValue(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : value;
}

function sourceRowForPrediction(entry, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (entry && entry.source_phien != null) {
    const match = list.find(row => String(row.session) === String(entry.source_phien));
    if (match) return match;
    return {
      session: entry.source_phien,
      side: parseKetQua(entry.source_result),
      sideSource: entry.source_result === 'Bộ ba' ? 'triple' : 'stored',
      dice: Array.isArray(entry.source_dice) ? entry.source_dice : [],
      vi: entry.source_vi || null
    };
  }

  const target = String(entry && entry.phien != null ? entry.phien : '');
  const targetIndex = list.findIndex(row => String(row.session) === target);
  if (targetIndex >= 0 && list[targetIndex + 1]) return list[targetIndex + 1];
  if (list[0] && String(nextSessionOf(list[0])) === target) return list[0];

  if (/^\d+$/.test(target)) {
    try {
      const previous = (BigInt(target) - 1n).toString();
      return list.find(row => String(row.session) === previous) || null;
    } catch (_) {}
  }
  return null;
}

function compareFeedRows(a, b) {
  const left = String(a && a.phien_du_doan != null ? a.phien_du_doan : '');
  const right = String(b && b.phien_du_doan != null ? b.phien_du_doan : '');
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    try {
      const aa = BigInt(left), bb = BigInt(right);
      return aa > bb ? -1 : aa < bb ? 1 : 0;
    } catch (_) {}
  }
  return right.localeCompare(left);
}

function buildPredictionFeedRecords(gameId, rows, limit = FEED_LIMIT) {
  const game = GAMES[gameId] || { type: 'tx' };
  const stored = Array.isArray(predictionFeedStore[gameId]) ? predictionFeedStore[gameId] : [];
  const byTarget = new Map();
  for (const record of stored) {
    if (record && record.phien_du_doan != null && Object.prototype.hasOwnProperty.call(record, 'xuc_xac')) {
      byTarget.set(String(record.phien_du_doan), record);
    }
  }

  const logs = Array.isArray(predHistory[gameId]) ? predHistory[gameId] : [];
  for (const entry of logs) {
    if (!entry || entry.phien == null || entry.risk_pause === true || !entry.du_doan) continue;
    const source = sourceRowForPrediction(entry, rows);
    const sourceResult = entry.source_result || (source && source.side
      ? sideLabel(source.side)
      : source && source.sideSource === 'triple' ? 'Bộ ba' : null);
    const sourceDice = Array.isArray(entry.source_dice) && entry.source_dice.length
      ? entry.source_dice
      : source && Array.isArray(source.dice) ? source.dice : [];
    const confidence = Number(entry.conf);
    let icon = '⏳';
    if (entry.void === true) icon = '➖';
    else if (entry.ok === true) icon = '✅';
    else if (entry.ok === false) icon = '❌';

    const record = {
      id: IDOL,
      phien: sessionValue(entry.source_phien != null ? entry.source_phien : (source && source.session)),
      ket_qua: sourceResult,
      xuc_xac: sourceDice,
      phien_du_doan: sessionValue(entry.phien),
      du_doan: entry.du_doan,
      do_tin_cay: Number.isFinite(confidence) ? `${Number.isInteger(confidence) ? confidence : Number(confidence.toFixed(1))}%` : null,
      pattern: compactPatternLabel(entry.pattern || entry.the_cau || entry.theCau),
      icon
    };
    // Keep the output schema identical across game types. Xóc Đĩa uses its
    // four red/white pieces in xuc_xac; TX games use their three dice values.
    if (game.type === 'xocdia' && !record.xuc_xac.length && source && source.vi) {
      record.xuc_xac = [source.vi];
    }
    byTarget.set(String(entry.phien), record);
  }

  const sorted = Array.from(byTarget.values()).sort(compareFeedRows);
  const count = Math.max(0, Math.min(FEED_LIMIT, Number(limit) || FEED_LIMIT));
  return sorted.slice(0, count);
}

function persistPredictionFeed(gameId, rows) {
  predictionFeedStore[gameId] = buildPredictionFeedRecords(gameId, rows, FEED_LIMIT);
  saveCompactJSON('prediction_feed.json', predictionFeedStore);
  return predictionFeedStore[gameId];
}

function buildRecentPredictionRecords(gameId, limit = 5) {
  const rows = sourceCache[gameId] || loadJSON(sourceFile(gameId), []);
  return buildPredictionFeedRecords(gameId, rows, limit);
}

app.get('/:brand/:table', async (req, res) => {
  const gameId = `${req.params.brand}/${req.params.table}`;
  if (!GAMES[gameId]) {
    return res.status(404).json({ ok: false, error: 'Game không tồn tại', tip: 'Xem GET / hoặc GET /games' });
  }
  try {
    await runPredict(gameId);
    const records = persistPredictionFeed(gameId, sourceCache[gameId] || []);
    res.set('Cache-Control', 'no-store').json(records);
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
    console.log(`PRED-API v4.5.0 on :${PORT}`);
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
  settlePredictionLogs, pushPredLog, buildRecentPredictionRecords, buildPredictionFeedRecords, persistPredictionFeed, fetchGame, runPredict, expandEmbeddedCauRows,
  consecutiveLossState, getGamePredictionStats, buildOverview, DASHBOARD_HTML,
  _state: { engines, predHistory, predictionFeedStore, lastStatus, sourceCache, recentOk }
};
