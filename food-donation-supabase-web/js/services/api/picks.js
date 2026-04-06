import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";

export async function fefoCandidates(productId) {
  const { data, error } = await supabase
    .from("tblDonationLot")
    .select("LotID, ProductID, QuantityUnits, UnitWeightKg, ExpiryDate, Status")
    .eq("ProductID", productId)
    .in("Status", ["Received", "Stored"])
    .order("ExpiryDate", { ascending: true });
  if (error) throw error;

  const lotIds = (data || []).map((r) => r.LotID);
  if (!lotIds.length) return [];
  const { data: inv } = await supabase
    .from("tblInventory")
    .select("InventoryID, LotID, ZoneID, OnHandUnits, OnHandKg")
    .in("LotID", lotIds)
    .gt("OnHandUnits", 0);
  const invByLot = new Map((inv || []).map((r) => [r.LotID, r]));
  return (data || []).map((lot) => ({ ...lot, inventory: invByLot.get(lot.LotID) })).filter((x) => x.inventory);
}

export async function allocate({ orderLineId, inventoryId, allocUnits }) {
  const { data: inv, error: invError } = await supabase
    .from("tblInventory")
    .select("InventoryID, LotID, OnHandUnits")
    .eq("InventoryID", inventoryId)
    .single();
  if (invError) throw invError;
  if (parseNumber(allocUnits) <= 0 || parseNumber(allocUnits) > parseNumber(inv.OnHandUnits)) {
    throw new Error("Allocation units invalid or exceed inventory.");
  }

  const { data: lot, error: lotError } = await supabase
    .from("tblDonationLot")
    .select("UnitWeightKg")
    .eq("LotID", inv.LotID)
    .single();
  if (lotError) throw lotError;

  const allocKg = parseNumber(allocUnits) * parseNumber(lot.UnitWeightKg);
  const { data, error } = await supabase
    .from("tblPickAllocation")
    .insert({
      OrderLineID: orderLineId,
      InventoryID: inventoryId,
      AllocUnits: allocUnits,
      AllocKg: allocKg,
      Picked: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markPicked(allocationId) {
  const { data: allocation, error: pickErr } = await supabase
    .from("tblPickAllocation")
    .update({ Picked: true })
    .eq("AllocationID", allocationId)
    .select("AllocationID, InventoryID, AllocUnits, Picked")
    .single();
  if (pickErr) throw pickErr;

  const { data: inv, error: invError } = await supabase
    .from("tblInventory")
    .select("InventoryID, LotID, OnHandUnits")
    .eq("InventoryID", allocation.InventoryID)
    .single();
  if (invError) throw invError;

  const nextUnits = parseNumber(inv.OnHandUnits) - parseNumber(allocation.AllocUnits);
  if (nextUnits < 0) throw new Error("Pick failed: negative inventory.");

  const { data: lot, error: lotError } = await supabase
    .from("tblDonationLot")
    .select("UnitWeightKg")
    .eq("LotID", inv.LotID)
    .single();
  if (lotError) throw lotError;

  const nextKg = nextUnits * parseNumber(lot.UnitWeightKg);
  const { error: updateErr } = await supabase
    .from("tblInventory")
    .update({ OnHandUnits: nextUnits, OnHandKg: nextKg, LastUpdated: new Date().toISOString() })
    .eq("InventoryID", inv.InventoryID);
  if (updateErr) {
    await supabase.from("tblPickAllocation").update({ Picked: false }).eq("AllocationID", allocationId);
    throw updateErr;
  }
  return allocation;
}
