#!/usr/bin/env node
// 지문 키 셀프테스트 — 네트워크도 DB 도 없이 돈다.
//
// 여기서 고정하는 것은 하나다: **같은 글이 어느 타깃 경로로 들어와도 한 행이다.**
//
//   2026-09-24 까지 identity_key 가 `sha256(source|product_ref|external_id)` 였다.
//   그래서 같은 글이 `url:` 타깃과 `board:` 타깃으로 각각 들어오면 서로 다른 키가
//   되어 analysis_inputs 에 두 행이 됐다(SP-031 과 같은 형태). 게시판 순회가 붙은
//   소스가 8곳이라 그 구멍이 곧 대량 중복이 될 상태였다.
//
// ⚠️ 가짜 지문·가짜 store 로 때우지 않는다(§7.1 사례 5). 여기서 돌리는 것은
//    **실제 clien 어댑터 + 실제 lib/review/store.ts** 다. store 만 DB 대신 아주
//    작은 가짜 PostgREST(UNIQUE 제약을 실제로 흉내내는)를 받는다.

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { clienAdapter } from '../lib/review/adapters/clien.ts'
import { danawaAdapter } from '../lib/review/adapters/danawa.ts'
import { computeFingerprint, CROSS_TARGET_MIN_TEXT_LEN } from '../lib/review/fingerprint.ts'
import { createReviewStore } from '../lib/review/store.ts'
import { encodeBoardCursor } from '../lib/review/types.ts'

let pass = 0
let fail = 0
const here = path.dirname(fileURLToPath(import.meta.url))

const t = (name, got, want) => {
  if (got === want) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'clien', name), 'utf8')

// ════════════════════════════════════════════════════════════════════
// 가짜 PostgREST — review_fingerprints 한 테이블만 안다
// ════════════════════════════════════════════════════════════════════
//
// UNIQUE (source_key, identity_key) 를 **실제로** 흉내낸다. 그게 store.ts 의
// 중복 판정 본체이므로, 그걸 흉내내지 않는 가짜는 아무것도 증명하지 못한다.
const UNIQUE = { code: '23505', message: 'duplicate key value violates unique constraint' }

function fakeDb(rows = []) {
  const state = { rows, seq: 0 }

  class Q {
    constructor(op, payload) {
      this.op = op
      this.payload = payload
      this.filters = []
      this.limitN = null
    }
    eq(col, val) {
      this.filters.push((r) => r[col] === val)
      return this
    }
    not(col, op, val) {
      if (op !== 'is' || val !== null) throw new Error(`가짜 DB 미지원: not(${col},${op})`)
      this.filters.push((r) => r[col] !== null && r[col] !== undefined)
      return this
    }
    limit(n) {
      this.limitN = n
      return this
    }
    hits() {
      const r = state.rows.filter((row) => this.filters.every((f) => f(row)))
      return this.limitN === null ? r : r.slice(0, this.limitN)
    }
    async maybeSingle() {
      const h = this.hits()
      if (h.length > 1) return { data: null, error: { code: 'PGRST116', message: '여러 행' } }
      return { data: h[0] ? { ...h[0] } : null, error: null }
    }
    then(resolve, reject) {
      return this.run().then(resolve, reject)
    }
    async run() {
      if (this.op === 'select') return { data: this.hits().map((r) => ({ ...r })), error: null }

      if (this.op === 'insert') {
        const row = this.payload
        const clash = state.rows.some(
          (r) => r.source_key === row.source_key && r.identity_key === row.identity_key,
        )
        if (clash) return { data: null, error: UNIQUE }
        state.rows.push({
          id: `fp${++state.seq}`,
          revision_count: 0,
          analysis_input_id: null,
          ...row,
        })
        return { data: null, error: null }
      }

      if (this.op === 'update') {
        const targets = this.hits()
        if ('identity_key' in this.payload) {
          for (const tgt of targets) {
            const clash = state.rows.some(
              (r) =>
                r !== tgt &&
                r.source_key === tgt.source_key &&
                r.identity_key === this.payload.identity_key,
            )
            if (clash) return { data: null, error: UNIQUE }
          }
        }
        for (const tgt of targets) Object.assign(tgt, this.payload)
        return { data: null, error: null }
      }

      throw new Error(`가짜 DB 미지원: ${this.op}`)
    }
  }

  const client = {
    from(table) {
      if (table !== 'review_fingerprints') throw new Error(`가짜 DB 는 이 테이블을 모른다: ${table}`)
      return {
        insert: (payload) => new Q('insert', payload),
        select: () => new Q('select'),
        update: (payload) => new Q('update', payload),
      }
    },
  }

  return { state, store: createReviewStore(client) }
}

