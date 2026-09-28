'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
import { columnAvailability, readRelevanceSubmission, stratumOf, STRATUM_LABEL } from '@/lib/relevance-feedback/sample'
import { FEEDBACK_MIGRATION, INFORMATIVE_MIGRATION, isMissingColumn, isMissingRelation } from '@/lib/relevance-feedback/db'
import type { FeedbackRow } from '@/lib/relevance-feedback/sample'

// ⛔ 사람 전용 쓰기 경로 — /relevance/grade 카드의 저장 버튼 하나. relevance-grading-import.mjs(마크다운 표)와
//    같은 칸(human_verdict·human_graded_at)에 쓴다. LLM 판정(verdict·second_*·model·reason)은 건드리지 않는다.
//    이 값이 곧 자동 승인 감사(킬스위치 창) 입력이다 — 따로 기록하지 않는다.

export type RelevanceActionState = { ok: boolean; message: string } | null

const VERDICT_KO: Record<string, string> = { relevant: '관련', irrelevant: '무관', unknown: '모름' }
const ko = (v: unknown) => (typeof v === 'string' ? VERDICT_KO[v] ?? v : '없음')
const infKo = (v: unknown) => (v === true ? '정보있음' : v === false ? '정보없음' : '미기재')

export async function gradeRelevance(_prev: RelevanceActionState, fd: FormData): Promise<RelevanceActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }

  const sub = readRelevanceSubmission({ inputId: fd.get('input_id'), verdict: fd.get('verdict'), informative: fd.get('informative'), note: fd.get('note') })
  if (!sub.value) return { ok: false, message: sub.error ?? '제출 내용을 읽지 못했습니다.' }
  const { inputId, verdict, informative, note } = sub.value

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  // 층은 서버에서 다시 계산한다 — 폼에 실으면 채점 전에 DOM 으로 보인다(끌림 방지).
  const { data: row, error: readErr } = await sb.from('review_relevance_verdicts').select('*').eq('input_id', inputId).maybeSingle()
  if (readErr) return { ok: false, message: `판정 행 조회 실패 — 저장하지 않았습니다: ${readErr.message}` }
  if (!row) return { ok: false, message: '판정 행이 없습니다. 새로고침 후 확인하세요.' }
  const r = row as FeedbackRow
  if (r.human_verdict != null) return { ok: false, message: `이미 채점된 행입니다(${ko(r.human_verdict)}) — 덮어쓰지 않았습니다. 새로고침하세요.` }

  const avail = columnAvailability([row])
  const patch: Record<string, unknown> = { human_verdict: verdict, human_graded_at: new Date().toISOString() }
  if (informative !== null) patch.human_product_informative = informative

  const write = (p: Record<string, unknown>) =>
    sb.from('review_relevance_verdicts').update(p).eq('input_id', inputId).is('human_verdict', null).select('input_id')
  let { data, error } = await write(patch)
  // 정보성 컬럼(000031)만 없으면 판정은 저장하고 그 사실을 말한다. 조용히 버리지 않는다(§7.2).
  let infMissing = false
  if (error && 'human_product_informative' in patch && isMissingColumn(error)) {
    infMissing = true
    delete patch.human_product_informative
    ;({ data, error } = await write(patch))
  }
  if (error) return { ok: false, message: `저장 실패: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 채점됐습니다 — 덮어쓰지 않았습니다. 새로고침하세요.' }

  const stratum = stratumOf(r, avail)
  let noteMsg = ''
  if (note) {
    const { error: noteErr } = await sb.from('relevance_criteria_feedback').insert({
      input_id: inputId,
      stratum,
      human_verdict: verdict,
      human_product_informative: infMissing ? null : informative,
      model_verdicts: {
        verdict: r.verdict ?? null,
        second_verdict: r.second_verdict ?? null,
        product_informative: r.product_informative ?? null,
        second_product_informative: r.second_product_informative ?? null,
      },
      note,
      created_by: auth.email,
    })
    // 판정은 이미 저장됐다. 메모만 실패했으면 본문을 되돌려 보여 준다 — 잃어버리지 않게.
    if (noteErr) {
      noteMsg = isMissingRelation(noteErr)
        ? ` · ⚠️ 메모는 저장 안 됨(마이그 ${FEEDBACK_MIGRATION} 미적용) — 적은 내용: "${note}"`
        : ` · ⚠️ 메모 저장 실패(${noteErr.message}) — 적은 내용: "${note}"`
    } else noteMsg = ' · 메모 저장됨'
  }

  revalidatePath('/relevance/grade')
  revalidatePath('/relevance/feedback')
  // 저장 뒤에야 공개한다 — 모델 판정·뽑힌 층.
  const reveal = `공개: ${stratum ? STRATUM_LABEL[stratum] : '층 없음'} · 1차 ${ko(r.verdict)} · 2차 ${ko(r.second_verdict)}`
    + (avail.informative ? ` · 정보성 1차 ${infKo(r.product_informative)}/2차 ${infKo(r.second_product_informative)}` : '')
  return {
    ok: true,
    message: `저장: ${ko(verdict)}${informative === null ? '' : ` · ${infKo(informative)}`} · 채점자 ${auth.email} · ${reveal}`
      + (infMissing ? ` · ⚠️ 정보있음/없음은 저장 안 됨(마이그 ${INFORMATIVE_MIGRATION} 미적용)` : '')
      + noteMsg,
  }
}
