'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Rol = 'admin' | 'chofer' | 'finanzas'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // ✅ trae el perfil con retry por si el trigger tarda
  const fetchPerfil = async (userId: string) => {
    for (let i = 0; i < 6; i++) {
      const { data, error } = await supabase
        .from('usuarios')
        .select('rol, activo')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('ERROR SELECT usuarios:', error)
        return { perfil: null as any, error: error.message }
      }

      if (data) return { perfil: data, error: null }

      await sleep(200)
    }

    return {
      perfil: null,
      error: 'No existe perfil en usuarios (trigger/backfill pendiente).',
    }
  }

  // ✅ redirección robusta (router + fallback)
  const go = (path: string) => {
    router.replace(path)
    setTimeout(() => {
      if (window.location.pathname !== path) window.location.href = path
    }, 50)
  }

  const onLogin = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error || !data.user) {
        alert(error?.message ?? 'Error de login')
        return
      }

      const user = data.user
      console.log('AUTH:', user.email, user.id)

      const { perfil, error: perfilError } = await fetchPerfil(user.id)
      if (perfilError) {
        alert(perfilError)
        await supabase.auth.signOut()
        return
      }

      if (!perfil?.activo) {
        alert('Usuario inactivo')
        await supabase.auth.signOut()
        return
      }

      // ✅ FIX CLAVE: normalizar rol (quita espacios / mayúsculas)
      const rolNormalizado = (perfil.rol ?? '')
        .toString()
        .trim()
        .toLowerCase() as Rol

      console.log('PERFIL:', perfil, 'ROL_NORMALIZADO:', rolNormalizado)

      if (rolNormalizado === 'admin') go('/admin')
      else go('/chofer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm bg-white border rounded-xl p-4 space-y-3">
        <h1 className="text-xl font-bold">Login</h1>

        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            className="mt-1 w-full border rounded-lg p-2 text-sm"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Contraseña</label>
          <input
            className="mt-1 w-full border rounded-lg p-2 text-sm"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button
          onClick={onLogin}
          disabled={loading}
          className={`w-full rounded-xl p-3 text-sm font-medium ${
            loading
              ? 'bg-gray-300 text-gray-600'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}
