/** Injected at build time from package.json and git (see vite.config.ts). */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_REPO__: string

interface ImportMetaEnv {
  /** Supabase project URL. Without it (and the key) the app stores data in the browser only. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Safe to ship: row level security guards the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}
