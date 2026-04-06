"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "../../../../lib/supabase/server";

export async function createBeneficiaryOrder(formData: FormData) {
  const beneficiaryId = Number(formData.get("beneficiaryId"));
  if (!beneficiaryId) {
    throw new Error("Beneficiary ID not found. Please register first.");
  }
  const supabase = supabaseServer();
  const payload = {
    BeneficiaryID: beneficiaryId,
    Priority: String(formData.get("priority") || "2"),
    Status: "Pending",
    Notes: String(formData.get("notes") || ""),
  };
  const { error } = await supabase.from("tblOrders").insert(payload);
  if (error) throw error;
  revalidatePath("/beneficiary/order");
}
