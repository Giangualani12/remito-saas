'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Rol = 'admin' | 'chofer' | 'finanzas' | null

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [email, setEmail] = useState<string>('')
  const [nombre, setNombre] = useState<string>('Administrador')

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
        error: eUser,
      } = await supabase.auth.getUser()

      if (eUser) console.log('getUser error:', eUser)
      if (!user) {
        window.location.href = '/login'
        return
      }

      setEmail(user.email ?? '')

      const { data: perfil, error: ePerfil } = await supabase
        .from('usuarios')
        .select('rol, activo, nombre')
        .eq('id', user.id)
        .maybeSingle()

      if (ePerfil) {
        console.log('perfil error:', ePerfil)
        await supabase.auth.signOut()
        window.location.href = '/login'
        return
      }

      const rol = (perfil?.rol ?? '').toString().trim().toLowerCase() as Rol
      const activo = !!perfil?.activo

      if (!activo || rol !== 'admin') {
        await supabase.auth.signOut()
        window.location.href = '/login'
        return
      }

      setNombre(perfil?.nombre ?? 'Administrador')
      setAllowed(true)
      setLoading(false)
    }

    run()
  }, [])

  const nav = useMemo(
    () => [
      { href: '/admin', label: 'Dashboard', icon: '📊' },
      { href: '/admin/viajes', label: 'Viajes', icon: '🚚' },
      { href: '/admin/clientes', label: 'Clientes', icon: '🏢' },
      { href: '/admin/tarifas', label: 'Tarifas', icon: '💰' },
      { href: '/admin/pagos', label: 'Pagos', icon: '🧾' },
      { href: '/admin/reportes', label: 'Reportes', icon: '📈' },
      { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
    ],
    []
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700">
        Cargando…
      </div>
    )
  }

  if (!allowed) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* SIDEBAR */}
        <aside className="w-72 min-h-screen bg-white border-r border-gray-200 flex flex-col">
          {/* Brand */}
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                R
              </div>
              <div className="leading-tight">
                <div className="font-bold text-gray-900">Remito SaaS</div>
                <div className="text-xs text-gray-500">Panel Admin</div>
              </div>
            </div>
          </div>

          {/* Profile */}
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500">Sesión</div>
            <div className="text-sm font-semibold text-gray-900 truncate">{email || '-'}</div>
            <div className="text-xs text-gray-500">{nombre}</div>
          </div>

          {/* Nav */}
          <nav className="px-3 pb-3 space-y-1 flex-1">
            {nav.map(item => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition',
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                      : 'text-gray-700 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <span className="w-6 text-center">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-gray-200">
            <button
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition"
              onClick={async () => {
                await supabase.auth.signOut()
                window.location.href = '/login'
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* CONTENT */}
        <main className="flex-1 p-6">
          {/* Contenedor lindo para evitar “todo pegado” */}
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
