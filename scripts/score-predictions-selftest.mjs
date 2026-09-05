// lib/predictions/{score,parse-log,link}.ts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/score-predictions-selftest.mjs
//
// 채점기가 조용히 틀리는 지점은 전부 여기다. 채점 결과는 규칙 신뢰도로 바로
// 흘러 들어가는데, 신뢰도가 오염되면 그 위에 쌓인 규칙 갱신 판단까지 전부
// 틀리고, 그런데도 화면에는 아무 에러가 안 뜬다.
//
// 특히 붙잡아야 하는 것:
//   1) 무효 vs 보류 — 방향이 반대인 것과 노이즈 범위인 것 (§4-1)
//   2) 확인 불가 vs 0건 — 상대를 못 찾은 것을 "차이 없음"으로 접지 않는가
//   3) within 의 상한 초과 — 많이 나온 게 성공이 아니다 (§3-3)
//   4) 파서가 못 읽은 예측을 "예측 없음"으로 접지 않는가

import {
  METRIC_WEIGHTS, computeMetric, median, mad, parseThreshold, bootstrapStage,
  scoreOne, tallyByRule, wilsonLower, ruleAction,
} from '../lib/predictions/score.ts'
import { parseDecisionLog, extractPredictions } from '../lib/predictions/parse-log.ts'
import { LOG_CODE_RE, LINK_TABLE_READY, linkDecisionLog } from '../lib/predictions/link.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}
function near(name, actual, expected, tol = 1e-9) {
  check(name, actual !== null && Math.abs(actual - expected) < tol, `기대 ~${expected}, 실제 ${actual}`)
}
function throws(name, fn, re) {
  try { fn(); failures.push(`${name} — 던졌어야 하는데 안 던짐`) }
  catch (e) { check(name, re.test(String(e.message)), `메시지 불일치: ${e.message}`) }
}

// ── 1) 지표 ───────────────────────────────────────────────────
eq('save_rate 는 지표 목록에 없다', 'save_rate' in METRIC_WEIGHTS, false)
eq('like_rate 가중치 8', METRIC_WEIGHTS.like_rate, 8)

const snap = (o) => ({
  postId: 'p', publishedAt: '2026-09-01T00:00:00Z', bucket: 'h168',
  views: 1000, likes: 30, replies: 5, reposts: 4, quotes: 2, ...o,
})
near('like_rate = likes/views', computeMetric('like_rate', snap({})), 0.03)
near('share_rate = (reposts+quotes)/views', computeMetric('share_rate', snap({})), 0.006)
eq('views 는 원시 카운트', computeMetric('views', snap({})), 1000)
eq('분모 0 이면 null (0 이 아니다)', computeMetric('like_rate', snap({ views: 0 })), null)

// ── 2) 기준선·임계 ────────────────────────────────────────────
eq('median 홀수', median([3, 1, 2]), 2)
eq('median 짝수', median([1, 2, 3, 4]), 2.5)
eq('median 빈 배열은 null (0 아님)', median([]), null)
eq('MAD 계산', mad([1, 2, 3, 4, 5]), 1)
eq('전부 같은 값이면 MAD 0', mad([2, 2, 2]), 0)
eq("threshold '1.5mad'", parseThreshold('1.5mad').factor, 1.5)
eq("threshold '20pct' 는 비율로", parseThreshold('20pct').factor, 0.2)
eq('threshold 생략 시 1.0mad', parseThreshold(undefined).factor, 1)
throws('모르는 threshold 는 던진다', () => parseThreshold('가끔'), /알 수 없는 threshold/)

eq('3건이면 부트스트랩 보류', bootstrapStage(3), 'bootstrap_hold')
eq('5건이면 참고 판정', bootstrapStage(5), 'bootstrap_ref')
eq('10건이면 정식 판정', bootstrapStage(10), 'full')

