import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Null when the build has no Supabase project configured: the app then only stores data locally. */
export const supabase = url && key ? createClient(url, key) : null
