'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, CircleHelp, Compass, Fuel, Gauge, Gem, MessageCircle, Mountain, Package, Pickaxe, Radio, Rocket, Shield, Sparkles, Sun, X } from 'lucide-react'
import { GameCanvas } from './game-canvas'
import { PLANETS, useGameStore, type PlanetName } from './store'
import { flightInput } from './input'

type PipLine = { from: 'pip' | 'pilot'; text: string }

const planetNotes: Record<PlanetName, string> = {
  'Lyra Prime': 'Blue-glass canyons. Rich in deep-core crystal.',
  'Kestrel Reach': 'A quiet red-rock belt. Good salvage prospects.',
  'Vela Drift': 'Unstable ice shelf. Keep your shields charged.',
  Orison: 'Long-range beacon detected near the old colony.',
}

function Metric({ label, value, unit, tone = 'cyan', icon: Icon }: { label: string; value: string | number; unit?: string; tone?: string; icon: typeof Fuel }) {
  return <div className="metric">
    <div className="metric-head"><Icon size={13} strokeWidth={1.7} /><span>{label}</span></div>
    <div className={`metric-value ${tone}`}>{value}<small>{unit}</small></div>
  </div>
}

function Stick({ side, input }: { side: 'left' | 'right'; input: { active: boolean; x: number; y: number } }) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const origin = useRef<{ x: number; y: number; id: number } | null>(null)
  const RADIUS = 52

  const onDown = (event: React.PointerEvent) => {
    event.stopPropagation()
    const zone = zoneRef.current
    if (!zone) return
    const rect = zone.getBoundingClientRect()
    origin.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, id: event.pointerId }
    zone.setPointerCapture(event.pointerId)
    if (baseRef.current) {
      baseRef.current.style.left = `${origin.current.x}px`
      baseRef.current.style.top = `${origin.current.y}px`
      baseRef.current.style.opacity = '1'
    }
    input.active = true
    input.x = 0
    input.y = 0
  }
  const onMove = (event: React.PointerEvent) => {
    if (!origin.current || event.pointerId !== origin.current.id) return
    const rect = zoneRef.current!.getBoundingClientRect()
    let dx = event.clientX - rect.left - origin.current.x
    let dy = event.clientY - rect.top - origin.current.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS }
    input.x = dx / RADIUS
    input.y = -dy / RADIUS
    if (knobRef.current) knobRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }
  const onUp = (event: React.PointerEvent) => {
    if (!origin.current || event.pointerId !== origin.current.id) return
    origin.current = null
    input.active = false
    input.x = 0
    input.y = 0
    if (baseRef.current) baseRef.current.style.opacity = '0'
    if (knobRef.current) knobRef.current.style.transform = 'translate(-50%, -50%)'
  }
  return <div ref={zoneRef} data-stick={side} className={`stick-zone stick-${side}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(event) => event.preventDefault()}>
    <div ref={baseRef} className="stick-base"><div ref={knobRef} className="stick-knob" /></div>
    <span className="stick-label">{side === 'left' ? 'STICK · MOVE' : 'STICK · TURN + FIRE'}</span>
  </div>
}

export function StarlanceGame() {
  const mode = useGameStore((state) => state.mode)
  const setMode = useGameStore((state) => state.setMode)
  const fuel = useGameStore((state) => state.fuel)
  const shield = useGameStore((state) => state.shield)
  const rock = useGameStore((state) => state.rock)
  const crystal = useGameStore((state) => state.crystal)
  const bombs = useGameStore((state) => state.bombs)
  const holdValue = useGameStore((state) => state.holdValue)
  const rings = useGameStore((state) => state.rings)
  const currentPlanet = useGameStore((state) => state.currentPlanet)
  const distances = useGameStore((state) => state.distances)
  const setFuel = useGameStore((state) => state.setFuel)
  const setDistances = useGameStore((state) => state.setDistances)
  const setCurrentPlanet = useGameStore((state) => state.setCurrentPlanet)
  const mine = useGameStore((state) => state.mine)
  const jump = useGameStore((state) => state.jump)
  const distillFuel = useGameStore((state) => state.distillFuel)
  const forgeWeapon = useGameStore((state) => state.forgeWeapon)
  const restart = useGameStore((state) => state.restart)
  const [pipOpen, setPipOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [pipLines, setPipLines] = useState<PipLine[]>([{ from: 'pip', text: 'Flight systems nominal. Where should we point this thing?' }])
  const [night, setNight] = useState(18)
  const [tiltOn, setTiltOn] = useState(true)
  const toggleTilt = async () => {
    const next = !tiltOn
    if (next) {
      const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      if (typeof doe.requestPermission === 'function') {
        try { await doe.requestPermission() } catch { /* sensor stays silent; drag still steers */ }
      }
    }
    flightInput.tiltOn = next
    setTiltOn(next)
  }
  const [mined, setMined] = useState(false)
  const pointerStart = useRef<number | null>(null)
  const landable = distances[currentPlanet] <= 220

  useEffect(() => {
    if (mode !== 'FLIGHT') return
    const tick = window.setInterval(() => {
      const state = useGameStore.getState()
      const nextFuel = Math.max(0, state.fuel - 0.3)
      state.setFuel(nextFuel)
      const nextDistances = { ...state.distances, [state.currentPlanet]: Math.max(0, state.distances[state.currentPlanet] - 65) }
      state.setDistances(nextDistances)
      if (nextFuel <= 0) state.setMode('STRANDED')
    }, 1000)
    return () => window.clearInterval(tick)
  }, [mode])

  useEffect(() => {
    if (mode !== 'SURFACE') return
    const tick = window.setInterval(() => setNight((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(tick)
  }, [mode])

  const setSteering = (value: number) => window.dispatchEvent(new CustomEvent('starlance:steer', { detail: value }))
  const sendMessage = async () => {
    const text = question.trim()
    if (!text) return
    setPipLines((lines) => [...lines, { from: 'pilot', text }])
    setQuestion('')
    try {
      const response = await fetch('/api/pip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, planet: currentPlanet, mode }) })
      const data = await response.json()
      setPipLines((lines) => [...lines, { from: 'pip', text: data.reply }])
    } catch {
      setPipLines((lines) => [...lines, { from: 'pip', text: `Copy that. ${planetNotes[currentPlanet]}` }])
    }
  }

  const startFlight = () => setMode('FLIGHT')
  const goSurface = () => setMode('SURFACE')
  const blastoff = () => setMode('LAUNCH')

  return <main className={`game-shell mode-${mode.toLowerCase()}`} onPointerDown={(event) => { pointerStart.current = event.clientX }} onPointerMove={(event) => {
    if (pointerStart.current === null || mode !== 'FLIGHT') return
    const delta = Math.max(-1, Math.min(1, (event.clientX - pointerStart.current) / 110))
    setSteering(delta)
    if (Math.abs(event.clientX - pointerStart.current) > 20) {
      const state = useGameStore.getState()
      const updated = { ...state.distances, [state.currentPlanet]: Math.max(0, state.distances[state.currentPlanet] - 0.35) }
      state.setDistances(updated)
    }
  }} onPointerUp={() => { pointerStart.current = null; setSteering(0) }} onPointerCancel={() => { pointerStart.current = null; setSteering(0) }}>
    {mode !== 'TITLE' && mode !== 'STRANDED' && <GameCanvas />}

    {mode === 'TITLE' && <section className="title-screen">
      <div className="title-art" role="img" aria-label="A silver exploration ship heads toward distant worlds." />
      <div className="title-vignette" />
      <div className="title-top"><span className="signal"><i /> LONG-RANGE TRANSMISSION</span><span className="build-code">FIELD LOG · 07.24</span></div>
      <div className="title-copy">
        <span className="eyebrow"><span /> A FRONTIER BEYOND THE MAP</span>
        <h1>STAR<span>LANCE</span></h1>
        <p>One ship. Four uncharted worlds.<br />A long way home.</p>
      </div>
      <div className="title-bottom">
        <div className="mission-stamp"><span>MISSION 01</span><strong>THE OUTER REACH</strong><small>DEEP-SPACE MINING EXPEDITION</small></div>
        <button className="primary-button launch-button" onClick={startFlight}><span>Launch mission</span><Rocket size={19} /></button>
        <span className="title-footer">TOUCH TO STEER <b>·</b> EXPLORE TO SURVIVE</span>
      </div>
    </section>}

    {mode === 'FLIGHT' && <>
      <header className="flight-header">
        <div className="brand-chip"><span className="brand-mark">S</span><div><strong>STARLANCE</strong><small>FLIGHT DECK <i /> LIVE</small></div></div>
        <button className={`tilt-toggle ${tiltOn ? 'on' : ''}`} onClick={toggleTilt} aria-pressed={tiltOn}><Compass size={14} /><span>TILT</span><strong>{tiltOn ? 'ON' : 'OFF'}</strong></button>
        <button className="icon-button help-button" aria-label="Mission briefing" onClick={() => setPipOpen(true)}><CircleHelp size={19} /></button>
      </header>
      <div className="flight-status">
        <div className="status-card fuel-card"><div className="status-top"><span><Fuel size={14} /> FUEL RESERVE</span><strong className={fuel < 25 ? 'critical' : ''}>{Math.ceil(fuel)}<small>%</small></strong></div><div className="gauge-track"><i className={fuel < 25 ? 'critical-fill' : ''} style={{ width: `${fuel}%` }} /></div><small className="gauge-foot">{fuel < 25 ? 'LOW RESERVE · LAND IMMEDIATELY' : 'EST. RANGE 2,480 KM'}</small></div>
        <div className="status-card shield-card"><div className="status-top"><span><Shield size={14} /> SHIELD</span><strong>{shield}<small>%</small></strong></div><div className="gauge-track shield-track"><i style={{ width: `${shield}%` }} /></div><small className="gauge-foot">HULL INTEGRITY GOOD</small></div>
      </div>
      <div className="hold-chip"><Package size={14} /><span>HOLD VALUE</span><strong>¢{holdValue.toLocaleString()}</strong><span className="rings-count">RINGS {rings}</span></div>
      <div className="planet-chips" aria-label="Planet destinations">
        {PLANETS.map((planet, index) => <button key={planet} className={`planet-chip ${currentPlanet === planet ? 'selected' : ''}`} onClick={() => setCurrentPlanet(planet)}>
          <span className={`planet-dot planet-${index}`} />
          <span className="chip-name">{planet.split(' ')[0].toUpperCase()}</span>
          <span className="chip-dist">{Math.ceil(distances[planet]).toLocaleString()} KM</span>
        </button>)}
      </div>
      {fuel < 25 && <div className="fuel-warning"><span className="warning-dot" /> CRITICAL RESERVE — FIND A LANDING SITE</div>}
      <div className="flight-bottom">
        {landable ? <button className="land-button" onClick={goSurface}><span>LAND</span><small>{currentPlanet} · SITE IN RANGE</small><ArrowDown size={22} /></button> : <div className="land-tracker"><span>APPROACHING {currentPlanet.toUpperCase()}</span><div className="land-track"><i style={{ width: `${Math.min(100, Math.max(2, (1 - distances[currentPlanet] / 2300) * 100))}%` }} /></div><small>{Math.ceil(distances[currentPlanet]).toLocaleString()} KM TO GO · LAND UNLOCKS AT 220 KM · RINGS CLOSE IT FASTER</small></div>}
      </div>
      <Stick side="left" input={flightInput.stickL} />
      <Stick side="right" input={flightInput.stickR} />
    </>}

    {mode === 'SURFACE' && <>
      <header className="flight-header surface-header"><div className="brand-chip"><span className="brand-mark">S</span><div><strong>{currentPlanet.toUpperCase()}</strong><small>SURFACE EXPEDITION <i /> LIVE</small></div></div><div className="day-chip"><Sun size={15} /><span>DAYLIGHT</span><strong>00:{String(night).padStart(2, '0')}</strong></div></header>
      <div className="surface-status"><Metric label="FUEL" value={Math.ceil(fuel)} unit="%" icon={Fuel} /><Metric label="SHIELD" value={shield} unit="%" icon={Shield} /><Metric label="ROCK" value={rock} icon={Mountain} /><Metric label="CRYSTAL" value={crystal} icon={Gem} /></div>
      <div className="surface-landmark"><span className="eyebrow"><span /> UNKNOWN TERRAIN</span><h2>THE GLASS<br />CANYON</h2><p>{mined ? 'Fresh deposits exposed. Pip is scanning for more.' : 'A mineral seam glows beneath the fractured ice.'}</p><span className="scan-line" /></div>
      <div className="surface-bottom"><div className="night-meter"><Sun size={15} /><span>DARKNESS IN</span><strong>00:{String(night).padStart(2, '0')}</strong><div><i style={{ width: `${Math.max(8, (night / 18) * 100)}%` }} /></div></div>
        <div className="action-grid"><button className="action-button" onClick={() => { jump(); setMined(false); window.dispatchEvent(new CustomEvent('starlance:jump')) }}><ArrowUp size={18} /><strong>JUMP</strong><small>BOOST · 3 FUEL</small></button><button className="action-button mine-button" onClick={() => { mine(); setMined(true) }}><Pickaxe size={18} /><strong>MINE</strong><small>+2 ROCK · +1 GEM</small></button><button className="action-button" onClick={() => setPipOpen(true)}><Radio size={18} /><strong>CALL</strong><small>OPEN PIP COMMS</small></button><button className="action-button ship-button" onClick={() => setMode('SHIP')}><Rocket size={18} /><strong>SHIP</strong><small>RETURN TO SHIP</small></button></div>
        {night === 0 && <div className="fuel-warning"><span className="warning-dot" /> NIGHTFALL APPROACHING — RETURN TO SHIP</div>}
      </div>
      <Stick side="left" input={flightInput.stickL} />
    </>}

    {mode === 'SHIP' && <>
      <header className="flight-header ship-header"><div className="brand-chip"><span className="brand-mark">S</span><div><strong>THE WAYFARER</strong><small>SHIP SYSTEMS <i /> ONLINE</small></div></div><button className="icon-button" aria-label="Open Pip chat" onClick={() => setPipOpen(true)}><MessageCircle size={18} /></button></header>
      <div className="ship-window"><span className="window-label">DOCKED · {currentPlanet.toUpperCase()}</span><div className="window-planet" /><span className="window-coordinate">OUTER REACH / 07</span></div>
      <section className="ship-interior"><div className="section-kicker"><span /> CARGO & SYSTEMS</div><h2>Ship status</h2>
        <div className="cargo-grid"><Metric label="ROCK" value={rock} icon={Mountain} /><Metric label="CRYSTAL" value={crystal} icon={Gem} /><Metric label="FUEL" value={Math.ceil(fuel)} unit="%" icon={Fuel} /><Metric label="SHIELD" value={shield} unit="%" icon={Shield} /></div>
        <div className="hold-summary"><span>HOLD VALUE</span><strong>¢{holdValue.toLocaleString()}</strong><small>{rock + crystal} UNITS CARGO</small></div>
        <div className="ship-actions"><button className="conversion-button" onClick={distillFuel} disabled={rock < 4 || fuel >= 100}><span className="conversion-icon"><Fuel size={18} /></span><span><strong>Distill fuel</strong><small>4 rock → +18% fuel</small></span><span className="convert-mark">↗</span></button><button className="conversion-button" onClick={forgeWeapon} disabled={crystal < 2}><span className="conversion-icon amber"><Sparkles size={18} /></span><span><strong>Forge weapon</strong><small>2 crystal → +1 bomb <b>· {bombs} READY</b></small></span><span className="convert-mark">↗</span></button></div>
        <button className="primary-button blastoff-button" onClick={blastoff}><span>Blastoff</span><Rocket size={19} /><small>RETURN TO ORBIT</small></button>
        <button className="back-surface" onClick={goSurface}><ChevronDown size={15} /> BACK TO SURFACE</button>
      </section>
      <button className="pip-float ship-pip" onClick={() => setPipOpen(true)} aria-label="Open chat with Pip"><span className="pip-face"><i /><i /></span><span>PIP</span><span className="pip-online" /></button>
    </>}

    {mode === 'STRANDED' && <section className="stranded-screen"><div className="stranded-stars" /><div className="distress-mark"><Radio size={26} /></div><span className="eyebrow"><span /> SIGNAL LOST</span><h1>STRANDED</h1><p>Fuel reserves depleted.<br />The stars go quiet around you.</p><div className="distress-data"><span>LAST KNOWN SECTOR<strong>OUTER REACH · 07</strong></span><span>SHIP STATUS<strong>POWER OFFLINE</strong></span></div><button className="primary-button" onClick={() => { restart(); setPipOpen(false) }}><span>Restart mission</span><Rocket size={18} /></button><small className="distress-footer">A NEW FLIGHT LOG WILL BEGIN</small></section>}

    {pipOpen && <div className="pip-backdrop" onClick={() => setPipOpen(false)}><section className="pip-panel" onClick={(event) => event.stopPropagation()} aria-label="Pip ship AI chat" role="dialog" aria-modal="true"><div className="pip-handle" /><header className="pip-header"><div className="pip-avatar"><span className="pip-face"><i /><i /></span></div><div><strong>PIP <span>SHIP AI</span></strong><small><i /> ONLINE · WAYFARER SYSTEMS</small></div><button className="icon-button" aria-label="Close Pip chat" onClick={() => setPipOpen(false)}><X size={18} /></button></header><div className="pip-intro"><span>MISSION ASSISTANT</span><p>Navigation, mining intel, or a little encouragement. I&apos;m here.</p></div><div className="pip-messages" aria-live="polite">{pipLines.map((line, index) => <div key={`${line.from}-${index}`} className={`chat-line ${line.from}`}><span>{line.from === 'pip' ? 'PIP' : 'YOU'}</span><p>{line.text}</p></div>)}</div><form className="pip-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}><input aria-label="Message Pip" placeholder="Ask Pip anything…" value={question} onChange={(event) => setQuestion(event.target.value)} /><button type="submit" aria-label="Send message" disabled={!question.trim()}><ArrowRight size={18} /></button></form></section></div>}
  </main>
}
