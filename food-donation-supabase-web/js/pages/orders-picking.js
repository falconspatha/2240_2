import * as ordersPage from "./orders.js";
import * as pickingPage from "./picking.js";

let childDestroy = null;

function parseTab(hash) {
  const q = hash.split("?")[1] || "";
  const params = new URLSearchParams(q);
  return params.get("tab") === "picking" ? "picking" : "orders";
}

function setHashTab(currentHash, tab) {
  const raw = currentHash.replace(/^#\/?/, "");
  const [pathOnly, qs = ""] = raw.split("?");
  const params = new URLSearchParams(qs);
  params.set("tab", tab);
  const path = pathOnly.split("?")[0] || "orders-picking";
  return `#/${path}?${params}`;
}

export async function render(container, ctx = {}) {
  const hash = ctx.hash || location.hash;
  const tab = parseTab(hash);

  container.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap;margin-bottom:.35rem">
      <div role="tablist" aria-label="Orders and picking" style="display:flex;gap:.35rem;flex-wrap:wrap">
        <button type="button" role="tab" aria-selected="${tab === "orders"}" class="btn ${tab === "orders" ? "btn-primary" : "btn-ghost"}" data-tab="orders">Orders</button>
        <button type="button" role="tab" aria-selected="${tab === "picking"}" class="btn ${tab === "picking" ? "btn-primary" : "btn-ghost"}" data-tab="picking">Picking</button>
      </div>
    </div>
    <div id="ordersPickingMount"></div>
  `;

  const mount = container.querySelector("#ordersPickingMount");

  container.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === tab) return;
      location.hash = setHashTab(location.hash, btn.dataset.tab);
    });
  });

  if (childDestroy) childDestroy();
  childDestroy = null;

  const childCtx = { ...ctx, hash };

  if (tab === "orders") {
    await ordersPage.render(mount, childCtx);
    childDestroy = ordersPage.destroy;
  } else {
    await pickingPage.render(mount, childCtx);
    childDestroy = pickingPage.destroy;
  }
}

export function destroy() {
  if (childDestroy) childDestroy();
  childDestroy = null;
}
