#!/usr/bin/env node
// HN 실패신호 후보를 reports/hn-failed-idea-candidates.md 에 append 한다.
//
// DB 에 아무것도 쓰지 않는다. failed_angles 에도 손대지 않는다 — 이 파일은 사람이
// 읽고 "이건 진짜 실패 사례다" 싶은 것만 docs/failed-angles.md 로 직접 옮기는
// 대기열이다. reports/ 는 §10.1 에서 무인 루프가 써도 되는 경로다.
//
// 두 가지 입력 방식이 있다.
//
//   1. 파일 — Algolia 응답 형태의 JSON 을 넘긴다. 이미 수집 중인 그 응답을
//      그대로 넣으면 된다. `{ "hits": [...] }` 또는 `[ ...hits ]`.
//   2. --sweep — 구문 12개를 Algolia 에 직접 질의한다. 워크플로가 쓰는 길이다.
//      사람이 매번 손으로 응답을 떠다 넣던 것을 없애려고 붙였다.
//
// 실행:
//   node scripts/hn-failure-signal-log.mjs <hits.json> "<검색 맥락>"
//   node scripts/hn-failure-signal-log.mjs <hits.json> "q:notion" --dry
//   node scripts/hn-failure-signal-log.mjs --sweep
//   node scripts/hn-failure-signal-log.mjs --sweep --dry
//
// 종료 코드: 0 성공 / 1 입력·형식 오류 / 2 조회 실패(확인 불가)
//
// ⚠️ --sweep 은 구문 하나라도 조회에 실패하면 **아무것도 쓰지 않고 2 로 죽는다**.
//    일부만 훑은 결과를 append 하면 파일이 "이만큼 봤다"는 거짓말을 하게 된다
//    (§7.1 — 0건과 못 읽음은 다른 사건이다). 매일 도는 스윕이라 하루 건너뛰어도
//    다음 실행이 같은 구간을 다시 훑는다 — search_by_date 는 최신순이고 중복은
//    object_id 로 막힌다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { htmlStrip } from '../lib/review/adapters/hackernews.ts'
import { USER_AGENT } from '../lib/review/runner.ts'
import {
  FAILURE_PHRASES,
  FAILURE_SIGNAL_ENABLED,
  candidateFromHit,
  existingObjectIds,
  formatCandidateBlock,
  phraseSearchUrl,
  selectNewCandidates,
} from '../lib/review/failure-signal.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'reports', 'hn-failed-idea-candidates.md')

const HEADER = `# HN 실패신호 후보 대기열

이 파일은 자동 생성된 **후보 목록**이지 확정된 실패 사례가 아니다.
\`scripts/hn-failure-signal-log.mjs\` 가 이미 수집한 HN 댓글 본문에서 강한 다단어
실패 신호 구문을 찾아 여기에 쌓는다. DB 에는 아무것도 쓰지 않는다.

사람이 읽고 진짜 실패 사례라고 판단한 것만 \`docs/failed-angles.md\` 표로 직접
옮긴다. 옮긴 뒤 \`scripts/failed-angles-sync.mjs\` 가 \`failed_angles\` 로 upsert 한다.

각 블록의 \`- 판정:\` 줄이 사람의 결론이다. \`(미검토)\` 면 아직 안 읽은 것이고,
\`채택\` 은 \`docs/failed-angles.md\` 로 옮긴 것, \`기각(오탐)\` 은 읽고 버린 것이다.
**기각한 블록도 지우지 않는다** — \`## HN <id>\` 머리글이 중복 방지 키라(
\`lib/review/failure-signal.ts\` \`existingObjectIds\`), 지우면 다음 실행이 같은
댓글을 다시 올린다.

`

const argv = process.argv.slice(2)
const dry = argv.includes('--dry')
const sweep = argv.includes('--sweep')
const [jsonPath, contextArg] = argv.filter((a) => !a.startsWith('--'))

if (!sweep && !jsonPath) {
  console.error('사용법: node scripts/hn-failure-signal-log.mjs <hits.json> "<검색 맥락>" [--dry]')
  console.error('        node scripts/hn-failure-signal-log.mjs --sweep [--dry]')
  process.exit(1)
}
if (!FAILURE_SIGNAL_ENABLED) {
  console.log('FAILURE_SIGNAL_ENABLED=false — 아무것도 하지 않는다.')
  process.exit(0)
}

/** 요청 간격. HN Algolia 는 공개 API 지만 12번을 몰아치지 않는다. */
const REQUEST_GAP_MS = 1500
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 얼마나 거슬러 올라가 볼 것인가. 매일 도는 스윕이라 기본은 짧게 잡는다.
 * 실측(2026-09-16): 하한 없이 12구문을 훑으면 신규 후보가 420건이다 — 희귀
 * 구문이 2007년 댓글까지 긁어 온다. 사람이 읽는 대기열에 그걸 쏟으면 아무도
 * 안 읽는다. 과거분 백필이 필요하면 `--since-days 4000` 처럼 크게 준다.
 */
