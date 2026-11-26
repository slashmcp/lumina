'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
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

function makeRockTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#6f6154'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1500; i++) {
    const shade = 70 + Math.floor(Math.random() * 90)
    g.fillStyle = `rgba(${shade},${shade * 0.88},${shade * 0.72},${0.16 + Math.random() * 0.3})`
    g.beginPath()
    g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(30,24,18,0.5)'
  for (let i = 0; i < 14; i++) {
    g.beginPath()
    let x = Math.random() * 256
    let y = Math.random() * 256
    g.moveTo(x, y)
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 60
      y += (Math.random() - 0.5) * 60
      g.lineTo(x, y)
    }
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeTerrainTexture(planet: PlanetName): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const base = new THREE.Color(GROUND_COLORS[planet])
  g.fillStyle = `#${base.getHexString()}`
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 420; i++) {
    const v = (Math.random() - 0.5) * 0.24
    const col = base.clone().offsetHSL(0, 0, v * 0.5)
    g.fillStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0.25)`
    g.beginPath()
    g.ellipse(Math.random() * 512, Math.random() * 512, 12 + Math.random() * 70, 8 + Math.random() * 44, Math.random() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // The resource shows through the ground: glowing veins in the ice and rock.
  const vein = planet === 'Kestrel Reach' ? 'rgba(255,150,60,' : 'rgba(80,230,245,'
  g.lineWidth = 1.6
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `${vein}${0.12 + Math.random() * 0.3})`
    g.shadowColor = planet === 'Kestrel Reach' ? '#ff9640' : '#50e6f5'
    g.shadowBlur = 7
    g.beginPath()
    let x = Math.random() * 512
    let y = Math.random() * 512
    g.moveTo(x, y)
    for (let j = 0; j < 4; j++) {
      x += (Math.random() - 0.5) * 130
      y += (Math.random() - 0.5) * 130
      g.lineTo(x, y)
    }
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 17)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function jitteredRockGeometry(seed: number): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(1, 1)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
    const jitter = 1 + (n - Math.floor(n) - 0.5) * 0.44
    v.multiplyScalar(jitter)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
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
        new THREE.MeshStandardMaterial({ color: GROUND_COLORS[state.currentPlanet], roughness: 1, metalness: 0.02, flatShading: true }),
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

      const { group: ship } = buildShip(false)
      ship.position.set(-7.5, 2.15, -15)
      ship.scale.setScalar(1.55)
      scene.add(ship)

      const pilot = buildPilot()
      pilot.position.set(0.9, 0, 2.4)
      pilot.rotation.y = -0.35
      scene.add(pilot)

      tickScene = (t) => {
        pilot.position.y = Math.abs(Math.sin(t * 0.9)) * 0.03
        camera.position.x = Math.sin(t * 0.22) * 0.35
        camera.lookAt(0, 1.15, 0)
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

      // Terrain rushing below, textured per planet.
      let terrainTex = makeTerrainTexture(useGameStore.getState().currentPlanet)
      let terrainPlanet = useGameStore.getState().currentPlanet
      const terrain = new THREE.Mesh(
        new THREE.PlaneGeometry(260, 380),
        new THREE.MeshStandardMaterial({ map: terrainTex, roughness: 1, metalness: 0.02 }),
      )
      terrain.rotation.x = -Math.PI / 2
      terrain.position.set(0, -3.4, -150)
      scene.add(terrain)

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
      const rockTexture = makeRockTexture()
      const rockGeos = [jitteredRockGeometry(1), jitteredRockGeometry(2), jitteredRockGeometry(3)]
      type Rock = { mesh: THREE.Mesh; radius: number; hp: number; spin: THREE.Vector3; active: boolean }
      const rocks: Rock[] = []
      const rockMat = new THREE.MeshStandardMaterial({ map: rockTexture, roughness: 1, metalness: 0.03, flatShading: true })
      for (let i = 0; i < 14; i++) {
        const mesh = new THREE.Mesh(rockGeos[i % 3], rockMat)
        mesh.visible = false
        scene.add(mesh)
        rocks.push({ mesh, radius: 1, hp: 2, spin: new THREE.Vector3(), active: false })
      }
      const spawnRock = (rock: Rock, ahead: number) => {
        rock.active = true
        rock.hp = 2
        rock.radius = 0.7 + Math.random() * 1.6
        rock.mesh.scale.setScalar(rock.radius)
        rock.mesh.position.set((Math.random() - 0.5) * 15, -1 + Math.random() * 7.5, -ahead)
        rock.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
        rock.spin.set((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4)
        rock.mesh.visible = true
      }

      // Gold rings to thread.
      type Ring = { mesh: THREE.Mesh; active: boolean; prevZ: number; scored: boolean }
      const rings: Ring[] = []
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.28, emissive: 0x553a08, emissiveIntensity: 1.1 })
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.09, 12, 44), ringMat.clone())
        mesh.visible = false
        scene.add(mesh)
        rings.push({ mesh, active: false, prevZ: 0, scored: false })
      }
      let ringTimer = 4

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
      let droneTimer = 3

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
      const rockColor = new THREE.Color(0x9a8a76)
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
        let best: { kind: 'rock' | 'drone'; idx: number; z: number } | null = null
        rocks.forEach((rock, idx) => {
          if (!rock.active) return
          const p = rock.mesh.position
          if (p.z < -75 || p.z > -5) return
          if (Math.abs(p.x - ship.position.x) > 1.15 + rock.radius * 0.45) return
          if (Math.abs(p.y - ship.position.y) > 1.15 + rock.radius * 0.45) return
          if (!best || p.z > best.z) best = { kind: 'rock', idx, z: p.z }
        })
        drones.forEach((drone, idx) => {
          if (!drone.active) return
          const p = drone.group.position
          if (p.z < -75 || p.z > -5) return
          if (Math.abs(p.x - ship.position.x) > 1.3) return
          if (Math.abs(p.y - ship.position.y) > 1.3) return
          if (!best || p.z > best.z) best = { kind: 'drone', idx, z: p.z }
        })
        if (!best) return
        const hit = best as { kind: 'rock' | 'drone'; idx: number; z: number }
        if (hit.kind === 'drone') {
          const drone = drones[hit.idx]
          bursts.spawn(drone.group.position, hitColor, 22, 5)
          drone.active = false
          drone.group.visible = false
          s.addHoldValue(120)
        } else {
          const rock = rocks[hit.idx]
          rock.hp -= 1
          bursts.spawn(rock.mesh.position, rockColor, rock.hp <= 0 ? 26 : 8, 4)
          if (rock.hp <= 0) {
            rock.active = false
            rock.mesh.visible = false
            if (Math.random() < 0.45) s.addRock(1)
            s.addHoldValue(35)
          } else {
            rock.mesh.scale.setScalar(rock.radius * 0.82)
            rock.radius *= 0.82
          }
        }
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

      // Seed the course.
      rocks.forEach((rock, i) => {
        if (combat || i < 5) spawnRock(rock, 40 + i * 16 + Math.random() * 20)
      })

      tickScene = (t, dt) => {
        const s = useGameStore.getState()
        const distance = s.distances[s.currentPlanet]
        const closeness = THREE.MathUtils.clamp(1 - distance / 2400, 0, 1)
        const speed = combat ? 25 + closeness * 11 : 4.5

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
        if (flame) flame.scale.set(1, 0.82 + Math.sin(t * 31) * 0.16 + Math.random() * 0.07, 1)
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
          arr[i * 3 + 2] += speed * dt * 0.9
          if (arr[i * 3 + 2] > 14) arr[i * 3 + 2] -= 460
        }
        pos.needsUpdate = true

        // Terrain scroll + per-planet texture.
        if (s.currentPlanet !== terrainPlanet) {
          terrainPlanet = s.currentPlanet
          const old = terrainTex
          terrainTex = makeTerrainTexture(terrainPlanet)
          ;(terrain.material as THREE.MeshStandardMaterial).map = terrainTex
          ;(terrain.material as THREE.MeshStandardMaterial).needsUpdate = true
          old.dispose()
        }
        terrainTex.offset.y += (speed * dt) / 20

        // Destination planet.
        const radius = 2 + 16 * Math.pow(closeness, 2.2)
        planet.scale.setScalar(radius)
        planet.position.set(6.5 - closeness * 2.2, 3.4, -80 + closeness * 30)
        planet.rotation.y = t * 0.02
        targetColor.setHex(PLANET_COLORS[s.currentPlanet])
        planetMat.color.lerp(targetColor, 0.05)

        // Asteroids.
        rocks.forEach((rock) => {
          if (!rock.active) {
            if (combat) spawnRock(rock, 150 + Math.random() * 40)
            return
          }
          rock.mesh.position.z += speed * dt
          rock.mesh.rotation.x += rock.spin.x * dt
          rock.mesh.rotation.y += rock.spin.y * dt
          rock.mesh.rotation.z += rock.spin.z * dt
          const p = rock.mesh.position
          if (p.z > 13) {
            rock.active = false
            rock.mesh.visible = false
            return
          }
          if (combat && p.z > -1.8 && p.z < 1.8) {
            const dx = p.x - ship.position.x
            const dy = p.y - ship.position.y
            if (dx * dx + dy * dy < Math.pow(rock.radius * 0.85 + 0.72, 2)) {
              bursts.spawn(p, rockColor, 20, 4.5)
              rock.active = false
              rock.mesh.visible = false
              damageShip(12, t)
            }
          }
        })

        // Rings.
        if (combat) {
          ringTimer -= dt
          if (ringTimer <= 0) {
            const ring = rings.find((r) => !r.active)
            if (ring) {
              ring.active = true
              ring.scored = false
              ring.mesh.position.set((Math.random() - 0.5) * 5.6, 0.6 + Math.random() * 2.8, -175)
              ring.prevZ = -175
              ring.mesh.visible = true
              ;(ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x553a08)
            }
            ringTimer = 8 + Math.random() * 4
          }
        }
        rings.forEach((ring) => {
          if (!ring.active) return
          ring.prevZ = ring.mesh.position.z
          ring.mesh.position.z += speed * dt
          ring.mesh.rotation.z = Math.sin(t * 0.8) * 0.08
          const z = ring.mesh.position.z
          if (combat && ring.prevZ < 0 && z >= 0 && !ring.scored) {
            ring.scored = true
            const dx = ring.mesh.position.x - ship.position.x
            const dy = ring.mesh.position.y - ship.position.y
            if (Math.hypot(dx, dy) < 1.75) {
              s.addHoldValue(250)
              bursts.spawn(ring.mesh.position, goldColor, 18, 3.5)
              ;(ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x1d5f66)
            }
          }
          if (z > 13) {
            ring.active = false
            ring.mesh.visible = false
          }
        })

        // Drones hunt the ship's lane.
        if (combat) {
          droneTimer -= dt
          if (droneTimer <= 0) {
            const drone = drones.find((d) => !d.active)
            if (drone) {
              drone.active = true
              drone.group.position.set((Math.random() - 0.5) * 10, 0.4 + Math.random() * 3.4, -155)
              drone.group.visible = true
            }
            droneTimer = 5.5 + Math.random() * 3.5
          }
        }
        drones.forEach((drone) => {
          if (!drone.active) return
          const p = drone.group.position
          p.z += speed * dt * 0.86
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
