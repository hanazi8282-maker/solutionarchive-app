#!/usr/bin/env node
// 다나와 파서 셀프테스트 — 네트워크 없이 픽스처로만 돈다.
//
// 이게 파서를 순수 함수로 뗀 이유다. 다나와가 구조를 바꿔도 저장된 픽스처로
// 새 파서를 짜고 옛 픽스처로 회귀를 확인할 수 있다. 남의 서버를 때려가며
// 디버깅하지 않는다.
//
// ⚠️ 픽스처는 실제 응답의 **구조만** 보존한다. 리뷰 본문과 작성자는 합성값으로
//    치환했다. 원문을 분석 기간만 보관하고 폐기하기로 해놓고 공개 리포에
//    영구 커밋하면 말이 맞지 않는다. 파서가 깨지는 건 구조지 본문이 아니라
//    회귀 검증 가치는 그대로다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { danawaAdapter, __internal } from '../lib/review/adapters/danawa.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'danawa', name), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (got === want) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const many = await fx('many.html')
const page2 = await fx('page2.html')
const few = await fx('few.html')
const empty = await fx('empty.html')

const ctx = (cursor = null) => ({ productRef: '93387356', cursor })

// ── 항목 경계 ─────────────────────────────────────────────────────
t('10건짜리에서 항목 10개를 자른다', __internal.splitItems(many).length, 10)
t('3건짜리에서 항목 3개를 자른다', __internal.splitItems(few).length, 3)
t('빈 응답은 항목 0개', __internal.splitItems(empty).length, 0)

// 경계가 새면 앞 항목 값이 뒤에 붙는다. 항목마다 seq 가 유일한지로 잡는다.
{
  const r = danawaAdapter.parse(many, ctx())
  const seqs = r.reviews.map((x) => x.externalId)
  t('seq 가 항목 수만큼 나온다', seqs.filter(Boolean).length, r.reviews.length)
  t('seq 가 전부 유일하다 — 경계가 새지 않았다', new Set(seqs).size, seqs.length)
}

// ── 필드 6종 ──────────────────────────────────────────────────────
{
  const r = danawaAdapter.parse(few, ctx())
  t('3건 파싱', r.reviews.length, 3)
  t('파싱 실패 0', r.parseFailures, 0)

  const a = r.reviews[0]
  ok('externalId 가 숫자 문자열', /^\d+$/.test(a.externalId))
  ok('본문이 비지 않았다', a.text.length > 0)
  t('100점 → 5.0 으로 정규화', a.rating, 5)
  t('판매처를 읽는다', a.seller, '11번가')
  ok('작성일이 ISO 형식', /^\d{4}-\d{2}-\d{2}$/.test(a.writtenAt))
  ok('작성자가 마스킹된 형태', /\*{2,}$/.test(a.authorMasked))

  t('둘째 판매처도 읽는다', r.reviews[1].seller, '롯데하이마트')

  // 제목과 본문이 합쳐지는지 — 제목만 있고 본문이 없는 리뷰가 실제로 있다
  ok('제목이 본문에 포함된다', a.text.includes('만족합니다'))
}

// 척도 변환 경계
t('100점 → 5', __internal.toFiveScale(100), 5)
t('80점 → 4', __internal.toFiveScale(80), 4)
t('0점 → 0', __internal.toFiveScale(0), 0)
t('50점 → 2.5', __internal.toFiveScale(50), 2.5)
t('90점 → 4.5', __internal.toFiveScale(90), 4.5)

// ── 커서 ──────────────────────────────────────────────────────────
{
  const target = { cursor: null, productRef: '93387356' }
  const req1 = danawaAdapter.nextRequest(target)
  ok('첫 요청은 page=1', req1.url.includes('page=1'))
  ok('상품 코드가 URL 에 들어간다', req1.url.includes('prodCode=93387356'))

  const req2 = danawaAdapter.nextRequest({ ...target, cursor: '3' })
  ok('커서 3 다음은 page=4', req2.url.includes('page=4'))

  t('커서가 깨졌으면 요청하지 않는다', danawaAdapter.nextRequest({ ...target, cursor: 'abc' }), null)
}

// ── 종료 신호 ─────────────────────────────────────────────────────
//
// ⚠️ 빈 페이지가 HTTP 404 가 아니라 **정상 200** 으로 온다. 상태 코드로는
//    끝을 알 수 없고 본문을 봐야 한다. 실측에서 확인한 사실이다.
{
  const r = danawaAdapter.parse(empty, ctx('1'))
  t('빈 응답은 리뷰 0건', r.reviews.length, 0)
  t('빈 응답은 nextCursor 가 null — 이 타깃 끝', r.nextCursor, null)
  t('빈 응답은 파싱 실패가 아니다', r.parseFailures, 0)
}
{
  const r = danawaAdapter.parse(many, ctx('1'))
  ok('내용이 있으면 커서가 이어진다', r.nextCursor !== null)
}

// ⚠️ 커서 **값**을 검증한다. 위처럼 null 여부만 보면 커서가 제자리에
//    머무는 걸 못 잡는다. 실제로 그 버그가 있었고, 통합 테스트에서야
//    드러났다 — 단위에서 잡혔어야 할 것이다.
//
//    nextRequest 는 cursor+1 을 요청하므로, parse 는 **방금 가져온
//    페이지 번호**를 돌려줘야 한다. 둘이 비대칭이면 같은 페이지를
//    영원히 다시 받는다.
{
  t('첫 페이지(cursor=null)를 읽으면 커서는 1', danawaAdapter.parse(many, ctx(null)).nextCursor, '1')
  t('cursor=1 로 요청한 페이지는 2 → 커서도 2', danawaAdapter.parse(page2, ctx('1')).nextCursor, '2')
  t('cursor=7 이면 가져온 건 8', danawaAdapter.parse(many, ctx('7')).nextCursor, '8')

  // nextRequest 와 parse 가 대칭인지 — 한 바퀴 돌려 본다.
  let cursor = null
  const pages = []
  for (let i = 0; i < 4; i++) {
    const url = danawaAdapter.nextRequest({ productRef: 'p', cursor }).url
    pages.push(new URL(url).searchParams.get('page'))
    cursor = danawaAdapter.parse(many, ctx(cursor)).nextCursor
  }
  t('페이지가 1,2,3,4 로 전진한다', pages.join(','), '1,2,3,4')
}

