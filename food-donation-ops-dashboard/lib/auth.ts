import { supabaseServer } from "./supabase/server";

export async function getUser() {
  const supabase = supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export function getUserRole(user: { app_metadata?: { role?: string }; user_metadata?: { role?: string } } | null) {
  return user?.app_metadata?.role || user?.user_metadata?.role || "user";
}

export async function requireAdmin() {
  const user = await requireUser();
  const role = getUserRole(user);
  if (role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}
