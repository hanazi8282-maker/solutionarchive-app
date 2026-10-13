#!/usr/bin/env node
// B레인 ① 셀프테스트 — 선별 규칙·꺼진 상태·쓰기 경로 없음. DB·네트워크 없음.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PROV_AREA_CAP, PROV_MIN_AREA_SHARE, selectProvisional } from '../lib/review/provisional.ts'
import { FLAG, main, parseAlready, toApproved } from './provisional-register.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const row = (key, o = {}) => ({ key, name: key.toUpperCase(), status: 'adopt', area: '1', areaShare: 0.9, tier: 'small', posts: 8, sources: 3, ...o })

// ── 선별 규칙
{
  const s = selectProvisional([
    row('otterlike'), row('hold1', { status: 'hold' }), row('rej1', { status: 'rejected' }), row('bench1', { status: 'benchmark' }),
    row('anchor1', { tier: 'anchor' }), row('abc'), row('notes1', { area: 'notes' }), row('design1', { area: 'design' }),
    row('spread1', { areaShare: PROV_MIN_AREA_SHARE - 0.01 }), row('edge1', { areaShare: PROV_MIN_AREA_SHARE }),
    row('blocked1'), row('noarea', { area: null }), row('noshare', { areaShare: null }), row('notier', { tier: null }),
  ], { blocked: new Set(['blocked1']) })
  t('채택만 · 기준점/짧은 키/영역 밖/비율 부족/차단/못 읽음을 건너뛴다', s.picked.map((r) => r.key), ['otterlike', 'edge1'])
  t('건너뜀 사유 건수', s.skipped, { platform: 0, lowercase_name: 0, not_adopt: 3, area_out: 2, area_share_low: 1, tier_anchor: 1, key_short: 1, blocked: 1, area_cap: 0, unreadable: 3 })
}
// 실측 오탐(2026-10-14 드라이런): 플랫폼 이름·소문자 시작 일반 구
{
  const s = selectProvisional([row('tistory', { name: 'tistory' }), row('brunch', { name: 'brunch' }), row('askai', { name: 'ask AI' }), row('theauburnaffirmation', { name: 'the Auburn Affirmation' }), row('invideoai', { name: 'InVideo AI' }), row('fera', { name: 'Fera' }), row('velog', { name: 'Velog' })])
  t('플랫폼 차단·소문자 시작 건너뜀 · 제품명은 통과', [s.picked.map((r) => r.key), s.skipped.platform, s.skipped.lowercase_name], [['invideoai', 'fera'], 3, 2])
  t('한글 이름은 소문자 규칙 대상이 아님', selectProvisional([row('노션ai도구', { name: '노션 AI도구' })]).picked.length, 1)
}
// 상한: 영역별 · 오늘 이미 등록한 수를 뺀다 · 입력 순서 유지
{
  const many = Array.from({ length: 15 }, (_, i) => row(`prod${String(i).padStart(2, '0')}x`))
  const a = selectProvisional(many)
  t(`기본 상한 ${PROV_AREA_CAP}/영역`, [a.picked.length, a.skipped.area_cap, a.byArea], [PROV_AREA_CAP, 5, { 1: PROV_AREA_CAP }])
  t('입력 순서(점수순)를 유지', a.picked.map((r) => r.key), many.slice(0, PROV_AREA_CAP).map((r) => r.key))
  const b = selectProvisional(many, { alreadyToday: { 1: 8 } })
  t('오늘 이미 8건 등록 → 2건만', b.picked.length, 2)
  const c = selectProvisional([...many.slice(0, 3), row('other1x', { area: '2' })], { areaCap: 3 })
  t('상한은 영역별로 센다', [c.picked.length, c.byArea], [4, { 1: 3, 2: 1 }])
  t('같은 키 중복은 한 번만', selectProvisional([row('dupkey'), row('dupkey')]).picked.length, 1)
}
t('parseAlready', [parseAlready('1:3,2:10'), parseAlready(undefined)], [{ 1: 3, 2: 10 }, {}])
t('parseAlready: 잘못된 형식은 던진다', (() => { try { parseAlready('9:1'); return 'no throw' } catch { return 'throw' } })(), 'throw')

// ── 스크립트: 꺼진 상태·파일 쓰기·확인 불가
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'))
const rows = [row('alphaone'), row('betatwo', { area: '2' })]
const cand = async () => ({ rows })
const quiet = []
const log = (s) => quiet.push(s)
{
  const dry = await main([], { candidates: cand, env: {}, reportsDir: tmp, log })
  t('--dry: 선별만 · 파일 0', [dry.picked.length, dry.written, fs.readdirSync(tmp).length], [2, null, 0])
  const off = await main(['--run'], { candidates: cand, env: {}, reportsDir: tmp, log })
  t('--run 인데 플래그 꺼짐: 파일 0 · 사유 안내', [off.written, off.enabled, fs.readdirSync(tmp).length, quiet.some((l) => l.includes(FLAG))], [null, false, 0, true])
  const off2 = await main(['--run'], { candidates: cand, env: { [FLAG]: 'TRUE' }, reportsDir: tmp, log })
  t('플래그는 정확히 "true" 만(대소문자 다르면 꺼짐)', off2.written, null)
  const on = await main(['--run', '--date=2026-10-14'], { candidates: cand, env: { [FLAG]: 'true' }, reportsDir: tmp, log })
  const j = JSON.parse(fs.readFileSync(on.written, 'utf8'))
  t('--run + 플래그 켜짐: approved.json 2건 · 임시 표식 · anchors null', [j.length, j[0].provisional, j[0].rule_ver, j[0].anchors.appstore_id, path.basename(on.written)], [2, true, 'prov-v1', null, 'provisional-approved.json'])
  t('toApproved 항목 모양(candidate-register-draft approved 호환)', Object.keys(toApproved([rows[0]], { date: 'd' })[0]), ['name', 'norm_key', 'area', 'anchors', 'evidence_count', 'provisional', 'rule_ver', 'proposed_on'])
  const empty = await main(['--run'], { candidates: async () => ({ rows: [row('x', { status: 'rejected' })] }), env: { [FLAG]: 'true' }, reportsDir: tmp, log })
  t('선별 0건이면 파일을 쓰지 않는다', empty.written, null)
  let err = null
  try { await main([], { candidates: async () => ({ rows: [] }), env: {}, reportsDir: tmp, log }) } catch (e) { err = e.message }
  t('후보 0건·못 읽음은 던진다(선별 0건으로 접지 않는다)', /0건/.test(err ?? ''), true)
}

// ── 정적: DB 쓰기 경로 없음 · 기본 꺼짐
{
  const here = path.dirname(fileURLToPath(import.meta.url))
  const src = fs.readFileSync(path.join(here, 'provisional-register.mjs'), 'utf8') + fs.readFileSync(path.join(here, '..', 'lib', 'review', 'provisional.ts'), 'utf8')
  t('정적: .insert( / .update( / .upsert( / .delete( / supabase 쓰기 없음', /\.(insert|update|upsert|delete)\(/.test(src), false)
  t("정적: 플래그 비교는 === 'true'", /env\[FLAG\] === 'true'/.test(src), true)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`provisional-register selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
