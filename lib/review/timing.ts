// 수집 실행 1회의 시간 분해 — **로그 전용 계측**(남헌 v32 §7, 2026-10-07).
//
// 질문: HN 실행이 "요청 수 × 간격"보다 훨씬 길다. 시간이 어디서 새는가 — 간격 대기·외부 요청·파싱·
// 리뷰 저장(DB 왕복)·커서 저장 중 무엇인가. 추정 말고 단계별 누적 ms 로 잰다.
//
// ⚠️ 러너(runner.ts)는 건드리지 않는다. 포트·어댑터를 **감싸기만** 한다 — 같은 함수를 같은 순서·같은 인자로
//    부르고 결과·예외를 그대로 돌려준다. 동작이 바뀌지 않는다는 근거가 이 구조다(셀프테스트가 대조한다).
// ⚠️ 단계는 직렬이다(러너가 await 로 하나씩 부른다). 그래서 단계 합 ≤ 총합이고, 남는 몫이 '기타'다
//    (램프 DB 조회·되돌리기, 지문 해시 계산, 건강도 판정 등 감싸지 않은 것). 기타가 크면 감쌀 자리를 더 찾는다.

import type { RunnerPorts, RunnerStore } from './runner.ts'
import type { ReviewSourceAdapter } from './types.ts'

export const PHASES = ['sleep', 'fetch', 'robots', 'parse', 'persist', 'progress', 'setup'] as const
export type Phase = (typeof PHASES)[number]

const LABEL: Record<Phase, string> = {
  sleep: '간격대기',
  fetch: '외부요청',
  robots: 'robots',
  parse: '파싱',
  persist: '리뷰저장',
  progress: '커서저장',
  setup: '준비',
}

/** 잡이 90분 timeout 에 잘리면 소스 요약 줄이 안 찍힌다(09-28 HN). 그때도 어디까지 갔는지 남기려는 중간 줄 간격. */
export const HEARTBEAT_MS = 5 * 60_000

export function withTiming(
  adapter: ReviewSourceAdapter,
  ports: RunnerPorts,
  clock: () => number = () => performance.now(),
  log: (s: string) => void = console.log,
) {
  const ms = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>
  const calls = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>
  const t0 = clock()
  let lastBeat = t0

  const add = (p: Phase, start: number) => {
    const end = clock()
    ms[p] += end - start
    calls[p]++
    if (end - lastBeat >= HEARTBEAT_MS) {
      lastBeat = end
      log(`ℹ️ [${adapter.key}] 진행 중 ${line(end - t0)}`)
    }
  }
  const timed = async <T>(p: Phase, f: () => Promise<T>): Promise<T> => {
    const start = clock()
    try {
      return await f()
    } finally {
      add(p, start)
    }
  }

  const s = ports.store
  const store: RunnerStore = {
    loadSource: (k) => timed('setup', () => s.loadSource(k)),
    listDueTargets: (k, n) => timed('setup', () => s.listDueTargets(k, n)),
    saveTargetProgress: (p) => timed('progress', () => s.saveTargetProgress(p)),
    recordFingerprint: (fp) => timed('persist', () => s.recordFingerprint(fp)),
    appendInput: (i) => timed('persist', () => s.appendInput(i)),
    linkFingerprint: (a, b, c) => timed('persist', () => s.linkFingerprint(a, b, c)),
  }

  function line(totalMs: number): string {
    const sec = (n: number) => (n / 1000).toFixed(1)
    const pct = (n: number) => (totalMs > 0 ? Math.round((n / totalMs) * 100) : 0)
    const sum = PHASES.reduce((a, p) => a + ms[p], 0)
    const parts = PHASES.map((p) => `${LABEL[p]} ${sec(ms[p])}(${pct(ms[p])}%·${calls[p]}회)`)
    return `시간 분해 ${sec(totalMs)}초 = ${parts.join(' · ')} · 기타 ${sec(totalMs - sum)}(${pct(totalMs - sum)}%)`
  }

  return {
    adapter: {
      ...adapter,
      parse(body, ctx) {
        const start = clock()
        try {
          return adapter.parse(body, ctx)
        } finally {
          add('parse', start)
        }
      },
    } as ReviewSourceAdapter,
    ports: {
      ...ports,
      store,
      sleep: (n: number) => timed('sleep', () => ports.sleep(n)),
      fetchText: (url: string, init?: Parameters<RunnerPorts['fetchText']>[1]) =>
        timed(url.endsWith('/robots.txt') ? 'robots' : 'fetch', () => ports.fetchText(url, init)),
    } as RunnerPorts,
    ms,
    calls,
    /** 기존 소스 보고 줄 아래 한 줄. totalMs 는 그 줄의 'N초' 와 같은 시계로 잰 실행 시간. */
    line,
  }
}
