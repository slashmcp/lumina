'use client'

import { useEffect, useRef } from 'react'
import { useGameStore, PLANETS } from './store'

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mode = useGameStore((state) => state.mode)
  const distances = useGameStore((state) => state.distances)
  const currentPlanet = useGameStore((state) => state.currentPlanet)
  const activeDistance = distances[currentPlanet]

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let frame = 0
    let width = 0
    let height = 0
    let animation = 0
    let steer = 0
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    const stars = Array.from({ length: 120 }, (_, index) => ({
      x: ((index * 83 + 17) % 997) / 997,
      y: ((index * 137 + 31) % 991) / 991,
      radius: ((index * 17) % 12) / 10 + 0.35,
      phase: index * 0.37,
    }))
    const draw = () => {
      frame += 0.008
      context.clearRect(0, 0, width, height)
      const gradient = context.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, mode === 'SURFACE' ? '#141e27' : '#05090f')
      gradient.addColorStop(0.58, mode === 'SURFACE' ? '#302722' : '#0c1b28')
      gradient.addColorStop(1, mode === 'SURFACE' ? '#0a0b0d' : '#030407')
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)

      if (mode === 'SURFACE') {
        const horizon = height * 0.49
        context.fillStyle = '#0c1015'
        context.beginPath()
        context.moveTo(0, horizon)
        for (let x = 0; x <= width; x += 24) {
          context.lineTo(x, horizon + Math.sin(x * 0.018 + frame) * 18 + Math.cos(x * 0.032) * 11)
        }
        context.lineTo(width, height)
        context.lineTo(0, height)
        context.fill()
        const ground = context.createLinearGradient(0, horizon, 0, height)
        ground.addColorStop(0, '#34302b')
        ground.addColorStop(1, '#101214')
        context.fillStyle = ground
        context.fillRect(0, horizon + 12, width, height - horizon)
        for (let i = 0; i < 20; i++) {
          const x = (i * 127 + frame * 38) % width
          const y = horizon + 30 + ((i * 79) % Math.max(1, height - horizon - 30))
          context.fillStyle = i % 5 === 0 ? '#55e7ed' : '#5b5147'
          context.globalAlpha = i % 5 === 0 ? 0.62 : 0.34
          context.fillRect(x, y, i % 5 === 0 ? 2 : 3, 2)
        }
        context.globalAlpha = 1
      } else {
        stars.forEach((star) => {
          const x = (star.x * width + steer * 22 + width) % width
          const y = (star.y * height + frame * (12 + star.radius * 8)) % height
          context.globalAlpha = 0.34 + Math.sin(frame * 3 + star.phase) * 0.2
          context.fillStyle = '#d8f6ff'
          context.beginPath()
          context.arc(x, y, star.radius, 0, Math.PI * 2)
          context.fill()
        })
        context.globalAlpha = 1
        if (mode !== 'SHIP') {
        const horizon = height * 0.65
        const planetColors = ['#9e684b', '#415d77', '#8d8c72', '#906a9a']
        const planetIndex = PLANETS.indexOf(currentPlanet)
        const scale = Math.max(0.34, 1.2 - activeDistance / 1800)
        const planetRadius = Math.min(width * 0.28, 72) * scale
        const px = width * 0.71 + steer * 7
        const py = horizon - 60 + Math.sin(frame) * 3
        const orb = context.createRadialGradient(px - planetRadius * 0.3, py - planetRadius * 0.35, planetRadius * 0.08, px, py, planetRadius)
        orb.addColorStop(0, '#f7d9ad')
        orb.addColorStop(0.48, planetColors[planetIndex])
        orb.addColorStop(1, '#10131a')
        context.fillStyle = orb
        context.beginPath()
        context.arc(px, py, planetRadius, 0, Math.PI * 2)
        context.fill()
        context.strokeStyle = 'rgba(175, 209, 219, .32)'
        context.lineWidth = 2
        context.beginPath()
        context.ellipse(px, py, planetRadius * 1.5, planetRadius * 0.34, -0.12, 0, Math.PI * 2)
        context.stroke()

        const sx = width * 0.5 + steer * 4
        const sy = height * 0.81
        context.save()
        context.translate(sx, sy)
        context.fillStyle = 'rgba(56, 217, 238, .32)'
        context.beginPath()
        context.moveTo(-9, 29)
        context.lineTo(0, 92 + Math.sin(frame * 22) * 12)
        context.lineTo(9, 29)
        context.fill()
        context.fillStyle = '#aab8bc'
        context.beginPath()
        context.moveTo(0, -42)
        context.lineTo(21, 17)
        context.lineTo(12, 24)
        context.lineTo(0, 18)
        context.lineTo(-12, 24)
        context.lineTo(-21, 17)
        context.closePath()
        context.fill()
        context.fillStyle = '#51616b'
        context.beginPath()
        context.moveTo(-21, 17)
        context.lineTo(-34, 34)
        context.lineTo(-12, 27)
        context.lineTo(0, 20)
        context.lineTo(12, 27)
        context.lineTo(34, 34)
        context.lineTo(21, 17)
        context.fill()
        context.fillStyle = '#e8f8fa'
        context.beginPath()
        context.ellipse(0, -12, 4, 13, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
        }
      }
      animation = window.requestAnimationFrame(draw)
    }
    animation = window.requestAnimationFrame(draw)
    const steerListener = (event: Event) => {
      const custom = event as CustomEvent<number>
      steer = custom.detail
    }
    window.addEventListener('starlance:steer', steerListener)
    return () => {
      window.cancelAnimationFrame(animation)
      window.removeEventListener('resize', resize)
      window.removeEventListener('starlance:steer', steerListener)
    }
  }, [mode, currentPlanet, activeDistance])

  return <canvas aria-label={mode === 'SURFACE' ? 'Alien planet surface' : 'Spaceflight view'} className="game-canvas" ref={canvasRef} />
}
