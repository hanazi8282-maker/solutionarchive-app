#!/usr/bin/env node
// .github/workflows/collect-gap-watchdog.yml 정적 검사(v71k 3-3) — 이 감시자가 스스로 폭주하거나 아무것도 못 하게 되지 않도록 핵심 성질을 고정한다. 네트워크·DB 없음.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const y = fs.readFileSync('.github/workflows/collect-gap-watchdog.yml', 'utf8').replace(/\r\n/g, '\n')
let pass = 0
const t = (name, fn) => { fn(); pass++; console.log(`✓ ${name}`) }

t('크론은 30분 간격이고 정각·30분이 아니다', () => {
  const m = y.match(/- cron: '([^']+)'/)
  assert.ok(m, 'cron 없음')
  const [min, ...rest] = m[1].split(' ')
  const mins = min.split(',').map(Number)
  assert.equal(mins.length, 2)
  assert.equal(Math.abs(mins[1] - mins[0]), 30)
  assert.ok(mins.every((x) => x !== 0 && x !== 30))
  assert.deepEqual(rest, ['*', '*', '*', '*'])
})
t('권한: 워크플로 기본은 contents:read, actions:write 는 job 안에서 한 번만', () => {
  const head = y.slice(0, y.indexOf('jobs:'))
  assert.ok(head.includes('permissions:\n  contents: read') && !head.includes('actions: write'))
  assert.equal(y.split('actions: write').length - 1, 1)
})
t('main 에서만 · 끄기 변수(GAP_WATCHDOG_ENABLED=false)로 job 이 시작되지 않는다', () => {
  assert.ok(y.includes("github.ref == 'refs/heads/main'") && y.includes("vars.GAP_WATCHDOG_ENABLED != 'false'"))
})
t('기본은 DRY(로그만) — GAP_WATCHDOG_DRY=false 를 설정해야 실제로 건다', () => {
  assert.ok(y.includes("DRY: ${{ vars.GAP_WATCHDOG_DRY != 'false' }}") && y.includes('[DRY]'))
})
t('수집·판정 모두 dry_run=false 를 명시한다(기본 입력 dry_run=true 함정) + 수집은 source=all', () => {
  assert.ok(y.includes('check nightly-review-collect.yml "$COLLECT_MIN" -f dry_run=false -f source=all'))
  assert.ok(y.includes('check nightly-relevance.yml "$JUDGE_MIN" -f dry_run=false'))
})
t('건너뛰는 조건: 진행/대기 중 · 4시간 안 수동 실행 · 이력 못 읽음', () => {
  assert.ok(y.includes('in_progress') && y.includes('queued') && y.includes('< 14400'))
  assert.ok(y.includes('실행 이력을 못 읽었다'))
})
t('기준은 분 단위 숫자만 받고 수집 330(5.5시간) · 판정 840(14시간)이 기본이다(근거는 파일 머리말)', () => {
  assert.ok(y.includes("vars.GAP_WATCHDOG_COLLECT_MIN || '330'") && y.includes("vars.GAP_WATCHDOG_JUDGE_MIN || '840'") && y.includes('*[!0-9]*'))
})
t('보호 파일 nightly-review-collect.yml 은 이 PR 이 수정하지 않는다(대상으로만 부른다)', () => {
  assert.ok(!y.includes('git commit') && !y.includes('git push'))
})
console.log(`\ngap-watchdog selftest: ${pass} pass`)
