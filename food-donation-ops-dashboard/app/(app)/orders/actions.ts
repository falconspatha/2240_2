"use server";

import { supabaseServer } from "../../../lib/supabase/server";

export async function createOrder(formData: FormData) {
  const supabase = supabaseServer();
  const payload = {
    BeneficiaryID: Number(formData.get("beneficiaryId")),
    Status: "Pending",
    Priority: formData.get("priority"),
    Notes: formData.get("notes"),
  };
  const { error } = await supabase.from("tblOrders").insert(payload);
  if (error) throw error;
}

export async function addOrderLine(formData: FormData) {
  const supabase = supabaseServer();
  const payload = {
    OrderID: Number(formData.get("orderId")),
    ProductID: Number(formData.get("productId")),
    Qty_Units: Number(formData.get("qtyUnits")),
    Notes: formData.get("notes"),
  };
  const { error } = await supabase.from("tblOrderLine").insert(payload);
  if (error) throw error;
}

export async function updateOrderStatus(formData: FormData) {
  const supabase = supabaseServer();
  const orderId = Number(formData.get("orderId"));
  const status = String(formData.get("status"));
  const { error } = await supabase.from("tblOrders").update({ Status: status }).eq("OrderID", orderId);
  if (error) throw error;
}
