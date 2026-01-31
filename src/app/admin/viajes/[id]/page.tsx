'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ViajeEstado = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeDetalle = {
  viaje_id: string
  estado: ViajeEstado
  origen: string
  destino: string
  tipo_unidad: string
  creado_en: string
  actualizado_en: string
  chofer_id: string

  cliente_id: string | null
  tarifa_id: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null

  transportista_nombre: string | null
  transportista_email: string | null

  // remito
  remito_id: string | null
  numero_remito: string | null
  fecha_viaje: string | null
  archivo_url: string | null
  remito_creado_en?: string | null
}

type Cliente = { id: string; nombre: string }

type Tarifa = {
  id: string
  destino: string | null
  tipo_unidad: string | null
  valor_cliente: number
  valor_chofer: number
  segundo_viaje_pct?: number | null
  cliente_id: string | null
  activo?: boolean | null
}

function fmtMoneyARS(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(value)
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-AR')
}

function statusMeta(estado: ViajeEstado) {
  switch (estado) {
    case 'pendiente':
      return { label: 'Pendiente', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' }
    case 'aprobado':
      return { label: 'Aprobado', chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' }
    case 'facturado':
      return { label: 'Facturado', chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' }
    case 'pagado':
      return { label: 'Pagado', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' }
    case 'rechazado':
      return { label: 'Rechazado', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' }
    default:
      return { label: estado, chip: 'bg-gray-50 text-gray-700 border-gray-200', dot: 'bg-gray-400' }
  }
}

/**
 * ✅ Convierte `archivo_url` a URL abrible.
 * - Si ya es http(s), lo usa directo.
 * - Si es path (Storage), crea signedUrl.
 */
async function resolveRemitoUrl(archivoUrl: string) {
  if (!archivoUrl) return null
  if (archivoUrl.startsWith('http://') || archivoUrl.startsWith('https://')) return archivoUrl

  const { data, error } = await supabase.storage.from('remitos').createSignedUrl(archivoUrl, 60 * 10) // 10 min
  if (error) throw error
  return data?.signedUrl ?? null
}

/**
 * ✅ Descarga real (PDF/imagen) desde signedUrl
 */
async function downloadFromUrl(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar el archivo')

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(objectUrl)
}

export default function AdminViajeIdPage() {
  const router = useRouter()
  const params = useParams()
  const viajeId = String(params?.id || '')

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [viaje, setViaje] = useState<ViajeDetalle | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])

  const [clienteSeleccionado, setClienteSeleccionado] = useState<string>('')
  const [tarifaSeleccionada, setTarifaSeleccionada] = useState<string>('')

  const margen = useMemo(() => {
    if (!viaje?.valor_cliente_snapshot || !viaje?.valor_chofer_snapshot) return null
    return viaje.valor_cliente_snapshot - viaje.valor_chofer_snapshot
  }, [viaje])

  const meta = useMemo(() => {
    if (!viaje) return null
    return statusMeta(viaje.estado)
  }, [viaje])

  const cargarTodo = async () => {
    try {
      setLoading(true)

      // ✅ Traemos TODO del view (consistente)
      const { data, error } = await supabase
        .from('viajes_listado')
        .select('*')
        .eq('viaje_id', viajeId)
        .single()

      if (error) throw error

      setViaje(data as ViajeDetalle)

      // Clientes
      const { data: cData, error: cErr } = await supabase
        .from('clientes')
        .select('id,nombre')
        .order('nombre', { ascending: true })

      if (cErr) throw cErr
      setClientes((cData || []) as Cliente[])

      // Tarifas activas
      const { data: tData, error: tErr } = await supabase
        .from('tarifas')
        .select('id,cliente_id,destino,tipo_unidad,valor_cliente,valor_chofer,segundo_viaje_pct,activo,creado_en')
        .eq('activo', true)
        .order('creado_en', { ascending: false })

      if (tErr) throw tErr
      setTarifas((tData || []) as Tarifa[])

      // defaults
      setClienteSeleccionado(data?.cliente_id || '')
      setTarifaSeleccionada(data?.tarifa_id || '')
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Error cargando viaje')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!viajeId) return
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viajeId])

  const guardarCliente = async () => {
    if (!clienteSeleccionado) {
      alert('Seleccioná un cliente')
      return
    }
    try {
      setBusy(true)
      const { error } = await supabase.from('viajes').update({ cliente_id: clienteSeleccionado }).eq('id', viajeId)
      if (error) throw error
      await cargarTodo()
    } catch (e: any) {
      alert(e?.message || 'Error guardando cliente')
    } finally {
      setBusy(false)
    }
  }

  // ✅ Aplicar tarifa manual (si tu RPC es la versión "aplicar_tarifa_a_viaje(p_viaje_id,p_tarifa_id)")
  const aplicarTarifa = async () => {
    if (!tarifaSeleccionada) {
      alert('Seleccioná una tarifa')
      return
    }
    try {
      setBusy(true)
      const { error } = await supabase.rpc('aplicar_tarifa_a_viaje', {
        p_viaje_id: viajeId,
        p_tarifa_id: tarifaSeleccionada
      })
      if (error) throw error
      await cargarTodo()
    } catch (e: any) {
      alert(e?.message || 'Error aplicando tarifa')
    } finally {
      setBusy(false)
    }
  }

  const cambiarEstado = async (estado: ViajeEstado) => {
    try {
      setBusy(true)
      const { error } = await supabase.rpc('cambiar_estado_viaje', {
        p_viaje_id: viajeId,
        p_estado: estado
      })
      if (error) throw error
      await cargarTodo()
    } catch (e: any) {
      alert(e?.message || 'Error cambiando estado')
    } finally {
      setBusy(false)
    }
  }

  const marcarPagado = async () => {
    try {
      setBusy(true)
      const { error } = await supabase.rpc('registrar_pago_transportista', {
        p_viaje_id: viajeId
      })
      if (error) throw error
      await cargarTodo()
    } catch (e: any) {
      alert(e?.message || 'Error marcando pagado')
    } finally {
      setBusy(false)
    }
  }

  // ✅ VER REMITO (sin 404)
  const verRemito = async () => {
    try {
      if (!viaje?.archivo_url) return alert('Este viaje no tiene archivo cargado')
      setBusy(true)
      const url = await resolveRemitoUrl(viaje.archivo_url)
      if (!url) return alert('No se pudo generar el link del archivo')
      window.open(url, '_blank')
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Error abriendo el archivo')
    } finally {
      setBusy(false)
    }
  }

  // ✅ DESCARGAR REMITO (descarga real)
  const descargarRemito = async () => {
    try {
      if (!viaje?.archivo_url) return alert('Este viaje no tiene archivo cargado')
      setBusy(true)

      const url = await resolveRemitoUrl(viaje.archivo_url)
      if (!url) return alert('No se pudo generar el link del archivo')

      const ext = viaje.archivo_url.split('.').pop() || 'pdf'
      const filename = `remito_${viaje.numero_remito || viaje.viaje_id}.${ext}`

      await downloadFromUrl(url, filename)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Error descargando el archivo')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse rounded-2xl border bg-white p-6">
          <div className="h-6 w-64 rounded bg-gray-200" />
          <div className="mt-4 h-4 w-96 rounded bg-gray-200" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="h-28 rounded-2xl bg-gray-100" />
            <div className="h-28 rounded-2xl bg-gray-100" />
            <div className="h-28 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    )
  }

  if (!viaje) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-semibold">No se encontró el viaje</h2>
          <button
            onClick={() => router.push('/admin/viajes')}
            className="mt-4 rounded-xl border px-4 py-2 hover:bg-gray-50 transition"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  const tarifasFiltradas = tarifas.filter((t) => {
    if (clienteSeleccionado) return t.cliente_id === null || t.cliente_id === clienteSeleccionado
    return t.cliente_id === null
  })

  return (
    <div className="p-6">
      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/viajes')}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 transition"
            >
              ← Volver
            </button>

            <h1 className="text-2xl font-bold tracking-tight">Detalle del viaje</h1>

            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${meta?.chip}`}>
              <span className={`h-2 w-2 rounded-full ${meta?.dot}`} />
              {meta?.label}
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-600">Gestión completa: remito, cliente, tarifa, montos y estado.</p>
          <p className="mt-1 text-xs text-gray-500">
            ID: <span className="font-mono">{viaje.viaje_id}</span>
          </p>
        </div>

        <button
          onClick={cargarTodo}
          className="rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-60"
          disabled={busy}
        >
          {busy ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {/* GRID PRINCIPAL */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* COLUMNA IZQ */}
        <div className="space-y-6 lg:col-span-2">
          {/* RESUMEN */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Resumen</h2>
              <span className="text-xs text-gray-500">
                Creado: <b>{fmtDate(viaje.creado_en)}</b> · Actualizado: <b>{fmtDate(viaje.actualizado_en)}</b>
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-gradient-to-br from-blue-50 to-white p-4">
                <p className="text-xs text-gray-500">Transportista</p>
                <p className="mt-1 text-base font-semibold">{viaje.transportista_nombre || '—'}</p>
                <p className="text-sm text-gray-600">{viaje.transportista_email || '—'}</p>

                <div className="mt-4 rounded-xl border bg-white p-3">
                  <p className="text-xs text-gray-500">Cuenta del sistema</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Transportista</p>
                  <p className="mt-1 text-xs text-gray-500">
                    * No usamos “chofer real”. Todo es por transportista.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-4">
                <p className="text-xs text-gray-500">Ruta</p>
                <p className="mt-1 text-base font-semibold">
                  {viaje.origen} <span className="text-gray-400">→</span> {viaje.destino}
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs text-gray-500">Unidad</p>
                    <p className="mt-1 text-sm font-semibold">{viaje.tipo_unidad}</p>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs text-gray-500">Estado</p>
                    <p className="mt-1 text-sm font-semibold">{meta?.label}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border bg-white p-3">
                  <p className="text-xs text-gray-500">Última actualización</p>
                  <p className="mt-1 text-sm font-semibold">{fmtDate(viaje.actualizado_en)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* REMITO */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Remito</h2>
              <span className={`text-xs ${viaje.archivo_url ? 'text-emerald-600' : 'text-gray-500'}`}>
                {viaje.archivo_url ? 'Archivo disponible ✅' : 'Sin archivo'}
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Número</p>
                <p className="mt-1 text-base font-semibold">{viaje.numero_remito || '—'}</p>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Fecha del viaje</p>
                <p className="mt-1 text-base font-semibold">{fmtDate(viaje.fecha_viaje)}</p>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Acciones</p>

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={verRemito}
                    disabled={busy}
                    className="flex-1 rounded-xl border px-4 py-2 hover:bg-gray-100 transition disabled:opacity-50"
                  >
                    Ver
                  </button>

                  <button
                    onClick={descargarRemito}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-gray-900 px-4 py-2 text-white font-semibold hover:bg-black transition disabled:opacity-50"
                  >
                    Descargar
                  </button>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  * Ya no tira 404 (usa link firmado).
                </p>
              </div>
            </div>
          </div>

          {/* CLIENTE */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
            <h2 className="text-lg font-semibold">Cliente</h2>
            <p className="mt-1 text-sm text-gray-600">Seleccioná cliente para poder aplicar tarifas y facturar.</p>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <select
                className="w-full rounded-xl border px-3 py-3 outline-none focus:ring-2 focus:ring-blue-200 transition"
                value={clienteSeleccionado}
                onChange={(e) => setClienteSeleccionado(e.target.value)}
                disabled={busy}
              >
                <option value="">Seleccionar cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>

              <button
                onClick={guardarCliente}
                disabled={busy || !clienteSeleccionado}
                className="rounded-xl bg-blue-600 px-4 py-3 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                Guardar
              </button>
            </div>

            {!viaje.cliente_id && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                ⚠️ Sin cliente asignado: no vas a poder facturar todavía.
              </div>
            )}
          </div>

          {/* TARIFA */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Tarifa</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Primero elegí cliente. Después aplicás la tarifa para congelar los montos (snapshots).
                </p>
              </div>

              <div className="text-xs text-gray-500">{viaje.tarifa_id ? 'Tarifa aplicada ✅' : 'Sin tarifa'}</div>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <select
                className="w-full rounded-xl border px-3 py-3 outline-none focus:ring-2 focus:ring-violet-200 transition"
                value={tarifaSeleccionada}
                onChange={(e) => setTarifaSeleccionada(e.target.value)}
                disabled={busy || !clienteSeleccionado}
              >
                <option value="">{clienteSeleccionado ? 'Seleccionar tarifa…' : 'Elegí cliente primero…'}</option>
                {tarifasFiltradas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {(t.destino || 'General')} · {(t.tipo_unidad || 'General')} · {fmtMoneyARS(t.valor_cliente)} /{' '}
                    {fmtMoneyARS(t.valor_chofer)}
                  </option>
                ))}
              </select>

              <button
                onClick={aplicarTarifa}
                disabled={busy || !tarifaSeleccionada || !clienteSeleccionado}
                className="rounded-xl bg-violet-600 px-4 py-3 text-white font-semibold hover:bg-violet-700 transition disabled:opacity-50"
              >
                Aplicar tarifa
              </button>
            </div>

            {/* MONTOS */}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-gradient-to-br from-violet-50 to-white p-4">
                <p className="text-xs text-gray-500">Facturado al cliente</p>
                <p className="mt-1 text-xl font-bold">{fmtMoneyARS(viaje.valor_cliente_snapshot)}</p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-4">
                <p className="text-xs text-gray-500">A pagar al transportista</p>
                <p className="mt-1 text-xl font-bold">{fmtMoneyARS(viaje.valor_chofer_snapshot)}</p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-amber-50 to-white p-4">
                <p className="text-xs text-gray-500">Margen / Ganancia</p>
                <p className="mt-1 text-xl font-bold">{fmtMoneyARS(margen)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
            <h2 className="text-lg font-semibold">Acciones</h2>
            <p className="mt-1 text-sm text-gray-600">Control de estados (admin).</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => cambiarEstado('aprobado')}
                disabled={busy}
                className="rounded-xl border px-4 py-2 hover:bg-blue-50 hover:border-blue-200 transition"
              >
                Aprobar
              </button>

              <button
                onClick={() => cambiarEstado('facturado')}
                disabled={busy}
                className="rounded-xl bg-violet-600 px-4 py-2 text-white font-semibold hover:bg-violet-700 transition disabled:opacity-50"
              >
                Facturar
              </button>

              <button
                onClick={marcarPagado}
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
              >
                Marcar pagado
              </button>

              <button
                onClick={() => cambiarEstado('rechazado')}
                disabled={busy}
                className="rounded-xl border border-rose-200 px-4 py-2 text-rose-700 hover:bg-rose-50 transition"
              >
                Rechazar
              </button>
            </div>

            <div className="mt-4 rounded-xl border bg-gray-50 p-3 text-xs text-gray-600">
              Tip: <b>Facturar</b> exige cliente + tarifa aplicada (snapshots). <br />
              <b>Marcar pagado</b> exige estado <b>facturado</b>.
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
            <h2 className="text-lg font-semibold">Checklist rápido</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                <span>Remito cargado</span>
                <span className={viaje.archivo_url ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                  {viaje.archivo_url ? 'OK' : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                <span>Cliente asignado</span>
                <span className={viaje.cliente_id ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                  {viaje.cliente_id ? 'OK' : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                <span>Tarifa aplicada</span>
                <span className={viaje.tarifa_id ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                  {viaje.tarifa_id ? 'OK' : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                <span>Listo para facturar</span>
                <span className={viaje.cliente_id && viaje.tarifa_id ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                  {viaje.cliente_id && viaje.tarifa_id ? 'SI' : 'NO'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-gradient-to-br from-gray-50 to-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Pro Tip</h2>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">
              Esto ya está <b>entregable</b>. Lo siguiente pro: <b>Export Excel</b> + <b>Reportes</b>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
