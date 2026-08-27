// lib/threads/match.ts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/threads-match-selftest.mjs
//
// 이 레포에는 테스트 러너가 없다(package.json 참조). 매칭 로직은 이 기능에서
// 가장 조용히 틀리는 부분이라 — 잘못 붙은 데이터는 에러를 내지 않는다 —
// 러너 도입 없이 돌릴 수 있는 독립 스크립트로 둔다.
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import {
  normalizeBody,
  diceSimilarity,
  matchDrafts,
  AUTO_MATCH_MIN,
  AMBIGUITY_MARGIN,
} from '../lib/threads/match.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

// ── 픽스처 ────────────────────────────────────────────────────
// 실제 초안과 같은 길이대(300~500자)로 잡는다. 짧은 문자열은 바이그램이 적어
// 점수가 과민하게 움직여서, 임계값 검증에 쓰면 결론이 뒤집힌다.

const DRAFT_A = `재고를 300만원어치 태웠습니다.
잘 팔리던 SKU였고, 데이터도 다 봤고, 그래서 확신했습니다.
그런데 한 달 뒤 창고에 그대로 쌓여 있더군요.

문제는 판매량을 봤다는 것이었습니다. 봐야 했던 건 재구매율이었습니다.
한 번 사고 다시 안 사는 상품은 판매량이 아무리 높아도 결국 멈춥니다.
그 신호는 판매 데이터가 아니라 고객 데이터에 있었습니다.

숫자를 본다는 건 많이 본다는 뜻이 아닙니다.
무엇을 봐야 하는지 아는 것입니다.`

const DRAFT_B = `재고 300만원을 날린 날 배운 것이 있습니다.

잘 팔리던 SKU였고, 데이터도 다 봤고, 그래서 확신했습니다.
그런데 한 달 뒤 창고에 그대로 쌓여 있더군요.

문제는 판매량을 봤다는 것이었습니다. 봐야 했던 건 재구매율이었습니다.
한 번 사고 다시 안 사는 상품은 판매량이 아무리 높아도 결국 멈춥니다.
그 신호는 판매 데이터가 아니라 고객 데이터에 있었습니다.

숫자를 본다는 건 많이 본다는 뜻이 아닙니다.
무엇을 봐야 하는지 아는 것입니다.`

const DRAFT_OTHER = `발주서를 엑셀로 관리하던 시절 이야기입니다.
공장에서 온 회신을 시트에 옮겨 적다가 한 줄을 빠뜨렸고,
그 한 줄이 두 달 뒤 품절로 돌아왔습니다.

사람이 옮겨 적는 구간이 남아 있으면 언젠가 반드시 틀립니다.
문제는 그 사람이 게을러서가 아니라, 옮겨 적는 일 자체가 오류를 만드는 구조라는 것입니다.

시스템을 만든다는 건 사람을 믿지 않는다는 뜻이 아닙니다.
사람이 틀릴 자리를 없앤다는 뜻입니다.`

// ── 1) 정규화 ─────────────────────────────────────────────────

eq('정규화: 공백·줄바꿈 제거',
  normalizeBody('안녕  하세요\n\n반갑습니다'), '안녕하세요반갑습니다')

eq('정규화: 전각 공백',
  normalizeBody('안녕　하세요'), '안녕하세요')

eq('정규화: 이모지 제거',
  normalizeBody('오늘의 기록 ✅🔥'), '오늘의기록')

eq('정규화: ZWJ 결합 이모지(가족) 잔여물 없음',
  normalizeBody('가족 👨‍👩‍👧‍👦 입니다'), '가족입니다')

eq('정규화: 국기 이모지',
  normalizeBody('한국 🇰🇷 시장'), '한국시장')

eq('정규화: 피부톤 수정자',
  normalizeBody('박수 👏🏻 감사'), '박수감사')

eq('정규화: 스마트 따옴표·대시·말줄임표',
  normalizeBody('“재고”—그리고… ‘신호’'), '"재고"-그리고...\'신호\'')

eq('정규화: 전각 영숫자 NFKC',
  normalizeBody('ＳＫＵ１２３'), 'sku123')

eq('정규화: 제로폭 문자',
  normalizeBody('재​고﻿'), '재고')

// 지우면 안 되는 것들 — 실제 내용 차이다
check('정규화: 해시태그 유지', normalizeBody('본문 #재고관리').includes('#재고관리'))
check('정규화: 숫자 유지', normalizeBody('300만원').includes('300'))
check('정규화: 물음표 유지', normalizeBody('그래서요?').includes('?'))

eq('정규화: null 입력', normalizeBody(null), '')

// ── 2) 유사도 ─────────────────────────────────────────────────

eq('유사도: 공백·이모지만 다른 동일 본문 = 1',
  diceSimilarity(normalizeBody(DRAFT_A), normalizeBody(DRAFT_A.replace(/\n/g, ' ') + ' 🔥')), 1)

