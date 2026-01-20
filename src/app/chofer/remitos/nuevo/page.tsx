'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ChoferHeader from '@/components/chofer/ChoferHeader'

const TIPOS = ['camioneta', 'chasis', 'balancines', 'semis'] as const
type TipoUnidad = (typeof TIPOS)[number]

export default function NuevoRemitoPage() {
  const router = useRouter()

  const [numeroRemito, setNumeroRemito] = useState('')
  const [fechaViaje, setFechaViaje] = useState('')
  const [destino, setDestino] = useState('')
  const [choferReal, setChoferReal] = useState('')
  const [tipoUnidad, setTipoUnidad] = useState<TipoUnidad>('chasis')
  const [file, setFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)

  const subir = async () => {
    if (!numeroRemito || !fechaViaje || !destino || !choferReal || !tipoUnidad || !file) {
      alert('Completá todo y seleccioná el archivo.')
      return
    }

    // 🔥 Mini control de peso para evitar “memoria insuficiente” en celu
    const maxMB = 8
    if (file.size > maxMB * 1024 * 1024) {
      alert(`El archivo pesa más de ${maxMB}MB. Mandalo como PDF o sacá foto en menor calidad.`)
      return
    }

    setSaving(true)

    // 1) usuario actual
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes.user) {
      alert('No estás logueado.')
      setSaving(false)
      return
    }
    const user = userRes.user

    // 2) crear viaje (origen fijo)
    const { data: viaje, error: eViaje } = await supabase
      .from('viajes')
      .insert({
        chofer_id: user.id,                 // transportista
        origen: 'Buenos Aires',            // fijo
        destino: destino.trim(),
        tipo_unidad: tipoUnidad,
        chofer_nombre: choferReal.trim(),  // chofer real escrito
        estado: 'pendiente',
      })
      .select('id')
      .single()

    if (eViaje || !viaje?.id) {
      alert(eViaje?.message ?? 'Error creando viaje')
      setSaving(false)
      return
    }

    const viajeId = viaje.id as string

    // 3) subir archivo storage
    const ext = file.name.split('.').pop() || 'bin'
    const safeName = `${Date.now()}_${numeroRemito.replace(/\s+/g, '')}.${ext}`
    const path = `${user.id}/${viajeId}/${safeName}`

    const { error: eUp } = await supabase.storage.from('remitos').upload(path, file, { upsert: true })
    if (eUp) {
      alert(eUp.message)
      setSaving(false)
      return
    }

    // 4) insertar remito
    const { error: eRem } = await supabase.from('remitos').insert({
      viaje_id: viajeId,
      archivo_url: path,
      numero_remito: numeroRemito.trim(),
      fecha_viaje: fechaViaje,
    })

    if (eRem) {
      await supabase.storage.from('remitos').remove([path])
      alert(eRem.message)
      setSaving(false)
      return
    }

    setSaving(false)
    router.push('/chofer/remitos')
  }

  return (
    <div className="min-h-screen bg-gray-50 bg-app">
      <ChoferHeader />

      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5">
          <h1 className="text-xl font-bold tracking-tight">Subir remito</h1>
          <p className="text-sm text-gray-600 mt-1">
            Cargá remito + viaje (solo <b>destino</b>, unidad, chofer y archivo).
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 space-y-4">
          <div>
            <label className="text-sm font-medium">Número de remito</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={numeroRemito}
              onChange={e => setNumeroRemito(e.target.value)}
              placeholder="Ej: 1234"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Fecha del viaje</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={fechaViaje}
              onChange={e => setFechaViaje(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Destino</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={destino}
              onChange={e => setDestino(e.target.value)}
              placeholder="Ej: Rosario"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Chofer (real)</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={choferReal}
              onChange={e => setChoferReal(e.target.value)}
              placeholder="Ej: Juan Perez"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Tipo de unidad</label>
            <select
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={tipoUnidad}
              onChange={e => setTipoUnidad(e.target.value as TipoUnidad)}
            >
              {TIPOS.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Archivo (foto o PDF)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="mt-1 w-full text-sm"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            {file && <div className="text-xs text-gray-500 mt-1">Seleccionado: {file.name}</div>}
          </div>

          <button
            onClick={subir}
            disabled={saving}
            className="w-full rounded-2xl px-4 py-3 text-sm font-semibold bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-50"
          >
            {saving ? 'Subiendo…' : 'Subir remito'}
          </button>

          <div className="text-xs text-gray-500">
            Tip: si falla en el celu por memoria, usá PDF o bajá la calidad de la foto.
          </div>
        </div>
      </div>
    </div>
  )
}