// 옛 공식 — 이 파일 안에서만 쓰는 재계산기. 이행 경로를 고정하는 데 필요하다.
const legacyKey = (source, productRef, externalId) =>
  createHash('sha256').update(`${source}|${productRef}|${externalId}`, 'utf8').digest('hex')

// ════════════════════════════════════════════════════════════════════
// 1) 같은 글, 두 타깃 경로 — 실제 clien 어댑터로
// ════════════════════════════════════════════════════════════════════
const POST_PATH = '/service/board/park/19264755'
const postHtml = await fx('post-with-comments.html')

// url: 모드 — 사람이 글 주소를 직접 등록한 타깃.
const urlMode = clienAdapter.parse(postHtml, { productRef: `url:${POST_PATH}`, cursor: null })
// board: 모드 — 게시판 순회가 목록에서 찾아 큐에 담은 같은 글.
const boardMode = clienAdapter.parse(postHtml, {
  productRef: 'board:park',
  cursor: encodeBoardCursor({ q: [POST_PATH], last: '19264755' }),
})

ok('전제: 두 경로가 같은 건수를 낸다', urlMode.reviews.length === boardMode.reviews.length)
ok('전제: 리뷰가 1건 이상 나온다(픽스처가 살아 있다)', urlMode.reviews.length > 0)
t(
  '전제: 두 경로의 externalId 가 같다(어댑터가 경로로 조립한다)',
  boardMode.reviews.map((r) => r.externalId).join(','),
  urlMode.reviews.map((r) => r.externalId).join(','),
)

const keysOf = (res, productRef) =>
  res.reviews.map((r) => computeFingerprint('clien', productRef, r).identityKey)

const urlKeys = keysOf(urlMode, `url:${POST_PATH}`)
const boardKeys = keysOf(boardMode, 'board:park')

t('키: url: 경로와 board: 경로의 identity_key 가 같다', boardKeys.join(','), urlKeys.join(','))
t('키: 합집합이 늘어나지 않는다(= 중복 행이 안 생긴다)', new Set([...urlKeys, ...boardKeys]).size, urlKeys.length)

// 실제 store 로 두 번 적재해 본다 — 판정까지 봐야 "한 행"이 증명된다.
{
  const { state, store } = fakeDb()
  const verdicts = []
  for (const r of urlMode.reviews) {
    verdicts.push(await store.recordFingerprint(computeFingerprint('clien', `url:${POST_PATH}`, r)))
  }
  const firstRows = state.rows.length
  for (const r of boardMode.reviews) {
    verdicts.push(await store.recordFingerprint(computeFingerprint('clien', 'board:park', r)))
  }

  t('store: 첫 경로는 전부 new', verdicts.slice(0, urlMode.reviews.length).every((v) => v === 'new'), true)
  t('store: 두 번째 경로는 전부 duplicate', verdicts.slice(urlMode.reviews.length).join(','), urlMode.reviews.map(() => 'duplicate').join(','))
  t('store: 지문 행이 늘지 않는다', state.rows.length, firstRows)
}