// ── 3) 단일 판정 — 유효/무효/보류 ─────────────────────────────
// 기준선 표본: like_rate 가 0.010 ~ 0.019 사이. 중앙값 0.0145, MAD 0.0025.
const history = [0.010, 0.012, 0.014, 0.015, 0.016, 0.017, 0.018, 0.019, 0.013, 0.011]
  .map((r, i) => snap({
    postId: `h${i}`,
    publishedAt: new Date(Date.parse('2026-08-01T00:00:00Z') + i * 86400000).toISOString(),
    views: 1000, likes: Math.round(r * 1000),
  }))

const basePred = {
  metric: 'like_rate', direction: 'up', baseline: 'median_last_k', k: 10,
  threshold: '1.0mad', horizon: 'h168', because: 'P-03',
}

const up = scoreOne(basePred, { target: snap({ likes: 30 }), history })   // 0.030
eq('크게 오르면 유효', up.verdict, '유효')
near('기준선은 중앙값', up.baseline, 0.0145)
near('MAD', up.mad, 0.0025)

const down = scoreOne(basePred, { target: snap({ likes: 5 }), history })  // 0.005
eq('반대 방향으로 크게 움직이면 무효', down.verdict, '무효')
check('무효 사유에 방향이 적힌다', /방향 반대/.test(down.reason), down.reason)

const noise = scoreOne(basePred, { target: snap({ likes: 15 }), history }) // 0.015
eq('노이즈 범위면 보류 (무효 아님)', noise.verdict, '보류')
check('보류 사유는 노이즈다', /노이즈 범위/.test(noise.reason), noise.reason)

const small = scoreOne(basePred, { target: snap({ views: 50, likes: 30 }), history })
eq('views<100 이면 보류', small.verdict, '보류')
check('표본 부족이라고 적는다', /표본 부족/.test(small.reason), small.reason)

// direction: down 도 대칭으로 동작해야 한다.
const downPred = { ...basePred, direction: 'down' }
eq('down 예측이 실제로 내려가면 유효', scoreOne(downPred, { target: snap({ likes: 5 }), history }).verdict, '유효')
eq('down 예측인데 올라가면 무효', scoreOne(downPred, { target: snap({ likes: 30 }), history }).verdict, '무효')

// ── 4) 부트스트랩·MAD 0 폴백 ──────────────────────────────────
const tiny = history.slice(0, 3)
const boot = scoreOne(basePred, { target: snap({ likes: 30 }), history: tiny })
eq('기준선 표본 3건이면 보류', boot.verdict, '보류')
check('부트스트랩이라고 적는다', /부트스트랩/.test(boot.reason), boot.reason)

const flat = Array.from({ length: 10 }, (_, i) => snap({
  postId: `f${i}`, publishedAt: new Date(Date.parse('2026-08-01T00:00:00Z') + i * 86400000).toISOString(),
  views: 1000, likes: 10,   // 전부 0.010 → MAD 0
}))
const fallback = scoreOne(basePred, { target: snap({ likes: 13 }), history: flat })  // 0.013 = +30%
eq('MAD 0 이면 20pct 폴백으로 판정된다', fallback.verdict, '유효')
check('폴백이라고 적는다', /pct\(폴백\)/.test(fallback.reason), fallback.reason)

// ── 5) within — 상한 초과도 무효다 ────────────────────────────
const withinPred = {
  metric: 'views', direction: 'within', baseline: 'absolute',
  value: [3000, 30000], threshold: '1.0mad', horizon: 'h168', because: 'P-04',
}
eq('구간 안이면 유효', scoreOne(withinPred, { target: snap({ views: 12000 }), history }).verdict, '유효')
const over = scoreOne(withinPred, { target: snap({ views: 90000 }), history })
eq('상한 초과는 무효', over.verdict, '무효')
check('상한 초과라고 적는다', /상한 초과/.test(over.reason), over.reason)
eq('하한 미달도 무효', scoreOne(withinPred, { target: snap({ views: 500 }), history }).verdict, '무효')

