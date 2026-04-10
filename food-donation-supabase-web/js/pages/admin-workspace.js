import { showToast, confirmModal } from "../ui/components.js";
import { supabase } from "../services/supabaseClient.js";
import { store } from "../store.js";

// ── SQL history (localStorage) ──────────────────────────────────────────────
const SQL_HISTORY_KEY = "fdms_sql_history";
const MAX_HISTORY = 5;

function loadSqlHistory() {
  try { return JSON.parse(localStorage.getItem(SQL_HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveSqlHistory(history) {
  localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function pushSqlHistory(sql) {
  const history = loadSqlHistory().filter((h) => h.sql !== sql);
  history.unshift({ sql, ts: new Date().toISOString() });
  saveSqlHistory(history);
}
import { EXAMPLE_QUERIES } from "../data/exampleQueries.js";

// ── DDL guard ────────────────────────────────────────────────────────────────
const DDL_RULES = [
  /^ALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^CREATE\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^DROP\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s*;?$/i,
];

function isAllowedDDL(sql) {
  return DDL_RULES.some((r) => r.test(sql));
}

// ── Module card definitions ──────────────────────────────────────────────────
const MODULES = [
  { title: "Donor Management",  desc: "Register and maintain donor profiles.",                  route: "donors",         icon: "🤝", countKey: "donors" },
  { title: "Product Catalog",   desc: "Maintain product definitions and handling requirements.", route: "products",       icon: "📦", countKey: "products" },
  { title: "Donation Lots",     desc: "Receive lots and place them into storage zones.",         route: "lots",           icon: "🚚", countKey: "lots" },
  { title: "Storage Zones",     desc: "Update zone capacities and temperature bands.",         route: "storage",        icon: "🏭", countKey: "zones" },
  { title: "Inventory",         desc: "Run stock adjustments and inspect availability.",         route: "storage",        icon: "📋", countKey: null },
  { title: "Beneficiaries",     desc: "Maintain beneficiary records and contacts.",              route: "beneficiaries",  icon: "👥", countKey: "beneficiaries" },
  { title: "Orders",            desc: "Create demand orders and line items.",                    route: "orders-picking", icon: "🛒", countKey: "orders" },
  { title: "Picking",           desc: "Allocate and track fulfillment picks.",                   route: "orders-picking", icon: "✅", countKey: null },
  { title: "Reports",           desc: "Review KPI reports and export operational snapshots.",    route: "reports",        icon: "📊", countKey: null },
];

// ── Fetch all summary data in one pass ───────────────────────────────────────
async function fetchSummary() {
  const { data, error } = await supabase.rpc("fn_admin_summary");
  if (error) throw error;
  const s = Array.isArray(data) ? data[0] : data;

  // over-capacity zones still need per-zone detail — use fn_dashboard_zone_utilization
  const { data: zones, error: zErr } = await supabase.rpc("fn_dashboard_zone_utilization");
  if (zErr) throw zErr;

  const overCapZones = (zones || []).filter((z) =>
    z.CapacityKg && (Number(z.UsedKg) / Number(z.CapacityKg)) >= 0.9
  );

  return {
    counts: {
      donors:        Number(s.total_donors),
      products:      Number(s.total_products),
      lots:          Number(s.active_lots),
      zones:         Number(s.total_zones),
      beneficiaries: Number(s.total_beneficiaries),
      orders:        Number(s.total_orders),
    },
    alerts: {
      nearExpiry:  Number(s.near_expiry_count),
      openOrders:  Number(s.pending_orders),
      overCapZones,
    },
  };
}

// ── Render alerts bar ────────────────────────────────────────────────────────
function renderAlerts({ nearExpiry, openOrders, overCapZones }) {
  const items = [];

  // always shown, clickable
  const lotClass = nearExpiry > 0 ? "warn" : "ok";
  items.push(`<button class="badge ${lotClass}" id="alertLots" style="cursor:pointer;border:none;font:inherit">⚠️ ${nearExpiry} lot${nearExpiry !== 1 ? "s" : ""} expiring within 7 days</button>`);

  const orderClass = openOrders > 0 ? "warn" : "ok";
  items.push(`<button class="badge ${orderClass}" id="alertOrders" style="cursor:pointer;border:none;font:inherit">📋 ${openOrders} order${openOrders !== 1 ? "s" : ""} pending</button>`);

  if (overCapZones.length > 0)
    items.push(`<span class="badge warn">🏭 ${overCapZones.map((z) => z.ZoneName).join(", ")} at ≥90% capacity</span>`);

  if (nearExpiry === 0 && openOrders === 0 && overCapZones.length === 0)
    items.push(`<span class="badge ok">✅ All systems normal</span>`);

  return `<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">${items.join("")}</div>`;
}

// ── Render module cards ──────────────────────────────────────────────────────
function renderModuleCards(counts) {
  return MODULES.map((mod) => {
    const count = mod.countKey != null ? counts[mod.countKey] : null;
    const countBadge = count != null
      ? `<span class="badge" style="margin-left:auto">${count}</span>`
      : "";
    return `
      <article class="card" style="padding:1rem;display:flex;flex-direction:column;gap:.5rem">
        <div style="display:flex;align-items:center;gap:.5rem">
          <span style="font-size:1.3rem">${mod.icon}</span>
          <strong>${mod.title}</strong>
          ${countBadge}
        </div>
        <p class="muted" style="font-size:.85rem;flex:1">${mod.desc}</p>
        <div>
          <button class="btn btn-ghost" data-route="${mod.route}">Open →</button>
        </div>
      </article>`;
  }).join("");
}

// ── Render SQL history list ──────────────────────────────────────────────────
function renderHistory(container) {
  const history = loadSqlHistory();
  const list = container.querySelector("#sqlHistory");
  if (!list) return;
  if (!history.length) {
    list.innerHTML = `<p class="muted" style="font-size:.82rem">No history yet.</p>`;
    return;
  }
  list.innerHTML = history.map((h, i) => `
    <div style="display:flex;align-items:flex-start;gap:.5rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <code style="flex:1;font-size:.78rem;white-space:pre-wrap;word-break:break-all">${h.sql}</code>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;flex-shrink:0">
        <small class="muted">${new Date(h.ts).toLocaleTimeString()}</small>
        <button class="btn btn-ghost" style="font-size:.75rem;padding:.2rem .5rem" data-recall="${i}">Use</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-recall]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sql = history[Number(btn.dataset.recall)]?.sql;
      if (sql) container.querySelector("#ddlInput").value = sql;
    });
  });
}

// ── Main render ──────────────────────────────────────────────────────────────
function formatNow() {
  return new Date().toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResultTable(rows) {
  const keys = Object.keys(rows[0]);
  const head = `<thead><tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead>`;
  const body = rows
    .map(
      (row) =>
        `<tr>${keys.map((k) => `<td>${escapeHtml(row[k] === null || row[k] === undefined ? "" : String(row[k]))}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

let clockTimer;

async function runSelectRpc(sql) {
  const first = await supabase.rpc("fn_admin_run_select", { p_sql: sql });
  if (!first.error) return first;

  const message = String(first.error.message || "");
  const code = String(first.error.code || "");
  const isSignatureCacheMiss =
    code === "PGRST202" &&
    message.includes("fn_admin_run_select") &&
    message.includes("(p_sql)");

  // Backward compatibility: some DBs still define argument name as `sql`.
  if (!isSignatureCacheMiss) return first;
  return supabase.rpc("fn_admin_run_select", { sql });
}

export async function render(container) {
  const exampleButtons = EXAMPLE_QUERIES.map(
    (q) =>
      `<button type="button" class="btn btn-ghost" style="justify-content:flex-start;text-align:left" data-example-id="${q.id}">${escapeHtml(q.label)}</button>`,
  ).join("");

  container.innerHTML = `
    <div class="page-grid">

      <!-- Alerts -->
      <section class="card" id="alertsCard">
        <div class="toolbar" style="margin-bottom:.5rem">
          <h3>System Status</h3>
          <button class="btn btn-ghost" id="refreshAlerts" style="font-size:.82rem">↻ Refresh</button>
        </div>
        <div id="alertsBar"><span class="muted">Loading...</span></div>
      </section>

      <!-- Quick Actions -->
      <section class="card">
        <div class="toolbar"><h3>Quick Actions</h3></div>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">
          <button class="btn btn-primary" data-route="donors"   data-create="donor">+ New Donor</button>
          <button class="btn btn-primary" data-route="orders"   data-create="order">+ New Order</button>
          <button class="btn btn-primary" data-route="lots"     data-create="lot">+ Receive Lot</button>
          <button class="btn btn-ghost"   data-route="reports">View Reports</button>
          <button class="btn btn-ghost"   data-route="orders-picking">Go to Picking</button>
        </div>
      </section>

      <!-- Module Cards -->
      <section class="card">
        <div class="toolbar"><h3>Modules</h3></div>
        <div class="form-grid" id="moduleCards">
          <div class="muted">Loading...</div>
        </div>
      </section>

      <!-- SQL Console -->
      <section class="card">
        <div class="toolbar">
          <h3>SQL Console <small class="muted" style="font-weight:400;font-size:.8rem">(DDL only)</small></h3>
        </div>
        <p class="muted" style="font-size:.85rem;margin-bottom:.75rem">
          Accepts <code>CREATE / ALTER / DROP TABLE</code> only. Requires <code>fn_admin_run_sql</code> RPC on Supabase.
        </p>
        <div style="display:grid;grid-template-columns:1fr 220px;gap:1rem;align-items:start">
          <div style="display:grid;gap:.5rem">
            <textarea id="ddlInput" rows="5" placeholder="ALTER TABLE tblDonor ADD COLUMN Email TEXT;" style="width:100%;font-family:monospace;font-size:.85rem"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button class="btn btn-ghost" id="clearSql">Clear</button>
              <button class="btn btn-primary" id="runSql">Run SQL</button>
            </div>
            <div id="sqlResult" style="display:none;padding:.6rem;border-radius:8px;font-size:.83rem;font-family:monospace"></div>
          </div>
          <div>
            <p style="font-size:.8rem;font-weight:600;margin-bottom:.4rem">Recent History</p>
            <div id="sqlHistory"></div>
          </div>
        </div>
      </section>

    </div>
  `;

  // ── Load data ──────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const { counts, alerts } = await fetchSummary();
      container.querySelector("#alertsBar").innerHTML = renderAlerts(alerts);
      bindAlertButtons();
      container.querySelector("#moduleCards").innerHTML = renderModuleCards(counts);
      bindModuleRoutes();
    } catch (err) {
      container.querySelector("#alertsBar").innerHTML = `<span class="badge warn">Failed to load status: ${err.message}</span>`;
      container.querySelector("#moduleCards").innerHTML = renderModuleCards({});
      bindModuleRoutes();
    }
  }

  function bindAlertButtons() {
    container.querySelector("#alertLots")?.addEventListener("click", () => {
      store.contextLotsFilter = { expiryFilter: "active", sort: "ExpiryDate", sortDir: "asc" };
      location.hash = "#/lots";
    <section class="card">
      <div class="toolbar" style="flex-wrap:wrap;gap:.75rem">
        <h3>Admin SQL Console (Controlled)</h3>
        <span class="muted" id="adminClock" aria-live="polite"></span>
      </div>
      <p class="muted">DDL only below. Execution uses <code>fn_admin_run_sql</code> (admin JWT).</p>
      <form id="ddlForm" style="display:grid;gap:.75rem;margin-top:.8rem">
        <textarea id="ddlInput" rows="4" placeholder="ALTER TABLE &quot;tblDonor&quot; ADD COLUMN &quot;Extra&quot; TEXT;" style="width:100%;font-family:ui-monospace,monospace;font-size:.85rem"></textarea>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary" type="submit">Run DDL</button>
        </div>
      </form>
    </section>

    <section class="card" style="margin-top:1rem">
      <div class="toolbar">
        <h3>Example report queries</h3>
      </div>
      <p class="muted" style="margin-top:.5rem">
        Same examples as the <code>example query</code> folder (aligned to your schema). Load one, then run — read-only SELECTs use <code>fn_admin_run_select</code>.
        Apply <code>food-donation-supabase-web/sql/fn_admin_run_select.sql</code> in Supabase if the button errors.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.45rem;margin-top:.75rem">
        ${exampleButtons}
      </div>
      <div id="exampleResultWrap" style="margin-top:1rem;max-height:min(480px,60vh);overflow:auto;border:1px solid var(--border);border-radius:8px;padding:.75rem">
        <p class="muted" id="exampleResultPlaceholder">Results appear here.</p>
        <div id="exampleResultTable" style="display:none"></div>
      </div>
      <label style="display:block;margin-top:1rem;font-weight:600">Query</label>
      <textarea id="exampleSql" rows="8" style="width:100%;margin-top:.35rem;font-family:ui-monospace,monospace;font-size:.85rem" placeholder="Choose an example above, or paste a single SELECT…"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.65rem;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" id="clearExampleResult">Clear results</button>
      </div>
    </section>
  `;

  const clockEl = container.querySelector("#adminClock");
  const tick = () => {
    if (clockEl) clockEl.textContent = formatNow();
  };
  tick();
  clockTimer = setInterval(tick, 1000);

  const exampleSql = container.querySelector("#exampleSql");
  const resultPlaceholder = container.querySelector("#exampleResultPlaceholder");
  const resultTable = container.querySelector("#exampleResultTable");

  function setExampleResult(html, isTable) {
    resultPlaceholder.style.display = isTable ? "none" : "";
    resultTable.style.display = isTable ? "block" : "none";
    if (isTable) {
      resultTable.innerHTML = html;
    } else {
      resultPlaceholder.innerHTML = html;
    }
  }

  async function executeExampleQuery(sqlText) {
    const sql = sqlText.trim();
    if (!sql) {
      showToast("Enter or load a query first.", "error");
      return;
    }
    try {
      const { data, error } = await runSelectRpc(sql);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : data != null ? [data] : [];
      if (!rows.length) {
        setExampleResult('<p class="muted">No rows returned.</p>', false);
        return;
      }
      setExampleResult(renderResultTable(rows), true);
    } catch (error) {
      showToast(error.message || String(error), "error");
      setExampleResult(`<p class="muted">${escapeHtml(error.message || String(error))}</p>`, false);
    }
  }

  container.querySelectorAll("[data-example-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = EXAMPLE_QUERIES.find((q) => q.id === btn.dataset.exampleId);
      if (!item) return;
      exampleSql.value = item.sql;
      exampleSql.focus();
      showToast(`Loaded: ${item.label}`);
      await executeExampleQuery(item.sql);
    });
    container.querySelector("#alertOrders")?.addEventListener("click", () => {
      store.contextOrdersFilter = { status: "Pending" };
      location.hash = "#/orders-picking";
    });
  }

  function bindModuleRoutes() {
    container.querySelectorAll("[data-route]").forEach((btn) => {
      btn.addEventListener("click", () => {
        location.hash = `#/${btn.dataset.route}`;
        if (btn.dataset.create) {
          requestAnimationFrame(() =>
            window.dispatchEvent(new CustomEvent("quick-create", { detail: btn.dataset.create }))
          );
        }
      });
    });
  }

  await loadData();

  container.querySelector("#refreshAlerts").addEventListener("click", loadData);

  // ── SQL console ────────────────────────────────────────────────────────────
  renderHistory(container);

  const resultEl = container.querySelector("#sqlResult");

  function showSqlResult(msg, ok) {
    resultEl.style.display = "block";
    resultEl.style.background = ok
      ? "color-mix(in oklab, var(--primary), transparent 88%)"
      : "color-mix(in oklab, var(--danger), transparent 88%)";
    resultEl.textContent = msg;
  }

  container.querySelector("#clearSql").addEventListener("click", () => {
    container.querySelector("#ddlInput").value = "";
    resultEl.style.display = "none";
  });

  container.querySelector("#runSql").addEventListener("click", () => {
  container.querySelector("#clearExampleResult").addEventListener("click", () => {
    resultTable.innerHTML = "";
    setExampleResult("Results appear here.", false);
  });

  container.querySelector("#ddlForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const sql = container.querySelector("#ddlInput").value.trim();
    if (!sql) return showToast("SQL is required.", "error");
    if (!isAllowedDDL(sql)) {
      showSqlResult("Only CREATE / ALTER / DROP TABLE statements are allowed.", false);
      return;
    }
    confirmModal({
      title: "Execute DDL Statement",
      message: `This will modify the database schema. Are you sure?<br><br><code style="font-size:.82rem">${sql}</code>`,
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc("fn_admin_run_sql", { p_sql: sql });
          if (error) throw error;
          pushSqlHistory(sql);
          renderHistory(container);
          showSqlResult("✓ Statement executed successfully.", true);
          showToast("Schema statement executed.");
          container.querySelector("#ddlInput").value = "";
        } catch (err) {
          showSqlResult(`✗ ${err.message}`, false);
          showToast(`SQL failed: ${err.message}`, "error");
        }
      },
    });
  });
}

export function destroy() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
}