// ════════════════════════════════════════════════════════════════════
// 2) externalId 가 없는 경로 — productRef 를 **유지한다**
// ════════════════════════════════════════════════════════════════════
//
// `판매처|작성자|작성일` 만으로는 사이트 안에서 유일하지 않다. 여기서 productRef 를
// 빼면 같은 날 같은 판매처에서 같은 마스킹 이름으로 쓴 **다른 상품 리뷰**가 한
// 리뷰로 뭉개진다 — 중복 적재보다 나쁘다.
{
  const noId = {
    externalId: null,
    text: '조립이 좀 힘들었어요',
    rating: 4,
    seller: '11번가',
    authorMasked: 'vl****',
    writtenAt: '2026-09-06',
  }
  const a = computeFingerprint('danawa', 'p1', noId, true)
  const b = computeFingerprint('danawa', 'p2', noId, true)
  t('폴백: kind=composite', a.kind, 'composite')
  ok('폴백: productRef 가 다르면 다른 키다(유지)', a.identityKey !== b.identityKey)
  t('폴백: 옛 키 폴백이 필요 없다(공식이 그대로다)', a.legacyIdentityKey, null)
}

// ════════════════════════════════════════════════════════════════════
// 3) 다나와 회귀 — 타깃 범위 id 는 키가 바뀌지 않는다
// ════════════════════════════════════════════════════════════════════
//
// 리뷰 seq 가 몰마다 다른 id 공간에서 온다(9자리 vs 11자리 0패딩). productRef 를
// 빼면 다른 상품의 다른 리뷰 둘이 한 리뷰로 뭉개진다.
{
  const rv = {
    externalId: '252495223',
    text: '가벼운데 성능도 만족합니다',
    rating: 5,
    seller: '11번가',
    authorMasked: 'vl****',
    writtenAt: '2026-09-06',
  }
  const a = computeFingerprint('danawa', 'p1', rv, true)
  const b = computeFingerprint('danawa', 'p2', rv, true)
  ok('다나와: 상품이 다르면 여전히 다른 리뷰', a.identityKey !== b.identityKey)
  t('다나와: 키가 옛 공식과 같다(이행 없음)', a.identityKey, legacyKey('danawa', 'p1', '252495223'))
  t('다나와: 그래서 옛 키 폴백이 없다', a.legacyIdentityKey, null)

  const unified = computeFingerprint('danawa', 'p1', rv, false)
  ok('플래그가 꺼지면 키가 달라진다(플래그가 실제로 배선돼 있다)', unified.identityKey !== a.identityKey)
  t('플래그가 꺼지면 옛 키를 폴백으로 들고 있다', unified.legacyIdentityKey, a.identityKey)
}

// ════════════════════════════════════════════════════════════════════
// 4) 이행 — 옛 키 행을 찾으면 새 키로 승격한다(행을 늘리지 않는다)
// ════════════════════════════════════════════════════════════════════
{
  const review = urlMode.reviews[0]
  const fp = computeFingerprint('clien', `url:${POST_PATH}`, review)

  const old = {
    id: 'old1',
    source_key: 'clien',
    identity_key: legacyKey('clien', `url:${POST_PATH}`, review.externalId),
    content_hash: fp.contentHash,
    key_kind: 'seq',
    product_ref: `url:${POST_PATH}`,
    written_at: fp.writtenAt,
    revision_count: 0,
    analysis_input_id: 'in-old',
  }
  t('전제: 옛 키가 새 키와 다르다', fp.legacyIdentityKey, old.identity_key)

  const { state, store } = fakeDb([old])
  const verdict = await store.recordFingerprint(fp)

  t('이행: 옛 키로 맞으면 duplicate(재적재 안 함)', verdict, 'duplicate')
  t('이행: 행이 늘지 않는다', state.rows.length, 1)
  t('이행: 그 행의 identity_key 가 새 키로 갱신됐다', state.rows[0].identity_key, fp.identityKey)
  t('이행: 원문 연결은 그대로다', state.rows[0].analysis_input_id, 'in-old')

  // 승격 뒤 두 번째 실행은 UNIQUE 충돌 경로로 들어온다(폴백을 다시 타지 않는다).
  t('이행: 다음 실행도 duplicate', await store.recordFingerprint(fp), 'duplicate')
  t('이행: 여전히 1행', state.rows.length, 1)
}

