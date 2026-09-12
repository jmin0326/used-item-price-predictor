import React, { useMemo, useState } from "react";
import * as math from "mathjs";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import {
  Tag,
  Calendar,
  Gauge,
  PackageCheck,
  Search,
  Eye,
  Receipt,
  TrendingDown,
} from "lucide-react";

/* =========================================================================
   1. 도메인 상수 — 카테고리(대분류 + 소분류)
   ========================================================================= */
const CATEGORIES = [
  { key: "digital", label: "디지털/가전", range: [80000, 2500000], decay: 1.05, floor: 0.1, pop: 1.4, elasticity: 6.4,
    subs: ["노트북", "휴대폰", "태블릿", "무선이어폰", "모니터", "키보드", "게임기", "스마트워치"] },
  { key: "fashion", label: "패션의류", range: [15000, 400000], decay: 0.95, floor: 0.12, pop: 1.1, elasticity: 5.4,
    subs: ["코트", "패딩", "니트", "청바지", "원피스", "운동화", "셔츠", "가디건"] },
  { key: "bag", label: "가방/지갑", range: [20000, 900000], decay: 0.7, floor: 0.25, pop: 1.0, elasticity: 5.0,
    subs: ["백팩", "크로스백", "토트백", "지갑", "숄더백"] },
  { key: "furniture", label: "가구/인테리어", range: [30000, 1500000], decay: 0.45, floor: 0.35, pop: 0.7, elasticity: 3.6,
    subs: ["책상", "의자", "소파", "침대프레임", "조명", "수납장"] },
  { key: "book", label: "도서", range: [5000, 70000], decay: 0.35, floor: 0.3, pop: 0.8, elasticity: 3.4,
    subs: ["소설", "전공서적", "만화책", "자기계발서", "에세이"] },
  { key: "baby", label: "유아동", range: [10000, 600000], decay: 0.6, floor: 0.2, pop: 0.9, elasticity: 5.4,
    subs: ["유모차", "아기침대", "장난감", "유아복", "카시트"] },
  { key: "sports", label: "스포츠/레저", range: [20000, 1200000], decay: 0.6, floor: 0.25, pop: 0.85, elasticity: 4.6,
    subs: ["자전거", "텐트", "골프채", "요가매트", "킥보드", "등산화"] },
  { key: "beauty", label: "뷰티/미용", range: [10000, 300000], decay: 0.9, floor: 0.15, pop: 0.9, elasticity: 5.4,
    subs: ["고데기", "드라이어", "마사지기", "전동칫솔"] },
  { key: "life", label: "생활/주방", range: [10000, 700000], decay: 0.7, floor: 0.2, pop: 0.95, elasticity: 4.6,
    subs: ["전기포트", "밥솥", "청소기", "에어프라이어", "커피머신"] },
  { key: "pet", label: "반려동물", range: [10000, 400000], decay: 0.65, floor: 0.2, pop: 0.8, elasticity: 4.2,
    subs: ["캣타워", "강아지집", "자동급식기", "펫유모차"] },
];
const REFERENCE_CATEGORY = CATEGORIES[CATEGORIES.length - 1].key;
const DUMMY_CATEGORIES = CATEGORIES.filter((c) => c.key !== REFERENCE_CATEGORY);
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const CONDITIONS = [
  { score: 5, label: "새 상품 (미개봉)" },
  { score: 4, label: "거의 새 것" },
  { score: 3, label: "사용감 적음" },
  { score: 2, label: "사용감 있음" },
  { score: 1, label: "많이 사용함" },
];

const CONDITION_LABEL = { 5: "미개봉", 4: "거의 새 것", 3: "사용감 적음", 2: "사용감 있음", 1: "많이 사용" };

const BRAND_WORDS = ["정품", "국내", "한정판", "새제품급", "인기", "가성비", "프리미엄", "베이직", "클래식", "미니"];

