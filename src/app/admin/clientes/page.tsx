'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Cliente = {
  id: string
  nombre: string
  creado_en: string
}

function normalizarNombre(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function AdminClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [nombre, setNombre] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, creado_en')
      .order('nombre', { ascending: true })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setClientes((data as Cliente[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const crearCliente = async () => {
    const n = nombre.trim()
    if (!n) {
      alert('Ingresá un nombre')
      return
    }

    // ✅ Anti duplicados (case-insensitive y espacios)
    const existe = clientes.some(c => normalizarNombre(c.nombre) === normalizarNombre(n))
    if (existe) {
      alert('Ese cliente ya existe (o muy parecido). Buscalo en la lista 👍')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('clientes')
      .insert({ nombre: n })
      .select('id, nombre, creado_en')
      .single()

    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    setClientes(prev =>
      [...prev, data as Cliente].sort((a, b) => a.nombre.localeCompare(b.nombre))
    )
    setNombre('')
    setSaving(false)
  }

  const filtrados = useMemo(() => {
    const q = normalizarNombre(busqueda)
    if (!q) return clientes

    return clientes.filter(c => normalizarNombre(c.nombre).includes(q))
  }, [clientes, busqueda])

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-gray-500">
            Empresas para las que se realizan viajes (a quienes después facturás).
          </p>
        </div>

        <button
          onClick={load}
          className="px-3 py-2 rounded-lg text-sm bg-white soft-border hover:bg-gray-50 active:scale-[0.99] transition"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Crear cliente */}
        <div className="card p-4 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
              🏢
            </div>
            <div>
              <div className="font-semibold">Nuevo cliente</div>
              <div className="text-xs text-gray-500">
                Creá una empresa para asignarla a viajes.
              </div>
            </div>
          </div>

          <label className="text-xs font-medium text-gray-600">Nombre</label>
          <input
            type="text"
            placeholder="Ej: Edesur / Acindar / Carrefour…"
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm soft-border focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') crearCliente()
            }}
          />

          <button
            onClick={crearCliente}
            disabled={saving}
            className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.99] transition"
          >
            {saving ? 'Guardando…' : 'Crear cliente'}
          </button>

          <div className="mt-3 text-xs text-gray-500">
            Tip: más adelante podés agregar CUIT / condición IVA / dirección si lo necesitás.
          </div>
        </div>

        {/* Lista */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="p-4 border-b" style={{ borderColor: 'rgba(15,23,42,0.08)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">Listado</div>
                <div className="text-xs text-gray-500">
                  Mostrando {filtrados.length} de {clientes.length}
                </div>
              </div>

              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-60 max-w-full rounded-xl px-3 py-2 text-sm soft-border focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-gray-600">Cargando clientes…</div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-2">🗂️</div>
              <div className="font-semibold">No hay resultados</div>
              <div className="text-sm text-gray-500">
                Probá con otro nombre o creá un cliente nuevo.
              </div>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
              {filtrados.map(c => (
                <div
                  key={c.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div>
                    <div className="font-medium">{c.nombre}</div>
                    <div className="text-xs text-gray-500">
                      Creado: {new Date(c.creado_en).toLocaleDateString('es-AR')}
                    </div>
                  </div>

                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    activo
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
