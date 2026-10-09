import type { GridFilter, Size, Status } from './types'

export const STORAGE_KEY = 'art-pi-planner:v1'

/** Platforms of a new train: iOS and Android build every Mobile ticket in parallel. */
export const DEFAULT_PLATFORMS: [name: string, est: string][] = [['iOS', 'Mobile'], ['Android', 'Mobile'], ['Backend', 'Backend']]
/** Platforms of data stored before platforms were configurable. */
export const LEGACY_PLATFORMS = ['Frontend', 'Backend']
export const VALS = [1, 0.75, 0.5, 0.25, 0]
export const SIZES: Size[] = ['XS', 'S', 'M', 'L', 'XL']
export const STATUSES: Status[] = ['Committed', 'Uncommitted', 'New']

export const ROLES = ['Frontend developer', 'Backend developer', 'Frontend QA', 'Backend QA', 'Team Lead', 'Product Owner', 'Scrum Master', 'Tech Lead']
export const DEFAULT_PLANNED = ['Frontend developer', 'Backend developer', 'Frontend QA', 'Backend QA']
export const ROLE_SUGGEST = ['iOS Engineer', 'Android Engineer', 'Java Engineer', 'Frontend QA', 'Backend QA', 'Tech Lead', 'Team Lead', 'Scrum Master', 'Product Owner']
export const DEFAULT_FTYPES = ['Feature', 'Support', 'Tech debt', 'Kaizen', 'Other']
export const DEFAULT_VELOCITY = 30

export const GF0: GridFilter = { group: 'all', platform: 'all', role: 'all', sprint: 'all', absent: false }

export const PALETTES: [key: string, label: string, colour: string][] = [
  ['forest', 'Forest', '#0f7b5f'],
  ['ocean', 'Ocean', '#11639e'],
  ['violet', 'Violet', '#6b45c6'],
  ['amber', 'Amber', '#a8651a'],
  ['rose', 'Rose', '#b43a62'],
  ['slate', 'Slate', '#3f5365'],
]
