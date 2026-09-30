// 실증 판정 1회(judge). app/api/analyze/angle/route.ts 에서 옮겼다(2026-10-01, I4-9 1번) — 리포트 앵글 검증
// (lib/cases/idea-angles-run.ts)이 같은 판정 한 벌을 쓴다. 동작 변경 0: 프롬프트·강등 규칙·fail-close 그대로.
// 프롬프트(JUDGE_SYSTEM_PROMPT)는 UNTRUSTED_INPUT_NOTICE 를 싣는다(judge-prompt.ts, untrusted-input-selftest 등록부).
//
// LLM 호출은 `call` 로 받는다 — 라우트는 callLlmJsonWithModel(provider, …)를, 리포트 앵글은 호출 수를 세는 래퍼를 넘긴다.
import { SUBSTANTIATION_VERDICTS, type SubstantiationVerdict } from './types.ts'
import {
  JUDGE_SYSTEM_PROMPT,
  buildJudgePrompt,
  normalizeWhitespace,
  type EvidenceCorpus,
  type JudgeAspect,
} from './judge-prompt.ts'

export type JsonCall = (system: string, user: string, label: string) => Promise<{ data: Record<string, unknown>; model: string }>

export type JudgeResult = {
  verdict: SubstantiationVerdict
  reason: string
  evidenceQuote: string | null
  /** 이 판정을 낸 실제 모델명 */
  model: string
}

export function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

/**
 * 실증 판정 1회. 프롬프트만으로는 막히지 않는 두 가지를 코드로 막는다.
 *  (A) 인용 환각 — SUBSTANTIATED 인데 인용이 없거나 원문에 없으면 UNSUBSTANTIATED 로 강등
 *  (B) fail-close — 파싱이 어긋나면 통과(EXPERIENTIAL)가 아니라 UNSUBSTANTIATED
 */
export async function judgeHeadline(
  call: JsonCall,
  headline: string,
  aspects: JudgeAspect[],
  outputType: string,
  evidence: EvidenceCorpus,
  label: string,
): Promise<JudgeResult> {
  const { data: parsed, model } = await call(JUDGE_SYSTEM_PROMPT, buildJudgePrompt(headline, aspects, outputType, evidence), label)

  let verdict =
    pickEnum<SubstantiationVerdict>(parsed.verdict, SUBSTANTIATION_VERDICTS) ?? 'UNSUBSTANTIATED'
  let reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''
  let quote =
    typeof parsed.evidence_quote === 'string' && parsed.evidence_quote.trim()
      ? parsed.evidence_quote.trim()
      : null

  if (verdict === 'SUBSTANTIATED') {
    const needle = normalizeWhitespace(quote ?? '')
    if (!needle || !evidence.normalized.includes(needle)) {
      console.warn(
        `[analyze/angle] ${label}: SUBSTANTIATED 강등 — ${needle ? '인용이 원문에 없음' : '인용 없음'} quote=${JSON.stringify((quote ?? '').slice(0, 120))}`,
      )
      verdict = 'UNSUBSTANTIATED'
      reason = `${reason || '(사유 없음)'} / 코드검증: 원문 인용이 확인되지 않아 강등`
      quote = null
    }
  }

  return { verdict, reason, evidenceQuote: verdict === 'SUBSTANTIATED' ? quote : null, model }
}
