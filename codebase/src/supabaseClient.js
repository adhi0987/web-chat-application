import { createClient } from '@supabase/supabase-js'

// REPLACE WITH YOUR KEYS FROM SUPABASE DASHBOARD -> SETTINGS -> API
const supabaseUrl = 'https://clgjswrlcwzmdxhhegtk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZ2pzd3JsY3d6bWR4aGhlZ3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMzk1MjEsImV4cCI6MjA3NDYxNTUyMX0.AQ69x50YS-S9kuT7QkexVveFc91HW2zAyKt0bKqYb50'

export const supabase = createClient(supabaseUrl, supabaseKey)