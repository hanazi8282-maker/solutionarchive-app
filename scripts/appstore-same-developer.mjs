#!/usr/bin/env node
// 같은 개발사 앱 후보 파일 만들기(v71aj (다)) — lib/review/appstore-same-developer.ts collectSameDeveloper 를 사람이 손으로 한 번 돌리는 얇은 실행기.
// 무인 연결 없음(워크플로 없음). 결과 파일을 mention-loop.mjs --similar=… 와 candidate-generator.mjs --candidates=… 가 받는다.
// DB 를 import 하지 않는다. 네트워크 = itunes.apple.com robots.txt + 루트 /lookup 만(모듈이 robots 재확인·4초 간격·상한·차단 즉시 중단).
//   --targets=<json>   review_targets 행 [{source_key, product_ref, label}] (보고서 §2 읽기 SQL (D))
//   --out=<json>       {candidates, requests, stopped, skipped}
//   --max-requests=N   기본 40(모듈 상한). 앵커 1개 = 2요청
// 종료 코드: 0 · 1(입력 실패) · 2(robots·차단으로 멈춤 — 쓴 데까지는 out 에 남는다)

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { LOOKUP_MAX_REQUESTS, anchorsFrom, collectSameDeveloper } from '../lib/review/appstore-same-developer.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const opt = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  try {
    if (!opt('targets') || !opt('out')) throw new Error('--targets=<json> --out=<json> 필요')
    // /lookup 은 v71aj 정책 A(/search 제한 허용) 밖 — 판단 대기다(scripts/anchor-verify.mjs 머리 주석). 판단이 난 뒤 사람이 명시적으로 켠다.
    if (!process.argv.includes('--allow-lookup')) throw new Error('/lookup 경로는 사람 판단 대기다 — 허용 결정 뒤 --allow-lookup 을 붙여 돌린다(0요청으로 중단)')
    const anchors = anchorsFrom(JSON.parse(fs.readFileSync(opt('targets'), 'utf8')))
    const fetchText = async (url) => {
      const r = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20000) }).catch(() => null)
      return { status: r?.status ?? null, body: r ? await r.text() : '' }
    }
    const run = await collectSameDeveloper(anchors, { fetchText, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), productToken: PRODUCT_TOKEN }, { maxRequests: Number(opt('max-requests') ?? LOOKUP_MAX_REQUESTS) })
    fs.writeFileSync(opt('out'), JSON.stringify(run, null, 2) + '\n')
    console.log(`[같은 개발사] 앵커 ${anchors.length} · 요청 ${run.requests} · 후보 ${run.candidates.length} · 건너뜀 ${JSON.stringify(run.skipped)}${run.stopped ? ` · 멈춤: ${run.stopped}` : ''} → ${opt('out')}`)
    process.exit(run.stopped ? 2 : 0)
  } catch (e) {
    console.error(`❌ appstore-same-developer: ${e.message}`)
    process.exit(1)
  }
}
