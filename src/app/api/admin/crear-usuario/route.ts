import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Body = {
  nombre: string
  email: string
  rol: 'admin' | 'chofer' | 'finanzas'
  password?: string
}

function generarPasswordSimple(nombre: string) {
  const clean = (nombre || 'User')
    .trim()
    .split(' ')[0]
    .slice(0, 10)
    .replace(/[^a-zA-Z0-9]/g, '')

  const year = new Date().getFullYear()
  const n = Math.floor(Math.random() * 90) + 10
  return `${clean}${year}!${n}`
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body

    const nombre = (body.nombre ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const rol = (body.rol ?? 'chofer').toString().trim().toLowerCase() as Body['rol']
    const password = (body.password ?? '').trim() || generarPasswordSimple(nombre)

    if (!nombre || !email) {
      return NextResponse.json({ error: 'Faltan datos (nombre/email)' }, { status: 400 })
    }

    // 1) Crear usuario en AUTH
    const { data: created, error: eCreate } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (eCreate || !created.user) {
      return NextResponse.json(
        { error: eCreate?.message ?? 'Error creando auth user' },
        { status: 400 }
      )
    }

    const userId = created.user.id

    // 2) Perfil (upsert por si trigger ya lo creó)
    const { error: ePerfil } = await supabaseAdmin
      .from('usuarios')
      .upsert(
        { id: userId, email, nombre, rol, activo: true },
        { onConflict: 'id' }
      )

    if (ePerfil) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: ePerfil.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, userId, password })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Error inesperado' },
      { status: 500 }
    )
  }
}
