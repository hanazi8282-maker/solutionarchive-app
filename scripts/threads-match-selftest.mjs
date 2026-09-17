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
  rankDraftsFor,
  classifyUnmatched,
  AUTO_MATCH_MIN,
  AMBIGUITY_MARGIN,
  OFF_PIPELINE_MAX,
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
  // 발행 직전에 구어체로 통째로 다시 쓴 글(실사례 CS-20260910-01, 실측 0.267).
  // 자동 연결되면 안 되고, 미연결 게시물로 남아 대시보드에 올라와야 하며,
  // 수동 연결 후보 1등은 원래 초안이어야 한다.
  const rewritten = `솔직히 말하면 재고로 300만원 날렸어요.
그 SKU 진짜 잘 나갔거든요. 숫자도 다 확인했고요. 근데 한 달 지나니까 창고에 그대로더라고요.
제가 본 건 판매량이었어요. 봤어야 하는 건 재구매율이었고요.
한 번 사고 끝나는 물건은 아무리 많이 팔려도 결국 멈춰요.
그 신호가 고객 쪽 데이터에 있었는데 저는 판매 쪽만 들여다봤던 거죠.`
  const out = matchDrafts(
    [{ id: 'd1', body: DRAFT_A }, { id: 'd2', body: DRAFT_OTHER }],
    [{ id: 't1', text: rewritten, permalink: null, timestamp: '2026-09-12T10:54:54+0000' }],
  )
  const ranked = rankDraftsFor({ id: 't1', text: rewritten }, [{ id: 'd2', body: DRAFT_OTHER }, { id: 'd1', body: DRAFT_A }])
  eq('다시 쓴 발행본: 자동 연결 0', out.matched.length, 0)
  eq('다시 쓴 발행본: 미연결 게시물로 남음', out.unmatchedThreads.includes('t1'), true)
  eq('다시 쓴 발행본: 후보 1등은 원래 초안', ranked[0]?.draftId, 'd1')
  check('다시 쓴 발행본: 1등 점수도 임계값 미만', ranked[0]?.score < AUTO_MATCH_MIN, `점수 ${ranked[0]?.score}`)
  check('다시 쓴 발행본: 후보는 초안 수만큼 전부', ranked.length === 2)
}

{
  // 초안도 게시물도 없음
  const out = matchDrafts([], [])
  eq('빈 입력: 연결 0', out.matched.length, 0)
  eq('빈 입력: 보류 0', out.skipped.length, 0)
}

// ── 4) 미연결 게시물 분류 ─────────────────────────────────────
//
// 후보 집합을 먼저 넓히고(posts 초안 + 칼럼 연재 편) 분류는 그 다음이다.
// 순서를 뒤집으면 칼럼 연재의 발행본이 "파이프라인 외"로 오분류된다 —
// 2026-09-18 에 실제로 그렇게 판정했다가 뒤집혔다(match.ts OFF_PIPELINE_MAX 주석).

// 칼럼 `beauty-of-joseon` 연재 1편 본문(419자). content_columns
// fc5c4409-b5cf-475c-a0c9-e966d9b7b4cd 의 threads[0].body 와 같다
// (정본 파일: drafts/columns/2026-09-15-beauty-of-joseon.threads.md).
// ⚠️ 이 픽스처를 "비슷한 다른 글"로 바꾸지 마라. 이 편의 발행본이 매처에
//    파이프라인 외로 보였던 그 사건이 이 테스트의 이유다.
const COLUMN_EPISODE_1 = `아이템을 못 정한 창업자는 보통 새로 만들 것부터 찾는다.

조선미녀를 키운 천주혁 대표는 반대로 갔다. 중국향 화장품 유통을 하던 그는 2016년 무렵 경쟁이 과열되며 기회를 잡기 어려워졌다고 본인이 밝혔다. 그가 고른 건 새 브랜드가 아니라 독점 유통하던 조선미녀였다.

당시 미국에서는 제품 하나만 팔아 판매량이 많지 않았다. 대신 아마존과 현지 셀렉숍 반응이 정말 좋았고, 상품군만 정비하면 키울 수 있겠다고 봤다고 한다. 보도에 따르면 인수 당시 연 매출은 1억 원, 2024년 매출은 3237억 원이다.

이 사례에서 옮길 건 순서다. 남의 제품 여러 개를 먼저 팔아 보고, 판매량이 아니라 반응의 온도로 하나를 고른다. 그리고 그 제품에 빠진 것을 채운다.

지금 팔고 있는 것 중에, 적게 팔리지만 반응이 유난히 좋은 게 있지 않은가?`

