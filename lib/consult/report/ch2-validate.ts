// 결론서 2장 "결정 메모" 검증기 — 순수 함수(파일 내 import 는 같은 report/ 디렉토리의 순수 유틸뿐). 유료 기능이자 결론서 v4 2장.
// 문체(v71ci §2): 합니다체, 권고는 "~하세요", 별명 금지, "90일 재측정" 금지, 액션플랜은 쓰되 날짜를 넣지 않는다(done_when 은 완료 조건이지 날짜가 아니다).
import { assertNoStatViolations } from './stat-lint.ts'

export type Ch2 = {
  decision: string // 첫 문장 = 1층 ⓓ memo_first 와 같은 결론
  options: { name: string; pros: string; cons: string }[]
  recommendation: { choice: string; reasons: string[]; change_mind_if: string[] }
  risks: { risk: string; mitigation: string }[]
  actionplan: { step: string; done_when: string }[]
  // v71cl-엔진(v5): 핵심 예측 확률 + 종료 조건 + 기각한 대안. 옛 결론서(캐시)에는 없을 수 있어 옵셔널.
  prediction_pct?: number // 0~100, "핵심 예측 확률(%)"
  kill_condition?: string // "언제 그만둘지" — Annie Duke Quit / Camuffo
  rejected_alternative?: { name: string; reason: string } // 기각한 대안 1개와 이유
  // v71cm: 해결책 층 강화 — 모든 모드 공통 "실행 패키지"(복붙 가능 산출물 + 2주 실험 + 플랜 B).
  execution_package?: {
    artifacts: string[] // 2~5개, 바로 복붙해 쓰는 산출물(가격표 초안·공지 메일 문안·랜딩 첫 3줄·인터뷰 질문 5개·측정 시트 열 이름 등)
    experiment: { what: string; who: string; n: number; success_metric: string; if_fail: string } // 2주 실험 설계
    plan_b: { name: string; trigger: string } // 반증 조건이 켜지면 넘어갈 대안(3장 후보 중 승격)
  }
}

const BANNED = /90\s*일\s*재측정/
// 액션플랜 단계에 날짜(2026-11-30, 11월 30일, 3월 말, 다음 주 등 구체 일정)를 넣지 않는다.
const DATED = /(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*[/]\s*\d{1,2}(?!\d)|다음\s*주|이번\s*주|내일|오늘까지)/

const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`메모 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}
const arr = (v: unknown, min: number, max: number, field: string): unknown[] => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`메모 형식 오류: ${field} 는 ${min}~${max}개`)
  return v
}

export function validateCh2(raw: Record<string, unknown>, memoFirst: string): Ch2 {
  const rec = (raw.recommendation ?? {}) as Record<string, unknown>
  const out: Ch2 = {
    decision: s(raw.decision, 200, 'decision'),
    options: arr(raw.options, 2, 4, '선택지').map((o, i) => {
      const x = (o ?? {}) as Record<string, unknown>
      return { name: s(x.name, 80, `선택지 ${i + 1} 이름`), pros: s(x.pros, 300, `선택지 ${i + 1} 장점`), cons: s(x.cons, 300, `선택지 ${i + 1} 단점`) }
    }),
    recommendation: {
      choice: s(rec.choice, 120, 'recommendation.choice'),
      reasons: arr(rec.reasons, 2, 4, '권고 이유').map((r, i) => s(r, 300, `권고 이유 ${i + 1}`)),
      change_mind_if: arr(rec.change_mind_if, 1, 3, '결정을 바꿀 조건').map((r, i) => s(r, 300, `바꿀 조건 ${i + 1}`)),
    },
    risks: arr(raw.risks, 1, 4, '위험').map((o, i) => {
      const x = (o ?? {}) as Record<string, unknown>
      return { risk: s(x.risk, 300, `위험 ${i + 1}`), mitigation: s(x.mitigation, 300, `완화 ${i + 1}`) }
    }),
    actionplan: arr(raw.actionplan, 3, 6, '액션플랜').map((o, i) => {
      const x = (o ?? {}) as Record<string, unknown>
      return { step: s(x.step, 200, `단계 ${i + 1}`), done_when: s(x.done_when, 200, `단계 ${i + 1} 완료 조건`) }
    }),
  }
  if (raw.prediction_pct != null) {
    const p = Number(raw.prediction_pct)
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error('메모 형식 오류: prediction_pct 는 0~100')
    out.prediction_pct = Math.round(p)
  }
  if (raw.kill_condition != null) out.kill_condition = s(raw.kill_condition, 300, 'kill_condition')
  if (raw.rejected_alternative != null) {
    const ra = raw.rejected_alternative as Record<string, unknown>
    out.rejected_alternative = { name: s(ra.name, 80, 'rejected_alternative.name'), reason: s(ra.reason, 300, 'rejected_alternative.reason') }
  }
  if (raw.execution_package != null) {
    const ep = raw.execution_package as Record<string, unknown>
    const artifacts = arr(ep.artifacts, 2, 5, 'execution_package.artifacts').map((a, i) => s(a, 400, `execution_package.artifacts[${i}]`))
    const exp = (ep.experiment ?? {}) as Record<string, unknown>
    const n = Number(exp.n)
    if (!Number.isFinite(n) || n <= 0) throw new Error('메모 형식 오류: execution_package.experiment.n 은 양수')
    const pb = (ep.plan_b ?? {}) as Record<string, unknown>
    out.execution_package = {
      artifacts,
      experiment: { what: s(exp.what, 300, 'experiment.what'), who: s(exp.who, 200, 'experiment.who'), n: Math.round(n), success_metric: s(exp.success_metric, 200, 'experiment.success_metric'), if_fail: s(exp.if_fail, 200, 'experiment.if_fail') },
      plan_b: { name: s(pb.name, 120, 'plan_b.name'), trigger: s(pb.trigger, 300, 'plan_b.trigger') },
    }
  }
  const text = JSON.stringify(out)
  if (BANNED.test(text)) throw new Error('메모 문체 오류: 금지 표현')
  assertNoStatViolations(text, '결정 메모')
  if (out.actionplan.some((a) => DATED.test(a.step) || DATED.test(a.done_when))) throw new Error('메모 형식 오류: 액션플랜에 날짜가 들어 있음')
  // 메모의 첫 문장은 1층 ⓓ 와 같은 결론이어야 한다(화면 사이 모순 방지) — 앞 20자가 같거나 포함 관계.
  const a = out.decision.replace(/\s/g, '')
  const b = memoFirst.replace(/\s/g, '')
  if (b && !(a.startsWith(b.slice(0, 20)) || b.startsWith(a.slice(0, 20)))) throw new Error('메모 형식 오류: 결정 문장이 1층 메모 첫 문장과 다름')
  return out
}
