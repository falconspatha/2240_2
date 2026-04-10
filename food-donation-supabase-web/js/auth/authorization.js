const ALL_ROUTES = [
  "admin-landing",
  "inventory-landing",
  "beneficiary-landing",
  "donor-landing",
  "admin-workspace",
  "inventory-staff-ui",
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
  "beneficiary-order-submitted",
  "donor-register",
  "donor-donation",
];

export const ROLE_ACCESS = {
  "Administration staff": {
    home: "admin-landing",
    routes: [
      "admin-landing",
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
    ],
    quickActions: ["donor", "order", "lot"],
  },
  "Inventory staff": {
    home: "inventory-landing",
    routes: ["inventory-landing", "inventory-staff-ui"],
    quickActions: [],
  },
  Beneficiaries: {
    home: "beneficiary-landing",
    routes: ["beneficiary-landing", "beneficiary-register", "beneficiary-order", "beneficiary-order-submitted"],
    quickActions: [],
  },
  Beneficiary: {
    home: "beneficiary-landing",
    routes: ["beneficiary-landing", "beneficiary-register", "beneficiary-order", "beneficiary-order-submitted"],
    quickActions: [],
  },
  Donors: {
    home: "donor-landing",
    routes: ["donor-landing", "donor-register", "donor-donation"],
    quickActions: [],
  },
  Donor: {
    home: "donor-landing",
    routes: ["donor-landing", "donor-register", "donor-donation"],
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
