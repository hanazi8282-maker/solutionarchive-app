#!/usr/bin/env node
// 수집 시간 분해 계측(lib/review/timing.ts) 셀프테스트 — 네트워크·DB 없음. 가짜 시계·가짜 어댑터·가짜 DB.
//
// 고정하는 것:
//   1. 감싸도 러너 동작이 같다 — 결과(RunResult)·DB 호출 순서·외부 요청 순서가 감싸지 않은 실행과 한 글자도 안 다르다.
//   2. 단계 합 = 총합 — 가짜 시계는 감싼 자리에서만 흐르므로 '기타'가 정확히 0 이어야 한다.
//   3. 단계별 몫·횟수가 주입한 지연과 맞다(신규 리뷰 1건 = 저장 호출 3회).
//   4. 예외는 그대로 올라가고, 걸린 시간은 그래도 센다.
//   5. 5분 넘게 걸리면 중간 줄을 남긴다(잡이 timeout 에 잘려도 어디까지 갔는지 보이게).

import { runCollection } from '../lib/review/runner.ts'
import { withTiming, HEARTBEAT_MS, PHASES } from '../lib/review/timing.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

const DELAY = { fetch: 300, robots: 300, store: 200, progress: 100, setup: 50, parse: 5 }
const PAGES = 3
const PER_PAGE = 4

/** 가짜 세계 하나. clock 은 감싼 포트 안에서만 흐른다. */
function world({ throwOn = null, slowStoreMs = 0 } = {}) {
  const w = { now: 0, events: [] }
  const tick = (ms) => (w.now += ms)
  const seen = new Set()
  const store = {
    async loadSource(key) {
      tick(DELAY.setup)
      w.events.push(['loadSource', key])
      return { key, enabled: true, minIntervalMs: 1000, dailyRequestCap: 100, requestsToday: 0 }
    },
    async listDueTargets(key, n) {
      tick(DELAY.setup)
      w.events.push(['listDueTargets', key, n])
      return [{ id: 't1', projectId: 'p1', sourceKey: key, productRef: 'q:x', cursor: null, lastReviewAt: null, consecutiveEmpty: 0 }]
    },
    async saveTargetProgress(p) {
      tick(DELAY.progress)
      w.events.push(['saveTargetProgress', p])
    },
    async recordFingerprint(fp) {
      tick(DELAY.store + slowStoreMs)
      w.events.push(['recordFingerprint', fp.identityKey])
      if (throwOn === 'recordFingerprint') throw new Error('가짜 DB 오류')
      if (seen.has(fp.identityKey)) return 'duplicate'
      seen.add(fp.identityKey)
      return 'new'
    },
    async appendInput(i) {
      tick(DELAY.store)
      w.events.push(['appendInput', i.text])
      return `in-${w.events.length}`
    },
    async linkFingerprint(s, k, id) {
      tick(DELAY.store)
      w.events.push(['linkFingerprint', s, k, id])
    },
  }
  const ports = {
    now: () => new Date(Date.UTC(2026, 9, 7) + w.now),
    sleep: async (ms) => {
      tick(ms)
      w.events.push(['sleep', ms])
    },
    async fetchText(url) {
      w.events.push(['fetch', url])
      if (url.endsWith('/robots.txt')) {
        tick(DELAY.robots)
        return { status: 200, body: 'User-agent: *\nAllow: /\n' }
      }
      tick(DELAY.fetch)
      return { status: 200, body: url.split('page=')[1] }
    },
    store,
  }
  const adapter = {
    key: 'fake',
    displayName: '가짜',
    incrementalOnly: true,
    nextRequest: (target) => ({ url: `https://fake.example/api?page=${target.cursor ?? 0}` }),
    parse(body) {
      tick(DELAY.parse)
      const page = Number(body)
      const reviews = Array.from({ length: PER_PAGE }, (_, i) => ({
        externalId: `r${page}-${i}`,
        text: `가짜 리뷰 본문 ${page}-${i}`,
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: `2026-10-0${7 - page}`,
      }))
      return { reviews, nextCursor: page + 1 < PAGES ? String(page + 1) : null, parseFailures: 0 }
    },
  }
  return { w, ports, adapter }
}

const OPTS = { dryRun: false, targetLimit: 10 }

