import { supabase } from "../supabaseClient.js";
import { withMultiSearch, withSort } from "../queries.js";

const SEARCH_COLUMNS = ["ZoneName", "TempBand"];

export async function listZones({ search = "", sort = "ZoneName", sortDir = "asc" } = {}) {
  let query = supabase
    .from("tblStorageZone")
    .select("ZoneID, ZoneName, TempBand, CapacityKg, Notes");
  query = withMultiSearch(query, SEARCH_COLUMNS, search);
  query = withSort(query, sort, sortDir);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createZone(payload) {
  const { data, error } = await supabase.from("tblStorageZone").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateZone(id, patch) {
  const { data, error } = await supabase
    .from("tblStorageZone")
    .update(patch)
    .eq("ZoneID", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteZone(id) {
  const { error } = await supabase.from("tblStorageZone").delete().eq("ZoneID", id);
  if (error) throw error;
}
