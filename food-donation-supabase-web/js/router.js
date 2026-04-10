import { STRINGS } from "./ui/strings.js";
import { getSession } from "./auth/session.js";
import { canAccessRoute, getRoleHome, getRoleRoutes } from "./auth/authorization.js";

const routes = {
  login: () => import("./pages/login.js"),
  "admin-landing": () => import("./pages/admin-landing.js"),
  "inventory-landing": () => import("./pages/inventory-landing.js"),
  "beneficiary-landing": () => import("./pages/beneficiary-landing.js"),
  "donor-landing": () => import("./pages/donor-landing.js"),
  "admin-workspace": () => import("./pages/admin-workspace.js"),
  "inventory-staff-ui": () => import("./pages/inventory-staff-ui.js"),
  dashboard: () => import("./pages/dashboard.js"),
  donors: () => import("./pages/donors.js"),
  products: () => import("./pages/products.js"),
  lots: () => import("./pages/lots.js"),
  "zones-inventory": () => import("./pages/zones-inventory.js"),
  beneficiaries: () => import("./pages/beneficiaries.js"),
  "orders-picking": () => import("./pages/orders-picking.js"),
  reports: () => import("./pages/reports.js"),
  "beneficiary-register": () => import("./pages/beneficiary-register.js"),
  "beneficiary-order": () => import("./pages/beneficiary-order.js"),
  "beneficiary-delivery-status": () => import("./pages/beneficiary-delivery-status.js"),
  "beneficiary-order-submitted": () => import("./pages/beneficiary-order-submitted.js"),
  "donor-register": () => import("./pages/donor-register.js"),
  "donor-donation": () => import("./pages/donor-donation.js"),
};

let currentPage;
const PUBLIC_ROUTES = new Set(["login"]);

function tryRedirectLegacyMergedRoutes(session, pathPart) {
  if (!pathPart) return false;
  const allowed = getRoleRoutes(session.role);
  const queryPart = location.hash.includes("?") ? location.hash.slice(location.hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(queryPart);

  if (pathPart === "orders" && allowed.includes("orders-picking")) {
    params.delete("tab");
    const q = params.toString();
    location.hash = `#/orders-picking${q ? `?${q}` : ""}`;
    return true;
  }
  if (pathPart === "picking" && allowed.includes("orders-picking")) {
    params.set("tab", "picking");
    location.hash = `#/orders-picking?${params}`;
    return true;
  }
  if (pathPart === "zones" && allowed.includes("zones-inventory")) {
    params.delete("tab");
    const q = params.toString();
    location.hash = `#/zones-inventory${q ? `?${q}` : ""}`;
    return true;
  }
  if (pathPart === "inventory" && allowed.includes("zones-inventory")) {
    params.set("tab", "inventory");
    location.hash = `#/zones-inventory?${params}`;
    return true;
  }
  return false;
}

export async function navigate() {
  const app = document.getElementById("app");
  const session = getSession();
  const hashBody = location.hash.replace(/^#\/?/, "");
  const pathPart = hashBody.split("?")[0];
  if (session && pathPart && tryRedirectLegacyMergedRoutes(session, pathPart)) {
    return;
  }
  const requestedKey = (pathPart || (session ? getRoleHome(session.role) : "dashboard")).split("?")[0];
  const pageKey = !session && !PUBLIC_ROUTES.has(requestedKey) ? "login" : requestedKey;
  let safeKey = routes[pageKey] ? pageKey : session ? getRoleHome(session.role) : "login";
  if (session && safeKey !== "login" && !canAccessRoute(session.role, safeKey)) {
    safeKey = getRoleHome(session.role);
    location.hash = `#/${safeKey}`;
    return;
  }
  if (session && safeKey === "login") {
    location.hash = `#/${getRoleHome(session.role)}`;
    return;
  }
  const routeLoader = routes[safeKey];
  document.getElementById("pageTitle").textContent =
    safeKey === "login" ? "Login" : STRINGS.routes.find(([key]) => key === safeKey)?.[1] || "Dashboard";

  if (currentPage?.destroy) currentPage.destroy();
  app.classList.remove("route-enter");
  void app.offsetWidth;
  app.classList.add("route-enter");

  try {
    const mod = await routeLoader();
    currentPage = mod;
    await mod.render(app, { hash: location.hash });
    app.focus();
  } catch (error) {
    app.innerHTML = `<div class="card"><h3>Failed to load page</h3><p class="muted">${error.message}</p></div>`;
  }
}
