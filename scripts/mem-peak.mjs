// 메모리 피크(v71cu-4) — process.memoryUsage().rss 를 표본으로 재고, 끝날 때 '메모리 피크 NMB' 한 줄을 로그와
// 워크플로 요약(GITHUB_STEP_SUMMARY)에 남긴다. 11-19 2차 판정이 'hosted runner lost communication' 으로 죽었을 때
// 메모리를 잰 기록이 없어 원인을 추론으로만 남겼다(reports/2026-11-19-v71cu/S12-budget.md (b)).
// 러너째 죽으면 exit 훅도 못 돈다 — 그래서 호출부는 묶음마다 sample() 값을 로그에 찍는다(마지막 줄이 추세다).
import { appendFileSync } from 'node:fs'

export const toMb = (bytes) => Math.round(bytes / 1_048_576)

/** 워크플로 요약에 한 줄. 로컬·쓰기 실패는 조용히 건너뛴다(로그에는 이미 찍혔다). */
export function stepSummary(line) {
  const f = process.env.GITHUB_STEP_SUMMARY
  if (!f) return
  try { appendFileSync(f, `- ${line}\n`) } catch { /* 요약은 보조 출력 */ }
}

export function memPeak(label, { intervalMs = 5000 } = {}) {
  let peak = 0
  const sample = () => { const r = process.memoryUsage().rss; if (r > peak) peak = r; return toMb(r) }
  sample()
  const t = setInterval(sample, intervalMs)
  t.unref()
  const peakMb = () => toMb(peak)
  process.on('exit', (code) => {
    sample()
    const line = `메모리 피크 ${peakMb()}MB (${label}, 종료코드 ${code})`
    console.log(line)
    stepSummary(line)
  })
  return { sample, peakMb }
}
