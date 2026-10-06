export type RandomSource = () => number

/** Small deterministic PRNG (mulberry32): the same seed always gives the same numbers. */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks one item; `items` must not be empty. */
export function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.floor(random() * items.length)]
}
