/**
 * 관제실 상태 — 로컬 훅이 올린 역할별 현황(CMO/CTO/CEO-staff/HUB)을 KV 한 칸에 두고,
 * 뷰 토큰을 가진 브라우저만 읽는다.
 *
 * 이 화면 URL은 공개다. 그래서 쓰기와 읽기를 **서로 다른 시크릿**으로 가른다.
 *   AGENT_STATUS_PUSH_TOKEN   로컬 훅만 아는 쓰기 토큰
 *   AGENT_STATUS_VIEW_TOKEN   남헌 브라우저만 아는 읽기 토큰
 * 둘을 섞어 쓰면 화면 토큰이 곧 쓰기 권한이 된다. 절대 같은 값을 넣지 않는다.
 *
 * 시크릿이나 KV 바인딩이 없으면 그 방향은 통째로 막힌다(fail-closed).
 * 거절 사유는 한 가지 문구로만 답한다 — 토큰이 틀렸는지 설정이 없는지를
 * 바깥에서 구분할 수 없어야 한다.
 */

/** 쓰기·읽기 양쪽에서 쓰는 시크릿 헤더 이름 */
export const AGENT_STATUS_HEADER = "X-Agent-Status-Token";
/** KV에 쓰는 유일한 키 — 항상 최신 상태 하나만 둔다 */
export const AGENT_STATUS_KEY = "current";
/** 로컬 훅이 실수로 큰 파일을 올려도 KV를 낭비하지 않게 막는 상한 */
export const AGENT_STATUS_MAX_BYTES = 20 * 1024;

/** wrangler.jsonc의 kv_namespaces 바인딩에서 실제로 쓰는 것만 추린 타입 */
export interface AgentStatusKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export type AgentStatusEnv = {
  // 아직 바인딩·시크릿을 안 넣은 배포에서도 빌드가 되도록 전부 optional 이다.
  AGENT_STATUS_KV?: AgentStatusKV;
  AGENT_STATUS_PUSH_TOKEN?: string;
  AGENT_STATUS_VIEW_TOKEN?: string;
};

/** 거절 문구는 하나뿐이다 (토큰 불일치와 미설정을 구분해 주지 않는다) */
const denied = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** 시크릿이 없으면 통과할 수 없다 — 빈 시크릿과 빈 토큰이 우연히 맞아떨어지지 않게 한다. */
function allowed(presented: string | null, secret: string | undefined): boolean {
  return Boolean(secret) && presented === secret;
}

/** POST /api/agent-status — 로컬 훅이 현황을 올린다. */
export async function pushAgentStatus(request: Request, env: AgentStatusEnv): Promise<Response> {
  if (!allowed(request.headers.get(AGENT_STATUS_HEADER), env.AGENT_STATUS_PUSH_TOKEN)) return denied();
  if (!env.AGENT_STATUS_KV) {
    return Response.json({ error: "storage unavailable" }, { status: 503 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).length > AGENT_STATUS_MAX_BYTES) {
    return Response.json({ error: `body over ${AGENT_STATUS_MAX_BYTES} bytes` }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Response.json({ error: "expected a json object" }, { status: 400 });
  }

  // 올라온 내용은 그대로 두고, 언제 받았는지만 덧붙인다 (화면의 "소식 없음" 판정 근거).
  const fetched_at = new Date().toISOString();
  await env.AGENT_STATUS_KV.put(AGENT_STATUS_KEY, JSON.stringify({ ...(parsed as object), fetched_at }));
  return Response.json({ ok: true, fetched_at });
}

/** GET /api/agent-status — 관제실 패널이 폴링한다. */
export async function readAgentStatus(request: Request, env: AgentStatusEnv, url: URL): Promise<Response> {
  const presented = request.headers.get(AGENT_STATUS_HEADER) ?? url.searchParams.get("token");
  if (!allowed(presented, env.AGENT_STATUS_VIEW_TOKEN)) return denied();
  if (!env.AGENT_STATUS_KV) {
    return Response.json({ error: "storage unavailable" }, { status: 503 });
  }

  // 아직 아무도 올리지 않았으면 빈 객체다 — 패널은 네 칸 모두 "소식 없음"으로 그린다.
  const stored = (await env.AGENT_STATUS_KV.get(AGENT_STATUS_KEY)) ?? "{}";
  return new Response(stored, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
