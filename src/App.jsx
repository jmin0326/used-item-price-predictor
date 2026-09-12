import React, { useMemo, useState } from "react";
import * as math from "mathjs";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { Tag, Calendar, Gauge, PackageCheck, AlertTriangle, Receipt } from "lucide-react";

/* =========================================================================
   1. 도메인 상수
   ========================================================================= */
const CATEGORIES = [
  { key: "electronics", label: "전자기기", range: [300000, 2000000], decay: 1.1, floor: 0.1 },
  { key: "clothing", label: "의류/신발", range: [20000, 300000], decay: 0.9, floor: 0.15 },
  { key: "furniture", label: "가구/인테리어", range: [50000, 1500000], decay: 0.45, floor: 0.35 },
  { key: "media", label: "도서/음반", range: [5000, 60000], decay: 0.35, floor: 0.3 },
  { key: "bags", label: "가방/잡화", range: [30000, 500000], decay: 0.7, floor: 0.25 },
];
const REFERENCE_CATEGORY = CATEGORIES[CATEGORIES.length - 1].key;
const DUMMY_CATEGORIES = CATEGORIES.filter((c) => c.key !== REFERENCE_CATEGORY);

const CONDITIONS = [
  { score: 5, label: "새 상품 (미개봉)" },
  { score: 4, label: "거의 새 것" },
  { score: 3, label: "사용감 적음" },
  { score: 2, label: "사용감 있음" },
  { score: 1, label: "많이 사용함" },
];

/* =========================================================================
   2. 시드 난수 + 샘플 데이터 생성 (규칙 기반)
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

function generateDataset(rng, nPerCategory) {
  const rows = [];
  for (const cat of CATEGORIES) {
    for (let i = 0; i < nPerCategory; i++) {
      const originalPrice =
        Math.round((cat.range[0] + rng() * (cat.range[1] - cat.range[0])) / 1000) * 1000;
      const usageMonths = Math.round(rng() * 48);
      const conditionScore = 1 + Math.floor(rng() * 5);
      const hasAccessories = rng() > 0.5 ? 1 : 0;
      const hasDefect = rng() > 0.85 ? 1 : 0;

      let ratio = cat.floor + (1 - cat.floor) * Math.exp((-cat.decay * usageMonths) / 12);
      ratio *= 0.65 + 0.09 * conditionScore;
      if (hasAccessories) ratio *= 1.04;
      if (hasDefect) ratio *= 0.85;
      ratio *= 1 + gaussian(rng) * 0.05;
      ratio = Math.min(Math.max(ratio, 0.05), 1.05);

      rows.push({
        category: cat.key,
        originalPrice,
        usageMonths,
        conditionScore,
        hasAccessories,
        hasDefect,
        price: Math.round((originalPrice * ratio) / 1000) * 1000,
      });
    }
  }
  return rows;
}

/* =========================================================================
   3. 특징 엔지니어링 + 다중 선형회귀 (정규방정식 + 릿지)
   ========================================================================= */
function standardize(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}

function buildFeatureRow(r, stats) {
  const zPrice = (r.originalPrice - stats.originalPrice.mean) / stats.originalPrice.std;
  const zMonths = (r.usageMonths - stats.usageMonths.mean) / stats.usageMonths.std;
  const zCond = (r.conditionScore - stats.conditionScore.mean) / stats.conditionScore.std;
  const dummies = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? 1 : 0));
  // 카테고리 x 사용기간 상호작용: 카테고리별로 감가속도가 다르다는 걸 반영
  const interactions = DUMMY_CATEGORIES.map((c) => (r.category === c.key ? zMonths : 0));
  return [1, zPrice, zMonths, zCond, r.hasAccessories, r.hasDefect, ...dummies, ...interactions];
}

