'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { useGameStore, type PlanetName } from './store'
import { flightInput } from './input'

// Planet identity colors carried over from Starlance v1.
const PLANET_COLORS: Record<PlanetName, number> = {
  'Lyra Prime': 0x3a5fa8,
  'Kestrel Reach': 0xa8553a,
  'Vela Drift': 0x4a9a6a,
  Orison: 0x7b5aa8,
}

const GROUND_COLORS: Record<PlanetName, number> = {
  'Lyra Prime': 0x2c3e57,
  'Kestrel Reach': 0x5a3226,
  'Vela Drift': 0x274435,
  Orison: 0x453a5e,
}

// Surface ice, from the inspo photos (gf-19/gf-20): a dark frozen base
// with the resource glowing through it — cyan veins inside the ice.
function makeIceTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#8b98a5'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 380; i++) {
    const v = 120 + Math.floor(Math.random() * 70)
    g.fillStyle = `rgba(${v * 0.92},${v},${v * 1.08},${0.10 + Math.random() * 0.16})`
    g.beginPath()
    g.ellipse(Math.random() * 512, Math.random() * 512, 14 + Math.random() * 80, 9 + Math.random() * 50, Math.random() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.lineWidth = 1.7
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(110,235,250,${0.25 + Math.random() * 0.45})`
    g.shadowColor = '#50e6f5'
    g.shadowBlur = 8
    g.beginPath()
    let x = Math.random() * 512
    let y = Math.random() * 512
    g.moveTo(x, y)
    for (let j = 0; j < 4; j++) {
      x += (Math.random() - 0.5) * 140
      y += (Math.random() - 0.5) * 140
      g.lineTo(x, y)
    }
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 5)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildShip(flame: boolean): { group: THREE.Group; flame: THREE.Mesh | null } {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.92, roughness: 0.32 })
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a4149, metalness: 0.85, roughness: 0.45 })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.63, 3.4, 28), steel)
  group.add(body)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.15, 28), steel)
  nose.position.y = 2.27
  group.add(nose)

  const windowBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.565, 0.565, 0.3, 28),
    new THREE.MeshStandardMaterial({ color: 0x16222d, metalness: 0.6, roughness: 0.18, emissive: 0x0d2b36, emissiveIntensity: 0.7 }),
  )
  windowBand.position.y = 1.45
  group.add(windowBand)

  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.6), darkMetal)
    const angle = (i / 3) * Math.PI * 2
    fin.position.set(Math.sin(angle) * 0.72, -1.55, Math.cos(angle) * 0.72)
    fin.rotation.y = angle
    fin.rotation.z = Math.sin(angle) * 0.18
    fin.rotation.x = -Math.cos(angle) * 0.18
    group.add(fin)
  }

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.46, 0.5, 20), darkMetal)
  bell.position.y = -1.9
  group.add(bell)

  // Cold-gas RCS blocks, nose and tail quads. Maneuvering is RCS work;
  // the main bell burns at blastoff and nowhere else.
  const nozzleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15)
  for (const ny of [1.85, -1.45]) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const nozzle = new THREE.Mesh(nozzleGeo, darkMetal)
      nozzle.position.set(Math.sin(a) * 0.62, ny, Math.cos(a) * 0.62)
      group.add(nozzle)
    }
  }

  let flameMesh: THREE.Mesh | null = null
  if (flame) {
    flameMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.7, 16),
      new THREE.MeshBasicMaterial({ color: 0x86dcf5, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    flameMesh.rotation.x = Math.PI
    flameMesh.position.y = -2.95
    group.add(flameMesh)
    const glow = new THREE.PointLight(0x66ccee, 12, 9)
    glow.position.y = -2.4
    group.add(glow)
  }
  return { group, flame: flameMesh }
}

function buildPilot(): THREE.Group {
  const pilot = new THREE.Group()
  const suit = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.85, metalness: 0.1 })
  const accent = new THREE.MeshStandardMaterial({ color: 0xb35a2e, roughness: 0.7, metalness: 0.15 })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 6, 14), suit)
  body.position.y = 0.85
  pilot.add(body)

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.22), accent)
  pack.position.set(0, 0.98, -0.34)
  pilot.add(pack)

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.35, metalness: 0.05 }),
  )
  helmet.position.y = 1.72
  pilot.add(helmet)

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.295, 24, 18, -Math.PI / 3.2, Math.PI / 1.6, Math.PI / 3.4, Math.PI / 2.6),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.22, emissive: 0x2a1a05, emissiveIntensity: 0.6 }),
  )
  visor.position.y = 1.72
  visor.rotation.y = Math.PI
  pilot.add(visor)
  return pilot
}

// The ship as she actually is (inspo lock 2026-11-26, starlance-gf-19):
// a photoreal Starship — 9 m across, ~50 m tall — stainless, black window
// band, splayed landing legs, floodlit pad. Procedural stand-in until a
// true model exists; proportions and furniture follow the photo.
function buildStarship(): THREE.Group {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bfc9, roughness: 0.35, metalness: 0.85 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x565b63, roughness: 0.55, metalness: 0.8 })
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.2, metalness: 0.5 })
  const R = 2.35
  const baseY = 3.1
  const bodyH = 15.5
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, bodyH, 28), steel)
  body.position.y = baseY + bodyH / 2
  g.add(body)
  for (const wy of [0.3, 0.55, 0.78]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.015, 0.035, 8, 40), darkSteel)
    ring.rotation.x = Math.PI / 2
    ring.position.y = baseY + bodyH * wy
    g.add(ring)
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 1.15, 28), bandMat)
  band.position.y = baseY + bodyH - 0.7
  g.add(band)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), steel)
  nose.scale.y = 2.1
  nose.position.y = baseY + bodyH
  g.add(nose)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.6, 2.2), darkSteel)
    fin.position.set(Math.sin(a) * (R + 0.55), baseY + 2.2, Math.cos(a) * (R + 0.55))
    fin.rotation.y = a
    g.add(fin)
    const bellM = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.9, 14, 1, true), darkSteel)
    bellM.position.set(Math.sin(a) * 1.05, baseY - 0.4, Math.cos(a) * 1.05)
    g.add(bellM)
  }
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3
    const top = new THREE.Vector3(Math.sin(a) * R * 0.9, baseY + 1.4, Math.cos(a) * R * 0.9)
    const foot = new THREE.Vector3(Math.sin(a) * 4.6, 0.1, Math.cos(a) * 4.6)
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, top.distanceTo(foot), 8), steel)
    strut.position.copy(top).lerp(foot, 0.5)
    strut.quaternion.setFromUnitVectors(up, foot.clone().sub(top).normalize())
    g.add(strut)
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.16, 10), darkSteel)
    pad.position.copy(foot)
    g.add(pad)
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff })
  for (const lx of [-6.5, 6.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), darkSteel)
    post.position.set(lx, 1.7, 3.5)
    g.add(post)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.22), lampMat)
    head.position.set(lx, 3.45, 3.5)
    g.add(head)
    const spot = new THREE.SpotLight(0xdfeaff, 120, 34, 0.75, 0.6, 1)
    spot.position.set(lx, 3.45, 3.5)
    spot.target.position.set(0, 2, 0)
    g.add(spot)
    g.add(spot.target)
  }
  // True scale: ~9 units across the base, ~47 tall against a 1.8-unit
  // pilot — the real 9 m / 50 m proportions. She should dwarf the site.
  g.scale.setScalar(2)
  return g
}

// The harvester drone (inspo lock 2026-11-26, starlance-gf-20): a chunky
// ducted-fan flyer — belly laser melts the ice, the hose vacuums the
// meltwater up into the frosted tank. Distill feedstock, live on stage.
function buildDrone() {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.4, metalness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.6, metalness: 0.6 })
  const frost = new THREE.MeshStandardMaterial({ color: 0xd7dee6, roughness: 0.85, metalness: 0.1 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 14), steel)
  body.scale.set(1.25, 0.68, 0.95)
  g.add(body)
  const blades: THREE.Object3D[] = []
  for (const sx of [-1, 1]) {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 10, 24), dark)
    duct.rotation.x = Math.PI / 2
    duct.position.set(sx * 1.25, 0.12, 0)
    g.add(duct)
    const hub = new THREE.Group()
    hub.position.copy(duct.position)
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.12), dark)
      blade.rotation.y = (i / 3) * Math.PI
      hub.add(blade)
    }
    g.add(hub)
    blades.push(hub)
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 0.4, 10, 1, true), dark)
    bell.position.set(sx * 0.5, -0.5, 0.25)
    g.add(bell)
  }
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), frost)
  tank.position.set(0, -0.55, -0.15)
  tank.scale.set(1, 0.85, 1)
  g.add(tank)
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 8), dark)
  emitter.position.set(0, -0.62, 0.3)
  g.add(emitter)
  return { group: g, blades }
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      object.geometry.dispose()
      const material = object.material as THREE.Material | THREE.Material[]
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }
  })
}

type Burst = { spawn: (origin: THREE.Vector3, color: THREE.Color, count: number, speed: number) => void; tick: (dt: number) => void }

function makeBursts(scene: THREE.Scene): Burst {
  const CAP = 420
  const positions = new Float32Array(CAP * 3)
  const colors = new Float32Array(CAP * 3)
  const velocities = new Float32Array(CAP * 3)
  const life = new Float32Array(CAP)
  for (let i = 0; i < CAP; i++) positions[i * 3 + 1] = -999
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }))
  points.frustumCulled = false
  scene.add(points)
  let cursor = 0
  return {
    spawn(origin, color, count, speed) {
      for (let n = 0; n < count; n++) {
        const i = cursor
        cursor = (cursor + 1) % CAP
        positions[i * 3] = origin.x
        positions[i * 3 + 1] = origin.y
        positions[i * 3 + 2] = origin.z
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const s = speed * (0.35 + Math.random() * 0.85)
        velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * s
        velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * s
        velocities[i * 3 + 2] = Math.cos(phi) * s
        colors[i * 3] = color.r
        colors[i * 3 + 1] = color.g
        colors[i * 3 + 2] = color.b
        life[i] = 0.4 + Math.random() * 0.45
      }
      ;(geo.attributes.color as THREE.BufferAttribute).needsUpdate = true
    },
    tick(dt) {
      let any = false
      for (let i = 0; i < CAP; i++) {
        if (life[i] <= 0) continue
        any = true
        life[i] -= dt
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -999
          continue
        }
        positions[i * 3] += velocities[i * 3] * dt
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
        velocities[i * 3 + 1] -= 2.2 * dt
      }
      if (any) (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    },
  }
}

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mode = useGameStore((state) => state.mode)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    const scene = new THREE.Scene()
    scene.environment = envTexture
    scene.environmentIntensity = 0.45
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(640, 1136), 0.55, 0.55, 0.82)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const resize = () => {
      const width = canvas.clientWidth || 1
      const height = canvas.clientHeight || 1
      renderer.setSize(width, height, false)
      composer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    let tickScene: (t: number, dt: number) => void = () => {}
    const cleanupFns: (() => void)[] = []

    if (mode === 'SURFACE') {
      const state = useGameStore.getState()
      scene.background = new THREE.Color(0x0a111e)
      scene.fog = new THREE.FogExp2(0x0a111e, 0.010)
      camera.position.set(0, 2.7, 8.2)
      camera.lookAt(0, 1.15, 0)

      scene.add(new THREE.HemisphereLight(0x93a7c9, 0x2e2119, 0.85))
      const sun = new THREE.DirectionalLight(0xffe3c0, 1.6)
      sun.position.set(-14, 20, 8)
      scene.add(sun)

      const groundGeo = new THREE.CircleGeometry(95, 72)
      const positions = groundGeo.attributes.position
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i)
        const y = positions.getY(i)
        const d = Math.hypot(x, y)
        const lift = d < 4 ? 0 : Math.sin(x * 0.32) * Math.cos(y * 0.27) * 0.55 + Math.sin(x * 0.09 + y * 0.13) * 1.15
        positions.setZ(i, lift * Math.min(1, d / 14))
      }
      groundGeo.computeVertexNormals()
      const ground = new THREE.Mesh(
        groundGeo,
        new THREE.MeshStandardMaterial({ color: GROUND_COLORS[state.currentPlanet], map: makeIceTexture(), roughness: 0.9, metalness: 0.02, flatShading: true }),
      )
      ground.rotation.x = -Math.PI / 2
      scene.add(ground)

      // The resource: cyan glow inside the ice, never crystal chunks.
      const crystalMat = new THREE.MeshStandardMaterial({ color: 0x0b2b30, emissive: 0x36e6f0, emissiveIntensity: 2.1, roughness: 0.3 })
      for (let i = 0; i < 26; i++) {
        const size = i < 5 ? 0.34 : 0.13 + ((i * 37) % 10) / 55
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(size), crystalMat)
        const angle = i * 2.39996
        const radius = 2.5 + ((i * 53) % 26)
        crystal.position.set(Math.cos(angle) * radius, size * 0.55, Math.sin(angle) * radius - 3)
        crystal.rotation.set(i * 0.7, i * 1.3, 0)
        scene.add(crystal)
      }

      const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b5147, roughness: 0.95, flatShading: true })
      for (let i = 0; i < 18; i++) {
        const size = 0.25 + ((i * 29) % 10) / 16
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), rockMat)
        const angle = i * 1.93 + 0.6
        const radius = 3.5 + ((i * 41) % 30)
        rock.position.set(Math.cos(angle) * radius, size * 0.5, Math.sin(angle) * radius - 2)
        rock.rotation.set(i, i * 2.1, i * 0.4)
        scene.add(rock)
      }

      // Broken ice, from the drone photo: pale shards scattered across
      // the flats, tilted where the sheet cracked.
      const shardMat = new THREE.MeshStandardMaterial({ color: 0xa8d8e8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true })
      for (let i = 0; i < 26; i++) {
        const h = 0.5 + ((i * 31) % 10) / 14
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16 + ((i * 17) % 10) / 42, h, 5), shardMat)
        const angle = i * 2.7 + 1.1
        const radius = 3 + ((i * 47) % 29)
        const sx = Math.cos(angle) * radius
        const sz = Math.sin(angle) * radius - 2
        shard.position.set(sx, h * 0.32, sz)
        shard.rotation.set(((i * 13) % 10) / 22, i * 1.7, ((i * 7) % 10) / 26)
        scene.add(shard)
      }

      // The Starship, landed — she towers over the site, as she should.
      const ship = buildStarship()
      ship.position.set(-16, groundHeight(-16, -29) - 0.2, -29)
      ship.rotation.y = 0.55
      scene.add(ship)

      const pilot = buildPilot()
      pilot.position.set(0.9, 0, 2.4)
      pilot.rotation.y = -0.35
      scene.add(pilot)

      // Sorn, ported from v1 — he keeps near the ship, watching the pilot.
      let sorn: THREE.Group | null = null
      new GLTFLoader().load('/models/sorn.glb', (gltf) => {
        sorn = gltf.scene
        sorn.scale.setScalar(0.94)
        sorn.position.set(-4.4, groundHeight(-4.4, -11), -11)
        scene.add(sorn)
      }, undefined, () => {})

      // The harvester drone at work over the ice: laser down, hose down,
      // melt pool glowing. It is always out here, doing the mining.
      const droneBase = new THREE.Vector3(6.5, groundHeight(6.5, -7.5) + 3.1, -7.5)
      const { group: drone, blades: droneBlades } = buildDrone()
      drone.position.copy(droneBase)
      drone.rotation.y = -0.4
      scene.add(drone)
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.0, 8, 1, true), beamMat)
      beam.position.set(0, -2.1, 0.3)
      drone.add(beam)
      const hoseCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.6, -0.15),
        new THREE.Vector3(0.35, -1.5, 0.2),
        new THREE.Vector3(0.8, -2.3, 0.6),
        new THREE.Vector3(1.0, -3.05, 0.95),
      ])
      const hose = new THREE.Mesh(
        new THREE.TubeGeometry(hoseCurve, 20, 0.07, 8),
        new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7, metalness: 0.3 }),
      )
      drone.add(hose)
      const poolMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), poolMat)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(droneBase.x, groundHeight(droneBase.x, droneBase.z) + 0.04, droneBase.z + 0.3)
      scene.add(pool)

      // Walking: the left stick moves the pilot across the terrain and the
      // camera trails behind. Ground height mirrors the displaced circle
      // geometry above (world z = -geometry y).
      function groundHeight(wx: number, wz: number) {
        const d = Math.hypot(wx, wz)
        if (d < 4) return 0
        const lift = Math.sin(wx * 0.32) * Math.cos(wz * 0.27) * 0.55 + Math.sin(wx * 0.09 - wz * 0.13) * 1.15
        return lift * Math.min(1, d / 14)
      }
      const angleLerp = (a: number, b: number, k: number) => {
        let d = (b - a) % (Math.PI * 2)
        if (d > Math.PI) d -= Math.PI * 2
        if (d < -Math.PI) d += Math.PI * 2
        return a + d * k
      }
      let camYaw = -0.15
      let hopY = 0
      let hopV = 0
      const onJump = () => { if (hopY <= 0) hopV = 6.5 }
      window.addEventListener('starlance:jump', onJump)
      cleanupFns.push(() => window.removeEventListener('starlance:jump', onJump))
      const camTarget = new THREE.Vector3()

      tickScene = (t, dt) => {
        const sL = flightInput.stickL
        const fwdX = -Math.sin(camYaw)
        const fwdZ = -Math.cos(camYaw)
        const rightX = Math.cos(camYaw)
        const rightZ = -Math.sin(camYaw)
        let mx = 0
        let mz = 0
        if (sL.active) {
          mx = rightX * sL.x + fwdX * sL.y
          mz = rightZ * sL.x + fwdZ * sL.y
        }
        const moving = Math.hypot(mx, mz) > 0.12
        if (moving) {
          pilot.position.x += mx * 5.6 * dt
          pilot.position.z += mz * 5.6 * dt
          const r = Math.hypot(pilot.position.x, pilot.position.z)
          if (r > 34) {
            pilot.position.x *= 34 / r
            pilot.position.z *= 34 / r
          }
          pilot.rotation.y = angleLerp(pilot.rotation.y, Math.atan2(mx, mz), 1 - Math.exp(-dt * 10))
          camYaw = angleLerp(camYaw, pilot.rotation.y + Math.PI, 1 - Math.exp(-dt * 1.6))
        }
        if (hopV !== 0 || hopY > 0) {
          hopY += hopV * dt
          hopV -= 16 * dt
          if (hopY <= 0) { hopY = 0; hopV = 0 }
        }
        const bob = moving ? Math.abs(Math.sin(t * 10)) * 0.06 : Math.abs(Math.sin(t * 0.9)) * 0.03
        pilot.position.y = groundHeight(pilot.position.x, pilot.position.z) + bob + hopY
        if (sorn) {
          sorn.position.y = groundHeight(sorn.position.x, sorn.position.z) + Math.abs(Math.sin(t * 0.8)) * 0.04
          const sdx = pilot.position.x - sorn.position.x
          const sdz = pilot.position.z - sorn.position.z
          if (Math.hypot(sdx, sdz) < 9) {
            sorn.rotation.y = angleLerp(sorn.rotation.y, Math.atan2(sdx, sdz), 1 - Math.exp(-dt * 3))
          }
        }
        drone.position.y = droneBase.y + Math.sin(t * 1.25) * 0.12
        drone.rotation.y = -0.4 + Math.sin(t * 0.23) * 0.15
        droneBlades.forEach((b) => { b.rotation.y += dt * 28 })
        beamMat.opacity = 0.55 + Math.sin(t * 37) * 0.12 + Math.random() * 0.1
        poolMat.opacity = 0.26 + Math.sin(t * 2.4) * 0.08
        pool.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05)
        pilot.rotation.z = moving ? Math.sin(t * 10) * 0.045 : 0
        camTarget.set(
          pilot.position.x + Math.sin(camYaw) * 7.5,
          pilot.position.y + 3.0,
          pilot.position.z + Math.cos(camYaw) * 7.5,
        )
        camera.position.lerp(camTarget, 1 - Math.exp(-dt * 4))
        camera.lookAt(pilot.position.x, pilot.position.y + 1.25, pilot.position.z)
      }
    } else if (mode === 'LAUNCH') {
      // BLASTOFF — ignition, liftoff, and the gravity turn: she rises
      // vertical, then pitches over toward the horizon as she climbs,
      // engines cut at MECO, and the fade hands over to FLIGHT.
      // Tap anywhere to skip.
      scene.background = new THREE.Color(0x04070d)
      scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x1a2027, 0.7))
      const moon = new THREE.DirectionalLight(0xcfe4ff, 1.6)
      moon.position.set(-14, 22, 10)
      scene.add(moon)

      const starGeo = new THREE.BufferGeometry()
      const starPos = new Float32Array(900 * 3)
      for (let i = 0; i < 900; i++) {
        starPos[i * 3] = (Math.random() - 0.5) * 320
        starPos[i * 3 + 1] = Math.random() * 150 - 5
        starPos[i * 3 + 2] = (Math.random() - 0.5) * 320
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdceaff, size: 0.55 })))

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(70, 40),
        new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 1 }),
      )
      ground.rotation.x = -Math.PI / 2
      scene.add(ground)

      const ship = buildStarship()
      scene.add(ship)

      // The main engines burn here, and only here.
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      const flame = new THREE.Mesh(new THREE.ConeGeometry(1.45, 9, 20, 1, true), flameMat)
      flame.rotation.x = Math.PI
      flame.visible = false
      ship.add(flame)
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.8, 5.5, 16, 1, true), coreMat)
      core.rotation.x = Math.PI
      core.visible = false
      ship.add(core)
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(13, 28), glowMat)
      glowDisc.rotation.x = -Math.PI / 2
      glowDisc.position.y = 0.05
      scene.add(glowDisc)

      const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false })
      const fade = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), fadeMat)
      fade.position.z = -2
      camera.add(fade)
      scene.add(camera)
      camera.position.set(26, 9, 38)

      let launchT = 0
      let done = false
      const finish = () => {
        if (done) return
        done = true
        useGameStore.getState().setMode('FLIGHT')
      }
      const onSkip = () => finish()
      window.addEventListener('pointerdown', onSkip)
      cleanupFns.push(() => window.removeEventListener('pointerdown', onSkip))

      tickScene = (t, dt) => {
        launchT += dt
        const T = launchT
        const ignite = THREE.MathUtils.smoothstep(T, 0.1, 0.9)
        const climb = Math.pow(Math.max(0, T - 0.9), 1.6) * 4.4
        const turn = THREE.MathUtils.smoothstep(T, 2.4, 6.4) * 1.15
        ship.position.y = climb
        ship.position.z = -Math.pow(Math.max(0, T - 2.4), 2) * 2.7
        ship.rotation.x = -turn
        const meco = T > 6.2 ? Math.max(0, 1 - (T - 6.2) * 2.2) : 1
        const fs = ignite * meco
        flame.visible = fs > 0.02
        core.visible = flame.visible
        const flick = 0.85 + Math.random() * 0.25
        flame.scale.set(0.7 + fs * 0.5, Math.max(0.001, fs * flick), 0.7 + fs * 0.5)
        flame.position.y = 2.3 - 4.5 * flame.scale.y
        core.scale.set(0.8 + fs * 0.3, Math.max(0.001, fs * flick), 0.8 + fs * 0.3)
        core.position.y = 2.3 - 2.75 * core.scale.y
        glowMat.opacity = 0.5 * ignite * Math.max(0, 1 - climb / 52)
        const shake = T > 0.1 && T < 2.8 ? (Math.random() - 0.5) * 0.07 * ignite : 0
        camera.position.set(26 - Math.min(12, Math.max(0, T - 2) * 2.4) + shake, 9 + Math.min(20, climb * 0.22), 38)
        camera.lookAt(ship.position.x, ship.position.y + 18 - turn * 8, ship.position.z - turn * 12)
        fadeMat.opacity = THREE.MathUtils.smoothstep(T, 6.6, 7.4)
        if (T >= 7.45) finish()
      }
    } else {
      // FLIGHT — a Star Fox-style rail run. The course streams at the ship;
      // the pilot steers inside the frame, dodges, shoots, and threads rings.
      // In SHIP mode the same scene idles as the backdrop behind the panel.
      const combat = mode === 'FLIGHT'
      scene.background = new THREE.Color(0x030609)
      scene.fog = new THREE.Fog(0x030609, 60, 240)
      camera.position.set(0, 2.1, 7.6)

      scene.add(new THREE.AmbientLight(0x8899bb, 0.45))
      const key = new THREE.DirectionalLight(0xfff1d6, 2.2)
      key.position.set(6, 9, 5)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0x6fb7d9, 0.9)
      rim.position.set(-7, 3, -6)
      scene.add(rim)

      // Stars
      const starCount = 1300
      const starPositions = new Float32Array(starCount * 3)
      const starColors = new Float32Array(starCount * 3)
      const palette = [new THREE.Color(0xffffff), new THREE.Color(0xcfe9ff), new THREE.Color(0xffe9c9)]
      for (let i = 0; i < starCount; i++) {
        starPositions[i * 3] = (Math.random() - 0.5) * 260
        starPositions[i * 3 + 1] = (Math.random() - 0.5) * 170
        starPositions[i * 3 + 2] = 14 - Math.random() * 460
        const c = palette[i % 3]
        starColors[i * 3] = c.r
        starColors[i * 3 + 1] = c.g
        starColors[i * 3 + 2] = c.b
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }))
      scene.add(stars)

      // No terrain in space. Below the ship is void and stars — the old
      // scrolling ground plane read as an ocean (Will, 2026-11-26).

      // Destination planet, growing as the store's distance closes.
      const planetMat = new THREE.MeshStandardMaterial({ color: PLANET_COLORS[useGameStore.getState().currentPlanet], roughness: 0.85, metalness: 0.05 })
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), planetMat)
      scene.add(planet)
      const ringDisc = new THREE.Mesh(
        new THREE.RingGeometry(1.45, 2.15, 64),
        new THREE.MeshBasicMaterial({ color: 0xa9c6d4, transparent: true, opacity: 0.30, side: THREE.DoubleSide }),
      )
      ringDisc.rotation.x = Math.PI / 2.35
      planet.add(ringDisc)
      const targetColor = new THREE.Color()

      // The ship.
      const { group: ship, flame } = buildShip(true)
      ship.scale.setScalar(0.62)
      ship.position.set(0, 1.5, 0)
      // Lay the vertical Starship over into flight attitude, nose forward (-Z).
      ship.rotation.x = -Math.PI / 2.25
      scene.add(ship)

      // Propulsion truth (Will, 2026-11-26): the main engines are OFF in
      // flight — they burn in the blastoff sequence and nowhere else.
      // Steering and avoidance are cold-gas RCS work: short pale puffs
      // from the nozzle blocks.
      if (flame) flame.visible = false
      ship.traverse((o) => {
        const l = o as THREE.PointLight
        if (l.isPointLight) l.intensity = 0
      })
      type Puff = { mesh: THREE.Mesh; life: number; dir: THREE.Vector3 }
      const puffGeo = new THREE.ConeGeometry(0.09, 0.55, 8)
      const puffs: Puff[] = []
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(
          puffGeo,
          new THREE.MeshBasicMaterial({ color: 0xe8f2f8, transparent: true, opacity: 0, depthWrite: false }),
        )
        m.visible = false
        ship.add(m)
        puffs.push({ mesh: m, life: 0, dir: new THREE.Vector3() })
      }
      let puffCooldown = 0
      const upAxis = new THREE.Vector3(0, 1, 0)
      const firePuffs = (side: number, vert: number) => {
        let fired = 0
        for (const p of puffs) {
          if (p.life > 0) continue
          const nose = fired % 2 === 0
          p.mesh.position.set(side * 0.68, nose ? 1.85 : -1.45, vert * 0.68)
          p.dir.set(side, 0, vert).normalize()
          p.mesh.quaternion.setFromUnitVectors(upAxis, p.dir)
          p.life = 0.26
          p.mesh.visible = true
          fired++
          if (fired >= 2) break
        }
      }

      const bursts = makeBursts(scene)

      // Damage flash, attached to the camera.
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 7),
        new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false }),
      )
      flash.position.set(0, 0, -1.2)
      camera.add(flash)
      scene.add(camera)
      let flashLevel = 0
      let shake = 0
      let invulnerableUntil = 0
      let strandedSent = false

      // Asteroid pool.
      // No asteroids (Will, 2026-11-26). The course is rings, laid out
      // in Sonic-style trails — lines, arcs, and sweeps to follow.
      type Ring = { mesh: THREE.Mesh; active: boolean; prevZ: number; scored: boolean }
      const rings: Ring[] = []
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.28, emissive: 0x553a08, emissiveIntensity: 1.1 })
      for (let i = 0; i < 16; i++) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.09, 12, 44), ringMat.clone())
        mesh.visible = false
        scene.add(mesh)
        rings.push({ mesh, active: false, prevZ: 0, scored: false })
      }
      let ringTimer = 1.5
      const spawnRingTrail = () => {
        const free = rings.filter((r) => !r.active)
        const count = Math.min(free.length, 5 + Math.floor(Math.random() * 3))
        if (count < 4) return
        const shape = Math.random()
        const sweepDir = Math.random() < 0.5 ? 1 : -1
        const x0 = (Math.random() - 0.5) * 3.2
        const y0 = 0.8 + Math.random() * 2.2
        const dx = (Math.random() - 0.5) * 0.8
        const dy = (Math.random() - 0.5) * 0.5
        for (let i = 0; i < count; i++) {
          const ring = free[i]
          const f = count > 1 ? i / (count - 1) : 0
          let x = x0 + dx * i
          let y = y0 + dy * i
          if (shape < 0.45) y += Math.sin(f * Math.PI) * 1.15
          else if (shape < 0.75) x += Math.sin(f * Math.PI) * 1.5 * sweepDir
          ring.active = true
          ring.scored = false
          ring.mesh.position.set(
            THREE.MathUtils.clamp(x, -3.6, 3.6),
            THREE.MathUtils.clamp(y, 0.25, 4.1),
            -175 - i * 8,
          )
          ring.prevZ = ring.mesh.position.z
          ring.mesh.visible = true
          ;(ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x553a08)
        }
      }

      // Hunter drones.
      type Drone = { group: THREE.Group; active: boolean; phase: number }
      const drones: Drone[] = []
      for (let i = 0; i < 5; i++) {
        const group = new THREE.Group()
        const core = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.46),
          new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.8, roughness: 0.4, flatShading: true }),
        )
        group.add(core)
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3524 }))
        eye.position.set(0, 0, 0.4)
        group.add(eye)
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x39404a, metalness: 0.8, roughness: 0.5 })
        const wl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.3), wingMat)
        wl.position.x = -0.6
        group.add(wl)
        const wr = wl.clone()
        wr.position.x = 0.6
        group.add(wr)
        group.visible = false
        scene.add(group)
        drones.push({ group, active: false, phase: Math.random() * 6 })
      }
      // Laser pool.
      type Beam = { mesh: THREE.Mesh; life: number; side: number }
      const beams: Beam[] = []
      const beamMat = new THREE.MeshBasicMaterial({ color: 0x7df3ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      for (let i = 0; i < 10; i++) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 30, 6), beamMat)
        mesh.rotation.x = Math.PI / 2
        mesh.visible = false
        scene.add(mesh)
        beams.push({ mesh, life: 0, side: 0 })
      }
      let beamCursor = 0
      let fireCooldown = 0

      // Pointer control: hold to steer and fire; release and the ship recenters.
      let pointerHeld = false
      let targetX = 0
      let targetY = 1.6
      const onDown = (e: PointerEvent) => {
        // Touches that land on HUD controls (sticks, buttons) are not steering.
        if ((e.target as HTMLElement | null)?.closest?.('button, a, input, textarea, form, [data-stick]')) return
        pointerHeld = true
        targetX = THREE.MathUtils.clamp(((e.clientX / window.innerWidth) * 2 - 1) * 3.4, -3.4, 3.4)
        targetY = THREE.MathUtils.clamp(2.0 - ((e.clientY / window.innerHeight) * 2 - 1) * 1.8, 0.1, 3.9)
      }
      const onMove = (e: PointerEvent) => {
        if (!pointerHeld) return
        targetX = THREE.MathUtils.clamp(((e.clientX / window.innerWidth) * 2 - 1) * 3.4, -3.4, 3.4)
        targetY = THREE.MathUtils.clamp(2.0 - ((e.clientY / window.innerHeight) * 2 - 1) * 1.8, 0.1, 3.9)
      }
      const onUp = () => {
        pointerHeld = false
      }
      if (combat) {
        window.addEventListener('pointerdown', onDown)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        cleanupFns.push(() => {
          window.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        })
      }

      // Tilt steering: lean the phone to fly. Neutral pitch is captured on
      // the first reading of the run; fresh sensor data overrides the pointer.
      const tilt = { x: 0, y: 0, seen: 0, neutralBeta: null as number | null }
      const onTilt = (e: DeviceOrientationEvent) => {
        if (e.gamma === null || e.beta === null) return
        if (tilt.neutralBeta === null) tilt.neutralBeta = e.beta
        const dx = e.gamma
        const dy = e.beta - tilt.neutralBeta
        tilt.x = Math.abs(dx) < 3 ? 0 : THREE.MathUtils.clamp(dx / 22, -1, 1)
        tilt.y = Math.abs(dy) < 3 ? 0 : THREE.MathUtils.clamp(dy / 20, -1, 1)
        tilt.seen = performance.now()
      }
      if (combat) {
        window.addEventListener('deviceorientation', onTilt)
        cleanupFns.push(() => window.removeEventListener('deviceorientation', onTilt))
      }

      const hitColor = new THREE.Color(0xffa050)
      const goldColor = new THREE.Color(0xffcf6e)

      const fireLasers = (t: number) => {
        const s = useGameStore.getState()
        for (const side of [-0.55, 0.55]) {
          const beam = beams[beamCursor]
          beamCursor = (beamCursor + 1) % beams.length
          beam.mesh.position.set(ship.position.x + side, ship.position.y - 0.1, ship.position.z - 15)
          beam.mesh.visible = true
          beam.life = 0.07
          beam.side = side
        }
        // Nearest shootable target roughly along the aim line wins.
        let best: { idx: number; z: number } | null = null
        drones.forEach((drone, idx) => {
          if (!drone.active) return
          const p = drone.group.position
          if (p.z < -75 || p.z > -5) return
          if (Math.abs(p.x - ship.position.x) > 1.3) return
          if (Math.abs(p.y - ship.position.y) > 1.3) return
          if (!best || p.z > best.z) best = { idx, z: p.z }
        })
        if (!best) return
        const drone = drones[(best as { idx: number; z: number }).idx]
        bursts.spawn(drone.group.position, hitColor, 22, 5)
        drone.active = false
        drone.group.visible = false
        s.addHoldValue(120)
        void t
      }

      const damageShip = (amount: number, t: number) => {
        if (t < invulnerableUntil) return
        invulnerableUntil = t + 0.9
        flashLevel = 0.32
        shake = 0.55
        const s = useGameStore.getState()
        s.damageShield(amount)
        bursts.spawn(ship.position, hitColor, 16, 4)
        if (s.shield - amount <= 0 && !strandedSent) {
          strandedSent = true
          s.setMode('STRANDED')
        }
      }

      tickScene = (t, dt) => {
        const s = useGameStore.getState()
        const distance = s.distances[s.currentPlanet]
        const closeness = THREE.MathUtils.clamp(1 - distance / 2400, 0, 1)
        const speed = combat ? 25 + closeness * 11 : 4.5
        const spd = speed

        // Virtual sticks: the left stick flies the ship in every direction;
        // the right stick turns (analog) and fires while deflected.
        const sL = flightInput.stickL
        const sR = flightInput.stickR
        const stickDriving = sL.active && (Math.abs(sL.x) > 0.08 || Math.abs(sL.y) > 0.08)
        if (stickDriving) {
          targetX = sL.x * 3.4
          targetY = THREE.MathUtils.clamp(1.6 + sL.y * 1.55, 0.1, 3.9)
        }
        // Tilt steering: a fresh sensor reading overrides the pointer,
        // unless a stick is driving.
        if (!stickDriving && flightInput.tiltOn && performance.now() - tilt.seen < 1500) {
          if (Math.abs(tilt.x) > 0.03) targetX = tilt.x * 3.4
          if (Math.abs(tilt.y) > 0.03) targetY = THREE.MathUtils.clamp(1.6 + tilt.y * 1.9, 0.1, 3.9)
        }
        const turn = sR.active ? sR.x : 0
        if (turn !== 0) targetX = THREE.MathUtils.clamp(targetX + turn * dt * 7.5, -3.4, 3.4)

        // Ship movement: ease toward the pointer target, bank with the turn.
        const prevX = ship.position.x
        const prevY = ship.position.y
        const ease = 1 - Math.exp(-dt * 6.5)
        ship.position.x += (targetX - ship.position.x) * ease
        ship.position.y += (targetY - ship.position.y) * ease + (combat ? 0 : Math.sin(t * 1.2) * 0.0015)
        const vx = dt > 0 ? (ship.position.x - prevX) / dt : 0
        const vy = dt > 0 ? (ship.position.y - prevY) / dt : 0
        ship.rotation.z = THREE.MathUtils.clamp(-vx * 0.16, -0.85, 0.85)
        ship.rotation.x = -Math.PI / 2.25 + THREE.MathUtils.clamp(vy * 0.05, -0.3, 0.3)
        // RCS: lateral/vertical corrections puff from the opposite side.
        puffCooldown -= dt
        if (puffCooldown <= 0) {
          if (vx > 0.7) { firePuffs(-1, 0); puffCooldown = 0.09 }
          else if (vx < -0.7) { firePuffs(1, 0); puffCooldown = 0.09 }
          if (vy > 0.7) { firePuffs(0, -1); puffCooldown = 0.09 }
          else if (vy < -0.7) { firePuffs(0, 1); puffCooldown = 0.09 }
        }
        puffs.forEach((p) => {
          if (p.life <= 0) return
          p.life -= dt
          const k = Math.max(0, p.life / 0.26)
          p.mesh.position.addScaledVector(p.dir, dt * 1.4)
          p.mesh.scale.set(1 + (1 - k) * 1.6, 1 + (1 - k) * 2.2, 1 + (1 - k) * 1.6)
          ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * k
          if (p.life <= 0) p.mesh.visible = false
        })
        if (!pointerHeld && turn === 0 && !stickDriving && combat) {
          targetX *= Math.exp(-dt * 1.4)
          targetY += (1.6 - targetY) * Math.exp(-dt * 1.4)
        }

        // Firing.
        fireCooldown -= dt
        if (combat && (pointerHeld || (sR.active && Math.hypot(sR.x, sR.y) > 0.35)) && fireCooldown <= 0) {
          fireLasers(t)
          fireCooldown = 0.13
        }
        beams.forEach((beam) => {
          if (beam.life > 0) {
            beam.life -= dt
            beam.mesh.position.x = ship.position.x + beam.side
            beam.mesh.position.y = ship.position.y - 0.1
            if (beam.life <= 0) beam.mesh.visible = false
          }
        })

        // Stars stream past.
        const pos = starGeo.attributes.position as THREE.BufferAttribute
        const arr = pos.array as Float32Array
        for (let i = 0; i < starCount; i++) {
          arr[i * 3 + 2] += spd * dt * 0.9
          if (arr[i * 3 + 2] > 14) arr[i * 3 + 2] -= 460
        }
        pos.needsUpdate = true

        // Destination planet.
        const radius = 2 + 16 * Math.pow(closeness, 2.2)
        planet.scale.setScalar(radius)
        planet.position.set(6.5 - closeness * 2.2, 3.4, -80 + closeness * 30)
        planet.rotation.y = t * 0.02
        targetColor.setHex(PLANET_COLORS[s.currentPlanet])
        planetMat.color.lerp(targetColor, 0.05)

        // Ring trails: a fresh trail every few seconds, Sonic-style.
        if (combat) {
          ringTimer -= dt
          if (ringTimer <= 0) {
            spawnRingTrail()
            ringTimer = 4.5 + Math.random() * 2
          }
        }
        rings.forEach((ring) => {
          if (!ring.active) return
          ring.prevZ = ring.mesh.position.z
          ring.mesh.position.z += spd * dt
          ring.mesh.rotation.z = Math.sin(t * 0.8) * 0.08
          const z = ring.mesh.position.z
          if (combat && ring.prevZ < 0 && z >= 0 && !ring.scored) {
            ring.scored = true
            const dx = ring.mesh.position.x - ship.position.x
            const dy = ring.mesh.position.y - ship.position.y
            if (Math.hypot(dx, dy) < 1.75) {
              s.addRing()
              s.addHoldValue(250)
              s.repairShield(4)
              // Slipstream: threading a ring closes the distance faster.
              s.setDistances({ ...s.distances, [s.currentPlanet]: Math.max(0, s.distances[s.currentPlanet] - 90) })
              bursts.spawn(ring.mesh.position, goldColor, 18, 3.5)
              ;(ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x1d5f66)
            }
          }
          if (z > 13) {
            ring.active = false
            ring.mesh.visible = false
          }
        })

        // Hunter drones are off the course — flight is about threading
        // rings, not survival. The pool stays unused for now.
        drones.forEach((drone) => {
          if (!drone.active) return
          const p = drone.group.position
          p.z += spd * dt * 0.86
          p.x += (ship.position.x - p.x) * dt * 0.22
          p.y += (ship.position.y - p.y) * dt * 0.22 + Math.sin(t * 2.2 + drone.phase) * dt * 0.5
          drone.group.rotation.y = Math.PI + Math.sin(t * 1.7 + drone.phase) * 0.3
          if (p.z > 12) {
            drone.active = false
            drone.group.visible = false
            return
          }
          if (combat && p.z > -1.6 && p.z < 1.6) {
            const dx = p.x - ship.position.x
            const dy = p.y - ship.position.y
            if (dx * dx + dy * dy < 1.35) {
              bursts.spawn(p, hitColor, 22, 5)
              drone.active = false
              drone.group.visible = false
              damageShip(10, t)
            }
          }
        })

        bursts.tick(dt)

        // Camera: loose follow + impact shake + damage flash decay.
        shake = Math.max(0, shake - dt * 1.5)
        const shX = (Math.random() - 0.5) * shake * 0.35
        const shY = (Math.random() - 0.5) * shake * 0.35
        camera.position.set(ship.position.x * 0.24 + shX, 2.1 + ship.position.y * 0.1 + shY, 7.6)
        camera.lookAt(ship.position.x * 0.45, 1.55, -12)
        flashLevel = Math.max(0, flashLevel - dt * 1.1)
        ;(flash.material as THREE.MeshBasicMaterial).opacity = flashLevel
        // Invulnerability blink.
        ship.visible = !(t < invulnerableUntil && Math.floor(t * 14) % 2 === 0)
      }
    }

    const clock = new THREE.Clock()
    let animation = 0
    const loop = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      tickScene(clock.elapsedTime, dt)
      composer.render()
      animation = window.requestAnimationFrame(loop)
    }
    animation = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(animation)
      window.removeEventListener('resize', resize)
      cleanupFns.forEach((fn) => fn())
      disposeScene(scene)
      envTexture.dispose()
      pmrem.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [mode])

  return (
    <canvas
      aria-label={mode === 'SURFACE' ? 'Alien planet surface' : 'Spaceflight view'}
      className="game-canvas"
      ref={canvasRef}
    />
  )
}
