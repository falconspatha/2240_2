import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { withMultiSearch } from "../queries.js";
import { logComputedZoneUsage } from "./capacity.js";

const SEARCH_COLUMNS = ["tblStorageZone.ZoneName"];

export async function listInventory({ search = "", zoneId, lotId } = {}) {
  let query = supabase
    .from("tblInventory")
    .select("InventoryID, LotID, ZoneID, OnHandUnits, OnHandKg, LastUpdated, tblStorageZone:ZoneID(ZoneName)")
    .order("LastUpdated", { ascending: false });
  if (zoneId) query = query.eq("ZoneID", zoneId);
  if (lotId) query = query.eq("LotID", lotId);
  // inventory search is done client-side on ZoneName since it's a joined field
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      const zoneName = (r.tblStorageZone?.ZoneName || "").toLowerCase();
      const lotId = String(r.LotID || "").toLowerCase();
      return zoneName.includes(term) || lotId.includes(term);
    });
  }
  return rows;
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
