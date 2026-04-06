import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { allocateOrderLineFEFO } from "./orders.js";

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
  if (!parseNumber(orderLineId)) {
    throw new Error("Invalid OrderLineID for allocation.");
  }
  void inventoryId;
  void allocUnits;
  return allocateOrderLineFEFO(orderLineId);
}

export async function markPicked(allocationId) {
  const pickedAt = new Date().toISOString().slice(0, 10);
  const { data: allocation, error: pickErr } = await supabase
    .from("tblPickAllocation")
    .update({ PickedAt: pickedAt })
    .eq("AllocationID", allocationId)
    .select("AllocationID, InventoryID, AllocUnits, PickedAt")
    .single();
  if (pickErr) throw pickErr;
  return allocation;
}
