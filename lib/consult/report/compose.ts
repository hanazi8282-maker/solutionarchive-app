// 결론서 단일 생성기(R11) — 장 단위 모듈을 프리셋으로 조립한다. 0층 무료 = 1장 · 유료 = 1+2장 · 콜드메일 = 전 장(1~6 + 부록).
// 웹 화면(/consult/run)·공개 출구(/r/{token})·콜드메일이 같은 장 모듈을 쓴다 — 같은 입력이면 같은 장이 나온다(만들어 둔 장은 다시 만들지 않는다).
import { db, type Run } from '../runs.ts'
import { diagnoseLayer0, generateMemo } from '../pipeline.ts'
import { retrieveSimilar } from '../cases.ts'
import { buildCh3to6 } from './ch3to6.ts'
import type { Ch1 } from './ch1-validate.ts'
import type { Ch2 } from './ch2-validate.ts'
import type { Ch3to6 } from './ch3to6-validate.ts'

export type Preset = 'free' | 'paid' | 'cold'
export const PRESET_CHAPTERS: Record<Preset, string[]> = { free: ['1'], paid: ['1', '2'], cold: ['1', '2', '3', '4', '5', '6'] }

export type ReportPayload = {
  company: string
  kind: Run['kind'] // H2(2026-11-14): 화면이 회사형/아이디어형 이름(실행 리포트/사업기획서 초안)을 고르는 데 쓴다.
  generated_at: string
  chapters: string[]
  ch1: Ch1
  ch2?: Ch2
  ch3to6?: Ch3to6
  appendix: { assumptions: string[]; sources: string[]; note: string }
}

export async function composeReport(run: Run, preset: Preset, createdBy: string): Promise<{ token: string; payload: ReportPayload }> {
  const sb = await db()
  const want = PRESET_CHAPTERS[preset]

  // 1장
  await diagnoseLayer0(run).catch((e) => { if (!(e instanceof Error) || !/already|exists/.test(e.message)) throw e })
  const { data: ds } = await sb.from('consult_diagnoses').select('layer,blocks').eq('run_id', run.id).eq('layer', 0).maybeSingle()
  if (!ds) throw new Error('1장(진단)을 만들지 못했습니다')
  let ch1 = ds.blocks as Ch1

  // 비슷한 회사 목록(③, v0) — 콜드메일 전 장에서만 채운다(보유 사례가 있을 때만, 없으면 빈 목록).
  const similar = preset === 'cold' ? await retrieveSimilar({ runId: run.id, owner: run.owner_email, category: ch1.position.category, oneLiner: run.one_liner ?? '' }) : []
  if (similar.length) ch1 = { ...ch1, similar }

  const payload: ReportPayload = {
    company: run.company_name ?? run.company_url ?? '창업 전 아이디어',
    kind: run.kind,
    generated_at: new Date().toISOString(),
    chapters: want,
    ch1,
    appendix: { assumptions: ch1.loss?.assumptions ?? [], sources: [], note: '' },
  }

  // 2장
  if (want.includes('2')) {
    await generateMemo(run, { allowNoLayer1: preset === 'cold' }).catch((e) => { if (!(e instanceof Error) || e.message !== 'no_layer1') throw e })
    const { data: m } = await sb.from('consult_memos').select('body').eq('run_id', run.id).eq('version', 1).maybeSingle()
    if (m) payload.ch2 = m.body as Ch2
    else if (preset === 'paid') throw new Error('no_layer1')
  }

  // 3~6장 — 콜드메일 전 장
  const { data: col } = await sb.from('consult_collected').select('facts').eq('run_id', run.id).maybeSingle()
  const pages = ((col?.facts ?? { pages: [] }) as { pages: { url: string; title: string; text: string }[] }).pages
  if (want.includes('3')) {
    const { data: prev } = await sb.from('consult_reports').select('payload').eq('run_id', run.id).contains('chapters', ['3']).order('created_at', { ascending: false }).limit(1)
    const cached = (prev?.[0]?.payload as ReportPayload | undefined)?.ch3to6
    if (cached) payload.ch3to6 = cached
    else payload.ch3to6 = (await buildCh3to6({ runId: run.id, owner: run.owner_email, ch1, pages, similar })).ch
  }

  payload.appendix.sources = pages.filter((p) => p.url !== 'user:one_liner').map((p) => p.url)
  payload.appendix.note = pages.length === 0 || payload.appendix.sources.length === 0
    ? '수집한 공개 페이지가 없어 한 줄 설명만으로 작성했습니다.'
    : '공개된 페이지만 읽었고, 수치는 가정을 밝힌 추정입니다.'

  const { data: row, error } = await sb.from('consult_reports').insert({ run_id: run.id, chapters: want, payload, created_by: createdBy }).select('token').single()
  if (error || !row) throw new Error(`결론서 저장 실패: ${error?.message}`)
  return { token: row.token as string, payload }
}
