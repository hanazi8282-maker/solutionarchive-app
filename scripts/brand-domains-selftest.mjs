#!/usr/bin/env node
// config/brand-domains.json 셀프테스트 — 네트워크·DB 없음. 파일만 읽는다.
//   node scripts/brand-domains-selftest.mjs
//
// 고정하는 것 (하나라도 조용히 틀리면 케이스 화면에 남의 회사 로고가 붙는다 — 그게 이 검사의 이유다):
//   1. 스키마 — 항목마다 brand_name/domain/status/note/checked_at 다섯 개, 그 이상도 이하도 아니다.
//   2. 도메인 형식 — 스킴·경로·www·대문자 금지. lib/cases/logo.ts 의 normalizeDomain() 을
//      그대로 재사용해 "이 값을 로고 함수에 넣었을 때 변형되지 않는가"로 검사한다.
//      (여기서 자체 정규식을 다시 쓰면 로고 함수와 어긋나는 순간을 못 잡는다.)
//   3. status 어휘 — active|rebranded|defunct|unverified 넷뿐.
//   4. active 인데 domain 이 null 이면 실패 — 백필 SQL 이 그 행을 만들 수 없다.
//   5. defunct 인데 domain 이 있으면 실패 — 폐업 도메인은 대개 남의 회사다(§ Fab/Homejoy/Juicero).
//   6. 도메인 중복 — 서로 다른 브랜드가 같은 도메인을 가리키면 둘 중 하나는 틀렸다.
//
// "_" 로 시작하는 키(_README)는 사람이 읽는 주석이라 건너뛴다.

import { readFileSync } from 'node:fs'
import { normalizeDomain } from '../lib/cases/logo.ts'

const raw = JSON.parse(readFileSync(new URL('../config/brand-domains.json', import.meta.url), 'utf8'))

let fail = 0
const bad = (slug, msg) => { fail++; console.log(`❌ ${slug} — ${msg}`) }

const STATUS = new Set(['active', 'rebranded', 'defunct', 'unverified'])
const FIELDS = ['brand_name', 'domain', 'status', 'note', 'checked_at']
const entries = Object.entries(raw).filter(([k]) => !k.startsWith('_'))
const seen = new Map()

if (!entries.length) bad('(파일)', '항목이 하나도 없다')

for (const [slug, v] of entries) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) bad(slug, '슬러그 형식이 아니다(소문자·숫자·하이픈)')
  if (v === null || typeof v !== 'object' || Array.isArray(v)) { bad(slug, '객체가 아니다'); continue }

  const keys = Object.keys(v)
  for (const f of FIELDS) if (!(f in v)) bad(slug, `${f} 누락`)
  for (const k of keys) if (!FIELDS.includes(k)) bad(slug, `모르는 필드 ${k}`)

  if (typeof v.brand_name !== 'string' || !v.brand_name.trim()) bad(slug, 'brand_name 이 비었다')
  if (typeof v.note !== 'string' || !v.note.trim()) bad(slug, 'note 가 비었다 — 판정 근거 없이 넘기지 않는다')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.checked_at ?? '')) bad(slug, `checked_at 형식 YYYY-MM-DD 아님: ${v.checked_at}`)
  if (!STATUS.has(v.status)) bad(slug, `status 어휘 밖: ${JSON.stringify(v.status)}`)

  if (v.domain !== null) {
    if (typeof v.domain !== 'string') bad(slug, 'domain 은 문자열이거나 null')
    else if (normalizeDomain(v.domain) !== v.domain) {
      bad(slug, `도메인 형식 — 스킴/경로/www/대문자 금지. "${v.domain}" → normalizeDomain 은 ${JSON.stringify(normalizeDomain(v.domain))}`)
    } else {
      const prev = seen.get(v.domain)
      if (prev) bad(slug, `도메인 중복 — ${prev} 와 같은 ${v.domain}`)
      else seen.set(v.domain, slug)
    }
  }

  if (v.status === 'active' && v.domain === null) bad(slug, 'active 인데 domain 이 null — 백필할 값이 없다')
  if (v.status === 'defunct' && v.domain !== null) bad(slug, 'defunct 인데 domain 이 있다 — 폐업 도메인은 대개 남의 회사다')
}

const tally = entries.reduce((a, [, v]) => ((a[v.status] = (a[v.status] ?? 0) + 1), a), {})
const line = Object.entries(tally).sort().map(([k, n]) => `${k} ${n}`).join(' · ')

if (fail) { console.log(`\n실패 ${fail}건 — ${entries.length}개 브랜드(${line})`); process.exit(1) }
console.log(`통과 — 브랜드 ${entries.length}건 (${line}) · 도메인 ${seen.size}개 전부 고유·normalizeDomain 무변형`)