// 위 편을 사람이 다시 쓴 발행본(Threads 18165008242467071, 2026-09-16, 498자)의 **근사본**이다.
// 발행본 전문은 content_columns.review_note(DB)에만 있어 이 테스트에 넣을 수 없었다.
// 근사본은 같은 대조에서 실물보다 0.025 높게 나오는 경향이 관측됐다(실물 0.103 → 근사 0.128).
// 실측은 매처가 다음 실행에서 detail.candidates 에 남긴다.
const REPUBLISHED_REWRITE = `조선미녀 천주혁 대표는 처음부터 브랜드를 만든 사람이 아닙니다.
중계업을 했습니다. 해외 바이어와 국내 브랜드를 붙여주는 일이었죠.

그 일을 하면서 어떤 제품이 어느 나라에서 얼마나 팔리는지 데이터가 손에 쌓였습니다.
남의 물건을 팔아주면서 시장이 무엇을 원하는지 먼저 알게 된 겁니다.

그리고 그 데이터가 가리키는 브랜드를 인수했습니다. 인수 당시 연 매출 1억이던 브랜드가
2024년에는 3237억이 됐습니다. 없는 시장을 개척한 게 아니라, 이미 팔리는 것을 확인하고 들어간 거죠.

순서가 반대입니다. 대부분은 브랜드를 만들고 나서 시장을 찾습니다.
그는 시장을 먼저 읽고 브랜드를 골랐습니다.`

// 같은 브랜드·다른 무브의 posts 초안(CS-20260910-02, 342자).
// 발행본과의 실측 유사도가 0.103 이었던 그 초안이다 — 그 값은 "파이프라인 외"의
// 근거가 아니었다. 진짜 주인이 후보에 없었을 뿐이다.
const DRAFT_SAME_BRAND = `"국내 로드샵→백화점→해외" 순서가 K뷰티의 정석이었다. 조선미녀는 이 순서를 거꾸로 탔다. 국내 유통망을 깔기 전에 미국 아마존을 1차 시장으로 잡았다.

국내 인지도는 그 다음에 왔다. "미국에서 더 유명한 K뷰티 브랜드"라는 타이틀이 해외 성과를 국내로 역수입하는 마케팅 소재가 됐다.

전자공시 기준으로 보면(연결·별도 집계 방식에 따라 수치가 갈린다), 연매출은 2022년 400억원에서 2024년 3237억원으로 늘었다. 매출의 90% 이상이 해외에서 나온다고 조선미녀가 협업 기사에서 밝힌 바 있다.

국내부터 다지지 않고 해외에서 먼저 터뜨리는 순서, 재현 가능한 전략일까 이 브랜드만의 예외일까.`

const POSTS_DRAFTS = [{ id: 'd1', body: DRAFT_A }, { id: 'd2', body: DRAFT_SAME_BRAND }]
const EPISODES = [{ id: 'COL-beauty-of-joseon-01', body: COLUMN_EPISODE_1 }]

{
  // ⭐ 이 작업의 핵심 회귀 테스트.
  //    같은 발행본을 두고, 후보에 칼럼 편이 있을 때와 없을 때 결론이 달라야 한다.
  const thread = { id: 't1', text: REPUBLISHED_REWRITE }

  const wide = classifyUnmatched(thread, POSTS_DRAFTS, EPISODES)
  eq('칼럼 발행본: 후보에 편이 있으면 column_episode', wide.kind, 'column_episode')
  eq('칼럼 발행본: 1등은 그 편', wide.bestId, 'COL-beauty-of-joseon-01')
  eq('칼럼 발행본: 출처 표시', wide.bestFrom, 'episode')
  check('칼럼 발행본: 파이프라인 외가 아니다', wide.bestScore >= OFF_PIPELINE_MAX, `점수 ${wide.bestScore}`)

  // 후보를 덜 본 상태(= 고치기 전 동작). 초안만 보면 점수가 0.1 대로 떨어진다.
  const narrow = classifyUnmatched(thread, POSTS_DRAFTS)
  check('칼럼 발행본: 초안만 보면 점수가 급락한다', narrow.bestScore < wide.bestScore, `${narrow.bestScore} vs ${wide.bestScore}`)
  // ★ 그래도 파이프라인 외로 내려가서는 안 된다. 임계값이 이 점수 위로 올라가면
  //   칼럼 연재 발행본이 경고에서 조용히 사라진다.
  eq('칼럼 발행본: 초안만 봐도 파이프라인 외는 아니다', narrow.kind, 'manual_link')
}

