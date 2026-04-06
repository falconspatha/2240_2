import { supabase } from "../supabaseClient.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function logZoneUsage({ zoneId, usedKg }) {
  const { data, error } = await supabase
    .from("tblZoneCapacityLog")
    .insert({ ZoneID: zoneId, LogDate: today(), UsedKg: usedKg })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function logComputedZoneUsage(zoneId) {
  const { data: rows, error: sumError } = await supabase.from("tblInventory").select("OnHandKg").eq("ZoneID", zoneId);
  if (sumError) throw sumError;
  const usedKg = Number((rows || []).reduce((sum, row) => sum + Number(row.OnHandKg || 0), 0).toFixed(2));
  return logZoneUsage({ zoneId, usedKg });
}

export async function listZoneUsage(zoneId, rangeDays = 30) {
  const from = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
  let query = supabase.from("tblZoneCapacityLog").select("LogID, ZoneID, LogDate, UsedKg").gte("LogDate", from);
  if (zoneId) query = query.eq("ZoneID", zoneId);
  const { data, error } = await query.order("LogDate");
  if (error) throw error;
  return data || [];
}
