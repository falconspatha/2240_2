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

export async function receiveLot(payload) {
  const today = new Date().toISOString().slice(0, 10);
  const donorId = parseNumber(payload?.DonorID);
  const productId = parseNumber(payload?.ProductID);
  const qtyUnits = parseNumber(payload?.QuantityUnits);
  const unitWeightKg = parseNumber(payload?.UnitWeightKg);
  const lotCode = `LOT-${today.replaceAll("-", "")}-${donorId || 0}-${productId || 0}-${Date.now().toString().slice(-5)}`;
  const insertPayload = {
    ...payload,
    DonorID: donorId,
    ProductID: productId,
    QuantityUnits: qtyUnits,
    UnitWeightKg: unitWeightKg,
    TotalWeightKg: Number((qtyUnits * unitWeightKg).toFixed(2)),
    LotCode: payload?.LotCode || lotCode,
    ReceivedDate: today,
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
