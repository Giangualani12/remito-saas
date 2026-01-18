import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  nombre: string;
  email: string;
  rol: "admin" | "chofer" | "finanzas";
  password?: string;
};

function generarPasswordSimple(nombre: string) {
  const clean = (nombre || "User")
    .trim()
    .split(" ")[0]
    .slice(0, 10)
    .replace(/[^a-zA-Z0-9]/g, "");

  const year = new Date().getFullYear();
  const n = Math.floor(Math.random() * 90) + 10;
  return `${clean}${year}${n}`;
}

export async function POST(req: Request) {
  try {
    // ✅ crear el client ADENTRO del handler (esto es lo que evita el crash en build)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      return NextResponse.json(
        { error: "Falta NEXT_PUBLIC_SUPABASE_URL en Vercel" },
        { status: 500 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(url, service, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as Body;

    if (!body?.email || !body?.nombre || !body?.rol) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const password = body.password?.trim() || generarPasswordSimple(body.nombre);

    // 1) crear usuario en Auth
    const { data: created, error: errCreate } =
      await supabaseAdmin.auth.admin.createUser({
        email: body.email.trim().toLowerCase(),
        password,
        email_confirm: true,
      });

    if (errCreate || !created?.user) {
      return NextResponse.json(
        { error: errCreate?.message || "Error creando usuario" },
        { status: 500 }
      );
    }

    // 2) insertar perfil en tabla usuarios
    const { error: errPerfil } = await supabaseAdmin.from("usuarios").insert({
      id: created.user.id,
      email: body.email.trim().toLowerCase(),
      nombre: body.nombre.trim(),
      rol: body.rol,
      activo: true,
    });

    if (errPerfil) {
      return NextResponse.json({ error: errPerfil.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      userId: created.user.id,
      password_generada: password,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error inesperado" },
      { status: 500 }
    );
  }
}
