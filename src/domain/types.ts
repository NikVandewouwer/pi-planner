/** Platform name, e.g. "iOS". Platforms are configured per train (Art.platforms). */
export type Platform = string
/** Estimate name, e.g. "Mobile". Platforms sharing an estimate build a ticket in parallel. */
export type Estimate = string
export type PerPlatform<T> = Record<Platform, T>
export type PerEstimate<T> = Record<Estimate, T>

export interface PlatformDef {
  id: string
  name: Platform
  /**
   * Internal key linking platforms that are estimated together (e.g. iOS and Android share one
   * ticket estimate and each build the whole ticket in parallel). Never shown: the UI shows
   * the linked platforms instead ("iOS + Android"). Feature points are stored per key.
   */
  est: Estimate
}

/** ISO date string, YYYY-MM-DD (always interpreted as UTC). */
export type ISODate = string

export interface Member {
  id: string
  name: string
  /** Role name (roles are referenced by name, as in the original data format). */
  role: string
}

export interface Team {
  id: string
  name: string
  members: Member[]
  /** Default velocity: story points per 100 planning days, per platform. */
  velocity: PerPlatform<number>
}

export interface Role {
  id: string
  name: string
  /** Included in planning: only these roles' days count towards velocity and forecast. */
  planned: boolean
  /**
   * Platforms this role works on. Usually one; a role across several (e.g. a QA testing iOS
   * and Android) has its days split evenly over them.
   */
  platforms: Platform[]
}

export interface FeatureType {
  id: string
  name: string
  /** Colour slot 0..7 */
  c: number
}

export interface DayOff {
  id: string
  name: string
  from: ISODate
  to: ISODate
  /** "all" for a public holiday, or a team id */
  scope: string
}

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL'
export type Status = 'Committed' | 'Uncommitted' | 'New'

export interface Feature {
  id: string
  name: string
  team: string
  type: string
  size: Size
  status: Status
  spill: boolean
  /** Platforms that build this feature */
  platforms: Platform[]
  /** Estimated story points per estimate (e.g. { Mobile: 32, Backend: 8 }) */
  pts: PerEstimate<number>
  /** Delivered story points per estimate (absent = unknown, not 0) */
  del: PerEstimate<number>
  /** Assigned member ids */
  who: string[]
  /** Weight per member, % of their platform's estimate */
  wt: Record<string, number>
  wtU?: 'pct'
}

export interface PI {
  id: string
  name: string
  start: ISODate
  sprints: number
  weeks: number
  off: DayOff[]
  features: Feature[]
  velocity?: Record<string, PerPlatform<number>>
  velUnit?: 'md'
}

export interface Art {
  id: string
  name: string
  teams: Team[]
  pis: PI[]
  platforms: PlatformDef[]
  roles: Role[]
  ftypes: FeatureType[]
}

/** memberId -> date -> availability (1, .75, .5, .25, 0). Missing = 1. */
export type AvailMap = Record<string, Record<ISODate, number>>

export interface Data {
  arts: Art[]
  avail: AvailMap
  artId: string | null
  piId: string | null
  /** First-run setup finished */
  done: boolean
}

export interface GridFilter {
  group: 'all' | 'planned' | 'unplanned'
  platform: 'all' | Platform
  role: string
  sprint: string
  absent: boolean
}

export type DeleteKind = 'platform' | 'team' | 'art' | 'pi' | 'feature' | 'role' | 'ftype' | 'member' | 'resetAvail' | 'off' | 'reset'

export type Modal =
  | { type: 'art' }
  | { type: 'pi'; id: string }
  | { type: 'ask'; kind: DeleteKind; id: string; back: Modal | null }
  | { type: 'import'; payload: unknown; arts: number }
  | { type: 'feature'; id: string }
  | { type: 'role'; id: string }
  | { type: 'member'; id: string }
  | { type: 'member-edit'; id: string }
  | { type: 'role-edit'; id: string }
  | { type: 'newTeam' }
  | { type: 'team'; id: string }

export interface UI {
  step: number
  view: 'plan' | 'setup'
  setupTab: 'general' | 'platforms' | 'roles' | 'teams' | 'ftypes'
  /** "all" or a team id */
  team: string
  /** "cycle" or a value from VALS as string */
  paint: string
  mainTab: 'availability' | 'planning'
  theme?: 'system' | 'light' | 'dark'
  palette?: string
  gf?: GridFilter
  fsort?: { key: string; dir: 'asc' | 'desc' }
  statTab?: 'sprint' | 'team' | 'platform' | 'role'
  piTab?: 'details' | 'off'
  modal: Modal | null
  menu: boolean
  wizard?: boolean
  prevArt?: string | null
}