eq('유사도: 빈 문자열끼리는 0 (아무 글에나 붙는 사고 방지)',
  diceSimilarity('', ''), 0)

{
  // 훅 한 문장만 갈아끼운 A/B 변형 — 임계값은 통과해야 한다(같은 글의 변형이므로)
  const s = diceSimilarity(normalizeBody(DRAFT_A), normalizeBody(DRAFT_B))
  check('유사도: A/B 변형은 임계값 이상', s >= AUTO_MATCH_MIN, `점수 ${s.toFixed(3)}`)
  check('유사도: A/B 변형은 완전일치가 아님', s < 1, `점수 ${s.toFixed(3)}`)
}

{
  // 완전히 다른 소재 — 임계값 근처에도 못 와야 한다
  const s = diceSimilarity(normalizeBody(DRAFT_A), normalizeBody(DRAFT_OTHER))
  check('유사도: 다른 글은 임계값 미만', s < AUTO_MATCH_MIN, `점수 ${s.toFixed(3)}`)
  check('유사도: 다른 글은 여유 있게 낮음', s < AUTO_MATCH_MIN - 0.2, `점수 ${s.toFixed(3)}`)
}

{
  // 발행 직전에 CTA·해시태그를 갈아끼운 경우 — 흡수돼야 한다
  const edited = DRAFT_A.replace('무엇을 봐야 하는지 아는 것입니다.', '무엇을 봐야 하는지 아는 것입니다.\n\n#재고관리 #셀러')
  const s = diceSimilarity(normalizeBody(DRAFT_A), normalizeBody(edited))
  check('유사도: 해시태그 추가는 흡수', s >= AUTO_MATCH_MIN, `점수 ${s.toFixed(3)}`)
}

// ── 3) 매칭 ───────────────────────────────────────────────────

{
  // 정상 경로: 초안 그대로 복사해 발행
  const out = matchDrafts(
    [{ id: 'd1', body: DRAFT_A }, { id: 'd2', body: DRAFT_OTHER }],
    [
      { id: 't1', text: DRAFT_OTHER.replace(/\n/g, '\n\n'), permalink: 'https://threads.net/t1', timestamp: '2026-08-26T10:00:00+0000' },
      { id: 't2', text: DRAFT_A + ' 🙏', permalink: 'https://threads.net/t2', timestamp: '2026-08-26T14:00:00+0000' },
    ],
  )
  eq('매칭: 2건 연결', out.matched.length, 2)
  eq('매칭: 보류 0건', out.skipped.length, 0)
  eq('매칭: d1 → t2', out.matched.find(m => m.draftId === 'd1')?.threadsId, 't2')
  eq('매칭: d2 → t1', out.matched.find(m => m.draftId === 'd2')?.threadsId, 't1')
  eq('매칭: permalink 전달', out.matched.find(m => m.draftId === 'd1')?.permalink, 'https://threads.net/t2')
  eq('매칭: timestamp 전달', out.matched.find(m => m.draftId === 'd1')?.timestamp, '2026-08-26T14:00:00+0000')
  check('매칭: exact 플래그', out.matched.every(m => m.exact === true))
  eq('매칭: 미연결 게시물 0', out.unmatchedThreads.length, 0)
}

{
  // ⭐ 핵심 안전장치: 같은 content_code 의 A/B 변형 두 편이 초안으로 공존하고,
  //   실제로는 그중 하나만 발행된 상황. 점수가 높은 쪽으로 자동 연결하면
  //   훅 A 의 성과가 훅 B 에 기록된다. 그래서 둘 다 보류돼야 한다.
  const out = matchDrafts(
    [{ id: 'dA', body: DRAFT_A }, { id: 'dB', body: DRAFT_B }],
    [{ id: 't1', text: DRAFT_A, permalink: null, timestamp: '2026-08-26T14:00:00+0000' }],
  )
  const skippedB = out.skipped.find(s => s.draftId === 'dB')
  // 게시물이 하나뿐이라 dB 입장에서는 2등이 없다 → 초안 쪽 모호성 판정으로는
  // 안 걸린다. 게시물 쪽 경쟁 판정(contested)이 이걸 잡는다.
  eq('A/B 보류: dB 는 contested', skippedB?.reason, 'contested')
  check('A/B 보류: dA 는 완전 일치라 연결됨',
    out.matched.length === 1 && out.matched[0].draftId === 'dA',
    JSON.stringify(out.matched))
}