/* =========================================================================
   2. 시드 난수 + 판매완료 샘플 데이터 생성
   ========================================================================= */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function usageLabel(days) {
  if (days < 1) return "미사용";
  if (days < 30) return `구매 ${days}일`;
  if (days < 365) return `${Math.round(days / 30.44)}개월 사용`;
  const y = Math.floor(days / 365);
  const m = Math.round((days % 365) / 30.44);
  return m > 0 ? `${y}년 ${m}개월 사용` : `${y}년 사용`;
}
function defectLabel(level) {
  if (level === 0) return "하자 없음";
  if (level <= 3) return "경미한 하자";
  if (level <= 6) return "하자 있음";
  return "하자 심함";
}

function generateDataset(rng, nPerCategory) {
  const rows = [];
  let id = 1;
  for (const cat of CATEGORIES) {
    for (let i = 0; i < nPerCategory; i++) {
      const originalPrice =
        Math.round((cat.range[0] + rng() * (cat.range[1] - cat.range[0])) / 1000) * 1000;
      const usageDays = Math.round(rng() * 1460);
      const usageMonths = usageDays / 30.44;
      const conditionScore = 1 + Math.floor(rng() * 5);
      const dr = rng();
      const defectLevel = dr < 0.55 ? 0 : Math.round(((dr - 0.55) / 0.45) * 10);
      const hasAccessories = rng() > 0.5 ? 1 : 0;
      const sub = cat.subs[Math.floor(rng() * cat.subs.length)];
      const brand = BRAND_WORDS[Math.floor(rng() * BRAND_WORDS.length)];

      // 이론 시세(fair price): 노이즈 없는 그 물건의 객관적 가치
      let fair = cat.floor + (1 - cat.floor) * Math.exp((-cat.decay * usageMonths) / 12);
      fair *= 0.72 + 0.056 * conditionScore;
      fair *= 1 - 0.028 * defectLevel;
      fair *= hasAccessories ? 1.04 : 1;
      fair = Math.min(Math.max(fair, 0.05), 1.0);
      const fairPrice = originalPrice * fair;

      // 실제 판매가는 시세 주변에서 흔들림 (판매자마다 더 받기도, 급처하기도)
      const soldPrice =
        Math.round(
          Math.min(
            Math.max(fairPrice * (1 + gaussian(rng) * 0.12), originalPrice * 0.03),
            originalPrice * 1.05
          ) / 100
        ) * 100;

      // 조회수 규칙: "시세 대비 얼마나 비싸게 불렀나(premium)"에 반응. 카테고리마다 민감도가 다름
      const premium = soldPrice / fairPrice;
      let views =
        cat.pop * 110 *
        Math.exp(-cat.elasticity * (premium - 1)) *
        (0.6 + 0.09 * conditionScore) *
        (hasAccessories ? 1.1 : 1) *
        (1 - 0.02 * defectLevel) *
        Math.exp(-usageMonths / 40);
      views *= Math.exp(gaussian(rng) * 0.2);
      views = Math.max(1, Math.round(views));

      rows.push({
        id: id++,
        category: cat.key,
        categoryLabel: cat.label,
        sub,
        title: `${brand} ${sub}`,
        originalPrice,
        usageDays,
        usageMonths,
        conditionScore,
        defectLevel,
        hasAccessories,
        soldPrice,
        views,
      });
    }
  }
  return rows;
}

/* =========================================================================
   3. 특징 엔지니어링 + 두 개의 선형회귀 (가격 / 조회수)
   ========================================================================= */
function standardize(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}
function ridge(X, y, lambda) {
  const p = X[0].length;
  const Xt = math.transpose(X);
  const XtX = math.multiply(Xt, X);
  const reg = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => (i === j && i !== 0 ? lambda : 0))
  );
  return math.multiply(math.inv(math.add(XtX, reg)), math.multiply(Xt, y));
}
function r2score(actual, pred) {
  const m = actual.reduce((a, b) => a + b, 0) / actual.length;
  const ssTot = actual.reduce((a, y) => a + (y - m) ** 2, 0);
  const ssRes = actual.reduce((a, y, i) => a + (y - pred[i]) ** 2, 0);
  return 1 - ssRes / ssTot;
}