// 2페이지도 항목이 있다 — 페이지네이션이 실제로 동작한다
{
  const p1 = danawaAdapter.parse(many, ctx('1'))
  const p2 = danawaAdapter.parse(page2, ctx('2'))
  ok('2페이지에도 리뷰가 있다', p2.reviews.length > 0)

  const s1 = new Set(p1.reviews.map((r) => r.externalId))
  const overlap = p2.reviews.filter((r) => s1.has(r.externalId)).length
  t('1·2페이지 리뷰가 겹치지 않는다', overlap, 0)
}

// ── 구조가 깨졌을 때 조용히 넘어가지 않는가 ──────────────────────
//
// 이게 이 셀프테스트에서 가장 중요한 부분이다. 다나와가 바뀌었을 때
// "0건 수집"으로 조용히 끝나면 2주 뒤에 안다.
{
  // 항목 경계는 그대로인데 필드가 전부 사라진 경우
  const broken = few
    .replace(/companyReview-button-(side|block)-\d+/g, 'companyReview-button-$1-x')
    .replace(/<span class="mall">[\s\S]*?<\/span>\s*<\/span>/g, '')
    .replace(/<span class="date">[^<]*<\/span>/g, '')
  const r = danawaAdapter.parse(broken, ctx())
  ok('필드가 사라지면 parseFailures 로 잡힌다', r.parseFailures > 0)
}
{
  // 본문 컨테이너 클래스만 바뀐 경우 — 이게 가장 교활한 실패다.
  //
  // 제목(<p class="tit">)은 그대로 읽히므로 "제목만 남은 리뷰"가 정상처럼
  // 수집되고, seq·판매처·날짜가 멀쩡하니 언뜻 아무 문제가 없어 보인다.
  // 수집량은 그대로인데 본문만 사라진 채로 몇 주가 간다.
  //
  // 이 테스트가 실제로 그 구멍을 잡아냈다. 파서를 고쳐 컨테이너 부재를
  // 구조 변경 신호로 쓴다 — 픽스처 23개 항목 전부에 컨테이너가 있었다.
  const renamed = few.replace(/<div class="atc">/g, '<div class="content">')
  const r = danawaAdapter.parse(renamed, ctx())
  t('본문 클래스가 바뀌면 전 항목이 파싱 실패로 잡힌다', r.parseFailures, 3)
  ok('리뷰를 버리지는 않는다 — 시끄럽게 보고하고 남긴다', r.reviews.length > 0)
}
{
  // 컨테이너는 있는데 내용만 빈 경우 = 원래 내용이 없는 리뷰(별점만 남김).
  // 구조는 멀쩡하므로 실패가 아니다. 위 케이스와 가르는 게 컨테이너의 존재다.
  const emptyBody = few
    .replace(/<div class="atc">[\s\S]*?<\/div>/g, '<div class="atc"></div>')
    .replace(/<p class="tit">[\s\S]*?<\/p>/g, '')
  const r = danawaAdapter.parse(emptyBody, ctx())
  t('내용 없는 리뷰는 저장하지 않는다', r.reviews.length, 0)
  t('내용 없음은 파싱 실패가 아니다 — 구조는 멀쩡하다', r.parseFailures, 0)
}
{
  // 컨테이너가 통째로 사라지고 제목도 없으면 구조 변경이다.
  const noText = few
    .replace(/<div class="atc">[\s\S]*?<\/div>/g, '')
    .replace(/<p class="tit">[\s\S]*?<\/p>/g, '')
  const r = danawaAdapter.parse(noText, ctx())
  t('컨테이너가 사라지면 리뷰 0건', r.reviews.length, 0)
  t('그리고 조용히 넘어가지 않는다', r.parseFailures, 3)
}
{
  // 항목 마크 자체가 바뀐 경우 — 가장 치명적이다
  const noMark = few.replace(/danawa-prodBlog-companyReview-clazz-more/g, 'x-review-item')
  const r = danawaAdapter.parse(noMark, ctx())
  t('항목 마크가 바뀌면 0건', r.reviews.length, 0)
  t('그리고 끝난 것으로 보고한다(러너가 신규 0건으로 잡는다)', r.nextCursor, null)
}

// ── HTML 정리 ─────────────────────────────────────────────────────
t('태그 제거', __internal.stripHtml('<b>가</b>나'), '가나')
t('br 은 줄바꿈으로', __internal.stripHtml('가<br>나'), '가\n나')
t('엔티티 복원', __internal.stripHtml('a&amp;b &lt;c&gt;'), 'a&b <c>')
t('연속 공백 압축', __internal.stripHtml('가   나'), '가 나')
t('앞뒤 공백 제거', __internal.stripHtml('  가  '), '가')

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('파서가 틀렸다. 이 상태로 수집하면 잘못된 데이터가 분석에 들어간다.')
  process.exit(1)
}
console.log('다나와 파서 정상 — 구조가 깨지면 조용히 넘어가지 않는다.')