{
  // 게시물이 둘 다 올라온 경우 — 각자 제 짝을 찾아야 한다
  const out = matchDrafts(
    [{ id: 'dA', body: DRAFT_A }, { id: 'dB', body: DRAFT_B }],
    [
      { id: 't1', text: DRAFT_A, permalink: null, timestamp: '2026-08-26T14:00:00+0000' },
      { id: 't2', text: DRAFT_B, permalink: null, timestamp: '2026-08-26T18:00:00+0000' },
    ],
  )
  // 각 초안의 1등(1.0)과 2등(A/B 유사도)의 격차가 마진보다 크므로 ambiguous 가 아니다
  eq('A/B 양쪽 발행: 2건 연결', out.matched.length, 2)
  eq('A/B 양쪽 발행: dA → t1', out.matched.find(m => m.draftId === 'dA')?.threadsId, 't1')
  eq('A/B 양쪽 발행: dB → t2', out.matched.find(m => m.draftId === 'dB')?.threadsId, 't2')
}

{
  // 완전 일치가 아닌 경우의 경쟁: 발행본이 B 를 손본 것이라 어느 초안에서
  // 왔는지 텍스트만으로는 확정할 수 없다. 둘 다 보류돼야 한다.
  const editedB = DRAFT_B.replace('숫자를 본다는 건 많이 본다는 뜻이 아닙니다.', '숫자를 본다는 건 많이 보는 게 아닙니다.')
  const out = matchDrafts(
    [{ id: 'dA', body: DRAFT_A }, { id: 'dB', body: DRAFT_B }],
    [{ id: 't1', text: editedB, permalink: null, timestamp: '2026-08-26T14:00:00+0000' }],
  )
  eq('경쟁(비완전일치): 자동 연결 0', out.matched.length, 0)
  check('경쟁(비완전일치): 둘 다 보류',
    out.skipped.length === 2 && out.skipped.every(s => s.reason === 'contested'),
    JSON.stringify(out.skipped))
}

{
  // 아직 발행되지 않은 초안
  const out = matchDrafts(
    [{ id: 'd1', body: DRAFT_A }],
    [{ id: 't1', text: DRAFT_OTHER, permalink: null, timestamp: '2026-08-26T10:00:00+0000' }],
  )
  eq('미발행 초안: 연결 0', out.matched.length, 0)
  eq('미발행 초안: below_threshold', out.skipped[0]?.reason, 'below_threshold')
  eq('미발행 초안: 게시물은 미연결로 남음', out.unmatchedThreads[0], 't1')
}

{
  // 완전히 같은 본문의 초안이 실수로 두 개 — 게시물은 하나
  const out = matchDrafts(
    [{ id: 'd1', body: DRAFT_A }, { id: 'd2', body: DRAFT_A }],
    [{ id: 't1', text: DRAFT_A, permalink: null, timestamp: '2026-08-26T14:00:00+0000' }],
  )
  // 1등 1.0, 2등 없음 → 둘 다 후보로 올라오고, 배정 단계에서 하나만 확정된다
  eq('중복 초안: 1건만 연결(1:1 보장)', out.matched.length, 1)
  eq('중복 초안: 나머지는 taken_by_better_match',
    out.skipped.find(s => s.reason === 'taken_by_better_match') ? 'taken_by_better_match' : undefined,
    'taken_by_better_match')
}

{
  // 본문이 빈 초안 — 어떤 게시물에도 붙으면 안 된다
  const out = matchDrafts(
    [{ id: 'd1', body: '' }, { id: 'd2', body: null }],
    [{ id: 't1', text: '', permalink: null, timestamp: '2026-08-26T14:00:00+0000' }],
  )
  eq('빈 본문: 연결 0', out.matched.length, 0)
  eq('빈 본문: 2건 보류', out.skipped.length, 2)
}

{
  // 텍스트 없는 게시물(이미지 전용 등)이 섞여 있어도 매칭이 깨지지 않아야 한다
  const out = matchDrafts(
    [{ id: 'd1', body: DRAFT_A }],
    [
      { id: 't0', text: null, permalink: null, timestamp: '2026-08-26T09:00:00+0000' },
      { id: 't1', text: DRAFT_A, permalink: null, timestamp: '2026-08-26T14:00:00+0000' },
    ],
  )
  eq('텍스트 없는 게시물 혼재: 정상 연결', out.matched[0]?.threadsId, 't1')
  eq('텍스트 없는 게시물은 미연결로 남음', out.unmatchedThreads.includes('t0'), true)
}

{
  // 초안도 게시물도 없음
  const out = matchDrafts([], [])
  eq('빈 입력: 연결 0', out.matched.length, 0)
  eq('빈 입력: 보류 0', out.skipped.length, 0)
}

// ── 4) 임계값 상수 자체 ───────────────────────────────────────
check('상수: AUTO_MATCH_MIN 범위', AUTO_MATCH_MIN > 0.5 && AUTO_MATCH_MIN < 1)
check('상수: AMBIGUITY_MARGIN 범위', AMBIGUITY_MARGIN > 0 && AMBIGUITY_MARGIN < 0.2)

// ── 결과 ──────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n❌ ${failures.length}건 실패 / ${passed + failures.length}건 중\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✅ ${passed}건 전부 통과`)
