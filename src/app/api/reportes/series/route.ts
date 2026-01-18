import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ViajeDB = {
  creado_en: string
  estado: 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
}

export async function POST(req: Request) {
  try {
    const { mes } = await req.json()

    if (!mes) {
      return NextResponse.json({ error: 'Mes requerido (YYYY-MM)' }, { status: 400 })
    }

    const [y, m] = mes.split('-').map(Number)

    const desdeDate = new Date(y, m - 1, 1)
    const hastaDate = new Date(y, m, 0, 23, 59, 59, 999)

    const desde = desdeDate.toISOString()
    const hasta = hastaDate.toISOString()

    const { data, error } = await supabaseAdmin
      .from('viajes')
      .select('creado_en, estado, valor_cliente_snapshot, valor_chofer_snapshot')
      .gte('creado_en', desde)
      .lte('creado_en', hasta)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data ?? []) as ViajeDB[]

    const diasDelMes = new Date(y, m, 0).getDate()

    // base del mes: array día 1..N
    const base = Array.from({ length: diasDelMes }, (_, i) => ({
      day: i + 1,
      label: String(i + 1),
      facturado: 0,
      costo: 0,
      ganancia: 0,
    }))

    for (const v of rows) {
      const d = new Date(v.creado_en)
      const day = d.getDate()

      const idx = day - 1
      if (idx < 0 || idx >= base.length) continue

      // Facturado cuenta si estado facturado o pagado
      if ((v.estado === 'facturado' || v.estado === 'pagado') && v.valor_cliente_snapshot != null) {
        base[idx].facturado += Number(v.valor_cliente_snapshot)
      }

      // Costo cuenta cuando pagado (porque es "plata que ya salió")
      if (v.estado === 'pagado' && v.valor_chofer_snapshot != null) {
        base[idx].costo += Number(v.valor_chofer_snapshot)
      }
    }

    // calcular ganancia por día
    for (const r of base) {
      r.ganancia = r.facturado - r.costo
    }

    return NextResponse.json(base)
  } catch {
    return NextResponse.json(
      { error: 'Error inesperado en series diarias' },
      { status: 500 }
    )
  }
}
