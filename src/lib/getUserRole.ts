import { supabase } from './supabase'

export async function getUserRole() {
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  return data?.rol ?? null
}
