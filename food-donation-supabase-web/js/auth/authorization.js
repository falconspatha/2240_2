const ALL_ROUTES = [
  "dashboard",
  "donors",
  "products",
  "lots",
  "zones",
  "inventory",
  "beneficiaries",
  "orders",
  "picking",
  "reports",
];

export const ROLE_ACCESS = {
  "Administration staff": {
    home: "dashboard",
    routes: ALL_ROUTES,
    quickActions: ["donor", "order", "lot"],
  },
  "Inventory staff": {
    home: "inventory",
    routes: ["dashboard", "lots", "zones", "inventory", "picking", "reports"],
    quickActions: ["lot"],
  },
  Beneficiaries: {
    home: "orders",
    routes: ["dashboard", "orders", "reports"],
    quickActions: ["order"],
  },
  Donors: {
    home: "lots",
    routes: ["dashboard", "products", "lots", "reports"],
    quickActions: ["lot"],
  },
};

export function getRoleRoutes(role) {
  return ROLE_ACCESS[role]?.routes || ["dashboard"];
}

export function canAccessRoute(role, route) {
  return getRoleRoutes(role).includes(route);
}

export function getRoleHome(role) {
  return ROLE_ACCESS[role]?.home || "dashboard";
}

export function canUseQuickAction(role, action) {
  return (ROLE_ACCESS[role]?.quickActions || []).includes(action);
}
