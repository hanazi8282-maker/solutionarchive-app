import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseValidateAngleBody } from '@/lib/analysis/validate-angle'

// 앵글 "실전 채택 표시" — 사람이 명시적으로 "이 앵글 실전에서 써봤고 됐다"고
// 기록하는 지점. 자동 트리거는 어디에도 없다 — 오직 이 POST 호출로만 채워진다.
//
// analysis_angles.substantiation_verdict='SUBSTANTIATED' 와 다르다: 그건
// "카피 문장에 근거가 있다"는 LLM 판정이고, 이건 "실제 시장에서 성과를 냈다"는
// 사람의 판단이다. 둘을 자동으로 섞으면 크로스섹션 어드바이저가 검증 안 된
// 카피 판정을 성공 사례처럼 추천하게 된다(그래서 여기서 advisor.ts wiring은
// 하지 않는다 — 데이터가 쌓인 뒤 별도로 판단).
//
// 같은 앵글을 여러 번 승인 기록하는 것을 막지 않는다(중복 방지 없음) — 시간이
// 지나며 "다시 확인해보니 여전히 잘 됨" 같은 재확인 기록도 유효한 이력이라,
// UNIQUE 로 잠그면 오히려 그 이력을 못 남긴다.
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)
  const parsed = parseValidateAngleBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { angleId, outcomeNote, validatedBy } = parsed

  const { data: angle, error: angleError } = await supabase
    .from('analysis_angles')
    .select('id, project_id, headline_draft')
    .eq('id', angleId)
    .maybeSingle()

  if (angleError) {
    console.error('[analyze/angle/validate] angle fetch error:', angleError.message)
    return NextResponse.json({ error: '앵글 조회에 실패했습니다.' }, { status: 500 })
  }
  if (!angle) {
    return NextResponse.json({ error: '앵글을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch')
    .eq('id', angle.project_id)
    .maybeSingle()

  if (projectError) {
    console.error('[analyze/angle/validate] project fetch error:', projectError.message)
    return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  const row: Record<string, unknown> = {
    angle_id: angle.id,
    product_category: project.product_elevator_pitch,
    angle_summary: angle.headline_draft ?? '(문구 없음)',
    outcome_note: outcomeNote,
  }
  // validated_by 를 안 주면 DB 컬럼 기본값('남헌')이 채우도록 필드 자체를 뺀다.
  if (validatedBy) row.validated_by = validatedBy

  const { data: inserted, error: insertError } = await supabase
    .from('validated_angles_corpus')
    .insert(row)
    .select('id, angle_id, product_category, angle_summary, outcome_note, validated_by, validated_at')
    .single()

  if (insertError) {
    console.error('[analyze/angle/validate] insert error:', insertError.message)
    return NextResponse.json({ error: `실전 채택 기록 저장 실패: ${insertError.message}` }, { status: 500 })
  }

  return NextResponse.json({ validated: inserted })
}
