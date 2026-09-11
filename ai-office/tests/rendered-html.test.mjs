// 빌드된 워커가 실제로 오피스 화면을 렌더하는지 확인한다.
// (상태코드만 보지 않는다 — 화면의 표지인 회사 제목까지 본문에서 확인한다)
import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY } from "../company.config.ts";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("GET / 가 회사 제목이 들어간 HTML 을 돌려준다", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.ok(html.includes(COMPANY.pageTitle), `본문에 "${COMPANY.pageTitle}" 가 없습니다`);
});