function trainModel(dataset, rng) {
  const stats = {
    originalPrice: standardize(dataset.map((r) => r.originalPrice)),
    usageMonths: standardize(dataset.map((r) => r.usageMonths)),
    conditionScore: standardize(dataset.map((r) => r.conditionScore)),
  };

  const idx = dataset.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const splitAt = Math.floor(idx.length * 0.8);
  const trainIdx = idx.slice(0, splitAt);
  const testIdx = idx.slice(splitAt);

  const Xtrain = trainIdx.map((i) => buildFeatureRow(dataset[i], stats));
  const yTrain = trainIdx.map((i) => dataset[i].price);

  const p = Xtrain[0].length;
  const Xt = math.transpose(Xtrain);
  const XtX = math.multiply(Xt, Xtrain);
  const lambda = 50;
  const reg = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => (i === j && i !== 0 ? lambda : 0))
  );
  const beta = math.multiply(math.inv(math.add(XtX, reg)), math.multiply(Xt, yTrain));

  const testRows = testIdx.map((i) => dataset[i]);
  const Xtest = testRows.map((r) => buildFeatureRow(r, stats));
  const yTestActual = testRows.map((r) => r.price);
  const yTestPred = Xtest.map((row) => math.dot(row, beta));

  const meanActual = yTestActual.reduce((a, b) => a + b, 0) / yTestActual.length;
  const ssTot = yTestActual.reduce((a, y) => a + (y - meanActual) ** 2, 0);
  const ssRes = yTestActual.reduce((a, y, i) => a + (y - yTestPred[i]) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  const mae =
    yTestActual.reduce((a, y, i) => a + Math.abs(y - yTestPred[i]), 0) / yTestActual.length;
  const rmse = Math.sqrt(ssRes / yTestActual.length);

  const testPoints = testRows.map((r, i) => ({
    actual: yTestActual[i],
    predicted: Math.max(0, yTestPred[i]),
    category: CATEGORIES.find((c) => c.key === r.category).label,
  }));

  const featureImportance = [
    { name: "정가 (1 표준편차 ↑)", value: beta[1] },
    { name: "사용기간 (1 표준편차 ↑)", value: beta[2] },
    { name: "상태 등급 (1 표준편차 ↑)", value: beta[3] },
    { name: "부속품 포함", value: beta[4] },
    { name: "하자 있음", value: beta[5] },
    ...DUMMY_CATEGORIES.map((c, i) => ({ name: `${c.label} (기준가 보정)`, value: beta[6 + i] })),
    ...DUMMY_CATEGORIES.map((c, i) => ({
      name: `${c.label} 감가속도 차이`,
      value: beta[6 + DUMMY_CATEGORIES.length + i],
    })),
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return { beta, stats, r2, mae, rmse, n: dataset.length, testPoints, featureImportance };
}

function predictPrice(model, input) {
  const row = buildFeatureRow(input, model.stats);
  const raw = math.dot(row, model.beta);
  const clamped = Math.min(Math.max(raw, input.originalPrice * 0.03), input.originalPrice * 1.05);
  return Math.round(clamped / 1000) * 1000;
}

/* =========================================================================
   4. UI
   ========================================================================= */
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const manwon = (n) => `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;

export default function UsedItemPricePredictor() {
  const model = useMemo(() => {
    const rng = mulberry32(20260902);
    const dataset = generateDataset(rng, 140);
    return trainModel(dataset, rng);
  }, []);

  const [ticketNo] = useState(() => Math.floor(100000 + Math.random() * 899999));
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [originalPrice, setOriginalPrice] = useState("500000");
  const [usageMonths, setUsageMonths] = useState("12");
  const [conditionScore, setConditionScore] = useState(4);
  const [hasAccessories, setHasAccessories] = useState(true);
  const [hasDefect, setHasDefect] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [stampKey, setStampKey] = useState(0);

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
    const predicted = predictPrice(model, {
      category,
      originalPrice: priceNum,
      usageMonths: monthsNum,
      conditionScore,
      hasAccessories: hasAccessories ? 1 : 0,
      hasDefect: hasDefect ? 1 : 0,
    });
    const low = Math.max(0, Math.round((predicted - model.rmse) / 1000) * 1000);
    const high = Math.round((predicted + model.rmse) / 1000) * 1000;
    setResult({ predicted, low, high, ratio: (predicted / priceNum) * 100 });
    setStampKey((k) => k + 1);
  };

  const scatterDomain = useMemo(() => {
    const all = model.testPoints.flatMap((p) => [p.actual, p.predicted]);
    return [0, Math.max(...all) * 1.05];
  }, [model]);

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
        padding: "28px 16px 48px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap');
        .mono { font-family: 'Nanum Gothic Coding', monospace; }
        .ledger-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--line);
          padding: 6px 2px;
          font-size: 15px;
          color: var(--ink);
          outline: none;
          font-family: 'IBM Plex Sans KR', sans-serif;
        }
        .ledger-input:focus { border-bottom: 1px solid var(--stamp); }
        .field-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          color: var(--ink-soft);
          margin-bottom: 6px;
        }
        .stamp-btn {
          background: var(--stamp);
          color: #F7F1E6;
          border: none;
          padding: 12px 20px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.02em;
          font-family: 'IBM Plex Sans KR', sans-serif;
          transition: transform 0.08s ease, background 0.15s ease;
        }
        .stamp-btn:hover { background: #9E3B29; }
        .stamp-btn:active { transform: scale(0.98); }
        .checkline {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          cursor: pointer;
          user-select: none;
        }
        @keyframes stampIn {
          0% { opacity: 0; transform: scale(1.5) rotate(-8deg); }
          60% { opacity: 1; transform: scale(0.96) rotate(-2deg); }
          100% { opacity: 1; transform: scale(1) rotate(-2deg); }
        }
        .stamp-reveal { animation: stampIn 0.45s cubic-bezier(.2,.8,.3,1); }
        @media (max-width: 720px) {
          .ticket-grid { grid-template-columns: 1fr !important; }
          .ticket-grid > div:first-child { border-right: none !important; border-bottom: 1px dashed var(--line); }
          .chart-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* 헤더: 감정서 티켓 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottom: `1px solid var(--ink)`,
            paddingBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Receipt size={22} color="var(--stamp)" strokeWidth={1.8} />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>중고물품 가격 감정서</h1>
          </div>
          <span className="mono" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            No. {ticketNo}
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "10px 0 26px", maxWidth: 560 }}>
          선형회귀 모델이 규칙 기반 샘플 데이터 {model.n.toLocaleString("ko-KR")}건을 학습해
          물품 정보로부터 적정 가격을 산정합니다. 카테고리, 사용기간, 상태를 입력하면 감정가가
          나옵니다.
        </p>

        {/* 본문: 입력폼 + 결과 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 0,
            border: "1px solid var(--line)",
            background: "var(--card)",
          }}
          className="ticket-grid"
        >
          {/* 입력 폼 */}
          <div style={{ padding: 24, borderRight: "1px dashed var(--line)" }}>
            <div style={{ marginBottom: 18 }}>
              <div className="field-label">
                <Tag size={14} /> 카테고리
              </div>
              <select
                className="ledger-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="field-label">
                <span className="mono" style={{ fontSize: 13 }}>
                  ₩
                </span>
                정가 (구매 당시 가격)
              </div>
              <input
                className="ledger-input"
                type="number"
                min="0"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="500000"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
              <div>
                <div className="field-label">
                  <Calendar size={14} /> 사용기간 (개월)
                </div>
                <input
                  className="ledger-input"
                  type="number"
                  min="0"
                  max="240"
                  value={usageMonths}
                  onChange={(e) => setUsageMonths(e.target.value)}
                />
              </div>
              <div>
                <div className="field-label">
                  <Gauge size={14} /> 상태 등급
                </div>
                <select
                  className="ledger-input"
                  value={conditionScore}
                  onChange={(e) => setConditionScore(Number(e.target.value))}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.score} value={c.score}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 22, marginBottom: 22 }}>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={hasAccessories}
                  onChange={(e) => setHasAccessories(e.target.checked)}
                />
                <PackageCheck size={15} color="var(--ink-soft)" />
                부속품 포함
              </label>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={hasDefect}
                  onChange={(e) => setHasDefect(e.target.checked)}
                />
                <AlertTriangle size={15} color="var(--ink-soft)" />
                하자 있음
              </label>
            </div>

            {error && (
              <p style={{ color: "var(--stamp)", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}

            <button className="stamp-btn" onClick={handleAppraise}>
              감정하기
            </button>
          </div>

          {/* 결과 패널 */}
          <div style={{ padding: 24, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {!result ? (
              <div style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.7 }}>
                왼쪽 항목을 입력하고 <strong>감정하기</strong>를 누르면
                <br />
                이 자리에 예상 가격이 표시됩니다.
              </div>
            ) : (
              <div key={stampKey} className="stamp-reveal">
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 4 }}>
                  감정가
                </div>
                <div className="mono" style={{ fontSize: 38, fontWeight: 700, color: "var(--stamp)", lineHeight: 1.1 }}>
                  {won(result.predicted)}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>
                  추정 범위 {won(result.low)} ~ {won(result.high)}
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 4 }}>
                    <span>정가 대비</span>
                    <span className="mono">{result.ratio.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 8, background: "#E2E4D8", position: "relative" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, result.ratio)}%`,
                        background: "var(--gold)",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 감정 근거 */}
        <div style={{ marginTop: 34 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>감정 근거</h2>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              R² {model.r2.toFixed(3)} · 평균오차 {won(model.mae)} · 검증 {model.testPoints.length}건
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="chart-grid">
            <div style={{ border: "1px solid var(--line)", background: "var(--card)", padding: "16px 16px 6px" }}>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>
                실제 가격 대 예측 가격 (검증 데이터)
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#DDE0D2" />
                  <XAxis
                    type="number"
                    dataKey="actual"
                    domain={scatterDomain}
                    tickFormatter={manwon}
                    tick={{ fontSize: 11, fill: "#54604F" }}
                    stroke="#B9C2AC"
                    label={{ value: "실제가", position: "insideBottom", offset: -2, fontSize: 11, fill: "#54604F" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="predicted"
                    domain={scatterDomain}
                    tickFormatter={manwon}
                    tick={{ fontSize: 11, fill: "#54604F" }}
                    stroke="#B9C2AC"
                    width={44}
                  />
                  <ReferenceLine
                    segment={[
                      { x: scatterDomain[0], y: scatterDomain[0] },
                      { x: scatterDomain[1], y: scatterDomain[1] },
                    ]}
                    stroke="#B9C2AC"
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    formatter={(v) => won(v)}
                    contentStyle={{ fontSize: 12, border: "1px solid var(--line)" }}
                  />
                  <Scatter data={model.testPoints} fill="#A98545" fillOpacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div style={{ border: "1px solid var(--line)", background: "var(--card)", padding: "16px 16px 6px" }}>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>
                특징별 가격 영향력 (회귀계수, 원)
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={model.featureImportance}
                  layout="vertical"
                  margin={{ top: 4, right: 20, bottom: 4, left: 4 }}
                >
                  <CartesianGrid stroke="#DDE0D2" horizontal={false} />
                  <XAxis type="number" tickFormatter={manwon} tick={{ fontSize: 10, fill: "#54604F" }} stroke="#B9C2AC" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 10.5, fill: "#1F2A22" }}
                    stroke="#B9C2AC"
                  />
                  <Tooltip formatter={(v) => won(v)} contentStyle={{ fontSize: 12, border: "1px solid var(--line)" }} />
                  <Bar dataKey="value">
                    {model.featureImportance.map((f, i) => (
                      <Cell key={i} fill={f.value >= 0 ? "#A98545" : "#B5442E"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 14, lineHeight: 1.6 }}>
            학습 데이터는 실제 시세가 아닌 카테고리별 감가상각 규칙으로 생성한 샘플입니다. 실제
            거래 데이터(CSV)로 교체하면 정확도를 더 높일 수 있어요.
          </p>
        </div>
      </div>
    </div>
  );
}
