// The claude-pets contract: what the plugin keeps in `$.store` (across sessions)
// and in `$.state` (for the session).

export type PetsSpecies = 'cat' | 'dog'

/** One pet of the roster. Positions and animation are runtime-only and not kept. */
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

declare module 'claude-code' {
  interface PluginState {
    'pets': {
      /** Bumped whenever the roster or the hidden flag changes: the band reads it and redraws. */
      revision: number
    }
  }
}
