import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  return new NextResponse(
    `<html><body><h1>CODE:</h1><p style="word-break:break-all;font-size:20px">${code}</p></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
