'use client'

import { supabase } from '@/lib/supabase'

export default function LogoutButton() {
  return (
    <button
      className="mt-8 w-full border rounded px-3 py-2 hover:bg-gray-100"
      onClick={async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
      }}
    >
      Cerrar sesión
    </button>
  )
}
