// src/app/api/admin/exportar/route.ts
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'
type TipoExport = 'general' | 'liquidacion' | 'facturacion'
type ModoFecha = 'fecha_viaje' | 'remito_creado_en'

type Body = {
  tipoExport?: TipoExport
  incluirLinkFirmado?: boolean

  // filtros
  estado?: 'todos' | EstadoViaje
  tipoUnidad?: string // 'todos' o unidad
  clienteId?: string // 'todos' o uuid
  qTransportista?: string
  qDestino?: string
  qRemito?: string

  modoFecha?: ModoFecha
  desde?: string // YYYY-MM-DD
  hasta?: string // YYYY-MM-DD

  // seguridad/perf
  maxSigned?: number // default 500
}

type ViajeListado = {
  viaje_id: string
  estado: EstadoViaje
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
  creado_en: string | null
  actualizado_en: string | null
  chofer_id: string
  cliente_id: string | null
  tarifa_id: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  transportista_nombre: string | null
  transportista_email: string | null
  remito_id: string | null
  numero_remito: string | null
  fecha_viaje: string | null
  archivo_url: string | null
  remito_creado_en: string | null
}

function safeCSV(value: any) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildCSV(headers: string[], rows: any[][]) {
  const lines: string[] = []
  lines.push(headers.map(safeCSV).join(','))
  for (const r of rows) lines.push(r.map(safeCSV).join(','))
  return lines.join('\n')
}

function fmtDate(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('es-AR')
}