const DEFAULT_SINCE_DAYS = 7
const sinceArg = argv.find((a) => a.startsWith('--since-days='))
const sinceDays = sinceArg ? Number(sinceArg.split('=')[1]) : DEFAULT_SINCE_DAYS
if (!Number.isFinite(sinceDays) || sinceDays <= 0) {
  console.error(`--since-days 값이 이상하다: ${sinceArg}`)
  process.exit(1)
}

/**
 * 한 실행에 append 할 상한.
 *
 * ponytail: 단순 상한이다. 넘친 후보는 버려지는 게 아니라 다음 실행에서 다시
 * 잡힌다 — 중복 판정이 파일의 `## HN <id>` 머리글 기준이라, 아직 안 쓴 것은
 * "이미 있음"으로 안 걸린다. 한 구문이 갑자기 유행해도 대기열이 안 터진다.
 * 매일 상한에 붙는다면 그건 구문 목록을 손볼 신호지 상한을 올릴 신호가 아니다.
 */
const MAX_APPEND_PER_RUN = 25

/** 구문 12개를 훑어 hit 을 모은다. 실패는 모아서 돌려준다 — 삼키지 않는다. */
async function sweepPhrases(sinceEpoch) {
  const byId = new Map()
  const failures = []
  for (const phrase of FAILURE_PHRASES) {
    try {
      const res = await fetch(phraseSearchUrl(phrase, { sinceEpoch }), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      })
      if (!res.ok) {
        failures.push(`"${phrase}" → HTTP ${res.status}`)
      } else {
        const doc = await res.json()
        // 200 이어도 hits 배열이 없으면 응답 구조가 바뀐 것이다. 0건으로 접지 않는다.
        if (!Array.isArray(doc?.hits)) {
          failures.push(`"${phrase}" → 200 인데 hits 배열이 없다 (응답 구조 변경?)`)
        } else {
          for (const h of doc.hits) if (h && typeof h.objectID === 'string') byId.set(h.objectID, h)
          console.log(`  "${phrase}" → hit ${doc.hits.length}건`)
        }
      }
    } catch (e) {
      failures.push(`"${phrase}" → ${e.message}`)
    }
    await sleep(REQUEST_GAP_MS)
  }
  return { hits: [...byId.values()], failures }
}

let hits
let context

if (sweep) {
  const sinceEpoch = Math.floor(Date.now() / 1000) - sinceDays * 86400
  console.log(`실패신호 스윕 — 구문 ${FAILURE_PHRASES.length}개 · 최근 ${sinceDays}일`)
  const swept = await sweepPhrases(sinceEpoch)
  if (swept.failures.length) {
    console.error(`⚠️ 확인 불가: 구문 ${swept.failures.length}/${FAILURE_PHRASES.length}개 조회 실패 — 아무것도 쓰지 않는다.`)
    for (const f of swept.failures) console.error(`   ${f}`)
    process.exit(2)
  }
  hits = swept.hits
  const today = new Date().toISOString().slice(0, 10)
  context = `자동 스윕 · 구문 ${FAILURE_PHRASES.length}개 · 최근 ${sinceDays}일 (Algolia search_by_date, ${today} UTC)`
} else {
  const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  hits = Array.isArray(doc) ? doc : Array.isArray(doc?.hits) ? doc.hits : null
  if (!hits) {
    console.error('hits 배열을 찾지 못했다. Algolia 응답이나 hit 배열을 넣어라.')
    process.exit(1)
  }
  context = (contextArg ?? '').trim() || '(맥락 미기재)'
}

const found = []
for (const hit of hits) {
  if (!hit || typeof hit !== 'object') continue
  const c = candidateFromHit(hit, context, htmlStrip)
  if (c) found.push(c)
}

const existingMd = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
const all = selectNewCandidates(existingObjectIds(existingMd), found)
// 넘친 건 버리는 게 아니라 미룬다 — 파일에 안 썼으니 다음 실행에서 다시 잡힌다.
const fresh = sweep ? all.slice(0, MAX_APPEND_PER_RUN) : all

console.log(`hit ${hits.length}건 · 실패신호 ${found.length}건 · 신규 ${all.length}건`)
if (all.length > fresh.length) {
  console.log(`⚠️ 한 실행 상한 ${MAX_APPEND_PER_RUN}건 — ${all.length - fresh.length}건은 다음 실행으로 미룬다.`)
}
for (const c of fresh) console.log(`  HN ${c.objectId} ← ${c.phrases.join(', ')}`)

if (dry || fresh.length === 0) {
  if (fresh.length === 0) console.log('추가할 것이 없다.')
  process.exit(0)
}

const body = fresh.map(formatCandidateBlock).join('\n')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, existingMd ? existingMd.replace(/\s*$/, '\n\n') + body : HEADER + body, 'utf8')
console.log(`→ ${path.relative(ROOT, OUT)} 에 ${fresh.length}건 append`)
