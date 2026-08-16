// GET /api/deploy-status — prod 배포 커밋이 origin/main HEAD보다 뒤처졌는지 진단.
// prodSha(Vercel 배포 SHA) vs mainSha(GitHub origin/main HEAD)를 GitHub API로 비교한다.
// 서버 전용 — GITHUB_TOKEN은 절대 클라이언트에 노출하지 않는다. UI/배너 노출 없음(API only).
//
// ⚠️ GITHUB_TOKEN expires: 2026-10-04 (발급 2026-07-06 + 90d).
//    renew before this date or /api/deploy-status silently starts returning 401.
//    갱신: fine-grained PAT(owner=hanazi8282-maker, repo=solutionarchive-app, Contents:Read-only) 재발급
//         → `vercel env rm GITHUB_TOKEN production` 후 `vercel env add` → 재배포.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const OWNER = 'hanazi8282-maker'
const REPO = 'solutionarchive-app'

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'solutionarchive-deploy-status',
})

export async function GET() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN 미설정' }, { status: 503 })
  }

  const prodShaFull = process.env.VERCEL_GIT_COMMIT_SHA ?? null
  const prodSha = prodShaFull ? prodShaFull.slice(0, 7) : 'local'

  try {
    // origin/main HEAD SHA
    const mainRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/commits/main`,
      { headers: GH_HEADERS(token), cache: 'no-store' },
    )
    if (!mainRes.ok) {
      return NextResponse.json(
        { error: `GitHub commits API ${mainRes.status}` },
        { status: 502 },
      )
    }
    const mainData = await mainRes.json()
    const mainShaFull: string = mainData.sha
    const mainSha = mainShaFull.slice(0, 7)

    // 로컬/미배포 환경: prod SHA가 없으면 비교 불가
    if (!prodShaFull) {
      return NextResponse.json({ synced: false, prodSha, mainSha, behindBy: null })
    }

    // prod가 main보다 몇 커밋 뒤처졌는지 = compare(base=prod ... head=main).ahead_by
    const cmpRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/compare/${prodShaFull}...${mainShaFull}`,
      { headers: GH_HEADERS(token), cache: 'no-store' },
    )
    if (!cmpRes.ok) {
      return NextResponse.json(
        { error: `GitHub compare API ${cmpRes.status}` },
        { status: 502 },
      )
    }
    const cmpData = await cmpRes.json()
    const behindBy: number = cmpData.ahead_by ?? 0

    return NextResponse.json({ synced: behindBy === 0, prodSha, mainSha, behindBy })
  } catch (e) {
    console.error('[deploy-status] failed', e)
    return NextResponse.json({ error: 'deploy-status 조회 실패' }, { status: 500 })
  }
}