// ★ 감가율(판매가/정가)을 예측한다. 원 단위 대신 비율을 맞춰야
//    5천원짜리 책과 250만원짜리 노트북을 하나의 식으로 다룰 수 있다.
function ratioFeatureRow(r, stats) {
  const zMonths = (r.usageMonths - stats.usageMonths.mean) / stats.usageMonths.std;
  const zCond = (r.conditionScore - stats.conditionScore.mean) / stats.conditionScore.std;
  const zLogPrice = (Math.log(r.originalPrice) - stats.logPrice.mean) / stats.logPrice.std;
  const years = r.usageMonths / 12;
  const decayFast = Math.exp(-years);        // 비선형 감가항 (초기 급락)
  const decaySlow = Math.exp(-0.4 * years);  // 비선형 감가항 (완만한 감가)
  const dummies = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? 1 : 0));
  const interMonths = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? zMonths : 0));
  const interFast = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? decayFast : 0));
  const interSlow = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? decaySlow : 0));
  return [1, zMonths, zCond, decayFast, decaySlow, r.defectLevel / 10, r.hasAccessories,
    zLogPrice, ...dummies, ...interMonths, ...interFast, ...interSlow];
}

// ★ 조회수는 "정가 대비"가 아니라 "시세가 대비 프리미엄"에 반응한다.
//    premium = 내가 부를 가격 / 이 물건의 시세가
function viewsFeatureRow(r, stats, listPrice, marketPrice) {
  const zMonths = (r.usageMonths - stats.usageMonths.mean) / stats.usageMonths.std;
  const zCond = (r.conditionScore - stats.conditionScore.mean) / stats.conditionScore.std;
  const premium = listPrice / Math.max(marketPrice, 1);
  const dummies = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? 1 : 0));
  return [1, premium, zMonths, zCond, r.defectLevel / 10, r.hasAccessories, ...dummies];
}

// 2단계 학습: (1) 감가율 모델로 시세가를 구하고 → (2) 그 시세가 기준으로 조회수 모델을 학습
function trainModels(dataset) {
  const stats = {
    usageMonths: standardize(dataset.map((r) => r.usageMonths)),
    conditionScore: standardize(dataset.map((r) => r.conditionScore)),
    logPrice: standardize(dataset.map((r) => Math.log(r.originalPrice))),
  };

  // (1) 감가율 회귀
  const Xr = dataset.map((r) => ratioFeatureRow(r, stats));
  const yr = dataset.map((r) => r.soldPrice / r.originalPrice);
  const betaRatio = ridge(Xr, yr, 0.5);
  const priceR2 = r2score(yr, Xr.map((row) => math.dot(row, betaRatio)));

  const partial = { stats, betaRatio };
  const marketPrices = dataset.map((r) => predictPrice(partial, r));

  // (2) 조회수 회귀 (시세가 대비 프리미엄 기준)
  const Xv = dataset.map((r, i) => viewsFeatureRow(r, stats, r.soldPrice, marketPrices[i]));
  const yv = dataset.map((r) => Math.log(r.views));
  const betaViews = ridge(Xv, yv, 0.3);
  const viewsR2 = r2score(yv, Xv.map((row) => math.dot(row, betaViews)));

  return { stats, betaRatio, betaViews, priceR2, viewsR2, n: dataset.length };
}

function predictPrice(model, input) {
  const raw = math.dot(ratioFeatureRow(input, model.stats), model.betaRatio);
  const ratio = Math.min(Math.max(raw, 0.03), 1.05);
  return Math.round((input.originalPrice * ratio) / 100) * 100;
}
function predictViews(model, input, listPrice, marketPrice) {
  const logV = math.dot(viewsFeatureRow(input, model.stats, listPrice, marketPrice), model.betaViews);
  return Math.max(0, Math.round(Math.exp(logV)));
}

