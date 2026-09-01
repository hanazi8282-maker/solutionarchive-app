// 저장 계층의 순수 로직 — 캡처 경로가 둘 이상이라 여기로 뺐다.
//
// 경로 2개가 같은 테이블에 멱등하게 들어가야 한다:
//   - POST /api/insight/capture      (curl / 아이폰 단축어. Bearer 인증)
//   - POST /api/insight/kakao-webhook (카카오톡 채널 공유. 오픈빌더 스킬)
//
// 로직을 복제하면 멱등성 키 계산이 갈리고, 같은 글이 경로에 따라 다른 행이
// 된다. 그러면 evidence_count 가 부풀어 "2건 이상 반복 관찰"이라는 반영
// 기준이 거짓으로 충족된다 — 근거 없는 패턴이 가이드에 들어가는 가장
// 현실적인 경로다.

export interface CaptureInput {
  url?: string | null
  text?: string | null
  note?: string | null
  /** 멱등성 키를 직접 주고 싶을 때(Notion 동기화가 쓴다). 없으면 URL 로 만든다. */
  key?: string | null
}

/**
 * 멱등성 키.
 *
 * 같은 글을 두 번 저장해도 한 행이어야 한다. URL 은 쿼리·프래그먼트를 떼고
 * 쓴다 — 공유 경로마다 `?igshid=...` 같은 추적 파라미터가 다르게 붙는데,
 * 그걸 키에 포함하면 같은 글이 경로 수만큼 행이 된다.
 */
export function idempotencyKey(input: CaptureInput): string | null {
  const key = input.key?.trim()
  if (key) return key

  const url = input.url?.trim()
  if (url) return `url:${url.split(/[?#]/)[0]}`

  // URL 도 key 도 없으면 원문 자체로 키를 만든다(같은 원문 = 같은 글).
  const text = input.text?.trim()
  if (text) return `text:${text.slice(0, 200)}`

  return null
}

export interface CaptureResult {
  ok: boolean
  /** 저장된 행. 실패 시 null. */
  saved: { id: string; notion_page_id: string; analysis_status: string } | null
  /** 사람이 읽는 한 줄. 카카오 응답 본문으로도 그대로 쓴다. */
  message: string
  /** 실패 원인 구분 — 호출부가 HTTP 상태를 정할 때 쓴다. */
  failure?: 'no-key' | 'db'
  detail?: string
}

/** Supabase 클라이언트의 최소 형태만 요구한다. 테스트에서 가짜를 넣기 위해서다. */
export interface CaptureStore {
  upsertSavedExample(row: Record<string, unknown>): Promise<{
    data: { id: string; notion_page_id: string; analysis_status: string } | null
    error: { message: string } | null
  }>
  /**
   * 실패로 못박힌 행을 다시 대기열에 올린다. 원문이 새로 들어왔을 때만 부른다.
   * 구현이 없으면 재시도 기능만 빠지고 저장은 정상 동작한다.
   */
  requeueFailed?(id: string): Promise<{ error: { message: string } | null }>
}

/**
 * 저장 본체.
 *
 * ⚠️ `text` 가 비어 있어도 저장은 된다. 다만 그 행은 분석 단계에서
 *    `원문(raw_text)이 비어 분석할 수 없다` 로 실패한다(lib/insight/llm.ts).
 *    호출부는 그 사실을 사용자에게 **반드시 알려야 한다** — 저장됐다고만
 *    말하면 며칠 뒤 "저장은 됐는데 아무것도 안 배웠다"가 된다(CLAUDE.md §7.1).
 *    `result.saved.analysis_status` 와 별개로 `hasText` 를 호출부가 직접 본다.
 */
