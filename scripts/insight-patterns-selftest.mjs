// lib/insight/patterns.ts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/insight-patterns-selftest.mjs
//
// 이 파일의 판정이 사람 승인 없이 main 에 커밋된다. 조용히 틀릴 수 있는
// 지점이 전부 여기다 — 표본 미달인데 승격되거나, 기준선이 없는데 개선으로
// 읽거나, 렌더 출력이 매번 달라져 빈 커밋이 매일 쌓이거나.
// 셋 다 에러를 내지 않는다. threads-collect-selftest.mjs 와 같은 방식으로 둔다.
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import {
  decide,
  shouldReflect,
  renderLearnedPatterns,
  renderRejectedPatterns,
  MIN_SAMPLE,
  NO_EFFECT_SAMPLE,
  EFFECT_THRESHOLD,
  MIN_EVIDENCE_TO_REFLECT,
  MAX_STRENGTH,
} from '../lib/insight/patterns.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    return
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const perf = (sampleSize, avgReplyRate, avgSpreadMultiple = 2) => ({
  sampleSize,
  avgReplyRate,
  avgSpreadMultiple,
})

const BASE = perf(50, 0.02)

// ── 1) 표본 가드 — DB 트리거와 같은 문턱을 코드도 지키는가 ──────────
{
  const p = { status: 'reflected', strength: 1 }

  for (let n = 0; n < MIN_SAMPLE; n++) {
    // 개선폭이 아무리 커도 표본이 모자라면 승격되면 안 된다.
    const d = decide(p, perf(n, 0.9), BASE)
    check(`표본 ${n}개는 승격 불가`, d.decision === 'hold', d.decision + '/' + d.reason)
  }

  const ok = decide(p, perf(MIN_SAMPLE, 0.9), BASE)
  check(`표본 ${MIN_SAMPLE}개부터 판정 가능`, ok.decision === 'promote', ok.reason)
}

// ── 2) 임계치 경계 ────────────────────────────────────────────────
{
  const p = { status: 'reflected', strength: 1 }
  const base = 0.02

  // 정확히 +10% → 승격(>= 이므로 포함)
  const at = decide(p, perf(10, base * (1 + EFFECT_THRESHOLD)), perf(50, base))
  check('정확히 +임계치면 승격', at.decision === 'promote', at.reason)

  // 임계치 바로 아래 → 보류
  const under = decide(p, perf(10, base * (1 + EFFECT_THRESHOLD - 0.01)), perf(50, base))
  check('임계치 미만은 보류', under.decision === 'hold', under.reason)

  // 정확히 -10% → 기각
  const down = decide(p, perf(10, base * (1 - EFFECT_THRESHOLD)), perf(50, base))
  check('정확히 -임계치면 기각', down.decision === 'reject', down.reason)
}

// ── 3) 좀비 패턴 방지 — 표본이 쌓였는데 차이가 없으면 접는다 ────────
{
  const p = { status: 'reflected', strength: 1 }
  const flat = perf(NO_EFFECT_SAMPLE, 0.0201)

  const d = decide(p, flat, BASE)
  check('표본 충분 + 무변화 = 기각', d.decision === 'reject', d.decision + '/' + d.reason)
  check('무효과 기각은 strength 0', d.nextStrength === 0, String(d.nextStrength))

  // 그 직전 표본에서는 아직 보류여야 한다.
  const before = decide(p, perf(NO_EFFECT_SAMPLE - 1, 0.0201), BASE)
  check('무효과 문턱 직전은 보류', before.decision === 'hold', before.reason)
}

// ── 4) 기준선이 없을 때 임의 승격하지 않는가 ─────────────────────────
{
  const p = { status: 'reflected', strength: 1 }

  const noBase = decide(p, perf(20, 0.5), perf(0, null))
  check('기준선 null 이면 승격 안 함', noBase.decision === 'hold', noBase.decision)

  const zeroBase = decide(p, perf(20, 0.5), perf(30, 0))
  check('기준선 0 이면 승격 안 함', zeroBase.decision === 'hold', zeroBase.decision)

  const noMine = decide(p, perf(20, null), BASE)
  check('내 답글률 null 이면 승격 안 함', noMine.decision === 'hold', noMine.decision)
}

// ── 5) strength 진행과 상한 ──────────────────────────────────────
{
  const good = perf(10, 0.05)
  let strength = 0
  for (let i = 0; i < 6; i++) {
    const d = decide({ status: 'reflected', strength }, good, BASE)
    check(`반복 승격 ${i}: promote`, d.decision === 'promote', d.reason)
    strength = d.nextStrength
  }
  check(`strength 상한 ${MAX_STRENGTH} 초과 안 함`, strength === MAX_STRENGTH, String(strength))
}

