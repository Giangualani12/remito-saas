'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Rol = 'admin' | 'chofer' | 'finanzas'

type Usuario = {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  creado_en: string
}

function passFacil(nombre: string) {
  const clean = (nombre || 'User')
    .trim()
    .split(' ')[0]
    .slice(0, 10)
    .replace(/[^a-zA-Z0-9]/g, '')
  const year = new Date().getFullYear()
  const n = Math.floor(Math.random() * 90) + 10
  return `${clean}${year}!${n}`
}

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [q, setQ] = useState('')

  // form
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('chofer')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('usuarios')
      .select('id,nombre,email,rol,activo,creado_en')
      .order('creado_en', { ascending: false })

    if (error) {
      alert(error.message)
      setUsuarios([])
      setLoading(false)
      return
    }

    setUsuarios((data ?? []) as Usuario[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return usuarios
    return usuarios.filter(u => {
      return (
        u.nombre.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.rol.toLowerCase().includes(term)
      )
    })
  }, [usuarios, q])

  const copiar = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt)
      alert('Copiado ✅')
    } catch {
      alert('No se pudo copiar 😅')
    }
  }

  const generar = () => {
    const p = passFacil(nombre)
    setPassword(p)
  }

  const crearUsuario = async () => {
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      alert('Completá Nombre, Email y Contraseña.')
      return
    }

    setSaving(true)

    try {
      const res = await fetch('/api/admin/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim().toLowerCase(),
          rol,
          password: password.trim(), // 👈 ahora lo mandamos
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        console.log('API ERROR:', json)
        alert(json?.error ?? 'No se pudo crear usuario')
        return
      }

      // ✅ ok
      alert(`Usuario creado ✅\n\nEmail: ${email}\nPass: ${password}`)

      // limpiar
      setNombre('')
      setEmail('')
      setRol('chofer')
      setPassword('')
      setShowPass(false)

      // recargar lista
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    const ok = confirm(activo ? '¿Desactivar usuario?' : '¿Activar usuario?')
    if (!ok) return

    const { error } = await supabase
      .from('usuarios')
      .update({ activo: !activo })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setUsuarios(prev =>
      prev.map(u => (u.id === id ? { ...u, activo: !activo } : u))
    )
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-gray-500">
            Creá choferes y administradores con contraseña simple.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 active:scale-[0.99] transition"
        >
          Actualizar
        </button>
      </div>

      {/* CARD CREAR */}
      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Agregar usuario</div>
          <div className="text-xs text-gray-500">
            Recomendado: contraseña fácil (ej: Pepe4821!)
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-600">Nombre</label>
            <input
              className="mt-1 w-full border rounded-xl p-3 text-sm"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Juan Perez"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Email</label>
            <input
              className="mt-1 w-full border rounded-xl p-3 text-sm"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="chofer@empresa.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Rol</label>
            <select
              className="mt-1 w-full border rounded-xl p-3 text-sm"
              value={rol}
              onChange={e => setRol(e.target.value as Rol)}
            >
              <option value="chofer">Chofer</option>
              <option value="admin">Admin</option>
              <option value="finanzas">Finanzas</option>
            </select>
          </div>
        </div>

        {/* password row */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Contraseña</label>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full border rounded-xl p-3 text-sm"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Ej: Ruta2026!55"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="px-4 border rounded-xl bg-white hover:bg-gray-50"
              >
                {showPass ? 'Ocultar' : 'Ver'}
              </button>
              <button
                type="button"
                onClick={generar}
                className="px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                Generar fácil
              </button>
              <button
                type="button"
                onClick={() => copiar(password)}
                className="px-4 border rounded-xl bg-white hover:bg-gray-50"
              >
                Copiar
              </button>
            </div>

            <div className="text-xs text-gray-500 mt-2">
              Tip: copiás y se la mandás por WhatsApp al chofer: Email + Contraseña.
            </div>
          </div>

          <button
            type="button" // ✅ ESTE ES EL FIX CLAVE
            onClick={crearUsuario}
            disabled={saving}
            className="h-[48px] rounded-xl bg-black text-white font-semibold disabled:opacity-60 hover:opacity-95 active:scale-[0.99] transition"
          >
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <input
          className="w-full border rounded-xl p-3 text-sm"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nombre, email o rol…"
        />
        <div className="text-xs text-gray-500 whitespace-nowrap">
          {filtrados.length}/{usuarios.length}
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-5 text-sm">Cargando usuarios…</div>
        ) : filtrados.length === 0 ? (
          <div className="p-5 text-sm text-gray-600">
            No hay usuarios para ese filtro.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4">Nombre</th>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Rol</th>
                <th className="text-left p-4">Estado</th>
                <th className="text-right p-4">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.map(u => (
                <tr key={u.id}>
                  <td className="p-4 font-medium">{u.nombre}</td>
                  <td className="p-4 text-gray-600">{u.email}</td>

                  <td className="p-4">
                    <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs">
                      {u.rol === 'admin' ? 'Admin' : u.rol === 'finanzas' ? 'Finanzas' : 'Chofer'}
                    </span>
                  </td>

                  <td className="p-4">
                    {u.activo ? (
                      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-green-50 text-green-700 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        Inactivo
                      </span>
                    )}
                  </td>

                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleActivo(u.id, u.activo)}
                      className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50"
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-500 flex items-center gap-2">
        ✅ Recomendación real: contraseña fácil + mandarla por WhatsApp. Después armamos “cambiar contraseña” desde el panel.
      </div>
    </div>
  )
}
