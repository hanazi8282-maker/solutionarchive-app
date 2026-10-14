'use client'

import { useActionState } from 'react'
import { AREAS, AUDIENCE_MAX, ANSWER_MAX, IDEA_MAX, QUESTIONS } from '@/lib/pmf-b/entry'
import { submitPmfB, type PmfBState } from './actions'

const box = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 12px', font: 'inherit' } as const

export function EntryForm() {
  const [state, action, pending] = useActionState<PmfBState, FormData>(submitPmfB, null)
  const r = state?.result
  return (
    <>
      <form action={action} autoComplete="off" style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
        <label>아이디어 한 문장 ({IDEA_MAX}자 이내)
          <textarea name="idea" required maxLength={IDEA_MAX} rows={3} style={box} />
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>영역</legend>
          {AREAS.map(a => (
            <label key={a.code} style={{ display: 'block', padding: '6px 0' }}>
              <input type="radio" name="area" value={a.code} required /> {a.label}
            </label>
          ))}
        </fieldset>
        <label>누구를 위한 건가요 (선택)
          <input name="audience" autoComplete="off" maxLength={AUDIENCE_MAX} style={box} />
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          <legend>안내 질문 (모두 선택)</legend>
          {QUESTIONS.map((q, i) => (
            <label key={q}>{q}
              <input name={`q${i}`} autoComplete="off" maxLength={ANSWER_MAX} style={box} />
            </label>
          ))}
        </fieldset>
        <p>입력한 내용은 저장하지 않습니다. 화면을 보여 드린 뒤 버려지고, 서버 기록에는 글자 수·영역·시각만 남습니다.</p>
        <button type="submit" disabled={pending} style={{ ...box, width: 'auto', cursor: 'pointer' }}>{pending ? '확인 중…' : '결과 보기'}</button>
      </form>
      <div role="status" aria-live="polite" style={{ maxWidth: 640, marginTop: 24 }}>
        {state?.error && <p>{state.error}</p>}
        {r?.kind === 'map' && <p><a href={r.href}>이 영역의 결론서 4칸 지도 보기</a></p>}
        {r?.kind === 'pending' && <p>이 영역 결론서는 준비 중입니다. 준비되면 이 입구에서 바로 이어집니다. (대기 신청은 문구 안내만 있고, 수집 기능은 없습니다.)</p>}
        {r?.kind === 'outside' && <p>지금은 ① 회의·통화 기록 ② 영업 ③ 마케팅 ④ 인사 운영 ⑤ 리뷰 관리 영역만 지원합니다.</p>}
      </div>
    </>
  )
}
