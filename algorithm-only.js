"use strict";

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

const ALGO_VERSION = "v8.0_meanrev_adaptive_chop_extracted";
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
  'virtual_organic_chaos': 1.0
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
  if (stats.recentResults.length >= 5) {
    if (recentAccuracy > 0.6) newWeight = Math.min(2.0, oldWeight * 1.05);
    else if (recentAccuracy < 0.4) newWeight = Math.max(0.3, oldWeight * 0.95);
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
    'Random Ảo Hữu Cơ': 'virtual_organic_chaos'
  };
  for (const [label, id] of Object.entries(mapping)) {
    if (name.includes(label)) return id;
  }
  return null;
}

function generateVirtualOrganicChaos(results, type) {
  const weight = getPatternWeight(type, 'virtual_organic_chaos');
  const entropySeed = Math.sin(Date.now() * Math.random()) * 10000;
  const fractional = entropySeed - Math.floor(entropySeed);

  const recent10 = results.slice(0, 10);
  const taiCount = recent10.filter(r => r === 'Tài').length;
  const naturalBias = taiCount >= 6 ? 'Xỉu' : (taiCount <= 4 ? 'Tài' : (fractional > 0.5 ? 'Tài' : 'Xỉu'));
  const organicConfidence = Math.floor(52 + (fractional * 32));

  return {
    detected: true,
    prediction: naturalBias,
    confidence: Math.round(organicConfidence * weight),
    name: `Random Ảo Hữu Cơ (${naturalBias} - ${organicConfidence}%)`,
    patternId: 'virtual_organic_chaos'
  };
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

function analyzeCau22(results, type) {
  if (results.length < 6) return { detected: false };
  let pairCount = 0;
  let i = 0;
  const pattern = [];
  while (i < results.length - 1 && pairCount < 4) {
    if (results[i] === results[i + 1]) {
      pattern.push(results[i]);
      pairCount++;
      i += 2;
    } else break;
  }
  if (pairCount >= 2) {
    let isAlternating = true;
    for (let j = 1; j < pattern.length; j++) {
      if (pattern[j] === pattern[j - 1]) {
        isAlternating = false;
        break;
      }
    }
    if (isAlternating) {
      const lastPairType = pattern[pattern.length - 1];
      const weight = getPatternWeight(type, 'cau_22');
      return {
        detected: true,
        pairCount,
        prediction: oppTitle(lastPairType),
        confidence: Math.round(Math.min(12, pairCount * 3 + 3) * weight),
        name: `Cầu 2-2 (${pairCount} cặp)`,
        patternId: 'cau_22'
      };
    }
  }
  return { detected: false };
}

function analyzeCau33(results, type) {
  if (results.length < 6) return { detected: false };
  let tripleCount = 0;
  let i = 0;
  const pattern = [];
  while (i < results.length - 2) {
    if (results[i] === results[i + 1] && results[i + 1] === results[i + 2]) {
      pattern.push(results[i]);
      tripleCount++;
      i += 3;
    } else break;
  }
  if (tripleCount >= 1) {
    const currentPosition = results.length % 3;
    const lastTripleType = pattern[pattern.length - 1];
    const weight = getPatternWeight(type, 'cau_33');
    const prediction = currentPosition === 0 ? oppTitle(lastTripleType) : lastTripleType;
    return {
      detected: true,
      tripleCount,
      prediction,
      confidence: Math.round(Math.min(13, tripleCount * 4 + 5) * weight),
      name: `Cầu 3-3 (${tripleCount} bộ ba)`,
      patternId: 'cau_33'
    };
  }
  return { detected: false };
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
  if (results.length < 8) return { detected: false };
  let quadCount = 0, i = 0;
  const pattern = [];
  while (i < results.length - 3) {
    if (results[i] === results[i + 1] && results[i + 1] === results[i + 2] && results[i + 2] === results[i + 3]) {
      pattern.push(results[i]);
      quadCount++;
      i += 4;
    } else break;
  }
  if (quadCount >= 1) {
    const weight = getPatternWeight(type, 'cau_44');
    return { detected: true, prediction: oppTitle(pattern[pattern.length - 1]), confidence: Math.round(14 * weight), name: 'Cầu 4-4', patternId: 'cau_44' };
  }
  return { detected: false };
}

function analyzeCau55(results, type) {
  if (results.length < 10) return { detected: false };
  let quintCount = 0, i = 0;
  const pattern = [];
  while (i < results.length - 4) {
    if (results[i] === results[i + 1] && results[i + 1] === results[i + 2] && results[i + 2] === results[i + 3] && results[i + 3] === results[i + 4]) {
      pattern.push(results[i]);
      quintCount++;
      i += 5;
    } else break;
  }
  if (quintCount >= 1) {
    const weight = getPatternWeight(type, 'cau_55');
    return { detected: true, prediction: oppTitle(pattern[0]), confidence: Math.round(15 * weight), name: 'Cầu 5-5', patternId: 'cau_55' };
  }
  return { detected: false };
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
  if (results.length < 12) return { detected: false };
  for (let cycleLen = 2; cycleLen <= 5; cycleLen++) {
    let match = true;
    const pattern = results.slice(0, cycleLen);
    for (let i = cycleLen; i < Math.min(cycleLen * 3, results.length); i++) {
      if (results[i] !== pattern[i % cycleLen]) {
        match = false;
        break;
      }
    }
    if (match) {
      const weight = getPatternWeight(type, 'cau_chu_ky');
      return { detected: true, prediction: pattern[results.length % cycleLen], confidence: Math.round(10 * weight), name: `Cầu Chu Kỳ ${cycleLen}`, patternId: 'cau_chu_ky' };
    }
  }
  return { detected: false };
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
  const validDesc = dataDesc.map(d => ({
    ...d,
    Phien: d?.Phien ?? d?.phien ?? null,
    Ket_qua: normalizeResult(d?.Ket_qua ?? d?.ket_qua ?? d?.result)
  })).filter(d => d.Ket_qua !== null);

  if (validDesc.length === 0) {
    return {
      ready: false, prediction: null, confidence: 0,
      theCau: "Chưa có dữ liệu hợp lệ",
      khuyenNghi: "QUAN SÁT - CHỜ DỮ LIỆU", nenDanh: false,
      lyDo: "Không có kết quả Tài/Xỉu hợp lệ để phân tích",
      factors: [], allPatterns: [], detailedAnalysis: { algoVersion: ALGO_VERSION, validSamples: 0 }
    };
  }

  const last50Desc = validDesc.slice(0, 50);
  const resultsDesc = last50Desc.map(d => d.Ket_qua);
  initializePatternStats(type);

  const historyAsc = Array.isArray(options.historyAsc) && options.historyAsc.length
    ? options.historyAsc.map(s => ({
        ...s,
        resultTruyenThong: toUpperCode(s.resultTruyenThong ?? s.Ket_qua ?? s.ket_qua),
        dices: s.dices || s.dice || [s.Xuc_xac_1, s.Xuc_xac_2, s.Xuc_xac_3]
      })).filter(s => s.resultTruyenThong !== null)
    : validDesc.slice().reverse().map(d => ({
        id: d.Phien,
        resultTruyenThong: toUpperCode(d.Ket_qua),
        dices: [d.Xuc_xac_1, d.Xuc_xac_2, d.Xuc_xac_3],
        point: d.Tong
      }));

  const v8Decision = analyzeAdaptiveHybridV6(historyAsc);
  const predictions = [];
  const factors = [];
  const allPatterns = [];

  const v8Weight = getPatternWeight(type, v8Decision.patternId);
  predictions.push({
    prediction: v8Decision.pickTitle,
    confidence: Math.round(v8Decision.confidence * v8Weight),
    priority: 25, name: v8Decision.theCau, patternId: v8Decision.patternId
  });
  factors.push(v8Decision.theCau);
  allPatterns.push({
    detected: true, prediction: v8Decision.pickTitle,
    confidence: v8Decision.confidence, name: v8Decision.theCau,
    patternId: v8Decision.patternId
  });

  // This random component exists in the supplied source but is disabled by
  // default: time/random-based votes are not reproducible evidence.
  if (options.includeExperimentalRandomSignal === true) {
    const organicChaos = generateVirtualOrganicChaos(resultsDesc, type);
    if (organicChaos.detected) {
      predictions.push({ prediction: organicChaos.prediction, confidence: organicChaos.confidence, priority: 4, name: organicChaos.name });
      factors.push(organicChaos.name);
      allPatterns.push(organicChaos);
    }
  }

  const parityMode = options.gameType === "xocdia";
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
      () => (options.diceModel === "hu" ? analyzeDiceTrendLineHu(last50Desc, type) : analyzeDiceTrendLineMd5(last50Desc, type))
    ])
  ];

  for (const fn of secondaryAnalyzers) {
    const res = fn();
    if (res && res.detected && (res.prediction === "Tài" || res.prediction === "Xỉu")) {
      predictions.push({ prediction: res.prediction, confidence: res.confidence, priority: 6, name: res.name, patternId: res.patternId });
      factors.push(res.name);
      allPatterns.push(res);
    }
  }

  const taiVotes = predictions.filter(p => p.prediction === "Tài");
  const xiuVotes = predictions.filter(p => p.prediction === "Xỉu");
  const taiScore = taiVotes.reduce((sum, p) => sum + p.confidence * p.priority, 0);
  const xiuScore = xiuVotes.reduce((sum, p) => sum + p.confidence * p.priority, 0);

  let finalPrediction = v8Decision.pickTitle;
  if (!v8Decision.shouldBet && Math.abs(taiScore - xiuScore) > 120) {
    finalPrediction = taiScore >= xiuScore ? "Tài" : "Xỉu";
  }

  const currentStreak = Number(options.currentStreak ?? 0);
  if (currentStreak <= -5) finalPrediction = oppTitle(finalPrediction);

  const sameSideVotes = finalPrediction === "Tài" ? taiVotes.length : xiuVotes.length;
  const agreementBonus = Math.round((sameSideVotes / Math.max(1, predictions.length)) * 6);
  const jitter = options.allowRandomJitter === true ? Math.floor(Math.random() * 3) - 1 : 0;
  const finalConfidence = v8Decision.shouldBet
    ? Math.max(58, Math.min(82, v8Decision.confidence + agreementBonus + jitter))
    : 50;

  let khuyenNghi = v8Decision.khuyenNghi;
  let nenDanh = v8Decision.shouldBet;
  const cooldown = Math.max(0, Number(options.inCooldown || 0));
  if (cooldown > 0) {
    khuyenNghi = `COOLDOWN (${cooldown} phiên)`;
    nenDanh = false;
  }

  return {
    ready: historyAsc.length >= MIN_HISTORY,
    prediction: finalPrediction,
    confidence: finalConfidence,
    theCau: v8Decision.theCau,
    khuyenNghi,
    nenDanh,
    lyDo: v8Decision.reason,
    factors,
    allPatterns,
    detailedAnalysis: {
      algoVersion: ALGO_VERSION,
      totalPatterns: predictions.length,
      taiVotes: taiVotes.length,
      xiuVotes: xiuVotes.length,
      taiScore,
      xiuScore,
      topPattern: v8Decision.theCau,
      validSamples: historyAsc.length,
      learningProfile: String(type)
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

module.exports = {
  ALGO_VERSION,
  MIN_HISTORY,
  DEFAULT_PATTERN_WEIGHTS,
  calculateAdvancedPrediction,
  analyzeAdaptiveHybridV6,
  runsOf,
  updatePatternPerformance,
  learnFromSettledPrediction,
  getPatternWeight,
  setPatternWeight,
  getPatternIdFromName,
  getAlgorithmLearningState,
  setAlgorithmLearningState,
  resetAlgorithmLearning
};