// ── 6) 이미 기각된 패턴은 다시 판정하지 않는다 ────────────────────
{
  const d = decide({ status: 'rejected', strength: 0 }, perf(50, 0.9), BASE)
  check('기각된 패턴은 재승격 안 됨', d.decision === 'hold', d.decision)
}

// ── 7) 반영 문턱 — 근거 1건은 우연과 구별되지 않는다 ───────────────
{
  check('근거 1건은 미반영', shouldReflect({ status: 'candidate', evidence_count: 1 }) === false)
  check(
    `근거 ${MIN_EVIDENCE_TO_REFLECT}건은 반영`,
    shouldReflect({ status: 'candidate', evidence_count: MIN_EVIDENCE_TO_REFLECT }) === true,
  )
  check(
    '이미 반영된 패턴은 다시 반영 대상 아님',
    shouldReflect({ status: 'reflected', evidence_count: 9 }) === false,
  )
}

// ── 8) 렌더링 결정성 — 빈 커밋이 매일 쌓이지 않는가 ────────────────
{
  const rows = [
    mk('b-pattern', 'B 패턴', 'confirmed', 3, 5),
    mk('a-pattern', 'A 패턴', 'reflected', 1, 2),
    mk('c-pattern', 'C 패턴', 'confirmed', 3, 5), // strength/evidence 동점 → key 로 갈린다
    mk('z-rejected', 'Z 패턴', 'rejected', 0, 4),
  ]

  const first = renderLearnedPatterns(rows)
  const shuffled = [rows[3], rows[1], rows[2], rows[0]]
  const second = renderLearnedPatterns(shuffled)

  check('렌더 출력이 입력 순서에 무관', first === second)
  check('같은 입력 = 같은 바이트', renderLearnedPatterns(rows) === first)

  check('기각된 패턴은 가이드에 없음', !first.includes('Z 패턴'))
  check('strength 0 은 가이드에 없음', !first.includes('z-rejected'))
  check('반영 패턴은 가이드에 있음', first.includes('A 패턴') && first.includes('B 패턴'))

  // 동점 항목은 key 사전순 — b 가 c 보다 먼저다.
  check('동점은 key 사전순', first.indexOf('B 패턴') < first.indexOf('C 패턴'))
  // strength 높은 게 먼저다.
  check('strength 내림차순', first.indexOf('B 패턴') < first.indexOf('A 패턴'))

  check('강조 수준 라벨 노출', first.includes('기본값') && first.includes('참고'))
}

// ── 9) 빈 상태에서도 유효한 문서가 나오는가 ────────────────────────
{
  const empty = renderLearnedPatterns([])
  check('빈 목록도 마크다운 헤더 유지', empty.startsWith('# 검증된 패턴'))
  check('빈 목록 안내문 포함', empty.includes('아직 반영된 패턴이 없다'))
  check('빈 목록 결정성', renderLearnedPatterns([]) === empty)

  const emptyRej = renderRejectedPatterns([])
  check('빈 기각로그도 유효', emptyRej.includes('아직 기각된 패턴이 없다'))
}

// ── 10) 기각 로그는 사유를 반드시 싣는가 ──────────────────────────
{
  const rows = [
    { ...mk('bad-hook', '나쁜 훅', 'rejected', 0, 6), rollback_reason: '답글률 22.0% 악화 (표본 7)' },
    { ...mk('ok-hook', '좋은 훅', 'confirmed', 2, 6), rollback_reason: null },
  ]
  const out = renderRejectedPatterns(rows)

  check('기각 패턴만 로그에 포함', out.includes('나쁜 훅') && !out.includes('좋은 훅'))
  check('기각 사유 노출', out.includes('답글률 22.0% 악화'))
  check('재실험 방지 문구 포함', out.includes('다시 제안하지 마라'))
}

function mk(key, title, status, strength, evidence) {
  return {
    pattern_key: key,
    title,
    description: `${title} 설명`,
    insight_type: 'actionable',
    evidence_count: evidence,
    status,
    strength,
    hypothesis_code: 'H8',
  }
}

console.log(`\n통과 ${passed}건`)
if (failures.length) {
  console.error(`실패 ${failures.length}건:`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('판정 로직·렌더링 정상 — 자동 커밋 경로를 신뢰할 수 있다.')
