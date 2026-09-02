// 카카오톡 채널 공유 → saved_examples 캡처 (카카오 i 오픈빌더 스킬 서버).
//
// ⚠️ 이 라우트가 존재하는 이유 — 트랙 1 이 몇 주째 0건이었던 원인:
//
//   인사이트 루프(저장 글 → LLM 분석 → 패턴 → 가이드 반영)는 인프라가 전부
//   섰는데 `saved_examples` 가 계속 0행이었다. 유일한 캡처 경로가
//   `/api/insight/capture` 였고 그 사용법이 **아이폰 단축어** 전제였는데
//   사용자는 안드로이드다. 즉 파이프라인이 다 도는데 입구가 없었다.
//
//   카카오톡 "나에게 보내기"는 대안이 못 된다 — 카카오는 본인에게 보내는
//   API 는 주지만 본인이 쓴 메시지를 읽는 API 는 주지 않는다. 그래서 전용
//   채널(챗봇)을 만들고, 그 채널로 공유하면 오픈빌더 스킬 웹훅이 서버로
//   밀어주는 구조로 간다.
//
// ⚠️ 카카오 스킬 규약 (공식 문서 확인, 2026-09-02):
//   - 응답 타임아웃 **5초**. 넘기면 사용자에게 실패로 보인다
//   - 응답은 `{version:"2.0", template:{outputs:[{simpleText:{text}}]}}`
//     outputs 는 1~3개, text 는 최대 1000자(500자 넘으면 "전체 보기"로 축약)
//   - 요청 최상위는 intent / action / flow / userRequest / bot / contexts
//
// ⚠️ 실패를 삼키지 않는다 (CLAUDE.md §7.1):
//   저장이 안 됐는데 "저장했습니다"를 돌려주면, 사용자는 며칠 뒤에야
//   "저장은 되는데 아무것도 안 배운다"를 알게 된다. 실패는 그 자리에서
//   카카오톡 화면에 뜬다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveExample, parseShare, MIN_TEXT_CHARS, rejectionLogLine } from '@/lib/insight/capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 카카오 5초 SLA 안에서 우리가 쓸 예산.
 *
 * 넘기면 카카오가 먼저 끊고 사용자는 "응답 없음"을 본다. 그건 저장 성공
 * 여부와 무관하게 실패로 보이므로, **우리가 먼저 끊고 상황을 말해준다.**
 * 남은 1.5초는 네트워크 왕복과 콜드스타트 몫이다.
 */
const BUDGET_MS = 3500

/** 카카오가 요구하는 정확한 응답 형태. 이 형태를 벗어나면 조용히 실패한다. */
function skillText(text: string) {
  return NextResponse.json({
    version: '2.0',
    template: { outputs: [{ simpleText: { text: text.slice(0, 1000) } }] },
  })
}

interface KakaoSkillPayload {
  userRequest?: {
    utterance?: string
    user?: { id?: string; type?: string }
  }
  bot?: { id?: string; name?: string }
  action?: { params?: Record<string, unknown> }
}

/**
 * 발신자 허용목록.
 *
 * 이 URL 은 인증 없이 외부에서 부를 수 있는 공개 엔드포인트다. 남이 URL 을
 * 알아내면 우리 `saved_examples` 에 임의의 글을 밀어넣을 수 있고, 그 글은
 * 매일 밤 LLM 에 먹혀 가이드에 반영되는 경로를 탄다 — **프롬프트 주입이
 * 파이프라인 안쪽까지 들어오는 입구가 된다.**
 *
 * `lib/insight/github.ts` 의 경로 허용목록이 출력 쪽을 막는다면, 이건
 * 입력 쪽을 막는다. 환경변수가 비어 있으면 **잠근다** — 열어두지 않는다.
 * fail-open 은 이 프로젝트가 이미 한 번 데인 형태다(§7.2).
 */
function senderAllowed(payload: KakaoSkillPayload): { ok: boolean; reason?: string } {
  const raw = process.env.KAKAO_ALLOWED_USER_IDS?.trim()
  if (!raw) {
    return { ok: false, reason: 'KAKAO_ALLOWED_USER_IDS 미설정 — 잠긴 상태다' }
  }

  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const userId = payload.userRequest?.user?.id?.trim()

  if (!userId) return { ok: false, reason: 'userRequest.user.id 없음' }
  if (!allowed.includes(userId)) return { ok: false, reason: '허용목록에 없는 발신자' }
  return { ok: true }
}