export async function saveExample(
  input: CaptureInput,
  store: CaptureStore,
  now: () => Date = () => new Date(),
): Promise<CaptureResult> {
  const key = idempotencyKey(input)
  if (!key) {
    return {
      ok: false,
      saved: null,
      message: 'url / text / key 중 최소 하나는 필요하다',
      failure: 'no-key',
    }
  }

  const stamp = now().toISOString()
  const { data, error } = await store.upsertSavedExample({
    notion_page_id: key,
    source_url: input.url?.trim() || null,
    raw_text: input.text?.trim() || null,
    user_note: input.note?.trim() || null,
    saved_at: stamp,
    synced_at: stamp,
  })

  if (error) {
    return { ok: false, saved: null, message: '저장 실패', failure: 'db', detail: error.message }
  }

  // ⚠️ 실패로 못박힌 행에 원문이 새로 들어오면 다시 대기열에 올린다.
  //
  //    이게 없으면 조용히 죽는 경로가 생긴다. URL 만 저장된 행은 다음 밤
  //    analyze 에서 `원문(raw_text)이 비어 분석할 수 없다` 로 throw 되고,
  //    loop.ts 가 그 행을 `analysis_status='failed'` 로 못박는다(무한 재시도
  //    방지). 그런데 analyze 는 `pending` 만 고르므로, **나중에 원문을 보내도
  //    raw_text 만 채워지고 그 행은 영영 분석되지 않는다.**
  //
  //    사용자에게는 "다시 보내면 원문이 채워집니다"라고 안내하는데, 하룻밤이
  //    지난 뒤엔 그 말이 거짓이 된다 — 채워지긴 하지만 아무 일도 안 일어난다.
  //
  //    되돌리는 조건을 **원문이 실제로 들어왔을 때 + 현재 failed 일 때**로
  //    좁힌다. `analyzed` 를 되돌리면 같은 글이 다시 분석돼 evidence_count 가
  //    부풀고, 원문 없이 되돌리면 다음 밤에 같은 이유로 또 실패한다.
  const hasText = Boolean(input.text?.trim())
  let requeued = false
  if (hasText && data?.analysis_status === 'failed' && store.requeueFailed) {
    const { error: reErr } = await store.requeueFailed(data.id)
    if (reErr) {
      // 저장 자체는 성공했으므로 실패로 뒤집지 않는다. 다만 삼키지도 않는다.
      return {
        ok: true,
        saved: data,
        message: `저장됨. 다만 재분석 대기열 등록에 실패했다(${reErr.message}).`,
      }
    }
    requeued = true
  }

  if (requeued) {
    return { ok: true, saved: data, message: '원문을 채웠다. 다음 나이틀리 실행에서 다시 분석된다.' }
  }

  return {
    ok: true,
    saved: data,
    message:
      data?.analysis_status === 'pending'
        ? '저장됨. 다음 나이틀리 실행에서 분석된다.'
        : data?.analysis_status === 'failed'
          ? '저장됨. 다만 이 글은 분석에 실패한 상태다 — 원문을 함께 보내면 다시 시도한다.'
          : '저장됨(이미 분석된 글이다).',
  }
}

// ── 카카오 공유 메시지에서 URL 과 원문을 가른다 ──────────────────────────

/** 첫 http(s) URL 하나. 없으면 null. */
export function extractUrl(utterance: string): string | null {
  const m = utterance.match(/https?:\/\/[^\s<>"')\]]+/)
  return m ? m[0] : null
}

export interface ParsedShare {
  url: string | null
  /** URL 을 걷어낸 나머지 텍스트. 의미 있는 길이가 아니면 null. */
  text: string | null
  /** 발화에 URL 도 텍스트도 없다. */
  empty: boolean
}

/**
 * 공유 발화를 URL / 원문으로 가른다.
 *
 * ⚠️ 원문을 URL 로 가져오지 않는 이유:
 *    Threads 는 게시물 URL 이 301 로 튕기고 `robots.txt` 를 정상적으로 주지
 *    않는다(threads.com/robots.txt 가 HTTP 200 인데 content-type 이
 *    text/html 이고 267KB 짜리 앱 셸이다). CLAUDE.md §7.1 —
 *    "읽지 못한 규칙을 허용으로 해석하지 마라. 판단 불가면 가지 않는다."
 *    그래서 **원문은 공유 메시지 자체에 실려 와야 한다.**
 *
 * 최소 길이를 두는 이유: 안드로이드 공유가 "제목 – URL" 형태로 짧은 꼬리표를
 * 붙이는 경우가 있는데, 그걸 원문으로 저장하면 LLM 이 제목 한 줄을 글 전체로
 * 읽고 엉뚱한 패턴을 뽑는다. 분석 가능한 원문과 꼬리표를 가른다.
 */
export const MIN_TEXT_CHARS = 40

export function parseShare(utteranceRaw: string): ParsedShare {
  const utterance = (utteranceRaw ?? '').trim()
  if (!utterance) return { url: null, text: null, empty: true }

  const url = extractUrl(utterance)
  const rest = (url ? utterance.replace(url, ' ') : utterance).replace(/\s+/g, ' ').trim()
  const text = rest.length >= MIN_TEXT_CHARS ? rest : null

  return { url, text, empty: !url && !text && rest.length === 0 }
}
