#!/usr/bin/env node
// 리뷰 수집 소스 접근 가능성 실측 — GitHub Actions 러너(Azure 대역)에서 실행.
//
// 목적은 "수집"이 아니라 **판정**이다. 어떤 소스가 데이터센터 IP 에서 실제로
// 접근되는지 알아야 수집 계층을 설계할지 말지 정할 수 있다. 그래서 소스당
// 최소 요청만 보내고 본문은 저장하지 않는다(길이와 차단 신호만 본다).
//
// ⛔ 규칙 — 어기면 파이프라인 전체가 죽는다:
//
//   1. robots.txt 를 먼저 읽고, Disallow 에 걸린 경로는 **요청하지 않는다.**
//      "차단됐다"가 아니라 "규칙상 안 간다"로 기록한다. 둘은 다른 결론이고,
//      섞으면 나중에 "여기 되는데?" 하고 다시 긁게 된다.
//   2. User-Agent 를 위장하지 않는다. 브라우저인 척하지 않고 정직하게 밝힌다.
//      403 이 돌아오면 그게 답이다 — 이 소스는 봇을 원하지 않는다.
//   3. 재시도·IP 로테이션·프록시 없음. 한 번 보고 결과를 적는다.
//   4. 요청 간 간격을 넉넉히 둔다. 판정에 속도가 필요한 일이 아니다.
//
// 결과 해석:
//   ok               — 접근 가능. 수집 후보
//   robots-disallow  — robots.txt 가 막았다. 요청 안 함
//   blocked          — 4xx/5xx 또는 차단 페이지. 우회하지 않는다
//   error            — DNS·타임아웃 등. 재시도 안 함
//
// 사용: node scripts/review-source-probe.mjs

import fs from 'node:fs/promises'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'

// robots.txt 의 User-agent 그룹과 대조할 때 쓰는 제품 토큰(RFC 9309 §2.2.1).
// UA 문자열 전체로 부분 일치를 하면 안 된다 — robots.txt 에 `User-agent: a`
// 같은 짧은 토큰이 있으면 우리 UA 안에 우연히 포함돼 남의 그룹 규칙을
// 뒤집어쓴다. 실제로 이 스크립트의 첫 버전이 그 버그를 갖고 있었다.
const PRODUCT_TOKEN = 'solutionarchive-review-probe'

const UA = `${PRODUCT_TOKEN}/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app; one-off reachability check)`

const GAP_MS = 4000 // 같은 호스트 연속 요청 사이 간격
const TIMEOUT_MS = 20_000

/**
 * 소스 목록.
 *
 * paths 는 "리뷰 원문이 있을 법한 경로"의 대표 샘플이다. 실제 상품 ID 를
 * 쓰지 않고 목록/검색 진입점을 보는 이유: 특정 상품이 삭제되면 판정이
 * 그 상품 사정에 좌우된다. 지금 재는 건 상품이 아니라 **문 앞까지 가는가** 다.
 */
const SOURCES = [
  { key: 'coupang', name: '쿠팡', origin: 'https://www.coupang.com', paths: ['/', '/np/categories/194276'] },
  { key: 'naver-smartstore', name: '네이버 스마트스토어', origin: 'https://smartstore.naver.com', paths: ['/'] },
  { key: 'naver-shopping', name: '네이버 쇼핑', origin: 'https://search.shopping.naver.com', paths: ['/', '/ns/search?query=%ED%83%88%EB%AA%A8%EC%83%B4%ED%91%B8'] },
  { key: '11st', name: '11번가', origin: 'https://www.11st.co.kr', paths: ['/', '/browsing/BestSeller.tmall'] },
  { key: 'gmarket', name: 'G마켓', origin: 'https://www.gmarket.co.kr', paths: ['/'] },
  { key: 'oliveyoung', name: '올리브영', origin: 'https://www.oliveyoung.co.kr', paths: ['/', '/store/main/getBestList.do'] },
  { key: 'musinsa', name: '무신사', origin: 'https://www.musinsa.com', paths: ['/'] },
  { key: 'danawa', name: '다나와', origin: 'https://prod.danawa.com', paths: ['/'] },
  { key: 'amazon', name: 'Amazon', origin: 'https://www.amazon.com', paths: ['/'] },
  { key: 'iherb', name: 'iHerb', origin: 'https://www.iherb.com', paths: ['/'] },
  { key: 'hwahae', name: '화해 (뷰티 리뷰)', origin: 'https://www.hwahae.co.kr', paths: ['/'] },
  { key: 'glowpick', name: '글로우픽 (뷰티 리뷰)', origin: 'https://www.glowpick.com', paths: ['/'] },
]

