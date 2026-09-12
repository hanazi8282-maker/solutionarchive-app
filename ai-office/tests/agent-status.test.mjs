// 관제실 엔드포인트가 fail-closed 인지 확인한다.
// 이 URL 은 공개라서, 토큰 없이 현황이 새어 나가지 않는 것이 이 기능의 전부다.
import assert from "node:assert/strict";
import test from "node:test";

const PUSH = "push-secret";
const VIEW = "view-secret";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

/** KV 바인딩 대역 — 실제로 쓰는 get/put 두 개만 흉내 낸다. */
function fakeKV(initial = null) {
  const store = { value: initial };
  return {
    store,
    async get() {
      return store.value;
    },
    async put(_key, value) {
      store.value = value;
    },
  };
}

async function call(worker, { method = "GET", path = "/api/agent-status", token, body, env = {} }) {
  const headers = token ? { "X-Agent-Status-Token": token } : {};
  return worker.fetch(
    new Request(`http://localhost${path}`, { method, headers, body }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...env },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("시크릿·KV 가 없는 배포에서도 500 이 아니라 401 이다", async () => {
  const worker = await loadWorker();
  for (const method of ["GET", "POST"]) {
    const response = await call(worker, { method, body: method === "POST" ? "{}" : undefined });
    assert.equal(response.status, 401, `${method} 가 401 이 아니다`);
  }
});

test("토큰이 틀리면 읽기도 쓰기도 막힌다", async () => {
  const worker = await loadWorker();
  const env = { AGENT_STATUS_KV: fakeKV(), AGENT_STATUS_PUSH_TOKEN: PUSH, AGENT_STATUS_VIEW_TOKEN: VIEW };

  assert.equal((await call(worker, { token: "nope", env })).status, 401);
  assert.equal((await call(worker, { path: "/api/agent-status?token=nope", env })).status, 401);
  assert.equal((await call(worker, { method: "POST", token: "nope", body: "{}", env })).status, 401);
});

test("쓰기 토큰으로는 읽을 수 없고, 읽기 토큰으로는 쓸 수 없다", async () => {
  const worker = await loadWorker();
  const env = { AGENT_STATUS_KV: fakeKV(), AGENT_STATUS_PUSH_TOKEN: PUSH, AGENT_STATUS_VIEW_TOKEN: VIEW };

  assert.equal((await call(worker, { token: PUSH, env })).status, 401);
  assert.equal((await call(worker, { method: "POST", token: VIEW, body: "{}", env })).status, 401);
});

test("올바른 토큰이면 올린 내용이 그대로 돌아오고 fetched_at 이 붙는다", async () => {
  const worker = await loadWorker();
  const env = { AGENT_STATUS_KV: fakeKV(), AGENT_STATUS_PUSH_TOKEN: PUSH, AGENT_STATUS_VIEW_TOKEN: VIEW };

  // role-status.json 의 실제 모양 그대로 (activity-status.sh 가 만드는 것)
  const roleStatus = {
    CMO: { status: "working", task: "Bash: npm test 실행 중", tool: "Bash", updated_at: "2026-09-12T10:00:00Z", history: [] },
    CTO: { status: "idle", task: "대기 중", tool: "", updated_at: "2026-09-12T10:00:00Z", history: [] },
    "CEO-STAFF": { status: "working", task: "보고 정리", tool: "Write", updated_at: "2026-09-12T10:00:00Z", history: [] },
    HUB: { status: "working", task: "수집", tool: "Grep", updated_at: "2026-09-12T10:00:00Z", history: [] },
  };
  const pushed = await call(worker, { method: "POST", token: PUSH, body: JSON.stringify(roleStatus), env });
  assert.equal(pushed.status, 200);

  const read = await call(worker, { token: VIEW, env });
  assert.equal(read.status, 200);
  const payload = await read.json();
  assert.deepEqual(
    { CMO: payload.CMO, CTO: payload.CTO, "CEO-STAFF": payload["CEO-STAFF"], HUB: payload.HUB },
    roleStatus,
    "올린 내용이 그대로 돌아오지 않았다",
  );
  assert.ok(payload.fetched_at, "fetched_at 이 없다");
});

test("20KB 를 넘는 본문은 413 으로 막는다", async () => {
  const worker = await loadWorker();
  const env = { AGENT_STATUS_KV: fakeKV(), AGENT_STATUS_PUSH_TOKEN: PUSH, AGENT_STATUS_VIEW_TOKEN: VIEW };

  const huge = JSON.stringify({ CMO: { task: "가".repeat(20 * 1024) } });
  const response = await call(worker, { method: "POST", token: PUSH, body: huge, env });
  assert.equal(response.status, 413);
  assert.equal(env.AGENT_STATUS_KV.store.value, null, "막힌 요청이 KV 에 쓰였다");
});

test("아무도 올리지 않았으면 빈 객체를 준다 (404 가 아니다)", async () => {
  const worker = await loadWorker();
  const env = { AGENT_STATUS_KV: fakeKV(), AGENT_STATUS_PUSH_TOKEN: PUSH, AGENT_STATUS_VIEW_TOKEN: VIEW };

  const response = await call(worker, { token: VIEW, env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {});
});