// 1. 동작 불변
{
  const a = world()
  const plain = await runCollection(a.adapter, OPTS, a.ports)
  const b = world()
  const tm = withTiming(b.adapter, b.ports, () => b.w.now, () => {})
  const start = b.w.now
  const wrapped = await runCollection(tm.adapter, OPTS, tm.ports)
  const total = b.w.now - start

  t('감싸도 RunResult 가 같다', wrapped, plain)
  t('감싸도 DB·요청·대기 순서가 같다', b.w.events, a.w.events)
  t('가짜 시계가 실제로 흘렀다(검사가 공회전이 아니다)', total > 0, true)

  // 2. 단계 합 = 총합
  const sum = PHASES.reduce((s, p) => s + tm.ms[p], 0)
  t('단계 합 = 총합(기타 0)', sum, total)
  t('기타 0 이 줄에 찍힌다', /기타 0\.0\(0%\)$/.test(tm.line(total)), true)

  // 3. 몫·횟수
  const newCount = PAGES * PER_PAGE
  t('신규 리뷰 수', plain.stats.newReviews, newCount)
  t('저장 호출 = 신규 × 3(지문·원문·연결)', tm.calls.persist, newCount * 3)
  t('저장 시간 = 호출 × 지연', tm.ms.persist, newCount * 3 * DELAY.store)
  t('외부 요청 = 페이지 수', [tm.calls.fetch, tm.ms.fetch], [PAGES, PAGES * DELAY.fetch])
  t('robots 1회(호스트 캐시)', [tm.calls.robots, tm.ms.robots], [1, DELAY.robots])
  t('파싱 = 페이지 수', [tm.calls.parse, tm.ms.parse], [PAGES, PAGES * DELAY.parse])
  t('준비 = loadSource + listDueTargets', tm.calls.setup, 2)
  t('커서 저장 = 페이지마다 + 타깃 끝 1회', tm.calls.progress, PAGES + 1)
  // 페이지 사이 처리(파싱+저장+커서)가 간격(1000ms)보다 길면 대기는 0 이다 — Pacer 는 '마지막 요청 이후' 남은 몫만 잔다.
  // 지금 지연이면 페이지당 처리 = 5 + 12×200 + 100 > 1000 → 대기 0회. 이게 HN 에서 간격 대기가 거의 안 보이는 이유다.
  t('처리가 간격보다 길면 간격 대기 0회', tm.calls.sleep, 0)
}

// 처리가 간격보다 짧으면 대기가 잡힌다(대기 계측이 실제로 도는지)
{
  const b = world()
  b.adapter.parse = (body) => ({ reviews: [], nextCursor: Number(body) + 1 < PAGES ? String(Number(body) + 1) : null, parseFailures: 0 })
  const tm = withTiming(b.adapter, b.ports, () => b.w.now, () => {})
  const start = b.w.now
  await runCollection(tm.adapter, OPTS, tm.ports)
  const total = b.w.now - start
  t('빈 페이지면 간격 대기 = 페이지 수 − 1', tm.calls.sleep, PAGES - 1)
  t('대기 시간 = 간격 − (요청 + 커서 저장)', tm.ms.sleep, (PAGES - 1) * (1000 - DELAY.fetch - DELAY.progress))
  t('대기 포함해도 단계 합 = 총합', PHASES.reduce((s, p) => s + tm.ms[p], 0), total)
}

// 4. 예외 통과
{
  const b = world({ throwOn: 'recordFingerprint' })
  const tm = withTiming(b.adapter, b.ports, () => b.w.now, () => {})
  let err = null
  try {
    await runCollection(tm.adapter, OPTS, tm.ports)
  } catch (e) {
    err = e.message
  }
  t('저장 예외가 그대로 올라간다', err, '가짜 DB 오류')
  t('실패한 호출도 시간을 센다', [tm.calls.persist, tm.ms.persist], [1, DELAY.store])
}

// 5. 중간 줄
{
  const b = world({ slowStoreMs: HEARTBEAT_MS / 4 })
  const logs = []
  const tm = withTiming(b.adapter, b.ports, () => b.w.now, (s) => logs.push(s))
  await runCollection(tm.adapter, OPTS, tm.ports)
  t('5분 넘으면 중간 줄을 남긴다', logs.length >= 1, true)
  t('중간 줄에 소스 키와 분해가 있다', /^ℹ️ \[fake\] 진행 중 시간 분해 .*리뷰저장/.test(logs[0] ?? ''), true)
}

console.log(`review-timing-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)
