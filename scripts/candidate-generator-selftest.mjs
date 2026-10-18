#!/usr/bin/env node
// lib/discovery/candidate-generator.ts · scripts/candidate-generator.mjs 셀프테스트 — 네트워크·DB 없음.
// 보는 것: 필터 순서(영역→중복→차단 소스→약관·robots), out-* 제외, robots 확인 불가 = 기각(§7.1), 소유자 예외만 통과,
//          하루 45 상한·② 가중, 기대 수확 모름은 0 으로 접지 않음, 등록 0, 창문 대장 pending 읽기, 입력 없으면 중단, DB/네트워크 import 0.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { GENERATOR_DAILY_CAP, dailyMetrics, filterCandidates, fromWindowLedger, pickDaily, similarAppReject } from '../lib/discovery/candidate-generator.ts'
import { main } from './candidate-generator.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}

const SOURCES = [
  { key: 'appstore', enabled: true, robots_status: 'disallowed', tos_status: null, override: 'owner_2026-10-05' },
  { key: 'clien', enabled: true, robots_status: 'allowed', tos_status: 'silent', override: null },
  { key: 'velog', enabled: true, robots_status: 'unverified', tos_status: null, override: null },
  { key: 'okky', enabled: false, robots_status: 'allowed', tos_status: null, override: null },
  { key: 'fmkorea', enabled: true, robots_status: 'allowed', tos_status: 'forbids_automation', override: null },
  { key: 'naver_x', enabled: true, robots_status: 'disallowed', tos_status: null, override: 'owner_fake' },
]
const TARGETS = [{ source_key: 'appstore', product_ref: 'kr:1' }]
const c = (o) => ({ generator: 'mention', source_key: 'clien', product_ref: 'board:x', label: '1:x', expected_yield: 10, ...o })

// ── 필터 ──
{
  const r = (o) => {
    const f = filterCandidates([c(o)], { targets: TARGETS, sources: SOURCES })
    return f.passed.length ? 'pass' : Object.keys(f.rejected)[0]
  }
  t('통과', r({}), 'pass')
  t('out-founder 제외', r({ label: 'out-founder:x' }), 'out_area')
  t('영역 없음 제외', r({ label: 'foo' }), 'no_area')
  t('hold/design 은 영역 ①~⑤ 밖', r({ label: 'design:x' }), 'no_area')
  t('기존 타깃 중복', r({ source_key: 'appstore', product_ref: 'kr:1' }), 'duplicate')
  t('차단 유지 소스(G2)', r({ source_key: 'g2' }), 'blocked_source')
  t('차단 유지 소스(danawa)', r({ source_key: 'danawa' }), 'blocked_source')
  t('소스 행 없음 = 새 소스는 이 경로 밖', r({ source_key: 'newsite' }), 'no_source')
  t('꺼진 소스', r({ source_key: 'okky' }), 'disabled')
  t('약관 자동화 금지', r({ source_key: 'fmkorea' }), 'tos_blocked')
  t('robots 확인 불가 = 기각(허용으로 접지 않음)', r({ source_key: 'velog' }), 'robots_unverified')
  t('robots 금지 + 소유자 예외 = 통과', r({ source_key: 'appstore', product_ref: 'us:1' }), 'pass')
  t('robots 금지 + 모르는 override = 기각', r({ source_key: 'naver_x' }), 'robots_unverified')
  t('모르는 갈래', r({ generator: 'llm_guess' }), 'bad_generator')
  const dup = filterCandidates([c({}), c({})], { targets: TARGETS, sources: SOURCES })
  t('같은 묶음 안 중복은 하나만', [dup.passed.length, dup.rejected.duplicate], [1, 1])
}

// ── 하루 상한·가중 ──
{
  const many = Array.from({ length: 60 }, (_, i) => c({ product_ref: `board:${i}`, label: `${(i % 5) + 1}:x`, expected_yield: 10 }))
  const picked = pickDaily(many)
  t('하루 상한 45', picked.length, GENERATOR_DAILY_CAP)
  t('② 가중이 앞으로(같은 수확이면 ② 먼저)', picked.slice(0, 12).every((p) => p.label.startsWith('2:')), true)
  t('② 로 한정하지 않음(다른 영역도 뽑힌다)', new Set(picked.map((p) => p.label[0])).size, 5)
  const unk = pickDaily([c({ product_ref: 'board:u', expected_yield: null }), c({ product_ref: 'board:k', expected_yield: 1 })])
  t('기대 수확 모름은 맨 뒤', unk.map((p) => p.product_ref), ['board:k', 'board:u'])
  const m = dailyMetrics(many, many, picked)
  t('지표: 등록은 항상 0', m.registered, 0)
  t('지표: 생성·통과·몫', [m.generated, m.passed, m.picked], [60, 60, 45])
  t('지표: 영역 분포 키', Object.keys(m.by_area).sort(), ['1', '2', '3', '4', '5'])
  const m2 = dailyMetrics([c({ expected_yield: null })], [c({ expected_yield: null })], [c({ expected_yield: null })])
  t('지표: 모르는 수확은 평균 확인 불가(null)·0 아님', [m2.avg_expected_yield, m2.yield_unknown], [null, 1])
}