/* =========================================================================
   4. UI 헬퍼
   ========================================================================= */
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const manwon = (n) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString("ko-KR")}만` : `${n}`);

/* =========================================================================
   5. 메인 컴포넌트
   ========================================================================= */
export default function UsedMarketPredictor() {
  const { dataset, model } = useMemo(() => {
    const rng = mulberry32(20260902);
    const ds = generateDataset(rng, 22);
    return { dataset: ds, model: trainModels(ds) };
  }, []);

  // ---- 감정 입력 상태 ----
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [originalPrice, setOriginalPrice] = useState("500000");
  const [usageMonths, setUsageMonths] = useState("12");
  const [conditionScore, setConditionScore] = useState(4);
  const [defectLevel, setDefectLevel] = useState(0);
  const [hasAccessories, setHasAccessories] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleAppraise = () => {
    const priceNum = Number(originalPrice);
    const monthsNum = Number(usageMonths);
    if (!priceNum || priceNum <= 0) {
      setError("정가를 1원 이상으로 입력해 주세요.");
      setResult(null);
      return;
    }
    if (monthsNum < 0 || monthsNum > 240) {
      setError("사용기간은 0~240개월 사이로 입력해 주세요.");
      setResult(null);
      return;
    }
    setError("");
    const input = {
      category,
      originalPrice: priceNum,
      usageMonths: monthsNum,
      conditionScore,
      defectLevel,
      hasAccessories: hasAccessories ? 1 : 0,
    };
    const recommended = predictPrice(model, input);

    // 가격 스윕 → 조회수 곡선 + 기대수익(가격x조회수) 최댓값 탐색
    // 범위는 시세가 기준 0.5배 ~ 1.6배 (정가는 넘지 않게)
    const lo = recommended * 0.5;
    const hi = Math.min(priceNum * 1.05, recommended * 1.6);
    const steps = 60;
    const curve = [];
    let best = null;
    for (let i = 0; i <= steps; i++) {
      const p = lo + ((hi - lo) * i) / steps;
      const price = Math.round(p / 100) * 100;
      const views = predictViews(model, input, price, recommended);
      const revenue = price * views;
      curve.push({ price, views, revenue });
      if (!best || revenue > best.revenue) best = { price, views, revenue };
    }
    const recViews = predictViews(model, input, recommended, recommended);
    setResult({
      recommended,
      curve,
      recViews,
      ratio: (recommended / priceNum) * 100,
      optimal: best,
      optimalRatio: (best.price / priceNum) * 100,
      optimalVsMarket: (best.price / recommended - 1) * 100,
    });
  };

  // ---- 마켓 필터 상태 ----
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sortBy, setSortBy] = useState("views");
  const [visible, setVisible] = useState(12);

  const filtered = useMemo(() => {
    const q = search.trim();
    let list = dataset.filter((item) => {
      if (filterCat !== "all" && item.category !== filterCat) return false;
      if (q) {
        const hay = `${item.title} ${item.sub} ${item.categoryLabel}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortBy === "views") list = [...list].sort((a, b) => b.views - a.views);
    else if (sortBy === "recent") list = [...list].sort((a, b) => a.usageDays - b.usageDays);
    else if (sortBy === "priceLow") list = [...list].sort((a, b) => a.soldPrice - b.soldPrice);
    else if (sortBy === "priceHigh") list = [...list].sort((a, b) => b.soldPrice - a.soldPrice);
    return list;
  }, [dataset, search, filterCat, sortBy]);

  const shown = filtered.slice(0, visible);

  return (
    <div
      style={{
        "--paper": "#EDEFE6",
        "--card": "#F7F8F1",
        "--ink": "#1F2A22",
        "--ink-soft": "#54604F",
        "--line": "#B9C2AC",
        "--stamp": "#B5442E",
        "--gold": "#A98545",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "'IBM Plex Sans KR', sans-serif",
        minHeight: "100%",
        padding: "28px 16px 56px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap');
        .mono { font-family: 'Nanum Gothic Coding', monospace; }
        .ledger-input {
          width: 100%; background: transparent; border: none;
          border-bottom: 1px solid var(--line); padding: 6px 2px;
          font-size: 15px; color: var(--ink); outline: none;
          font-family: 'IBM Plex Sans KR', sans-serif; box-sizing: border-box;
        }
        .ledger-input:focus { border-bottom: 1px solid var(--stamp); }
        .field-label { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink-soft); margin-bottom:6px; }
        .stamp-btn {
          background: var(--stamp); color: #F7F1E6; border: none; padding: 12px 20px;
          font-size: 15px; font-weight: 700; cursor: pointer; letter-spacing: 0.02em;
          font-family: 'IBM Plex Sans KR', sans-serif; width: 100%;
          transition: background 0.15s ease;
        }
        .stamp-btn:hover { background: #9E3B29; }
        .checkline { display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer; user-select:none; }
        .chip {
          border: 1px solid var(--line); background: transparent; color: var(--ink-soft);
          padding: 5px 12px; font-size: 12.5px; cursor: pointer; border-radius: 2px;
          font-family: 'IBM Plex Sans KR', sans-serif; white-space: nowrap;
        }
        .chip.active { background: var(--ink); color: var(--card); border-color: var(--ink); }
        .prod-card {
          border: 1px solid var(--line); background: var(--card); padding: 14px 16px;
          display: flex; flex-direction: column; gap: 7px; position: relative;
        }
        .sold-badge {
          position: absolute; top: 10px; right: 10px; font-size: 10.5px; font-weight: 700;
          color: var(--stamp); border: 1px solid var(--stamp); border-radius: 2px;
          padding: 1px 6px; transform: rotate(3deg); letter-spacing: 0.03em;
        }
        .range-input { width: 100%; accent-color: var(--stamp); }
        @media (max-width: 760px) {
          .appraise-grid { grid-template-columns: 1fr !important; }
          .appraise-grid > div:first-child { border-right: none !important; border-bottom: 1px dashed var(--line); }
          .market-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 460px) {
          .market-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* ===== 헤더 ===== */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
          borderBottom: "1px solid var(--ink)", paddingBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Receipt size={22} color="var(--stamp)" strokeWidth={1.8} />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>중고마켓 시세 감정소</h1>
          </div>
          <span className="mono" style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            판매완료 {dataset.length.toLocaleString("ko-KR")}건 학습
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "10px 0 26px", maxWidth: 620 }}>
          판매완료된 샘플 거래를 선형회귀로 학습해, 내 물건의 <strong>적정 판매가</strong>와
          <strong> 가격대별 예상 조회수</strong>를 알려줍니다. 아래에서 실제 판매완료 상품들도
          둘러볼 수 있어요.
        </p>

        {/* ===== 감정 섹션 ===== */}
        <div className="appraise-grid" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr",
          border: "1px solid var(--line)", background: "var(--card)" }}>
          {/* 입력 폼 */}
          <div style={{ padding: 24, borderRight: "1px dashed var(--line)" }}>
            <div style={{ marginBottom: 18 }}>
              <div className="field-label"><Tag size={14} /> 카테고리</div>
              <select className="ledger-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="field-label"><span className="mono" style={{ fontSize: 13 }}>₩</span> 정가 (구매 당시 가격)</div>
              <input className="ledger-input" type="number" min="0" value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)} placeholder="500000" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
              <div>
                <div className="field-label"><Calendar size={14} /> 사용기간 (개월)</div>
                <input className="ledger-input" type="number" min="0" max="240" value={usageMonths}
                  onChange={(e) => setUsageMonths(e.target.value)} />
              </div>
              <div>
                <div className="field-label"><Gauge size={14} /> 상태 등급</div>
                <select className="ledger-input" value={conditionScore}
                  onChange={(e) => setConditionScore(Number(e.target.value))}>
                  {CONDITIONS.map((c) => (<option key={c.score} value={c.score}>{c.label}</option>))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="field-label" style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingDown size={14} /> 하자 정도
                </span>
                <span className="mono" style={{ color: "var(--ink)" }}>
                  {defectLevel} / 10 · {defectLabel(defectLevel)}
                </span>
              </div>
              <input className="range-input" type="range" min="0" max="10" step="1"
                value={defectLevel} onChange={(e) => setDefectLevel(Number(e.target.value))} />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label className="checkline">
                <input type="checkbox" checked={hasAccessories}
                  onChange={(e) => setHasAccessories(e.target.checked)} />
                <PackageCheck size={15} color="var(--ink-soft)" /> 부속품(박스·충전기 등) 포함
              </label>
            </div>

            {error && <p style={{ color: "var(--stamp)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="stamp-btn" onClick={handleAppraise}>감정하기</button>
          </div>

          {/* 결과 + 조회수 곡선 */}
          <div style={{ padding: 24 }}>
            {!result ? (
              <div style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.7, height: "100%",
                display: "flex", alignItems: "center" }}>
                왼쪽 항목을 입력하고 <strong>&nbsp;감정하기&nbsp;</strong>를 누르면
                적정가와 가격대별 예상 조회수 그래프가 표시됩니다.
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3 }}>시세 추천가</div>
                    <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: "var(--stamp)", lineHeight: 1.1 }}>
                      {won(result.recommended)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                      정가 대비 {result.ratio.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ borderLeft: "1px dashed var(--line)", paddingLeft: 18 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3 }}>최적 판매가 (기대수익 최대)</div>
                    <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: "var(--gold)", lineHeight: 1.1 }}>
                      {won(result.optimal.price)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      시세 대비 {result.optimalVsMarket > 0 ? "+" : ""}{result.optimalVsMarket.toFixed(1)}% · <Eye size={12} /> {result.optimal.views}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--ink-soft)", margin: "16px 0 4px", display: "flex", alignItems: "center", gap: 5 }}>
                  <Eye size={13} /> 판매가격별 예상 조회수 · 기대수익(가격×조회수)
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={result.curve} margin={{ top: 6, right: 12, bottom: 2, left: 0 }}>
                    <defs>
                      <linearGradient id="vFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#A98545" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#A98545" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#DDE0D2" />
                    <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]}
                      tickFormatter={manwon} tick={{ fontSize: 11, fill: "#54604F" }}
                      stroke="#B9C2AC" />
                    <YAxis tick={{ fontSize: 11, fill: "#54604F" }} stroke="#B9C2AC" width={34}
                      label={{ value: "조회", angle: -90, position: "insideLeft", fontSize: 10, fill: "#54604F" }} />
                    <Tooltip
                      formatter={(v, name) => (name === "views" ? [`${v} 회`, "예상 조회수"] : v)}
                      labelFormatter={(l) => won(l)}
                      contentStyle={{ fontSize: 12, border: "1px solid var(--line)" }} />
                    <Area type="monotone" dataKey="views" stroke="#A98545" strokeWidth={2} fill="url(#vFill)" />
                    <ReferenceLine x={result.recommended} stroke="#B5442E" strokeWidth={1.5} strokeDasharray="4 3"
                      label={{ value: "시세가", position: "insideTopLeft", fontSize: 10, fill: "#B5442E" }} />
                    <ReferenceLine x={result.optimal.price} stroke="#6B7A3E" strokeWidth={1.5} strokeDasharray="2 2"
                      label={{ value: "최적가", position: "insideBottomRight", fontSize: 10, fill: "#6B7A3E" }} />
                    <ReferenceDot x={result.recommended} y={result.recViews} r={4} fill="#B5442E" stroke="none" />
                    <ReferenceDot x={result.optimal.price} y={result.optimal.views} r={4} fill="#6B7A3E" stroke="none" />
                  </AreaChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--stamp)" }}>빨간 선(시세가)</strong>은 비슷한 조건 매물들이
                  실제로 팔린 가격이고, <strong style={{ color: "#6B7A3E" }}>초록 선(최적가)</strong>은
                  "가격 × 예상 조회수"가 최대가 되는 지점이에요. 조회수는 수요(관심)의 대리 지표일 뿐,
                  실제 판매 확률을 보장하지는 않아요 — 빨리 팔고 싶다면 최적가보다 낮게, 값을 더
                  받고 싶다면 시세가 쪽을 선택하세요.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ===== 마켓 섹션 ===== */}
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderBottom: "1px solid var(--ink)",
            paddingBottom: 8, marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>판매완료 상품 둘러보기</h2>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{filtered.length}건</span>
          </div>

          {/* 검색 + 정렬 */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)",
              background: "var(--card)", padding: "6px 10px", flex: "1 1 220px" }}>
              <Search size={15} color="var(--ink-soft)" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setVisible(12); }}
                placeholder="예: 책, 노트북, 자전거…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 14,
                  width: "100%", color: "var(--ink)", fontFamily: "'IBM Plex Sans KR', sans-serif" }} />
            </div>
            <select className="ledger-input" style={{ width: 150, borderBottom: "1px solid var(--line)" }}
              value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="views">조회수순</option>
              <option value="recent">사용기간 짧은순</option>
              <option value="priceLow">가격 낮은순</option>
              <option value="priceHigh">가격 높은순</option>
            </select>
          </div>

          {/* 카테고리 칩 */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
            <button className={`chip ${filterCat === "all" ? "active" : ""}`}
              onClick={() => { setFilterCat("all"); setVisible(12); }}>전체</button>
            {CATEGORIES.map((c) => (
              <button key={c.key} className={`chip ${filterCat === c.key ? "active" : ""}`}
                onClick={() => { setFilterCat(c.key); setVisible(12); }}>{c.label}</button>
            ))}
          </div>

          {/* 상품 그리드 */}
          {shown.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: "24px 0" }}>
              검색 결과가 없어요. 다른 키워드나 카테고리를 눌러보세요.
            </p>
          ) : (
            <div className="market-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {shown.map((item) => {
                const dropPct = Math.round((1 - item.soldPrice / item.originalPrice) * 100);
                return (
                  <div key={item.id} className="prod-card">
                    <span className="sold-badge">판매완료</span>
                    <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>{item.categoryLabel}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, paddingRight: 48 }}>{item.title}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--stamp)" }}>{won(item.soldPrice)}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-soft)", textDecoration: "line-through" }}>{won(item.originalPrice)}</span>
                      {dropPct > 0 && <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>▼{dropPct}%</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "var(--ink-soft)" }}>
                      <span style={{ border: "1px solid var(--line)", padding: "1px 6px" }}>{usageLabel(item.usageDays)}</span>
                      <span style={{ border: "1px solid var(--line)", padding: "1px 6px" }}>{CONDITION_LABEL[item.conditionScore]}</span>
                      <span style={{ border: "1px solid var(--line)", padding: "1px 6px",
                        color: item.defectLevel > 0 ? "var(--stamp)" : "var(--ink-soft)" }}>{defectLabel(item.defectLevel)}</span>
                      <span style={{ border: "1px solid var(--line)", padding: "1px 6px" }}>
                        {item.hasAccessories ? "부속품 O" : "부속품 X"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--ink-soft)",
                      borderTop: "1px dashed var(--line)", paddingTop: 7, marginTop: 1 }}>
                      <Eye size={13} /> 조회 <span className="mono">{item.views.toLocaleString("ko-KR")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {visible < filtered.length && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button className="chip" style={{ padding: "9px 26px", fontSize: 13.5 }}
                onClick={() => setVisible((v) => v + 12)}>
                더 보기 ({filtered.length - visible}건 남음)
              </button>
            </div>
          )}
        </div>

        {/* ===== 푸터: 모델 근거 ===== */}
        <p className="mono" style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 32,
          borderTop: "1px solid var(--line)", paddingTop: 12, lineHeight: 1.7 }}>
          가격 예측 R² {model.priceR2.toFixed(3)} · 조회수 예측 R² {model.viewsR2.toFixed(3)} ·
          두 모델 모두 판매완료 샘플 {model.n}건으로 학습한 선형회귀입니다. 학습 데이터는 실제 시세가
          아닌 규칙 기반 샘플이며, 실제 거래 CSV로 교체하면 정확도를 높일 수 있습니다.
        </p>
      </div>
    </div>
  );
}
