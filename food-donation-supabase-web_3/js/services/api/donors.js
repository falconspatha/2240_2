import { supabase } from "../supabaseClient.js";
import { paginationRange, withMultiSearch, withFilters, withSort } from "../queries.js";

const SEARCH_COLUMNS = ["DonorName", "DonorType", "District", "Phone"];

export async function listDonors({ search = "", page = 1, size = 10, sort = "CreatedAt", sortDir = "desc", filters = {} } = {}) {
  const { from, to } = paginationRange(page, size);
  let query = supabase
    .from("tblDonor")
    .select("DonorID, DonorName, DonorType, District, Phone, Email, CreatedAt", { count: "exact" })
    .range(from, to);
  query = withMultiSearch(query, SEARCH_COLUMNS, search);
  query = withFilters(query, filters);
  query = withSort(query, sort, sortDir);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

export async function createDonor(payload) {
  const { data, error } = await supabase.from("tblDonor").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateDonor(id, patch) {
  const { data, error } = await supabase.from("tblDonor").update(patch).eq("DonorID", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDonor(id) {
  const { error } = await supabase.from("tblDonor").delete().eq("DonorID", id);
  if (error) throw error;
}

export async function donorStats(id) {
  const { data, error } = await supabase
    .from("tblDonationLot")
    .select("QuantityUnits, UnitWeightKg")
    .eq("DonorID", id);
  if (error) throw error;
  const totalUnits = (data || []).reduce((s, r) => s + Number(r.QuantityUnits || 0), 0);
  const totalKg = (data || []).reduce(
    (s, r) => s + Number(r.QuantityUnits || 0) * Number(r.UnitWeightKg || 0),
    0,
  );
  return { totalUnits, totalKg };
}