// ── 창문 대장 ──
{
  const led = { entries: [{ status: 'pending', source_key: 'appstore', product_ref: 'us:9', label: '2:us|a', new_per_request: 50, reason: 'daily_cap' }, { status: 'adopted', id: 'x', source_key: 'appstore', product_ref: 'gb:9', label: '2:gb|a' }] }
  const w = fromWindowLedger(led)
  t('대장: pending 만', w.map((x) => [x.generator, x.product_ref, x.expected_yield]), [['window', 'us:9', 50]])
}

// ── CLI: 입력 없으면 중단, 파일 쓰기는 --write 때만 ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'))
  const tf = path.join(tmp, 't.json')
  const sf = path.join(tmp, 's.json')
  const lf = path.join(tmp, 'l.json')
  fs.writeFileSync(tf, JSON.stringify(TARGETS))
  fs.writeFileSync(sf, JSON.stringify(SOURCES))
  fs.writeFileSync(lf, JSON.stringify({ entries: [{ status: 'pending', source_key: 'appstore', product_ref: 'us:9', label: '2:us|a', new_per_request: 50 }] }))
  let threw = false
  try {
    main([`--sources=${sf}`], { log: () => {} })
  } catch {
    threw = true
  }
  t('CLI: --targets 없으면 중단', threw, true)
  const o = main([`--targets=${tf}`, `--sources=${sf}`, `--window-ledger=${lf}`], { log: () => {} })
  t('CLI: 창문 1건 통과·몫 1·등록 0', [o.generated, o.passed, o.picked, o.picked_rows.length, o.registered], [1, 1, 1, 1, 0])
  t('CLI: --write 없으면 파일 없음', fs.existsSync(path.join(tmp, 'r')), false)
  main([`--targets=${tf}`, `--sources=${sf}`, `--window-ledger=${lf}`, '--write', `--reports-dir=${path.join(tmp, 'r')}`, '--date=2026-10-16'], { log: () => {} })
  t('CLI: --write 는 dry-run json 하나', fs.readdirSync(path.join(tmp, 'r', '2026-10-16')), ['candidate-generator-dryrun.json'])
}

// ── 정적: DB·네트워크·쓰기 경로 없음 ──
{
  const src = fs.readFileSync('scripts/candidate-generator.mjs', 'utf8') + fs.readFileSync('lib/discovery/candidate-generator.ts', 'utf8')
  t('정적: supabase import 없음', /supabase/i.test(src.replace(/\/\/.*$/gm, '')), false)
  t('정적: fetch 호출 없음', /\bfetch\s*\(/.test(src), false)
  t('정적: INSERT/UPDATE 없음', /\b(insert|update|upsert)\s*\(/i.test(src), false)
}

// v71au ⑧ 같은 개발사 갈래 적합성 — 2026-10-19 드라이런 37건을 직접 읽어 정한 규칙의 회귀
{
  const c = (label, genre) => ({ generator: 'similar_app', source_key: 'appstore', product_ref: 'x:1', label, expected_yield: 10, evidence: `same_developer of kr:1 · ${genre} · ratings=100` })
  t('유사앱: 업무용 장르 + 업무 앱은 통과', similarAppReject(c('2:us|salesforce-field-service', 'Business')), null)
  t('유사앱: 소비자용 장르(Lifestyle) 제외', similarAppReject(c('1:kr|u-스마트홈', 'Lifestyle')), 'out_genre')
  t('유사앱: 로고·전단 제작 앱 제외', similarAppReject(c('3:us|logo-maker-create-design', 'Business')), 'consumer_or_event')
  t('유사앱: 행사 앱 제외', similarAppReject(c('2:us|salesforce-events', 'Business')), 'consumer_or_event')
  t('유사앱: 개인 메일(NFD 한글) 제외', similarAppReject(c('1:kr|네이버-메일'.normalize('NFD'), 'Productivity')), 'consumer_or_event')
  t('유사앱: window 갈래는 이 규칙을 안 탄다', similarAppReject({ ...c('1:us|otter-ai', 'Lifestyle'), generator: 'window' }), null)
}

console.log(`candidate-generator selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
