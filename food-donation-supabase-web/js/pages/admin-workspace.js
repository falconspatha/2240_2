import { showToast } from "../ui/components.js";
import { supabase } from "../services/supabaseClient.js";

const WORKSPACE_MODULES = [
  { title: "Donor Management", description: "Register and maintain donor profiles.", route: "donors" },
  { title: "Product Catalog", description: "Maintain product definitions and handling requirements.", route: "products" },
  { title: "Donation Lots", description: "Receive lots and place them into storage zones.", route: "lots" },
  { title: "Storage Zones", description: "Update zone capacities and temperature bands.", route: "zones" },
  { title: "Inventory", description: "Run stock adjustments and inspect availability.", route: "inventory" },
  { title: "Beneficiaries", description: "Maintain beneficiary records and contacts.", route: "beneficiaries" },
  { title: "Orders", description: "Create demand orders and line items.", route: "orders" },
  { title: "Picking", description: "Allocate and track fulfillment picks.", route: "picking" },
  { title: "Reports", description: "Review KPI reports and export operational snapshots.", route: "reports" },
];

const DDL_RULES = [
  /^ALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^CREATE\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^DROP\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s*;?$/i,
];

function isAllowedDDL(sql) {
  return DDL_RULES.some((rule) => rule.test(sql));
}

export async function render(container) {
  container.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <h3>Admin Workspace</h3>
      </div>
      <p class="muted">Task-based control center for operational data, reporting, and controlled schema actions.</p>
      <div class="form-grid" id="workspaceCards" style="margin-top:1rem"></div>
    </section>
    <section class="card" style="margin-top:1rem">
      <div class="toolbar">
        <h3>Admin SQL Console (Controlled)</h3>
      </div>
      <p class="muted">Only DDL statements are accepted. Execution requires a protected Supabase RPC called <code>fn_admin_run_sql</code>.</p>
      <form id="ddlForm" style="display:grid;gap:.75rem;margin-top:.8rem">
        <textarea id="ddlInput" rows="5" placeholder="ALTER TABLE tblDonor ADD COLUMN Email TEXT;" style="width:100%"></textarea>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary" type="submit">Run SQL</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#workspaceCards").innerHTML = WORKSPACE_MODULES.map(
    (mod) => `
      <article class="card" style="padding:1rem">
        <h4>${mod.title}</h4>
        <p class="muted">${mod.description}</p>
        <div style="margin-top:.65rem">
          <button class="btn btn-ghost" data-route="${mod.route}">Open</button>
        </div>
      </article>
    `,
  ).join("");

  container.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = `#/${btn.dataset.route}`;
    });
  });

  container.querySelector("#ddlForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const sql = container.querySelector("#ddlInput").value.trim();
    if (!sql) return showToast("SQL is required.", "error");
    if (!isAllowedDDL(sql)) {
      showToast("Only CREATE/ALTER/DROP TABLE statements are allowed.", "error");
      return;
    }
    try {
      const { error } = await supabase.rpc("fn_admin_run_sql", { p_sql: sql });
      if (error) throw error;
      showToast("Schema statement executed.");
      container.querySelector("#ddlInput").value = "";
    } catch (error) {
      showToast(`SQL execution failed: ${error.message}`, "error");
    }
  });
}

export function destroy() {}