// ── 6) paired — 상대가 없으면 "확인 불가" 보류 ────────────────
const pairedPred = {
  metric: 'like_rate', direction: 'up', baseline: 'paired', pairedWith: 'LOG-20260910-02',
  threshold: '1.0mad', horizon: 'h168', because: 'C-12',
}
const noPair = scoreOne(pairedPred, { target: snap({ likes: 30 }), history, paired: null })
eq('paired 상대가 없으면 보류', noPair.verdict, '보류')
check('"확인 불가"라고 적는다 — 0 으로 접지 않는다', /확인 불가/.test(noPair.reason), noPair.reason)

// ── 7) 신뢰도 ─────────────────────────────────────────────────
near('Wilson 1승 0패 ≈ 21%', wilsonLower(1, 0), 0.2065, 0.005)
near('Wilson 7승 1패 ≈ 53%', wilsonLower(7, 1), 0.5290, 0.005)
near('Wilson 20승 3패 ≈ 68%', wilsonLower(20, 3), 0.6774, 0.005)
eq('n=0 이면 null (0% 아님)', wilsonLower(0, 0), null)

eq('무효 3건이면 UPD 후보', ruleAction({ valid: 5, invalid: 3, held: 0 }), 'UPD 후보 생성')
// n<5 면 아무 액션도 내지 않는다 — 표본이 없어서 판정 못 한 것이지 나쁜 규칙이 아니다.
eq('n<5 면 액션 없음', ruleAction({ valid: 2, invalid: 2, held: 1 }), null)
// 3승 2패: n=5, Wilson 하한 23% < 30% → 재검토. (무효 3건 미만이라 UPD 조건은 안 걸린다)
eq('n>=5 이고 하한 30% 미만이면 재검토', ruleAction({ valid: 3, invalid: 2, held: 0 }), '규칙 재검토')
eq('보류 과반이면 예측 설계 재검토', ruleAction({ valid: 2, invalid: 1, held: 8 }), '예측 설계 재검토')
eq('유효 12 무효 0 이면 안정', ruleAction({ valid: 12, invalid: 0, held: 0 }), '안정 규칙')

const tally = tallyByRule([{
  preds: [basePred, { ...basePred, because: 'R-11' }],
  metrics: [{ verdict: '유효' }, { verdict: '보류' }],
}])
eq('because 로 귀속된다', tally.get('P-03').valid, 1)
eq('보류는 held 로 간다', tally.get('R-11').held, 1)

// ── 8) 파서 ───────────────────────────────────────────────────
const goodEntry = [
  '### LOG-20260910-01 | 테스트 글',
  '- **출처**: `자체발행`',
  '- **예측**:',
  '  - metric: like_rate          # §1-1의 지표 코드',
  '    direction: up',
  '    baseline: median_last_10',
  '    threshold: 1.0mad',
  '    horizon: h168',
  '    because: P-03',
  '    rationale: "표본을 넓힌 카피"',
  '  - metric: views',
  '    direction: within',
  '    baseline: absolute',
  '    value: [3000, 100000]',
  '    threshold: 1.0mad',
  '    horizon: h168',
  '    because: P-04',
  '- **발행**: 2026-09-10',
].join('\n')

const r = parseDecisionLog(goodEntry, 'fixture')
eq('엔트리 1개', r.entries.length, 1)
eq('파싱 에러 0', r.errors.length, 0)
eq('예측 2개', r.entries[0].predictions.length, 2)
eq('median_last_10 → 코드+K 분리', r.entries[0].predictions[0].baseline, 'median_last_k')
eq('K=10', r.entries[0].predictions[0].k, 10)
eq('# 주석이 떨어진다', r.entries[0].predictions[0].metric, 'like_rate')
check('within 의 value 는 구간', Array.isArray(r.entries[0].predictions[1].value), JSON.stringify(r.entries[0].predictions[1].value))

