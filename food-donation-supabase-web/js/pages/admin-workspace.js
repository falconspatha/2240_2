import { showToast } from "../ui/components.js";
import { supabase } from "../services/supabaseClient.js";
import { EXAMPLE_QUERIES } from "../data/exampleQueries.js";

const DDL_RULES = [
  /^ALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^CREATE\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^DROP\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s*;?$/i,
];

function isAllowedDDL(sql) {
  return DDL_RULES.some((rule) => rule.test(sql));
}

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
      <label style="display:block;margin-top:1rem;font-weight:600">Query</label>
      <textarea id="exampleSql" rows="8" style="width:100%;margin-top:.35rem;font-family:ui-monospace,monospace;font-size:.85rem" placeholder="Choose an example above, or paste a single SELECT…"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.65rem;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" id="clearExampleResult">Clear results</button>
        <button type="button" class="btn btn-primary" id="runExampleQuery">Run example query</button>
      </div>
      <div id="exampleResultWrap" style="margin-top:1rem;max-height:min(480px,60vh);overflow:auto;border:1px solid var(--border);border-radius:8px;padding:.75rem">
        <p class="muted" id="exampleResultPlaceholder">Results appear here.</p>
        <div id="exampleResultTable" style="display:none"></div>
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

  container.querySelectorAll("[data-example-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = EXAMPLE_QUERIES.find((q) => q.id === btn.dataset.exampleId);
      if (!item) return;
      exampleSql.value = item.sql;
      exampleSql.focus();
      showToast(`Loaded: ${item.label}`);
    });
  });

  container.querySelector("#clearExampleResult").addEventListener("click", () => {
    resultTable.innerHTML = "";
    setExampleResult("Results appear here.", false);
  });

  container.querySelector("#runExampleQuery").addEventListener("click", async () => {
    const sql = exampleSql.value.trim();
    if (!sql) return showToast("Enter or load a query first.", "error");
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

export function destroy() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
}
