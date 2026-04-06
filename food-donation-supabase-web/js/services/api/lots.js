import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { withMultiSearch, withFilters, withSort, withDateRange } from "../queries.js";

const SEARCH_COLUMNS = ["Status", "TempRequirement"];

export async function listLots({ search = "", filters = {}, sort = "ReceivedDate", sortDir = "desc", fromDate = "", toDate = "", nearExpiryDays } = {}) {
  let query = supabase
    .from("tblDonationLot")
    .select(
      "LotID, DonorID, ProductID, QuantityUnits, UnitWeightKg, ExpiryDate, ReceivedDate, TempRequirement, StoredZoneID, Status, tblDonor:DonorID(DonorName), tblProduct:ProductID(ProductName)",
    );
  query = withMultiSearch(query, SEARCH_COLUMNS, search);
  query = withFilters(query, filters);
  query = withDateRange(query, "ReceivedDate", fromDate || null, toDate || null);
  if (nearExpiryDays) {
    const from = new Date().toISOString().slice(0, 10);
    const toNear = new Date(Date.now() + nearExpiryDays * 86400000).toISOString().slice(0, 10);
    query = query.gte("ExpiryDate", from).lte("ExpiryDate", toNear);
  }
  query = withSort(query, sort, sortDir);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function pickAvailableZoneId(tempRequirement, incomingKg) {
  const { data: zones, error: zoneError } = await supabase
    .from("tblStorageZone")
    .select("ZoneID, ZoneName, TempBand, CapacityKg");
  if (zoneError) throw zoneError;

  const { data: inventory, error: inventoryError } = await supabase
    .from("tblInventory")
    .select("ZoneID, OnHandKg");
  if (inventoryError) throw inventoryError;

  const normalizedTemp = String(tempRequirement || "").trim().toLowerCase();
  const matching = (zones || []).filter((zone) => String(zone.TempBand || "").trim().toLowerCase() === normalizedTemp);
  if (!matching.length) {
    throw new Error(`No storage zone found for temperature: ${tempRequirement}`);
  }

  const usedByZone = new Map();
  (inventory || []).forEach((row) => {
    const current = usedByZone.get(row.ZoneID) || 0;
    usedByZone.set(row.ZoneID, current + Number(row.OnHandKg || 0));
  });

  const withCapacity = matching
    .map((zone) => {
      const usedKg = Number(usedByZone.get(zone.ZoneID) || 0);
      const capacityKg = Number(zone.CapacityKg || 0);
      const freeKg = capacityKg - usedKg;
      return { ...zone, freeKg };
    })
    .sort((a, b) => b.freeKg - a.freeKg);

  const suitable = withCapacity.find((zone) => zone.freeKg >= Number(incomingKg || 0));
  if (suitable) return suitable.ZoneID;

  const fallback = withCapacity[0];
  if (fallback) return fallback.ZoneID;
  throw new Error("No storage zone available.");
}

export async function receiveLot(payload) {
  const today = new Date().toISOString().slice(0, 10);
  const donorId = parseNumber(payload?.DonorID);
  const productId = parseNumber(payload?.ProductID);
  const qtyUnits = parseNumber(payload?.QuantityUnits);
  const unitWeightKg = parseNumber(payload?.UnitWeightKg);
  const totalWeightKg = Number((qtyUnits * unitWeightKg).toFixed(2));
  const tempRequirement = payload?.TempRequirement;
  const autoZoneId = payload?.StoredZoneID ? parseNumber(payload.StoredZoneID) : await pickAvailableZoneId(tempRequirement, totalWeightKg);
  const lotCode = `LOT-${today.replaceAll("-", "")}-${donorId || 0}-${productId || 0}-${Date.now().toString().slice(-5)}`;
  const insertPayload = {
    ...payload,
    DonorID: donorId,
    ProductID: productId,
    QuantityUnits: qtyUnits,
    UnitWeightKg: unitWeightKg,
    TotalWeightKg: totalWeightKg,
    LotCode: payload?.LotCode || lotCode,
    ReceivedDate: today,
    TempRequirement: tempRequirement,
    StoredZoneID: autoZoneId,
    SuggestedZoneID: String(payload?.SuggestedZoneID || autoZoneId),
    Status: payload?.Status || "Received",
  };
  const { data, error } = await supabase.from("tblDonationLot").insert(insertPayload).select().single();
  if (error) throw error;
  return data;
}

export async function putToZone({ lotId, zoneId, units }) {
  const { data: lot, error: lotError } = await supabase
    .from("tblDonationLot")
    .select("LotID, UnitWeightKg")
    .eq("LotID", lotId)
    .single();
  if (lotError) throw lotError;

  const onHandKg = parseNumber(units) * parseNumber(lot.UnitWeightKg);
  const payload = {
    LotID: lotId,
    ZoneID: zoneId,
    OnHandUnits: units,
    OnHandKg: onHandKg,
    LastUpdated: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("tblInventory")
    .upsert(payload, { onConflict: "LotID,ZoneID" })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("tblDonationLot").update({ StoredZoneID: zoneId, Status: "Stored" }).eq("LotID", lotId);
  return data;
}
