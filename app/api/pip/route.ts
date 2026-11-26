import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { message, planet } = await request.json().catch(() => ({}))
  const destination = typeof planet === 'string' ? planet : 'the Outer Reach'
  const text = typeof message === 'string' ? message.toLowerCase() : ''
  const reply = text.includes('fuel')
    ? 'Fuel is precious out here. Land at a nearby beacon, then distill four rock into eighteen percent fuel aboard ship.'
    : text.includes('mine') || text.includes('crystal')
      ? `Scanning ${destination} now. Tap MINE on the surface to uncover rock and crystal deposits.`
      : `Copy that, pilot. ${destination} is on our scope. Keep an eye on your fuel and trust your instincts.`

  return NextResponse.json({ reply })
}
