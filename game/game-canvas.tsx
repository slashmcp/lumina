'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useGameStore, type PlanetName } from './store'

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

function buildShip(flame: boolean): { group: THREE.Group; flame: THREE.Mesh | null } {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.34 })
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

export function GameCanvas({ onSteer }: { onSteer?: (delta: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mode = useGameStore((state) => state.mode)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200)
    let steer = 0
    let steerSmooth = 0

    const resize = () => {
      const width = canvas.clientWidth || 1
      const height = canvas.clientHeight || 1
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    const steerListener = (event: Event) => {
      steer = (event as CustomEvent<number>).detail || 0
      onSteer?.(steer)
    }
    window.addEventListener('starlance:steer', steerListener)

    // Per-frame hooks filled in by the scene builders below.
    let tickScene: (t: number, dt: number) => void = () => {}

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
      // FLIGHT (also the backdrop behind the SHIP interior panel).
      scene.background = new THREE.Color(0x04070c)
      camera.position.set(0, 1.5, 6.8)
      camera.lookAt(0, 1.1, -12)

      scene.add(new THREE.AmbientLight(0x8899bb, 0.5))
      const key = new THREE.DirectionalLight(0xfff1d6, 2.1)
      key.position.set(6, 9, 5)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0x6fb7d9, 0.9)
      rim.position.set(-7, 3, -6)
      scene.add(rim)

      const starCount = 1500
      const starPositions = new Float32Array(starCount * 3)
      const starColors = new Float32Array(starCount * 3)
      const palette = [new THREE.Color(0xffffff), new THREE.Color(0xcfe9ff), new THREE.Color(0xffe9c9)]
      for (let i = 0; i < starCount; i++) {
        starPositions[i * 3] = (Math.random() - 0.5) * 130
        starPositions[i * 3 + 1] = (Math.random() - 0.5) * 84
        starPositions[i * 3 + 2] = 12 - Math.random() * 420
        const c = palette[i % 3]
        starColors[i * 3] = c.r
        starColors[i * 3 + 1] = c.g
        starColors[i * 3 + 2] = c.b
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.35, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }))
      scene.add(stars)

      const { group: ship, flame } = buildShip(true)
      ship.position.set(0, 0.15, 0)
      ship.scale.setScalar(0.62)
      scene.add(ship)

      const planetMat = new THREE.MeshStandardMaterial({ color: PLANET_COLORS[useGameStore.getState().currentPlanet], roughness: 0.85, metalness: 0.05 })
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), planetMat)
      scene.add(planet)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.45, 2.15, 64),
        new THREE.MeshBasicMaterial({ color: 0xa9c6d4, transparent: true, opacity: 0.30, side: THREE.DoubleSide }),
      )
      ring.rotation.x = Math.PI / 2.35
      planet.add(ring)
      const targetColor = new THREE.Color()

      tickScene = (t, dt) => {
        const s = useGameStore.getState()
        const distance = s.distances[s.currentPlanet]
        const closeness = THREE.MathUtils.clamp(1 - distance / 2400, 0, 1)

        steerSmooth += (steer - steerSmooth) * Math.min(1, dt * 7)
        ship.position.x = steerSmooth * 1.15
        ship.position.y = 0.15 + Math.sin(t * 1.35) * 0.07
        ship.rotation.z = -steerSmooth * 0.55
        ship.rotation.x = Math.sin(t * 0.8) * 0.02
        if (flame) {
          flame.scale.set(1, 0.82 + Math.sin(t * 31) * 0.16 + Math.random() * 0.07, 1)
        }

        const pos = starGeo.attributes.position as THREE.BufferAttribute
        const arr = pos.array as Float32Array
        const speed = mode === 'FLIGHT' ? 16 : 3
        for (let i = 0; i < starCount; i++) {
          arr[i * 3 + 2] += speed * dt
          if (arr[i * 3 + 2] > 12) arr[i * 3 + 2] -= 420
        }
        pos.needsUpdate = true

        const radius = 2 + 16 * Math.pow(closeness, 2.2)
        planet.scale.setScalar(radius)
        planet.position.set(6.5 - closeness * 2.2, 3.1, -72 + closeness * 26)
        planet.rotation.y = t * 0.02
        targetColor.setHex(PLANET_COLORS[s.currentPlanet])
        planetMat.color.lerp(targetColor, 0.05)

        camera.position.x = steerSmooth * 0.35
        camera.lookAt(steerSmooth * 0.6, 1.1, -12)
      }
    }

    const clock = new THREE.Clock()
    let animation = 0
    const loop = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      tickScene(clock.elapsedTime, dt)
      renderer.render(scene, camera)
      animation = window.requestAnimationFrame(loop)
    }
    animation = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(animation)
      window.removeEventListener('resize', resize)
      window.removeEventListener('starlance:steer', steerListener)
      disposeScene(scene)
      renderer.dispose()
    }
  }, [mode, onSteer])

  return (
    <canvas
      aria-label={mode === 'SURFACE' ? 'Alien planet surface' : 'Spaceflight view'}
      className="game-canvas"
      ref={canvasRef}
    />
  )
}