/**
 * 심화 단계 — 홈페이지가 열린다고 리뷰가 열리는 건 아니다.
 *
 * 1단계는 "문 앞까지 가는가"만 잰다. 리뷰 원문이 실제로 오는지는 따로 봐야
 * 한다. Amazon 이 정확히 그 함정이었다: /product-reviews/ 가 HTTP 200 에
 * 319KB 를 주지만 내용은 로그인 페이지다. 상태 코드만 봤으면 "된다"고
 * 적었을 것이다.
 *
 * needle 은 "리뷰 원문이 왔다"를 가르는 문자열이다. 없으면 껍데기다.
 */
const REVIEW_DEPTH = [
  {
    name: '다나와 판매처 리뷰',
    url: 'https://prod.danawa.com/info/dpg/ajax/companyProductReview.ajax.php?prodCode=102126566&page=1',
    needle: /상품리뷰|별점|유용한 리뷰순/,
    note: '여러 쇼핑몰 리뷰를 집약한다 — 쿠팡·11번가를 직접 못 가도 여기서 만난다',
  },
  {
    name: 'Amazon 리뷰 페이지',
    url: 'https://www.amazon.com/product-reviews/B08N5WRWNW',
    needle: /data-hook="review"/,
    note: 'HTTP 200 이지만 로그인 벽일 수 있다 — needle 로 가른다',
  },
]

/**
 * 공식 API 후보. 인증 없이 때려서 **도달 가능성만** 본다.
 * 401/403 은 여기서는 성공 신호다 — 엔드포인트가 살아 있고 응답한다는 뜻이다.
 * 크롤링보다 이쪽이 언제나 낫다: 차단당할 일이 없고 형식이 안정적이다.
 */
const APIS = [
  { key: 'naver-openapi', name: '네이버 검색 API (쇼핑)', url: 'https://openapi.naver.com/v1/search/shop.json?query=test', note: '무료. 상품 메타·가격. 리뷰 본문은 없음' },
  { key: 'naver-datalab', name: '네이버 데이터랩 API', url: 'https://openapi.naver.com/v1/datalab/shopping/categories', note: '무료. 카테고리 검색 트렌드' },
  { key: 'coupang-partners', name: '쿠팡 파트너스 API', url: 'https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=test', note: '파트너스 승인 필요. 상품 메타' },
  { key: '11st-openapi', name: '11번가 오픈 API', url: 'https://openapi.11st.co.kr/openapi/OpenApiService.tmall?key=test&apiCode=ProductSearch', note: '키 발급 필요' },
  { key: 'amazon-pa', name: 'Amazon PA-API 5', url: 'https://webservices.amazon.com/paapi5/searchitems', note: '어소시에이트 + 판매실적 요건. 리뷰는 이미지 링크만' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url) {
  const started = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      redirect: 'follow',
      signal: ctl.signal,
    })
    const body = await res.text()
    return { status: res.status, bytes: body.length, body, ms: Date.now() - started }
  } catch (e) {
    return { status: null, bytes: 0, body: '', ms: Date.now() - started, error: e.message }
  } finally {
    clearTimeout(timer)
  }
}

/** 200 인데 실제로는 차단 페이지인 경우를 잡는다. */
function blockSignal(body, status) {
  const head = body.slice(0, 4000).toLowerCase()
  const hits = []
  if (/captcha|are you a robot|자동입력 방지|보안문자/.test(head)) hits.push('captcha')
  if (/access denied|접근이 거부|비정상적인 접근|blocked/.test(head)) hits.push('access-denied')
  if (/cloudflare|attention required|cf-browser-verification/.test(head)) hits.push('cloudflare')
  if (status === 200 && body.length < 1500) hits.push('본문 과소')
  return hits
}

// ── 실행 ──────────────────────────────────────────────────────────
const out = []
const say = (s) => {
  out.push(s)
  console.log(s)
}

const egress = await get('https://api.ipify.org')
say('# 리뷰 수집 소스 접근성 실측')
say('')
say(`- 러너 egress IP: \`${egress.body.trim() || 'unknown'}\``)
say(`- User-Agent: \`${UA}\``)
say(`- 규칙: robots.txt 준수 · UA 위장 없음 · 재시도 없음 · 요청 간 ${GAP_MS / 1000}초`)
say('')

const results = []