// 옛 키 행의 본문이 바뀐 경우 — 승격 + revised 판정이 같이 나야 한다.
{
  const review = urlMode.reviews[0]
  const fp = computeFingerprint('clien', `url:${POST_PATH}`, review)
  const old = {
    id: 'old2',
    source_key: 'clien',
    identity_key: fp.legacyIdentityKey,
    content_hash: 'deadbeef',
    key_kind: 'seq',
    product_ref: `url:${POST_PATH}`,
    written_at: fp.writtenAt,
    revision_count: 0,
    analysis_input_id: 'in-old',
  }
  const { state, store } = fakeDb([old])
  t('이행: 본문이 바뀐 옛 키 행은 revised', await store.recordFingerprint(fp), 'revised')
  t('이행: revised 도 새 키로 승격된다', state.rows[0].identity_key, fp.identityKey)
  t('이행: content_hash 가 갱신된다', state.rows[0].content_hash, fp.contentHash)
  t('이행: revision_count 가 1', state.rows[0].revision_count, 1)
  t('이행: 그래도 1행', state.rows.length, 1)
}

// ════════════════════════════════════════════════════════════════════
// 5) 2차 방어 — 옛 행이 **다른 타깃**으로 저장돼 폴백이 못 찾는 경우
// ════════════════════════════════════════════════════════════════════
//
// 이게 키 이행만으로 막히지 않는 구멍이다: `url:` 타깃이 어제 적재한 행의 옛 키는
// 그때의 productRef 로 계산돼 있어, 오늘 `board:` 타깃이 만든 옛 키와 안 맞는다.
{
  const long = 'ㄱ'.repeat(CROSS_TARGET_MIN_TEXT_LEN)
  const review = { ...urlMode.reviews[0], text: long }
  const fpBoard = computeFingerprint('clien', 'board:park', review)

  const strayOldRow = {
    id: 'stray',
    source_key: 'clien',
    // 어제 `url:` 타깃이 만든 옛 키 — 오늘 board 타깃의 폴백 후보와 다르다.
    identity_key: legacyKey('clien', `url:${POST_PATH}`, review.externalId),
    content_hash: fpBoard.contentHash,
    key_kind: 'seq',
    product_ref: `url:${POST_PATH}`,
    written_at: fpBoard.writtenAt,
    revision_count: 0,
    analysis_input_id: 'in-yesterday',
  }
  ok('전제: 폴백 후보가 그 행과 다르다(= 폴백은 실패한다)', fpBoard.legacyIdentityKey !== strayOldRow.identity_key)

  const { state, store } = fakeDb([strayOldRow])
  t('2차: 같은 본문이 이미 적재돼 있으면 cross-target', await store.recordFingerprint(fpBoard), 'cross-target')
  t('2차: 남은 원문 연결은 어제 것 하나뿐', state.rows.filter((r) => r.analysis_input_id !== null).length, 1)
  // 두 번째 실행은 방금 만든 새 키 행의 UNIQUE 에 걸려 조회 없이 끝난다.
  t('2차: 다음 실행은 duplicate(조회를 반복하지 않는다)', await store.recordFingerprint(fpBoard), 'duplicate')
}

// 짧은 본문에는 적용하지 않는다 — 서로 다른 사람의 "감사합니다"를 버리면 안 된다.
{
  const short = '감사합니다'
  const review = { ...urlMode.reviews[0], externalId: `${POST_PATH}#9999`, text: short }
  const fp = computeFingerprint('clien', 'board:park', review)
  ok('전제: 짧은 본문이다', fp.textLength < CROSS_TARGET_MIN_TEXT_LEN)

  const twin = {
    id: 'twin',
    source_key: 'clien',
    identity_key: 'whatever',
    content_hash: fp.contentHash,
    key_kind: 'seq',
    product_ref: `url:${POST_PATH}`,
    written_at: null,
    revision_count: 0,
    analysis_input_id: 'in-other',
  }
  const { store } = fakeDb([twin])
  t('2차: 짧은 본문은 본문만으로 버리지 않는다', await store.recordFingerprint(fp), 'new')
}

