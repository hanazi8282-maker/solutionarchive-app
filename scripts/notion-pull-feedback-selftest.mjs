#!/usr/bin/env node
// notion-pull-feedback.mjs 의 순수 헬퍼 셀프테스트. 네트워크·DB 없음.
//
// 여기서 고정하는 것: 실패를 종료 코드로 드러내는가(진단 2-2·3-4) ·
// 판정 로그 코드가 하루 안에서 증가하는가 · <발행본> 마커 분리.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pullVerdict, nextLogCode, splitPublishedMarker } from './notion-pull-feedback.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── pullVerdict (종료 코드) ───────────────────────────────────────
t('verdict: 전부 성공 → 0', pullVerdict({}).code, 0)
t('verdict: 인자 없어도 0', pullVerdict().code, 0)
t('verdict: 페이지 읽기 실패 1건 → 1', pullVerdict({ error: 1 }).code, 1)
t('verdict: 전건 실패 → 1', pullVerdict({ error: 12 }).code, 1)
t('verdict: DB 갱신 실패만 있어도 1', pullVerdict({ updFailed: 1 }).code, 1)
ok('verdict: 사유가 문장에 남는다', pullVerdict({ error: 3 }).line.includes('3건'))
ok('verdict: 재처리 위험을 문장에 적는다', pullVerdict({ updFailed: 1 }).line.includes('다음 밤'))

// ── nextLogCode ──────────────────────────────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfp-'))
  const p = path.join(dir, 'log.md')
  t('logcode: 파일 없으면 01', nextLogCode(p, '2026-09-16'), 'LOG-20260916-01')
  fs.writeFileSync(p, '# 로그\n\n## LOG-20260916-01 — url\n', 'utf-8')
  t('logcode: 01 이 있으면 02', nextLogCode(p, '2026-09-16'), 'LOG-20260916-02')
  // DB 갱신 실패로 로그를 안 남긴 행은 같은 코드를 다음 밤에 다시 쓴다(중복 누적 방지).
  t('logcode: 로그에 안 쌓였으면 번호가 안 늘어난다', nextLogCode(p, '2026-09-16'), 'LOG-20260916-02')
  t('logcode: 날짜가 바뀌면 01 부터', nextLogCode(p, '2026-09-17'), 'LOG-20260917-01')
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── splitPublishedMarker ─────────────────────────────────────────
t('marker: 없으면 published=null', splitPublishedMarker('초안만').published, null)
t('marker: 없으면 body 는 원문', splitPublishedMarker('초안만').body, '초안만')
{
  const s = splitPublishedMarker('초안\n<발행본>\n실제 발행본')
  t('marker: body 는 마커 앞', s.body, '초안\n')
  t('marker: published 는 마커 뒤', s.published, '실제 발행본')
}
t('marker: 두 번째 마커는 발행본 안에 둔다', splitPublishedMarker('a<발행본>b<발행본>c').published, 'b<발행본>c')

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('풀백 헬퍼가 틀렸다. 실패가 exit 0 으로 새거나 판정 로그 코드가 중복된다.')
  process.exitCode = 1
} else {
  console.log('풀백 헬퍼 정상 — 종료 코드 3상태·로그 코드 증가·발행본 마커 확인.')
}
