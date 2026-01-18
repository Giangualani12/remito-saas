import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // importante
export const dynamic = "force-dynamic"; // evita pre-render raro

type Body = {
  nombre: string;
  email: string;
  rol: "admin" | "chofer" | "finanzas";
  password?: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en Vercel");
  if (!service) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en Vercel");

  return createClient(url, service, {
    auth: { persistSession: false },
  });
}

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
    const body = (await req.json()) as Body;

    if (!body?.email || !body?.nombre || !body?.rol) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin(); // ✅ adentro SIEMPRE

    const password = body.password?.trim() || generarPasswordSimple(body.nombre);

    // 1) crear usuario auth
    const { data: created, error: errCreate } =
      await supabaseAdmin.auth.admin.createUser({
        email: body.email,
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
      email: body.email,
      nombre: body.nombre,
      rol: body.rol,
      activo: true,
    });

    if (errPerfil) {
      return NextResponse.json(
        { error: errPerfil.message },
        { status: 500 }
      );
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