export async function POST(req: Request) {
  const started = Date.now()

  let payload: KakaoSkillPayload
  try {
    payload = (await req.json()) as KakaoSkillPayload
  } catch {
    // 카카오에는 항상 200 + 스킬 포맷으로 답한다. 4xx/5xx 를 주면 사용자
    // 화면에는 카카오 기본 오류만 뜨고 사유가 안 보인다.
    return skillText('요청을 읽지 못했습니다. (JSON 파싱 실패)')
  }

  const gate = senderAllowed(payload)
  if (!gate.ok) {
    // 왜 막혔는지는 서버 로그에만 남긴다. 응답으로 알려주면 허용목록의
    // 존재와 동작 방식을 외부에 노출한다.
    //
    // ⚠️ 발신자 id 를 반드시 함께 남긴다. 허용목록에 넣을 값을 알아내는
    //    유일한 경로가 이 줄이다 — 근거는 rejectionLogLine 주석 참조.
    console.warn(rejectionLogLine(gate.reason ?? '사유 불명', payload.userRequest?.user?.id))
    return skillText('등록되지 않은 발신자입니다.')
  }

  const utterance = payload.userRequest?.utterance ?? ''

  // 첫 실전 공유가 "안드로이드 Threads 공유가 실제로 무엇을 보내는가"를
  // 알려준다. 추측으로 설계하지 않기 위해 발화 전문을 남긴다.
  console.log(`[kakao-webhook] utterance(${utterance.length}자): ${JSON.stringify(utterance.slice(0, 500))}`)

  const share = parseShare(utterance)
  if (share.empty || (!share.url && !share.text)) {
    return skillText(
      '저장하지 못했습니다.\n\n' +
        'Threads 글 링크를 공유해 주세요. 원문 텍스트도 함께 보내면 분석 품질이 올라갑니다.',
    )
  }

  const supabase = await createClient()
  if (!supabase) {
    console.error('[kakao-webhook] Supabase 환경변수 없음')
    return skillText('저장하지 못했습니다. (서버 설정 오류 — Supabase 환경변수 없음)')
  }

  const store = {
    async upsertSavedExample(row: Record<string, unknown>) {
      const { data, error } = await supabase
        .from('saved_examples')
        .upsert(row, { onConflict: 'notion_page_id', ignoreDuplicates: false })
        .select('id, notion_page_id, analysis_status')
        .single()
      return { data: data ?? null, error: error ? { message: error.message } : null }
    },
    async requeueFailed(id: string) {
      const { error } = await supabase
        .from('saved_examples')
        .update({ analysis_status: 'pending', analysis_error: null })
        .eq('id', id)
      return { error: error ? { message: error.message } : null }
    },
  }

  // 예산을 넘기면 우리가 먼저 끊는다. 저장은 계속 진행될 수 있으므로
  // "실패했다"가 아니라 "확인되지 않았다"로 말한다 — 둘은 다른 사건이다.
  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), Math.max(500, BUDGET_MS - (Date.now() - started))),
  )
  const result = await Promise.race([
    saveExample({ url: share.url, text: share.text }, store),
    timeout,
  ])

  if (result === 'timeout') {
    console.warn(`[kakao-webhook] budget exceeded (${Date.now() - started}ms)`)
    return skillText(
      '저장 여부를 확인하지 못했습니다. (서버 응답이 느립니다)\n' +
        '잠시 후 같은 링크를 다시 보내 주세요 — 중복 저장되지 않습니다.',
    )
  }

  if (!result.ok) {
    console.error(`[kakao-webhook] save failed: ${result.failure} ${result.detail ?? ''}`)
    return skillText(`저장하지 못했습니다. (${result.message})`)
  }

  // 저장은 됐는데 원문이 없으면 그 행은 다음 밤 분석에서 실패한다.
  // "저장했습니다"로만 끝내면 사용자는 그 사실을 영영 모른다.
  if (!share.text) {
    return skillText(
      '링크는 저장했습니다.\n\n' +
        `다만 원문이 없어 이대로는 분석되지 않습니다. 글 본문을 복사해 ${MIN_TEXT_CHARS}자 이상 함께 보내 주세요.\n` +
        '같은 링크로 다시 보내면 새 행이 생기지 않고 원문만 채워집니다.',
    )
  }

  // 저장 본체가 돌려준 문구를 그대로 쓴다. "다시 분석된다"(실패 행 재대기)와
  // "분석된다"(신규)를 라우트가 다시 판단하면 두 곳이 갈린다.
  return skillText(`저장했습니다. (원문 ${share.text.length}자)\n${result.message}`)
}
