'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Rol = 'admin' | 'chofer' | 'finanzas'

export default function AuthGate({ allow }: { allow: Rol[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth.user

      if (!user) {
        if (mounted) setLoading(false)
        // evita loop: si ya estás en login no redirijas
        if (!pathname.startsWith('/login')) router.replace('/login')
        return
      }

      const { data: perfil, error } = await supabase
        .from('usuarios')
        .select('rol,activo')
        .eq('id', user.id)
        .maybeSingle()

      if (error || !perfil || perfil.activo === false) {
        await supabase.auth.signOut()
        if (!pathname.startsWith('/login')) router.replace('/login')
        if (mounted) setLoading(false)
        return
      }

      if (!allow.includes(perfil.rol)) {
        // redirección por rol
        router.replace(perfil.rol === 'admin' ? '/admin' : '/chofer')
        if (mounted) setLoading(false)
        return
      }

      if (mounted) setLoading(false)
    }

    run()
    return () => {
      mounted = false
    }
  }, [router, pathname, allow])

  if (loading) return <div className="p-6">Cargando…</div>
  return null
}
