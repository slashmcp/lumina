'use client'

import { create } from 'zustand'

export type GameMode = 'TITLE' | 'FLIGHT' | 'SURFACE' | 'SHIP' | 'STRANDED'
export type PlanetName = 'Lyra Prime' | 'Kestrel Reach' | 'Vela Drift' | 'Orison'

export const PLANETS: PlanetName[] = ['Lyra Prime', 'Kestrel Reach', 'Vela Drift', 'Orison']

type GameState = {
  mode: GameMode
  fuel: number
  shield: number
  rock: number
  crystal: number
  bombs: number
  holdValue: number
  currentPlanet: PlanetName
  distances: Record<PlanetName, number>
  setMode: (mode: GameMode) => void
  setFuel: (fuel: number) => void
  setDistances: (distances: Record<PlanetName, number>) => void
  setCurrentPlanet: (planet: PlanetName) => void
  damageShield: (amount: number) => void
  addHoldValue: (amount: number) => void
  addRock: (amount: number) => void
  mine: () => void
  jump: () => void
  distillFuel: () => void
  forgeWeapon: () => void
  restart: () => void
}

const initialDistances: Record<PlanetName, number> = {
  'Lyra Prime': 840,
  'Kestrel Reach': 1260,
  'Vela Drift': 1720,
  Orison: 2300,
}

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'TITLE',
  fuel: 78,
  shield: 92,
  rock: 12,
  crystal: 4,
  bombs: 2,
  holdValue: 2480,
  currentPlanet: 'Lyra Prime',
  distances: { ...initialDistances },
  setMode: (mode) => set({ mode }),
  setFuel: (fuel) => set({ fuel: Math.max(0, Math.min(100, fuel)) }),
  setDistances: (distances) => set({ distances }),
  setCurrentPlanet: (currentPlanet) => set({ currentPlanet }),
  damageShield: (amount) => set((state) => ({ shield: Math.max(0, state.shield - amount) })),
  addHoldValue: (amount) => set((state) => ({ holdValue: state.holdValue + amount })),
  addRock: (amount) => set((state) => ({ rock: state.rock + amount })),
  mine: () => set((state) => ({ rock: state.rock + 2, crystal: state.crystal + 1, holdValue: state.holdValue + 165 })),
  jump: () => set((state) => ({ fuel: Math.max(0, state.fuel - 3) })),
  distillFuel: () => {
    const { rock, fuel } = get()
    if (rock < 4 || fuel >= 100) return
    set({ rock: rock - 4, fuel: Math.min(100, fuel + 18) })
  },
  forgeWeapon: () => {
    const { crystal, bombs } = get()
    if (crystal < 2) return
    set({ crystal: crystal - 2, bombs: bombs + 1 })
  },
  restart: () => set({
    mode: 'TITLE', fuel: 78, shield: 92, rock: 12, crystal: 4, bombs: 2,
    holdValue: 2480, currentPlanet: 'Lyra Prime', distances: { ...initialDistances },
  }),
}))
