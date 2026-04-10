const ALL_ROUTES = [
  "admin-workspace",
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
  "beneficiary-register",
  "beneficiary-order",
  "donor-register",
  "donor-donation",
];

export const ROLE_ACCESS = {
  "Administration staff": {
    home: "admin-workspace",
    routes: [
      "admin-workspace",
      "dashboard",
      "donors",
      "products",
      "lots",
      "storage",
      "beneficiaries",
      "orders-picking",
      "reports",
    ],
    quickActions: ["donor", "order", "lot"],
  },
  "Inventory staff": {
    home: "storage",
    routes: ["dashboard", "lots", "storage", "orders-picking", "reports"],
    quickActions: ["lot"],
  },
  Beneficiaries: {
    home: "beneficiary-register",
    routes: ["beneficiary-register", "beneficiary-order"],
    quickActions: [],
  },
  Beneficiary: {
    home: "beneficiary-register",
    routes: ["beneficiary-register", "beneficiary-order"],
    quickActions: [],
  },
  Donors: {
    home: "donor-register",
    routes: ["donor-register", "donor-donation"],
    quickActions: [],
  },
  Donor: {
    home: "donor-register",
    routes: ["donor-register", "donor-donation"],
    quickActions: [],
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
