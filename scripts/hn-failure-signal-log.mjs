#!/usr/bin/env node
// HN 실패신호 후보를 reports/hn-failed-idea-candidates.md 에 append 한다.
//
// DB 에 아무것도 쓰지 않는다. failed_angles 에도 손대지 않는다 — 이 파일은 사람이
// 읽고 "이건 진짜 실패 사례다" 싶은 것만 docs/failed-angles.md 로 직접 옮기는
// 대기열이다. reports/ 는 §10.1 에서 무인 루프가 써도 되는 경로다.
//
// 입력은 Algolia 응답 형태의 JSON. 이미 수집 중인 그 응답을 그대로 넣으면 된다.
//   { "hits": [...] }  또는  [ ...hits ]
//
// 실행:
//   node scripts/hn-failure-signal-log.mjs <hits.json> "<검색 맥락>"
//   node scripts/hn-failure-signal-log.mjs <hits.json> "q:notion" --dry

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { htmlStrip } from '../lib/review/adapters/hackernews.ts'
import {
  FAILURE_SIGNAL_ENABLED,
  candidateFromHit,
  existingObjectIds,
  formatCandidateBlock,
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

`

const [, , jsonPath, contextArg, ...rest] = process.argv
const dry = rest.includes('--dry')

if (!jsonPath) {
  console.error('사용법: node scripts/hn-failure-signal-log.mjs <hits.json> "<검색 맥락>" [--dry]')
  process.exit(2)
}
if (!FAILURE_SIGNAL_ENABLED) {
  console.log('FAILURE_SIGNAL_ENABLED=false — 아무것도 하지 않는다.')
  process.exit(0)
}

const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const hits = Array.isArray(doc) ? doc : Array.isArray(doc?.hits) ? doc.hits : null
if (!hits) {
  console.error('hits 배열을 찾지 못했다. Algolia 응답이나 hit 배열을 넣어라.')
  process.exit(1)
}

const context = (contextArg ?? '').trim() || '(맥락 미기재)'

const found = []
for (const hit of hits) {
  if (!hit || typeof hit !== 'object') continue
  const c = candidateFromHit(hit, context, htmlStrip)
  if (c) found.push(c)
}

const existingMd = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
const fresh = selectNewCandidates(existingObjectIds(existingMd), found)

console.log(`hit ${hits.length}건 · 실패신호 ${found.length}건 · 신규 ${fresh.length}건`)
for (const c of fresh) console.log(`  HN ${c.objectId} ← ${c.phrases.join(', ')}`)

if (dry || fresh.length === 0) {
  if (fresh.length === 0) console.log('추가할 것이 없다.')
  process.exit(0)
}

const body = fresh.map(formatCandidateBlock).join('\n')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, existingMd ? existingMd.replace(/\s*$/, '\n\n') + body : HEADER + body, 'utf8')
console.log(`→ ${path.relative(ROOT, OUT)} 에 ${fresh.length}건 append`)
