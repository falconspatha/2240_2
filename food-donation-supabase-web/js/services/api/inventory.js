import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { paginationRange } from "../queries.js";
import { logComputedZoneUsage } from "./capacity.js";

export async function listInventory({ search = "", zoneId, lotId, page = 1, size = 10 } = {}) {
  // fetch all for client-side search/filter, then paginate
  let query = supabase
    .from("tblInventory")
    .select("InventoryID, LotID, ZoneID, OnHandUnits, OnHandKg, LastUpdated, tblStorageZone:ZoneID(ZoneName, TempBand)")
    .order("LastUpdated", { ascending: false });
  if (zoneId) query = query.eq("ZoneID", zoneId);
  if (lotId)  query = query.eq("LotID", lotId);
  const { data, error } = await query;
  if (error) throw error;
  let rows = data || [];

  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    rows = rows.filter((r) => {
      const zoneName = (r.tblStorageZone?.ZoneName || "").toLowerCase();
      return zoneName.includes(term) || String(r.LotID || "").toLowerCase().includes(term);
    });
  }

  const total = rows.length;
  const { from, to } = paginationRange(page, size);
  return { rows: rows.slice(from, to + 1), total };
}

export async function adjustInventory({ inventoryId, deltaUnits }) {
  const { data: row, error: getError } = await supabase
    .from("tblInventory")
    .select("InventoryID, LotID, OnHandUnits")
    .eq("InventoryID", inventoryId)
    .single();
  if (getError) throw getError;

  const nextUnits = parseNumber(row.OnHandUnits) + parseNumber(deltaUnits);
  if (nextUnits < 0) throw new Error("Cannot make on-hand units negative.");

  const { data: lot, error: lotError } = await supabase
    .from("tblDonationLot")
    .select("UnitWeightKg")
    .eq("LotID", row.LotID)
    .single();
  if (lotError) throw lotError;

  const nextKg = nextUnits * parseNumber(lot.UnitWeightKg);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("tblInventory")
    .update({
      OnHandUnits: String(nextUnits),
      OnHandKg: String(Number(nextKg.toFixed(2))),
      LastUpdated: today,
    })
    .eq("InventoryID", inventoryId)
    .select()
    .single();
  if (error) throw error;
  await logComputedZoneUsage(data.ZoneID);
  return data;
}