{
  // 임계값 양쪽의 실측점. 임계값을 올리려면 이 목록을 먼저 늘려야 한다.
  check('임계값: 실측 0.103(칼럼 발행본 vs 같은 브랜드 초안)은 위 — 파이프라인 외가 아니었다',
    0.103 >= OFF_PIPELINE_MAX)
  check('임계값: 실측 0.267(CS-20260910-01 재작성)은 위', 0.267 >= OFF_PIPELINE_MAX)
  check('임계값: 같은 칼럼 형제 편끼리 0.175 도 위(조치 대상으로 남는다)', 0.175 >= OFF_PIPELINE_MAX)
  check('임계값: 소재가 다른 글 쌍 0.071 은 아래', 0.071 < OFF_PIPELINE_MAX)
  check('임계값: 자동 연결 문턱보다 훨씬 아래', OFF_PIPELINE_MAX < AUTO_MATCH_MIN - 0.5)
}

{
  // 소재가 완전히 다른 글 — 파이프라인 외로 간다
  const info = classifyUnmatched({ id: 't1', text: DRAFT_OTHER.replace('발주서를', '지난 주말') }, EPISODES)
  eq('무관한 글: 파이프라인 외', info.kind, 'off_pipeline')
  check('무관한 글: 점수가 임계값 미만', info.bestScore < OFF_PIPELINE_MAX, `점수 ${info.bestScore}`)
  eq('무관한 글: 비교는 했다(사유 없음)', info.undecidable, null)
  check('무관한 글: 1등 후보는 남긴다(사람이 되짚을 단서)', !!info.bestId, info.bestId)
}

{
  // 초안이 1등이면 수동 연결 대상이다(칼럼 편이 후보에 있어도)
  const info = classifyUnmatched({ id: 't1', text: DRAFT_A + ' 조금 고침' }, POSTS_DRAFTS, EPISODES)
  eq('초안이 1등: manual_link', info.kind, 'manual_link')
  eq('초안이 1등: 출처 표시', info.bestFrom, 'draft')
  eq('초안이 1등: id 는 초안 id', info.bestId, 'd1')
}

{
  // 동점이면 초안 쪽으로 보낸다 — 그쪽이 바로 연결된다(칼럼 편은 스테이징이 먼저다)
  const same = [{ id: 'dSame', body: DRAFT_A }]
  const ep = [{ id: 'COL-x-01', body: DRAFT_A }]
  const info = classifyUnmatched({ id: 't1', text: DRAFT_A }, same, ep)
  eq('동점: 초안 우선', info.bestFrom, 'draft')
  eq('동점: manual_link', info.kind, 'manual_link')
}

{
  // 경계값을 정확히 맞춘 합성 픽스처. 한국어 본문으로는 특정 점수를 겨냥할 수
  // 없어서, 바이그램이 모두 서로 다른 문자열로 Dice 를 산수로 고정한다.
  //   A: 51자(바이그램 50개), B: 51자(50개) → 분모 100.
  //   앞머리 n자를 공유하면 겹치는 바이그램이 n-1개 → 점수 = 2(n-1)/100.
  const pool = Array.from({ length: 140 }, (_, i) => String.fromCharCode(0x4e00 + i))
  const a = pool.slice(0, 51).join('')
  const b = (n) => pool.slice(0, n).join('') + pool.slice(60, 60 + (51 - n)).join('')
  const drafts = [{ id: 'dx', body: a }]
  const at = (n) => classifyUnmatched({ id: 'tx', text: b(n) }, drafts)

  eq('경계: 정확히 임계값(0.080) 점수 확인', at(5).bestScore, 0.08)
  eq('경계: 정확히 임계값이면 파이프라인 외 아님', at(5).kind, 'manual_link')
  eq('경계: 임계값 아래(0.060) 점수 확인', at(4).bestScore, 0.06)
  eq('경계: 임계값 아래는 파이프라인 외', at(4).kind, 'off_pipeline')
  eq('경계: 임계값 위(0.100) 점수 확인', at(6).bestScore, 0.1)
  eq('경계: 임계값 위는 조치 대상', at(6).kind, 'manual_link')
}

{
  // 후보가 0건 — "닮은 게 없다"가 아니라 "비교를 못 했다"다(§7.1).
  const none = classifyUnmatched({ id: 't1', text: REPUBLISHED_REWRITE }, [])
  eq('후보 0건: 확인 불가', none.kind, 'undecidable')
  eq('후보 0건: 사유', none.undecidable, 'no_comparable_candidates')
  eq('후보 0건: 점수를 0 으로 적지 않는다', none.bestScore, null)
  eq('후보 0건: 출처도 비워 둔다', none.bestFrom, null)

  // 초안·편 행은 있지만 본문이 전부 비어 있는 경우도 같다 — diceSimilarity 의 0 을
  // "닮지 않았다"의 근거로 쓰면 안 된다.
  const empty = classifyUnmatched({ id: 't1', text: REPUBLISHED_REWRITE },
    [{ id: 'd1', body: '' }, { id: 'd2', body: null }], [{ id: 'COL-x-01', body: '  ' }])
  eq('본문 빈 후보만: 확인 불가', empty.kind, 'undecidable')

  // 초안은 0건이어도 칼럼 편이 있으면 비교는 된다
  const epOnly = classifyUnmatched({ id: 't1', text: REPUBLISHED_REWRITE }, [], EPISODES)
  eq('초안 0건 + 편 1건: 비교 가능', epOnly.kind, 'column_episode')
}

