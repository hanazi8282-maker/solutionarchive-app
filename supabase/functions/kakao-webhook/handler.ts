// 카카오 → Vercel 중계기의 순수 로직. Deno 전역을 쓰지 않는다.
//
// ⚠️ 이 파일이 존재하는 이유 — 카카오가 우리 서버에 도달하지 못한다:
//
//   `solutionarch.vercel.app/api/insight/kakao-webhook` 은 공개 인터넷에서
//   정상 응답한다(GET 405 / POST 200 · TLS1.2 · HTTP1.1 · 0.46초). 그런데
//   오픈빌더 스킬 테스트는 세 번(2026-09-02 KST 17:05:17 / 17:13:17 /
//   17:13:22) 모두 `[NetworkAccessForbidden]` 으로 떨어졌고, **그 세 시각의
//   프로덕션 런타임 로그에 요청이 한 건도 없다.** 같은 창(17:06·17:10)에
//   넣은 우리 프로브는 전부 찍혔다 — 양성 대조가 성립한다.
//
//   Vercel 은 무혐의다: Firewall Denied 0건(24시간), Custom Rules 0개,
//   Bot Protection Inactive. 즉 차단은 카카오에서 나가는 쪽에 있고
//   우리 코드로는 못 고친다. 그래서 도메인을 바꾼다.
//
// ⚠️ 로직을 복제하지 않는다. 이건 **중계기**다.
//   저장 본체는 `lib/insight/capture.ts` 한 곳이다. 여기서 파싱·저장을
//   다시 구현하면 같은 글이 경로에 따라 다른 행이 되고 `evidence_count`
//   가 부풀어 "2건 이상 반복 관찰" 기준이 거짓 충족된다. 그래서 이 파일은
//   **본문을 읽지 않는다** — 바이트 그대로 넘긴다.
//
// ⚠️ 카카오에는 항상 200 + 스킬 포맷으로 답한다.
//   4xx/5xx 를 주면 사용자 화면에는 카카오 기본 오류만 뜨고 사유가 안
//   보인다. 상위 라우트가 같은 규칙을 쓰는 이유와 동일하다. 이건 실패를
//   삼키는 게 아니다 — 실패 **사유를 사람이 보는 화면까지 올리는** 것이다.

/** 카카오 스킬 응답 규격. 이 형태를 벗어나면 조용히 실패한다. */
export function skillText(text: string): Response {
  return new Response(
    JSON.stringify({
      version: '2.0',
      template: { outputs: [{ simpleText: { text: text.slice(0, 1000) } }] },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

export interface HandlerDeps {
  /** 중계 대상. 프로덕션 라우트 전체 URL. */
  upstreamUrl: string
  /**
   * 상위 요청에 줄 예산(ms).
   *
   * 카카오 타임아웃은 5초다. 상위 라우트가 자체적으로 3.5초에 끊으므로
   * 여기서는 그보다 넉넉한 4.2초를 준다 — 우리가 먼저 끊으면 상위가
   * 남긴 사유를 못 보고 "연결 실패"로 뭉뚱그려진다. 남은 0.8초는
   * 카카오↔Supabase 왕복과 콜드스타트 몫이다.
   */
  budgetMs?: number
  fetchImpl?: typeof fetch
  log?: (msg: string) => void
}

const DEFAULT_BUDGET_MS = 4200

export function createHandler(deps: HandlerDeps) {
  const { upstreamUrl } = deps
  const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS
  const doFetch = deps.fetchImpl ?? fetch
  const log = deps.log ?? ((m: string) => console.log(m))

  return async function handle(req: Request): Promise<Response> {
    // 카카오는 POST 만 쓴다. 상위 라우트와 같은 405 를 준다 — 여기서
    // 스킬 포맷으로 답하면 "라우트가 살아 있다"는 신호가 흐려진다.
    if (req.method !== 'POST') {
      return new Response(null, { status: 405 })
    }

    // 본문을 파싱하지 않는다. JSON 이 깨져 있어도 상위가 그 사유를
    // 카카오 화면에 띄우게 둔다 — 판정 지점을 둘로 나누지 않는다.
    let body: string
    try {
      body = await req.text()
    } catch (e) {
      log(`[kakao-proxy] 요청 본문 읽기 실패: ${String(e)}`)
      return skillText('요청을 읽지 못했습니다. (프록시 단계)')
    }

    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), budgetMs)

    let upstream: Response
    try {
      upstream = await doFetch(upstreamUrl, {
        method: 'POST',
        // content-type 은 들어온 값을 그대로 넘기지 않고 항상 json 으로 못박는다.
        //
        // "바꾸지 않고 넘긴다"는 **본문**에 대한 규칙이다 — 멱등성 키가 본문
        // 바이트에서 나오기 때문이다. content-type 은 다르다. 상위 라우트가
        // 받는 형식은 JSON 하나뿐이고, 중간에서 `text/plain` 같은 값이 섞여
        // 들어오면(예: 본문만 있고 헤더가 없는 요청은 fetch 규격상 자동으로
        // text/plain 이 붙는다) 상위에 잘못된 형식을 알리는 셈이 된다.
        // 틀린 정보를 전달하느니 정확한 값을 세운다.
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      })
    } catch (e) {
      const elapsed = Date.now() - started
      const aborted = controller.signal.aborted
      const reason = aborted ? `${budgetMs}ms 예산 초과` : String(e)
      // 조용히 넘기지 않는다. 로그와 사용자 화면 양쪽에 사유를 남긴다.
      log(`[kakao-proxy] 업스트림 연결 실패 (${elapsed}ms): ${reason}`)
      return skillText(`저장 서버에 연결하지 못했습니다. (${reason})`)
    } finally {
      clearTimeout(timer)
    }

    const elapsed = Date.now() - started

    // 상위가 2xx 를 줬으면 그 본문이 곧 스킬 응답이다. 손대지 않는다.
    if (upstream.ok) {
      const text = await upstream.text()
      log(`[kakao-proxy] 중계 성공 ${upstream.status} (${elapsed}ms) ${text.length}B`)
      return new Response(text, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    // 비-2xx 는 상위가 스킬 포맷을 보장하지 않는다(플랫폼 오류 페이지일 수
    // 있다). 그대로 넘기면 카카오 화면에 사유가 안 보이므로 감싼다.
    const detail = (await upstream.text().catch(() => '')).slice(0, 200)
    log(`[kakao-proxy] 업스트림 오류 ${upstream.status} (${elapsed}ms): ${detail}`)
    return skillText(`저장 서버가 오류를 돌려줬습니다. (HTTP ${upstream.status})`)
  }
}
