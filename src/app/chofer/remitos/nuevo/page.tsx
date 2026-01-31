'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ChoferHeader from '@/components/chofer/ChoferHeader'

const TIPOS = ['camioneta', 'chasis', 'balancines', 'semis'] as const
type TipoUnidad = (typeof TIPOS)[number]

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function NuevoRemitoPage() {
  const router = useRouter()

  const [numeroRemito, setNumeroRemito] = useState('')
  const [fechaViaje, setFechaViaje] = useState('')
  const [destino, setDestino] = useState('')
  const [tipoUnidad, setTipoUnidad] = useState<TipoUnidad>('chasis')
  const [file, setFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)

  const fileLabel = useMemo(() => {
    if (!file) return 'Seleccionar archivo'
    return `${file.name} (${Math.ceil(file.size / 1024)} KB)`
  }, [file])

  const subir = async () => {
    // ✅ validaciones mínimas
    if (!numeroRemito.trim() || !fechaViaje || !destino.trim() || !tipoUnidad || !file) {
      alert('Completá todos los datos y seleccioná un archivo.')
      return
    }

    // 🔥 control de peso para evitar “memoria insuficiente” en celu
    const maxMB = 8
    if (file.size > maxMB * 1024 * 1024) {
      alert(`El archivo pesa más de ${maxMB}MB. Usá PDF o sacá foto en menor calidad.`)
      return
    }

    try {
      setSaving(true)

      // 1) usuario actual
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userRes.user) {
        alert('No estás logueado.')
        return
      }
      const user = userRes.user

      // 2) crear viaje (transportista = chofer_id)
      const { data: viaje, error: eViaje } = await supabase
        .from('viajes')
        .insert({
          chofer_id: user.id, // transportista
          origen: 'Buenos Aires',
          destino: destino.trim(),
          tipo_unidad: tipoUnidad,
          estado: 'pendiente'
        })
        .select('id')
        .single()

      if (eViaje || !viaje?.id) {
        alert(eViaje?.message ?? 'Error creando viaje')
        return
      }

      const viajeId = viaje.id as string

      // 3) subir archivo a storage
      const ext = file.name.split('.').pop() || 'bin'
      const safeNumero = numeroRemito.replace(/\s+/g, '').replace(/[^\w-]/g, '')
      const safeName = `${Date.now()}_${safeNumero}.${ext}`
      const path = `${user.id}/${viajeId}/${safeName}`

      const { error: eUp } = await supabase.storage
        .from('remitos')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (eUp) {
        alert(eUp.message)
        return
      }

      // 4) insertar remito (archivo_url = path)
      const { error: eRem } = await supabase.from('remitos').insert({
        viaje_id: viajeId,
        archivo_url: path, // ✅ guardamos el PATH (después lo abrimos con signedUrl)
        numero_remito: numeroRemito.trim(),
        fecha_viaje: fechaViaje
      })

      if (eRem) {
        // rollback archivo si falló el insert
        await supabase.storage.from('remitos').remove([path])
        alert(eRem.message)
        return
      }

      router.push('/chofer/remitos')
    } catch (err: any) {
      console.error(err)
      alert(err?.message ?? 'Error inesperado')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 bg-app">
      <ChoferHeader />

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* HEADER */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
          <h1 className="text-xl font-bold tracking-tight">Subir remito</h1>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            Cargás el <b>remito</b> y automáticamente se crea el <b>viaje</b>. <br />
            (Solo: destino, unidad, número, fecha y archivo)
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-white p-3">
              <p className="text-xs text-gray-500">Origen</p>
              <p className="text-sm font-semibold">Buenos Aires</p>
            </div>

            <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-white p-3">
              <p className="text-xs text-gray-500">Estado inicial</p>
              <p className="text-sm font-semibold">Pendiente</p>
            </div>
          </div>
        </div>

        {/* FORM */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-4 transition hover:shadow-md">
          {/* Número */}
          <div>
            <label className="text-sm font-medium">Número de remito</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              value={numeroRemito}
              onChange={(e) => setNumeroRemito(e.target.value)}
              placeholder="Ej: 1234"
              inputMode="numeric"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="text-sm font-medium">Fecha del viaje</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              value={fechaViaje}
              onChange={(e) => setFechaViaje(e.target.value)}
            />
          </div>

          {/* Destino */}
          <div>
            <label className="text-sm font-medium">Destino</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="Ej: Rosario"
            />
          </div>

          {/* Tipo unidad */}
          <div>
            <label className="text-sm font-medium">Tipo de unidad</label>
            <select
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              value={tipoUnidad}
              onChange={(e) => setTipoUnidad(e.target.value as TipoUnidad)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Archivo */}
          <div>
            <label className="text-sm font-medium">Archivo (foto o PDF)</label>

            <div className="mt-2 rounded-2xl border bg-gray-50 p-3 transition">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Seleccionado</p>
                  <p className="text-sm font-semibold truncate">{file ? fileLabel : '—'}</p>
                </div>

                <label
                  className={cn(
                    'cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold transition',
                    'hover:bg-gray-100 active:scale-[0.99]',
                    saving && 'opacity-50 pointer-events-none'
                  )}
                >
                  {file ? 'Cambiar' : 'Elegir'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Tip: si falla en el celu por memoria, usá <b>PDF</b> o bajá la calidad de la foto.
              </p>
            </div>
          </div>

          {/* Botón */}
          <button
            onClick={subir}
            disabled={saving}
            className={cn(
              'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition',
              'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50',
              saving && 'animate-pulse'
            )}
          >
            {saving ? 'Subiendo…' : 'Subir remito'}
          </button>

          {/* mini aviso */}
          <div className="rounded-xl border bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
            ✅ Se crea viaje automáticamente. Después el admin asigna <b>cliente + tarifa</b> y lo factura/paga.
          </div>
        </div>
      </div>
    </div>
  )
}
