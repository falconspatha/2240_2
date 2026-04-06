"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "../../../../lib/supabase/server";

export async function createSelfDonor(formData: FormData) {
  const supabase = supabaseServer();
  const payload = {
    Name: String(formData.get("name") || ""),
    Type: String(formData.get("type") || ""),
    Phone: String(formData.get("phone") || ""),
    Address: String(formData.get("address") || ""),
    District: String(formData.get("district") || ""),
  };
  const { error } = await supabase.from("tblDonor").insert(payload);
  if (error) throw error;
  revalidatePath("/donor/register");
}
