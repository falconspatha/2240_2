import { supabase } from "../supabaseClient.js";
import { paginationRange, withMultiSearch, withFilters, withSort } from "../queries.js";

const SEARCH_COLUMNS = ["BeneficiaryName", "ContactName", "District", "Phone"];

export async function listBeneficiaries({ search = "", page = 1, size = 10, sort = "CreatedAt", sortDir = "desc", filters = {} } = {}) {
  const { from, to } = paginationRange(page, size);
  let query = supabase
    .from("tblBeneficiary")
    .select(
      "BeneficiaryID, BeneficiaryName, ContactName, Phone, Address, District, Latitude, Longitude, HasColdStorage, CreatedAt",
      { count: "exact" },
    )
    .range(from, to);
  query = withMultiSearch(query, SEARCH_COLUMNS, search);
  query = withFilters(query, filters);
  query = withSort(query, sort, sortDir);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

export async function createBeneficiary(payload) {
  const { data, error } = await supabase.from("tblBeneficiary").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateBeneficiary(id, patch) {
  const { data, error } = await supabase
    .from("tblBeneficiary")
    .update(patch)
    .eq("BeneficiaryID", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBeneficiary(id) {
  const { error } = await supabase.from("tblBeneficiary").delete().eq("BeneficiaryID", id);
  if (error) throw error;
}