// 템플릿 코드블록을 실제 엔트리로 세면 안 된다.
const withTemplate = ['```markdown', '### LOG-YYYYMMDD-nn | (템플릿)', '```', '', goodEntry].join('\n')
eq('코드블록 안 템플릿은 안 센다', parseDecisionLog(withTemplate, 'fixture').entries.length, 1)

// 예측 칸이 없는 엔트리(역방향 등)는 에러가 아니다.
const reverse = ['### LOG-20260905-01 | 외부관찰', '- **출처**: `외부관찰`', '- **결론**: `구멍`'].join('\n')
const rr = parseDecisionLog(reverse, 'fixture')
eq('예측 없는 엔트리는 정상', rr.errors.length, 0)
eq('예측 0개', rr.entries[0].predictions.length, 0)

// ★ 못 읽은 것을 "예측 없음"으로 접지 않는다.
const missingField = ['### LOG-20260910-02 | 필드 누락', '- **예측**:',
  '  - metric: like_rate', '    direction: up', '    horizon: h168'].join('\n')
const mr = parseDecisionLog(missingField, 'fixture')
eq('필수 필드가 빠지면 에러로 올라온다', mr.errors.length, 1)
eq('에러난 엔트리는 entries 에 안 들어간다', mr.entries.length, 0)
check('누락 필드명을 알려준다', /baseline|threshold|because/.test(mr.errors[0].message), mr.errors[0].message)

const savedRate = ['### LOG-20260910-03 | 폐기 지표', '- **예측**:',
  '  - metric: save_rate', '    direction: up', '    baseline: median_last_10',
  '    threshold: 1.0mad', '    horizon: h168', '    because: R-11'].join('\n')
const sr = parseDecisionLog(savedRate, 'fixture')
eq('save_rate 예측은 보류가 아니라 에러다', sr.errors.length, 1)
check('쓸 수 있는 지표를 알려준다', /like_rate/.test(sr.errors[0].message), sr.errors[0].message)

throws('within 인데 구간이 아니면 던진다',
  () => extractPredictions(['- **예측**:', '  - metric: views', '    direction: within',
    '    baseline: absolute', '    value: 5000', '    threshold: 1.0mad',
    '    horizon: h168', '    because: P-04']),
  /within 인데 value/)

throws('paired 인데 paired_with 가 없으면 던진다',
  () => extractPredictions(['- **예측**:', '  - metric: like_rate', '    direction: up',
    '    baseline: paired', '    threshold: 1.0mad', '    horizon: h168', '    because: C-12']),
  /paired_with/)

// ── 9) 링크 (스텁 상태 확인) ──────────────────────────────────
check('LOG 코드 형식 통과', LOG_CODE_RE.test('LOG-20260910-01'))
check('XUP 도 통과', LOG_CODE_RE.test('XUP-20260910-99'))
check('무패딩은 거부', !LOG_CODE_RE.test('LOG-20260910-1'))
check('한 자리 접두어는 거부', !LOG_CODE_RE.test('L-20260910-01'))

const stub = await linkDecisionLog(null, { postId: 'x', decisionLogCode: 'LOG-20260910-01' })
eq('테이블 미적용이면 skipped (failed 아님)', stub.status, LINK_TABLE_READY ? 'linked' : 'skipped')
if (!LINK_TABLE_READY) check('스텁 사유에 마이그레이션 번호가 있다', /20260905000001/.test(stub.reason), stub.reason)
const badCode = await linkDecisionLog(null, { postId: 'x', decisionLogCode: 'LOG-2026-1' })
eq('코드 형식이 틀리면 failed', badCode.status, 'failed')

// ── 결과 ──────────────────────────────────────────────────────
console.log(`\n통과 ${passed} / 실패 ${failures.length}`)
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ 예측 채점기 자체 검증 통과')