for (const src of SOURCES) {
  const robotsRes = await get(`${src.origin}/robots.txt`)
  const groups = robotsRes.status === 200 ? parseRobots(robotsRes.body) : []
  // ⚠️ 같은 User-agent 그룹이 여러 번 나오는 사이트를 눈에 띄게 표시한다.
  //    화해가 그랬고, 병합하지 않은 파서는 뒤 그룹의 Disallow 를 통째로
  //    무시해 판정이 뒤집혔다. 새 소스를 추가할 때 이 표시를 먼저 볼 것.
  const starGroups = groups.filter((x) => x.agents.includes('*')).length
  const robotsNote =
    robotsRes.status === 200
      ? `${groups.length}개 그룹${starGroups > 1 ? ` ⚠️ * 그룹 ${starGroups}개(병합 대상)` : ''}`
      : `robots.txt ${robotsRes.status ?? robotsRes.error} — 규칙을 읽지 못함`

  // robots.txt 를 읽지 못했으면(5xx·네트워크 오류) 그 소스는 통째로 건너뛴다.
  // RFC 9309 는 5xx 를 "전부 금지"로 다루라고 한다. 404 는 "규칙 없음 = 허용"이라
  // 진행한다. 읽지 못한 것과 허용된 것을 같게 취급하면, 상대 서버가 잠깐
  // 흔들린 틈에 금지 경로를 긁게 된다.
  const robotsUnreadable = robotsRes.status === null || robotsRes.status >= 500
  if (robotsUnreadable) {
    for (const p of src.paths) {
      results.push({
        source: src.name,
        path: p,
        verdict: 'skipped',
        detail: 'robots.txt 를 읽지 못해 요청하지 않음',
        robotsNote,
      })
    }
    await sleep(GAP_MS)
    continue
  }

  await sleep(GAP_MS)

  for (const p of src.paths) {
    const pathname = new URL(p, src.origin).pathname
    const v = robotsVerdict(groups, pathname, PRODUCT_TOKEN)

    if (!v.allowed) {
      results.push({
        source: src.name,
        path: p,
        verdict: 'robots-disallow',
        detail: v.reason,
        robotsNote,
      })
      continue // 요청 자체를 보내지 않는다
    }

    const res = await get(`${src.origin}${p}`)
    let verdict
    let detail

    if (res.status === null) {
      verdict = 'error'
      detail = res.error ?? '알 수 없음'
    } else if (res.status >= 400) {
      verdict = 'blocked'
      detail = `HTTP ${res.status}`
    } else {
      const signals = blockSignal(res.body, res.status)
      verdict = signals.length > 0 ? 'blocked' : 'ok'
      detail = signals.length > 0
        ? `HTTP ${res.status} 이지만 ${signals.join(', ')}`
        : `HTTP ${res.status} · ${(res.bytes / 1024).toFixed(0)}KB · ${res.ms}ms`
    }

    results.push({ source: src.name, path: p, verdict, detail, robotsNote })
    await sleep(GAP_MS)
  }
}

say('## 사이트 직접 접근')
say('')
say('| 소스 | 경로 | 판정 | 근거 | robots |')
say('|---|---|---|---|---|')
for (const r of results) {
  const mark = { ok: '✅ ok', 'robots-disallow': '⛔ robots-disallow', blocked: '❌ blocked', error: '⚠️ error', skipped: '⏭️ skipped' }[r.verdict]
  say(`| ${r.source} | \`${r.path}\` | ${mark} | ${r.detail} | ${r.robotsNote} |`)
}

// ── 심화: 리뷰 원문이 실제로 오는가 ──────────────────────────────
say('')
say('## 리뷰 원문 도달 여부 (상태 코드가 아니라 내용으로 판정)')
say('')
say('| 대상 | 판정 | 근거 | 비고 |')
say('|---|---|---|---|')

for (const d of REVIEW_DEPTH) {
  const res = await get(d.url)
  let mark
  let why
  if (res.status === null) {
    mark = '⚠️ error'
    why = res.error ?? '알 수 없음'
  } else if (res.status !== 200) {
    mark = '❌ blocked'
    why = `HTTP ${res.status}`
  } else if (d.needle.test(res.body)) {
    mark = '✅ 리뷰 원문 확인'
    why = `HTTP 200 · ${(res.bytes / 1024).toFixed(0)}KB · 리뷰 마커 있음`
  } else {
    mark = '❌ 껍데기'
    why = `HTTP 200 · ${(res.bytes / 1024).toFixed(0)}KB 인데 리뷰 마커 없음` +
      (/sign in|Enter your email/i.test(res.body) ? ' (로그인 벽)' : '')
  }
  say(`| ${d.name} | ${mark} | ${why} | ${d.note} |`)
  await sleep(GAP_MS)
}

// ── 공식 API 도달성 ───────────────────────────────────────────────
say('')
say('## 공식 API 도달성 (인증 없이 — 401/403 이면 살아 있다는 뜻)')
say('')
say('| API | 응답 | 비고 |')
say('|---|---|---|')

for (const api of APIS) {
  const res = await get(api.url)
  const status = res.status === null ? `error: ${res.error}` : `HTTP ${res.status}`
  say(`| ${api.name} | ${status} | ${api.note} |`)
  await sleep(GAP_MS)
}

// ── 집계 ──────────────────────────────────────────────────────────
const tally = results.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {})
say('')
say('## 집계')
say('')
say(`- 접근 가능 ${tally.ok ?? 0} / robots 금지 ${tally['robots-disallow'] ?? 0} / 차단 ${tally.blocked ?? 0} / 건너뜀 ${tally.skipped ?? 0} / 오류 ${tally.error ?? 0}`)
say('')
say('판정은 사람이 한다. 이 스크립트는 "됐다/안 됐다"만 적고 우회를 시도하지 않는다.')

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n')
}
