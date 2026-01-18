import { supabase } from "./supabase";

type UsuarioRolRow = {
  rol: "admin" | "chofer" | "finanzas";
};

export async function getUserRole() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<UsuarioRolRow>();

  if (error) return null;

  return data?.rol ?? null;
}
