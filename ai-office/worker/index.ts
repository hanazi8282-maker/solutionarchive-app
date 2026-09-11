/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  REPORT_TOKEN_HEADER,
  integrationStatus,
  publishReport,
  type DayReport,
  type PublishEnv,
} from "./report";

/** Workers 런타임이 넘겨주는 정적 자산 바인딩 (wrangler.jsonc의 assets.binding) */
interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env extends PublishEnv {
  ASSETS: AssetFetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

/** 보고 발행 요청을 검사한다. 통과면 null, 막히면 그대로 돌려줄 401 응답. */
function denyReport(request: Request, env: Env, url: URL): Response | null {
  // REPORT_TOKEN이 없으면 어떤 경로로도 발행되지 않는다 (fail-closed).
  if (!env.REPORT_TOKEN) {
    return Response.json(
      { error: "발행이 아직 설정되지 않았어요 — REPORT_TOKEN을 넣어야 보고서를 보낼 수 있습니다." },
      { status: 401 },
    );
  }
  // ① 외부에서 직접 부르는 경로 — 시크릿 헤더가 맞아야 한다.
  if (request.headers.get(REPORT_TOKEN_HEADER) === env.REPORT_TOKEN) return null;
  // ② 오피스 화면이 스스로 부르는 경로 — 같은 오리진에서 온 브라우저 요청만 통과.
  //    공개 페이지에는 시크릿을 심을 수 없으므로 오리진으로 판정한다.
  if (request.headers.get("Origin") === url.origin) return null;
  return Response.json({ error: "발행 권한이 없어요 (토큰 불일치)." }, { status: 401 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 연동 설정 여부만 알려준다 (값은 절대 내보내지 않는다)
    if (url.pathname === "/api/integrations") {
      return Response.json(integrationStatus(env));
    }

    // 완료 보고를 Notion + Discord로 동시 발행
    if (url.pathname === "/api/report") {
      if (request.method !== "POST") return new Response("POST only", { status: 405 });
      const denied = denyReport(request, env, url);
      if (denied) return denied;
      try {
        const report = (await request.json()) as DayReport;
        const result = await publishReport(report, env);
        return Response.json(result);
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
