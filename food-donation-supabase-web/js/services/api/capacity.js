import { supabase } from "../supabaseClient.js";

export async function logZoneUsage({ zoneId, usedKg }) {
  const { data, error } = await supabase
    .from("tblZoneCapacityLog")
    .insert({ ZoneID: zoneId, LogDate: new Date().toISOString().slice(0, 10), UsedKg: usedKg })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listZoneUsage(zoneId, rangeDays = 30) {
  const from = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
  let query = supabase.from("tblZoneCapacityLog").select("LogID, ZoneID, LogDate, UsedKg").gte("LogDate", from);
  if (zoneId) query = query.eq("ZoneID", zoneId);
  const { data, error } = await query.order("LogDate");
  if (error) throw error;
  return data || [];
}