// ════════════════════════════════════════════════════════════════════
// 6) 어댑터별 externalId 유일성 감사표
// ════════════════════════════════════════════════════════════════════
//
// ⚠️ 표에 없는 어댑터가 생기면 **이 테스트가 실패한다.** 그게 목적이다 —
//    "확인하지 않았다"는 통과가 아니다(§7.1). 새 어댑터를 붙였으면 externalId 가
//    사이트 전역에서 유일한지 판단해 한 줄을 추가해라.
//
//   값 true  = 타깃(상품) 안에서만 유일 → 키에 product_ref 를 남긴다
//   값 false = 사이트 전역 유일          → 키에서 product_ref 를 뺀다
const AUDIT = {
  // 정규화된 글 경로(+ `#댓글id`)를 externalId 로 쓴다 → 구성상 사이트 전역 유일.
  '82cook.ts': false,
  'bobaedream.ts': false,
  'brunch.ts': false,
  'clien.ts': false,
  'damoang.ts': false,
  'fmkorea.ts': false,
  'okky.ts': false,
  'theqoo.ts': false,
  'todayhumor.ts': false,
  'velog.ts': false,
  // `blogId:logNo` — 네이버 전역에서 글 1개를 가리킨다.
  'naver-blog.ts': false,
  // 플랫폼 전역 id. HN objectID · YouTube 댓글 id · 텀블벅 후기 id(`tbr:<id>`).
  // 텀블벅은 같은 후기가 두 프로젝트 페이지에 실려 오는 것을 실측했다(SP-031) =
  // 그 id 가 프로젝트 범위가 아니라는 근거다.
  'hackernews.ts': false,
  'youtube.ts': false,
  'tumblbug.ts': false,
  // 판매처 리뷰 seq 가 몰마다 다른 id 공간에서 온다(9자리 vs 11자리 0패딩, 2026-08-29 실측).
  'danawa.ts': true,
  // RSS 리뷰 id 의 전역 유일성을 실측하지 않았다. 한 리뷰는 한 앱에만 달리므로
  // 타깃끼리 겹칠 수 없다 = 좁혀 둬도 잃는 것이 없다.
  'appstore.ts': true,
}

{
  const dir = path.join(here, '..', 'lib', 'review', 'adapters')
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.ts') && f !== 'url-ref.ts')

  t('감사표: 어댑터 파일과 표의 집합이 같다', files.filter((f) => !(f in AUDIT)).join(','), '')
  t('감사표: 표에 죽은 줄이 없다', Object.keys(AUDIT).filter((f) => !files.includes(f)).join(','), '')

  for (const f of files) {
    if (!(f in AUDIT)) continue
    // Windows 절대경로는 file:// URL 로 바꿔야 동적 import 가 된다.
    const mod = await import(pathToFileURL(path.join(dir, f)).href)
    const adapter = Object.values(mod).find(
      (v) => v && typeof v === 'object' && typeof v.key === 'string' && typeof v.parse === 'function',
    )
    ok(`감사표: ${f} 가 어댑터를 export 한다`, Boolean(adapter))
    if (!adapter) continue
    t(`감사표: ${adapter.key} 의 productScopedExternalId`, adapter.productScopedExternalId === true, AUDIT[f])
  }

  // 코드가 실제로 그 플래그를 보고 있는지(선언만 있고 안 읽히면 표는 장식이다).
  t('감사표: danawa 어댑터가 좁힘을 선언한다', danawaAdapter.productScopedExternalId, true)
  t('감사표: clien 어댑터는 선언하지 않는다', clienAdapter.productScopedExternalId, undefined)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log('지문 키 정상 — 같은 글은 어느 타깃 경로로 들어와도 한 행이고, 타깃 범위 id 는 좁힌 채로 남는다.')
