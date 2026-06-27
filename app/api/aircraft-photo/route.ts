import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const reg = new URL(request.url).searchParams.get('reg')
  if (!reg) return NextResponse.json({ photo: null })

  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/reg/${reg}`,
      { headers: { 'User-Agent': 'SkyGuard/1.0 (+mccluskeyjt@gmail.com)' } }
    )
    if (!res.ok) return NextResponse.json({ photo: null })
    const data = await res.json()
    const first = data.photos?.[0] ?? null
    if (!first) return NextResponse.json({ photo: null })
    return NextResponse.json({
      photo: {
        url:          first.thumbnail_large?.src ?? first.thumbnail?.src ?? null,
        photographer: first.photographer ?? null,
        link:         first.link ?? null,
      },
    })
  } catch {
    return NextResponse.json({ photo: null })
  }
}