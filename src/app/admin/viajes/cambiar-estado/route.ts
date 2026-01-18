import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL) return bad('Falta NEXT_PUBLIC_SUPABASE_URL en .env.local', 500)
    if (!SERVICE_KEY) return bad('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local', 500)

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    })

    const body = await req.json().catch(() => null)
    const viajeId = body?.viajeId as string | undefined
    const nuevoEstado = body?.nuevoEstado as string | undefined

    if (!viajeId || !nuevoEstado) {
      return bad('Datos incompletos (viajeId/nuevoEstado).', 400)
    }

    const estadosValidos = ['pendiente', 'aprobado', 'facturado', 'pagado', 'rechazado']
    if (!estadosValidos.includes(nuevoEstado)) {
      return bad('Estado inválido.', 400)
    }

    // 1) Traer viaje para validar reglas
    const { data: viaje, error: e1 } = await supabaseAdmin
      .from('viajes')
      .select('id, estado, cliente_id, valor_cliente_snapshot, valor_chofer_snapshot')
      .eq('id', viajeId)
      .single()

    if (e1 || !viaje) {
      return bad(e1?.message ?? 'Viaje no encontrado.', 404)
    }

    // 2) Bloqueo de “facturar” si falta cliente o snapshots
    if (nuevoEstado === 'facturado') {
      if (
        !viaje.cliente_id ||
        viaje.valor_cliente_snapshot == null ||
        viaje.valor_chofer_snapshot == null
      ) {
        return bad('Para facturar necesitás asignar cliente y tarifa (snapshots).', 400)
      }
    }

    // 3) Update
    const { data: updated, error: e2 } = await supabaseAdmin
      .from('viajes')
      .update({
        estado: nuevoEstado,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', viajeId)
      .select('id, estado, actualizado_en')
      .single()

    if (e2) {
      return bad(e2.message, 400)
    }

    return NextResponse.json({ ok: true, viaje: updated })
  } catch (err: any) {
    // esto te sirve para ver el error real
    return NextResponse.json(
      { error: err?.message ?? 'Error cambiando estado' },
      { status: 500 }
    )
  }
}
