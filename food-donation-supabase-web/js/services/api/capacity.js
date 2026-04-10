import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";

export async function logComputedZoneUsage(zoneId) {
  const { error } = await supabase.rpc("fn_log_computed_zone_usage", {
    p_zone_id: Number(zoneId),
  });
  const targetZoneId = parseNumber(zoneId);
  if (!targetZoneId) return null;
  const { data: rows, error: sumError } = await supabase.from("tblInventory").select("OnHandKg").eq("ZoneID", targetZoneId);
  if (sumError) throw sumError;
  const usedKg = Number((rows || []).reduce((sum, row) => sum + Number(row.OnHandKg || 0), 0).toFixed(2));
  return logZoneUsage({ zoneId: targetZoneId, usedKg });
}

export async function listZoneUsage(zoneId, rangeDays = 30) {
  const from = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
  let query = supabase.from("tblZoneCapacityLog").select("LogID, ZoneID, LogDate, UsedKg").gte("LogDate", from);
  if (zoneId) query = query.eq("ZoneID", zoneId);
  const { data, error } = await query.order("LogDate");
  if (error) throw error;
}
