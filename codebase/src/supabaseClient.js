import { createClient } from '@supabase/supabase-js'

// REPLACE WITH YOUR KEYS FROM SUPABASE DASHBOARD -> SETTINGS -> API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)