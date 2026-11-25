// 자식 프로세스 preload(--import): 127.0.0.1 밖 요청은 전부 막고, Gemini 만 결정적 가짜 응답을 준다.
const real = globalThis.fetch
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}/g
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input?.url ?? input))
  if (url.hostname === '127.0.0.1') return real(input, init)
  if (url.hostname !== 'generativelanguage.googleapis.com') throw new Error(`net-stub: 바깥 요청 차단 ${url.hostname}`)
  const prompt = JSON.parse(init.body).contents[0].parts[0].text
  const rows = [...new Set(prompt.match(UUID))].map((id) => {
    const n = parseInt(id.slice(0, 2), 16)
    return { input_id: id, verdict: ['relevant', 'irrelevant', 'unknown'][n % 3], product_informative: n % 2 === 0 }
  })
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ rows }) }] }, finishReason: 'STOP' }] }), { status: 200 })
}
