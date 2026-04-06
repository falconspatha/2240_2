"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "../../../../lib/supabase/server";

export async function createBeneficiaryOrder(formData: FormData) {
  const supabase = supabaseServer();
  const payload = {
    BeneficiaryID: Number(formData.get("beneficiaryId")),
    Priority: String(formData.get("priority") || "Normal"),
    Status: "Pending",
    Notes: String(formData.get("notes") || ""),
  };
  const { error } = await supabase.from("tblOrders").insert(payload);
  if (error) throw error;
  revalidatePath("/beneficiary/order");
}
