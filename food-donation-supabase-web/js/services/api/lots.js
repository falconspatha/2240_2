import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { withMultiSearch, withFilters, withSort, withDateRange } from "../queries.js";

const SEARCH_COLUMNS = ["Status", "TempRequirement"];
const today = () => new Date().toISOString().slice(0, 10);

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

function lotDatePart(dateText) {
  const date = new Date(dateText || new Date().toISOString().slice(0, 10));
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${yy}${mm}${dd}`;
}

async function generateLotCode(receivedDate) {
  const datePart = lotDatePart(receivedDate);
  const prefix = `LOT${datePart}-`;
  const { data, error } = await supabase
    .from("tblDonationLot")
    .select("LotCode")
    .like("LotCode", `${prefix}%`)
    .order("LotCode", { ascending: false })
    .limit(1);
  if (error) throw error;

  let nextNumber = 1;
  const latest = data?.[0]?.LotCode;
  if (latest) {
    const match = String(latest).match(/-(\d{5})$/);
    if (match) {
      nextNumber = Number(match[1]) + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}

async function writeZoneCapacityLog(zoneId) {
  if (!zoneId) return;
  const { data: rows, error: sumError } = await supabase.from("tblInventory").select("OnHandKg").eq("ZoneID", zoneId);
  if (sumError) throw sumError;
  const usedKg = (rows || []).reduce((sum, row) => sum + Number(row.OnHandKg || 0), 0);
  const { error: logError } = await supabase.from("tblZoneCapacityLog").insert({
    ZoneID: zoneId,
    LogDate: today(),
    UsedKg: Number(usedKg.toFixed(2)),
  });
  if (logError) throw logError;
}

export async function receiveLot(payload) {
  const receivedOn = today();
  const donorId = parseNumber(payload?.DonorID);
  const productId = parseNumber(payload?.ProductID);
  const qtyUnits = parseNumber(payload?.QuantityUnits);
  const unitWeightKg = parseNumber(payload?.UnitWeightKg);
  const totalWeightKg = Number((qtyUnits * unitWeightKg).toFixed(2));
  const tempRequirement = payload?.TempRequirement;
  const autoZoneId = payload?.StoredZoneID ? parseNumber(payload.StoredZoneID) : await pickAvailableZoneId(tempRequirement, totalWeightKg);
  const receivedDate = receivedOn;
  const lotCode = payload?.LotCode || (await generateLotCode(receivedDate));
  const insertPayload = {
    ...payload,
    DonorID: donorId,
    ProductID: productId,
    QuantityUnits: qtyUnits,
    UnitWeightKg: unitWeightKg,
    TotalWeightKg: totalWeightKg,
    LotCode: lotCode,
    ReceivedDate: receivedDate,
    TempRequirement: tempRequirement,
    StoredZoneID: autoZoneId,
    SuggestedZoneID: String(payload?.SuggestedZoneID || autoZoneId),
    Status: payload?.Status || "Received",
  };
  const { data, error } = await supabase.from("tblDonationLot").insert(insertPayload).select().single();
  if (error) throw error;

  const inventoryPayload = {
    LotID: data.LotID,
    ZoneID: autoZoneId,
    OnHandUnits: String(qtyUnits),
    OnHandKg: String(totalWeightKg),
    LastUpdated: receivedOn,
  };
  const { error: inventoryError } = await supabase.from("tblInventory").insert(inventoryPayload);
  if (inventoryError) throw inventoryError;
  await writeZoneCapacityLog(autoZoneId);

  return data;
}

export async function putToZone({ lotId, zoneId, units }) {
  const { data: lot, error: lotError } = await supabase
    .from("tblDonationLot")
    .select("LotID, UnitWeightKg, StoredZoneID")
    .eq("LotID", lotId)
    .single();
  if (lotError) throw lotError;

  const onHandKg = parseNumber(units) * parseNumber(lot.UnitWeightKg);
  const payload = {
    LotID: lotId,
    ZoneID: zoneId,
    OnHandUnits: units,
    OnHandKg: onHandKg,
    LastUpdated: today(),
  };

  const { data, error } = await supabase
    .from("tblInventory")
    .upsert(payload, { onConflict: "LotID,ZoneID" })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("tblDonationLot").update({ StoredZoneID: zoneId, Status: "Stored" }).eq("LotID", lotId);
  await writeZoneCapacityLog(zoneId);
  if (lot.StoredZoneID && String(lot.StoredZoneID) !== String(zoneId)) {
    await writeZoneCapacityLog(lot.StoredZoneID);
  }
  return data;
}
