// The claude-pets contract: what the plugin keeps in `$.store` (across sessions)
// and in `$.state` (for the session).

export type PetsSpecies = 'cat' | 'dog'

/** One pet of the roster. Positions are kept for the session only (see `positions`). */
export type PetsPet = {
  id: string
  species: PetsSpecies
  color: string
  name: string
}

/**
 * The keys of `$.store`:
 *   roster: PetsPet[]   absent until first run, when one random cat is added
 *   hidden: boolean     absent means shown
 */
export type PetsStore = {
  roster: PetsPet[]
  hidden: boolean
}

/** A pet's place in the band, saved to `$.state` about once a second. */
export type PetsPosition = {
  x: number
  dir: 1 | -1
}

declare module 'claude-code' {
  interface PluginState {
    'pets': {
      /** Bumped whenever the roster or the hidden flag changes: the band reads it and redraws. */
      revision: number
      /** Where each pet was, by pet id, so a hot reload doesn't teleport them. */
      positions: Record<string, PetsPosition>
    }
  }
}