export async function POST(req: Request) {
  const supa = await supabaseServer()

  // 1) auth
  const { data: userRes, error: userErr } = await supa.auth.getUser()
  if (userErr || !userRes.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // 2) check admin
  const { data: u, error: uErr } = await supa
    .from('usuarios')
    .select('rol')
    .eq('id', userRes.user.id)
    .single()

  if (uErr || !u || u.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  // 3) body
  const body = (await req.json().catch(() => ({}))) as Body

  const tipoExport: TipoExport = body.tipoExport ?? 'general'
  const incluirLinkFirmado = body.incluirLinkFirmado ?? true

  const estado = body.estado ?? 'todos'
  const tipoUnidad = body.tipoUnidad ?? 'todos'
  const clienteId = body.clienteId ?? 'todos'
  const qTransportista = (body.qTransportista ?? '').trim()
  const qDestino = (body.qDestino ?? '').trim()
  const qRemito = (body.qRemito ?? '').trim()

  const modoFecha: ModoFecha = body.modoFecha ?? 'remito_creado_en'
  const desde = (body.desde ?? '').trim()
  const hasta = (body.hasta ?? '').trim()

  const maxSigned = Math.min(Math.max(body.maxSigned ?? 500, 0), 2000)

  // 4) clientes (para nombres)
  const { data: clientesData } = await supa.from('clientes').select('id,nombre')
  const clientesMap = new Map<string, string>()
  ;(clientesData ?? []).forEach((c: any) => clientesMap.set(c.id, c.nombre))

  // 5) query viajes_listado
  let query = supa
    .from('viajes_listado')
    .select(
      `
      viaje_id,estado,origen,destino,tipo_unidad,creado_en,actualizado_en,chofer_id,
      cliente_id,tarifa_id,valor_cliente_snapshot,valor_chofer_snapshot,
      transportista_nombre,transportista_email,
      remito_id,numero_remito,fecha_viaje,archivo_url,remito_creado_en
    `
    )
    .order('remito_creado_en', { ascending: false, nullsFirst: false })
    .order('creado_en', { ascending: false, nullsFirst: false })

  if (estado !== 'todos') query = query.eq('estado', estado)
  if (tipoUnidad !== 'todos') query = query.eq('tipo_unidad', tipoUnidad)
  if (clienteId !== 'todos') query = query.eq('cliente_id', clienteId)

  if (qTransportista) query = query.ilike('transportista_nombre', `%${qTransportista}%`)
  if (qDestino) query = query.ilike('destino', `%${qDestino}%`)
  if (qRemito) query = query.ilike('numero_remito', `%${qRemito}%`)

  if (desde) {
    if (modoFecha === 'fecha_viaje') query = query.gte('fecha_viaje', desde)
    else query = query.gte('remito_creado_en', `${desde}T00:00:00`)
  }
  if (hasta) {
    if (modoFecha === 'fecha_viaje') query = query.lte('fecha_viaje', hasta)
    else query = query.lte('remito_creado_en', `${hasta}T23:59:59`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const rows = (data ?? []) as ViajeListado[]

  // 6) signed urls opcional
  const signedMap = new Map<string, string>()
  if (incluirLinkFirmado) {
    const paths = rows.map(r => r.archivo_url).filter(Boolean) as string[]
    const unique = Array.from(new Set(paths)).slice(0, maxSigned)

    const signedPairs = await Promise.all(
      unique.map(async (p) => {
        try {
          const { data: s, error: e } = await supa.storage.from('remitos').createSignedUrl(p, 60 * 30)
          if (e) return [p, ''] as const
          return [p, s.signedUrl] as const
        } catch {
          return [p, ''] as const
        }
      })
    )

    signedPairs.forEach(([p, url]) => signedMap.set(p, url))
  }

  // 7) armar CSV segun tipo
  const today = new Date().toISOString().slice(0, 10)

  let filename = `export_${today}.csv`
  let csv = ''

  if (tipoExport === 'general') {
    filename = `viajes_export_${today}.csv`

    const headers = [
      'Fecha viaje',
      'Fecha carga',
      'Remito N°',
      'Destino',
      'Unidad',
      'Estado',
      'Transportista',
      'Email',
      'Cliente',
      'Valor Cliente',
      'Valor Chofer',
      'Margen',
      'Link remito'
    ]

    const csvRows = rows.map(r => {
      const clienteNombre = r.cliente_id ? (clientesMap.get(r.cliente_id) || r.cliente_id) : ''
      const vc = r.valor_cliente_snapshot ?? ''
      const vch = r.valor_chofer_snapshot ?? ''
      const margen = (r.valor_cliente_snapshot ?? 0) - (r.valor_chofer_snapshot ?? 0)

      const link = r.archivo_url
        ? (incluirLinkFirmado ? (signedMap.get(r.archivo_url) || '') : r.archivo_url)
        : ''

      return [
        fmtDate(r.fecha_viaje),
        fmtDate(r.remito_creado_en),
        r.numero_remito || '',
        r.destino || '',
        r.tipo_unidad || '',
        r.estado || '',
        r.transportista_nombre || '',
        r.transportista_email || '',
        clienteNombre,
        vc === '' ? '' : vc,
        vch === '' ? '' : vch,
        (vc !== '' && vch !== '') ? margen : '',
        link
      ]
    })

    csv = buildCSV(headers, csvRows)
  }

  if (tipoExport === 'liquidacion') {
    filename = `liquidacion_transportistas_${today}.csv`

    const map = new Map<string, { nombre: string; email: string; viajes: number; total: number }>()
    rows.forEach(r => {
      const key = r.chofer_id
      const prev = map.get(key) || {
        nombre: r.transportista_nombre || 'Sin nombre',
        email: r.transportista_email || '',
        viajes: 0,
        total: 0
      }
      prev.viajes += 1
      prev.total += (r.valor_chofer_snapshot || 0)
      map.set(key, prev)
    })

    const headers = ['Transportista', 'Email', 'Cantidad viajes', 'Total a pagar (ARS)']
    const csvRows = Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map(v => [v.nombre, v.email, v.viajes, v.total])

    csv = buildCSV(headers, csvRows)
  }

  if (tipoExport === 'facturacion') {
    filename = `facturacion_clientes_${today}.csv`

    const map = new Map<string, { cliente: string; viajes: number; total: number; margen: number }>()
    rows.forEach(r => {
      const key = r.cliente_id || 'SIN_CLIENTE'
      const nombre = r.cliente_id ? (clientesMap.get(r.cliente_id) || r.cliente_id) : 'Sin cliente'
      const prev = map.get(key) || { cliente: nombre, viajes: 0, total: 0, margen: 0 }
      const vc = r.valor_cliente_snapshot || 0
      const vch = r.valor_chofer_snapshot || 0
      prev.viajes += 1
      prev.total += vc
      prev.margen += (vc - vch)
      map.set(key, prev)
    })

    const headers = ['Cliente', 'Cantidad viajes', 'Total facturado (ARS)', 'Margen total (ARS)']
    const csvRows = Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map(v => [v.cliente, v.viajes, v.total, v.margen])

    csv = buildCSV(headers, csvRows)
  }

  // 8) responder como “archivo descargable”
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
}
