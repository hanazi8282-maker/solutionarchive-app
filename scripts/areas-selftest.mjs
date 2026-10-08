#!/usr/bin/env node
// config/areas.json · lib/analysis/areas-config.ts 셀프테스트 — 네트워크·DB 없음.
// 보는 것: 실제 설정이 읽히고 어휘가 DB CHECK(마이그 20261009000020)와 같다 · founder 목록이 소급 규칙 v37-1 SQL 과 같고 devto 가 없다 ·
//          env 최소량 덮어쓰기(틀린 값은 경고 뒤 설정값) · 형식 오류는 cfg=null(안전한 기본값 = 영역 축 끔).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { AREA_CODES, loadAreasConfig, parseAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const throws = (name, fn, re) => {
  try {
    fn()
    t(`${name} (던져야 한다)`, 'no throw', String(re))
  } catch (e) {
    t(name, re.test(e.message), true)
  }
}

const CFG_PATH = path.join(process.cwd(), 'config', 'areas.json')
const RAW = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))
const clone = () => JSON.parse(JSON.stringify(RAW))

// ── C0: 실제 설정 ────────────────────────────────────────────────
{
  const { cfg, error, warnings } = loadAreasConfig(CFG_PATH, {})
  t('실제 설정: 읽힘 · 경고 0', [error, warnings], [null, []])
  t('실제 설정: 코드·순서', cfg.areas.map((a) => a.code), ['1', '2', '3', '4', '5', 'design', 'hold', 'out-consumer', 'out-founder'])
  t('실제 설정: 최소량 대상 = 1~5·design', scorableAreas(cfg).map((a) => a.code), ['1', '2', '3', '4', '5', 'design'])
  t('실제 설정: hold 비활성·kind hold · 영역 외 둘은 out', cfg.areas.filter((a) => !a.active).map((a) => `${a.code}:${a.kind}`), ['hold:hold', 'out-consumer:out', 'out-founder:out'])
  t('실제 설정: floor 200(설정)', [cfg.floor, cfg.floorSource], [200, 'config'])
  t('실제 설정: founder 5곳 · devto 없음(남헌 판단 대기)', [cfg.founderSources, cfg.founderSources.includes('devto')], [['hackernews', 'indiehackers', 'producthunt', 'disquiet', 'okky'], false])
  t('실제 설정: 포기 기준은 제안값', [cfg.abandon.status, cfg.abandon.minProjects, cfg.abandon.projectInputMin, cfg.abandon.minRelevantPct, cfg.abandon.grayBandPct, cfg.abandon.maxUnknownPct, cfg.abandon.minMedianInputs, cfg.abandon.immediateSwapRelevantPct],
    ['proposed', 3, 100, 30, [25, 35], 20, 50, 10])
  t('실제 설정: 표시명에 원문 범위 문구', [cfg.areas[2].name.includes('직접 도구만'), cfg.areas[3].name.includes('채용 제외')], [true, true])
}

// ── DB 어휘·소급 규칙과 대조(설정과 DB 가 갈라지면 여기서 잡힌다) ──
{
  const mig = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261009000020_analysis_projects_area.sql'), 'utf8')
  const check = /area_code IS NULL OR area_code IN \(([^)]*)\)/.exec(mig)
  const vocab = check ? [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : null
  t('DB CHECK 어휘 = AREA_CODES = 설정 코드', [vocab, [...AREA_CODES]], [RAW.areas.map((a) => a.code), RAW.areas.map((a) => a.code)])
  const founder = /coalesce\(source_key IN \(([^)]*)\), false\)/.exec(mig)
  t('소급 v37-1 founder 목록 = 설정', founder ? [...founder[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : null, RAW.founder_sources)
}

// ── env 최소량 ───────────────────────────────────────────────────
{
  const a = parseAreasConfig(clone(), { RELEVANCE_AREA_FLOOR: '150' })
  t('env 150 → floor 150(env)', [a.cfg.floor, a.cfg.floorSource, a.warnings], [150, 'env', []])
  const b = parseAreasConfig(clone(), { RELEVANCE_AREA_FLOOR: '' })
  t('env 빈 문자열(워크플로 기본) → 설정값', [b.cfg.floor, b.cfg.floorSource, b.warnings.length], [200, 'config', 0])
  for (const bad of ['0', '-5', '12.5', 'abc']) {
    const c = parseAreasConfig(clone(), { RELEVANCE_AREA_FLOOR: bad })
    t(`env '${bad}' → 경고 + 설정값`, [c.cfg.floor, c.cfg.floorSource, c.warnings.length], [200, 'config', 1])
  }
}

// ── 형식 오류는 던진다 → load 는 cfg=null ─────────────────────────
{
  const mut = (f) => { const r = clone(); f(r); return r }
  throws('코드 누락', () => parseAreasConfig(mut((r) => r.areas.splice(1, 1))), /설정에 없는 코드: 2/)
  throws('어휘 밖 코드(6)', () => parseAreasConfig(mut((r) => { r.areas[0].code = '6' })), /어휘 밖/)
  throws('코드 중복', () => parseAreasConfig(mut((r) => r.areas.push({ ...r.areas[0] }))), /중복/)
  throws('hold 활성화 금지', () => parseAreasConfig(mut((r) => { r.areas.find((a) => a.code === 'hold').active = true })), /hold/)
  throws('영역 외를 영역으로 금지', () => parseAreasConfig(mut((r) => { r.areas.find((a) => a.code === 'out-founder').kind = 'area' })), /out-founder/)
  throws('kind 어휘 밖', () => parseAreasConfig(mut((r) => { r.areas[0].kind = 'x' })), /kind/)
  throws('표시명 빈 값', () => parseAreasConfig(mut((r) => { r.areas[0].name = ' ' })), /name/)
  throws('floor 0', () => parseAreasConfig(mut((r) => { r.floor = 0 })), /floor/)
  throws('founder 빈 배열', () => parseAreasConfig(mut((r) => { r.founder_sources = [] })), /founder_sources/)
  throws('abandon 없음', () => parseAreasConfig(mut((r) => { delete r.abandon })), /abandon/)
  throws('관련 비율 101', () => parseAreasConfig(mut((r) => { r.abandon.min_relevant_pct = 101 })), /min_relevant_pct/)
  throws('회색 띠 뒤집힘', () => parseAreasConfig(mut((r) => { r.abandon.gray_band_pct = [35, 25] })), /gray_band_pct/)
  throws('기준이 회색 띠 밖', () => parseAreasConfig(mut((r) => { r.abandon.min_relevant_pct = 40 })), /회색 띠/)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'areas-cfg-'))
  const missing = loadAreasConfig(path.join(tmp, 'none.json'), {})
  t('파일 없음 → cfg null + error(확인 불가)', [missing.cfg, typeof missing.error], [null, 'string'])
  fs.writeFileSync(path.join(tmp, 'bad.json'), '{ not json')
  const bad = loadAreasConfig(path.join(tmp, 'bad.json'), {})
  t('JSON 깨짐 → cfg null + error', [bad.cfg, typeof bad.error], [null, 'string'])
  fs.writeFileSync(path.join(tmp, 'mut.json'), JSON.stringify(mut((r) => { r.areas[0].code = '6' })))
  t('어휘 밖 파일 → cfg null', loadAreasConfig(path.join(tmp, 'mut.json'), {}).cfg, null)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`areas-selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
