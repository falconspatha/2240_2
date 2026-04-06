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
    OrderDate: String(formData.get("orderDate") || new Date().toISOString().slice(0, 10)),
    RequiredDeliveryDate: String(formData.get("requiredDeliveryDate") || "") || null,
    Status: String(formData.get("status") || "Pending"),
    Priority: Number(formData.get("priority") || 2),
    Notes: String(formData.get("notes") || "") || null,
  };
  const { error } = await supabase.from("tblOrders").insert(payload);
  if (error) throw error;
  revalidatePath("/beneficiary/order");
}
