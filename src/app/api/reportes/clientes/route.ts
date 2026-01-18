import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ViajeRow = {
  cliente_id: string
  estado: 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  clientes: { nombre: string } | { nombre: string }[] | null
}

type FilaInterna = {
  cliente: string
  viajes: number
  facturado: number
  pagado: number
}

export async function POST(req: Request) {
  try {
    const { mes } = await req.json()

    if (!mes) {
      return NextResponse.json({ error: 'Mes requerido (YYYY-MM)' }, { status: 400 })
    }

    const [y, m] = mes.split('-').map(Number)
    const desde = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const hasta = new Date(Date.UTC(y, m, 1)).toISOString()

    const { data, error } = await supabaseAdmin
      .from('viajes')
      .select(`
        cliente_id,
        estado,
        valor_cliente_snapshot,
        valor_chofer_snapshot,
        clientes:cliente_id ( nombre )
      `)
      .gte('creado_en', desde)
      .lt('creado_en', hasta)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data ?? []) as ViajeRow[]
    const resumen: Record<string, FilaInterna> = {}

    for (const v of rows) {
      const clienteNombre = Array.isArray(v.clientes)
        ? v.clientes[0]?.nombre
        : v.clientes?.nombre

      if (!clienteNombre) continue
      const key = v.cliente_id

      if (!resumen[key]) {
        resumen[key] = { cliente: clienteNombre, viajes: 0, facturado: 0, pagado: 0 }
      }

      resumen[key].viajes++

      // ✅ Facturado: cuando facturado o pagado
      if (
        (v.estado === 'facturado' || v.estado === 'pagado') &&
        v.valor_cliente_snapshot != null
      ) {
        resumen[key].facturado += v.valor_cliente_snapshot
      }

      // ✅ Pagado: solo cuando pagado
      if (v.estado === 'pagado' && v.valor_chofer_snapshot != null) {
        resumen[key].pagado += v.valor_chofer_snapshot
      }
    }

    const resultado = Object.values(resumen).map(r => ({
      ...r,
      ganancia: r.facturado - r.pagado,
    }))

    return NextResponse.json(resultado)
  } catch {
    return NextResponse.json(
      { error: 'Error inesperado en reporte por cliente' },
      { status: 500 }
    )
  }
}