{
  // 게시물에 본문이 없는 경우(이미지 전용 글 등) — 역시 판정 불가다
  for (const [name, text] of [['null', null], ['빈 문자열', ''], ['이모지만', '🔥🙏']]) {
    const info = classifyUnmatched({ id: 't1', text }, POSTS_DRAFTS, EPISODES)
    eq(`게시물 본문 없음(${name}): 확인 불가`, info.kind, 'undecidable')
    eq(`게시물 본문 없음(${name}): 사유`, info.undecidable, 'no_text')
  }
}

{
  // 여러 건이 섞인 실제 모양 — 매처가 못 붙인 것들을 분류하면 넷으로 갈린다.
  const threads = [
    { id: 'tOK', text: DRAFT_A, permalink: null, timestamp: '2026-09-16T10:00:00+0000' },            // 자동 연결됨
    // 초안 d1 을 발행 직전에 구어체로 다시 쓴 글(CS-20260910-01 계열, 실측 0.267 대).
    // 자동 연결 문턱(0.82)에는 못 미치지만 후보로는 확실히 잡힌다.
    {
      id: 'tManual',
      text: `솔직히 말하면 재고로 300만원 날렸어요.
그 SKU 진짜 잘 나갔거든요. 숫자도 다 확인했고요. 근데 한 달 지나니까 창고에 그대로더라고요.
제가 본 건 판매량이었어요. 봤어야 하는 건 재구매율이었고요.
한 번 사고 끝나는 물건은 아무리 많이 팔려도 결국 멈춰요.`,
      permalink: null,
      timestamp: '2026-09-16T12:00:00+0000',
    },
    { id: 'tColumn', text: REPUBLISHED_REWRITE, permalink: null, timestamp: '2026-09-16T17:48:28+0000' },
    { id: 'tOff', text: '오늘 점심은 김치찌개였다. 어제도 김치찌개였고 그제도 김치찌개였다. 회사 앞에 다른 가게가 없다.', permalink: null, timestamp: '2026-09-16T18:00:00+0000' },
    { id: 'tNoText', text: null, permalink: null, timestamp: '2026-09-16T19:00:00+0000' },
  ]
  const out = matchDrafts(POSTS_DRAFTS, threads)
  eq('혼재: 자동 연결 1건', out.matched.length, 1)
  eq('혼재: 자동 연결은 완전 일치 건', out.matched[0]?.threadsId, 'tOK')

  const kinds = Object.fromEntries(
    threads
      .filter(t => out.unmatchedThreads.includes(t.id))
      .map(t => [t.id, classifyUnmatched(t, POSTS_DRAFTS, EPISODES).kind]),
  )
  eq('혼재: 미연결 4건', Object.keys(kinds).length, 4)
  eq('혼재: 손본 초안 발행본 → 수동 연결', kinds.tManual, 'manual_link')
  eq('혼재: 칼럼 편 발행본 → 칼럼 편', kinds.tColumn, 'column_episode')
  eq('혼재: 무관한 글 → 파이프라인 외', kinds.tOff, 'off_pipeline')
  eq('혼재: 본문 없는 글 → 확인 불가', kinds.tNoText, 'undecidable')
  // ⚠️ 경고 대상은 조치 가능한 둘(manual_link + column_episode)이다. 넷을 한 숫자로
  //    뭉치면(과거 동작) 매시 같은 경고가 떠서 진짜 미연결을 아무도 안 보게 된다.
  eq('혼재: 경고 대상은 2건',
    Object.values(kinds).filter(k => k === 'manual_link' || k === 'column_episode').length, 2)
}

// ── 5) 임계값 상수 자체 ───────────────────────────────────────
check('상수: AUTO_MATCH_MIN 범위', AUTO_MATCH_MIN > 0.5 && AUTO_MATCH_MIN < 1)
check('상수: AMBIGUITY_MARGIN 범위', AMBIGUITY_MARGIN > 0 && AMBIGUITY_MARGIN < 0.2)
check('상수: OFF_PIPELINE_MAX 범위', OFF_PIPELINE_MAX > 0.071 && OFF_PIPELINE_MAX <= 0.103)

// ── 결과 ──────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n❌ ${failures.length}건 실패 / ${passed + failures.length}건 중\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✅ ${passed}건 전부 통과`)
