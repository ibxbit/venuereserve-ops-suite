export const roles = {
  MEMBER: "member",
  FRONT_DESK: "front-desk",
  MANAGER: "manager",
  MODERATOR: "moderator",
  AUDITOR: "auditor",
};

export const allRoles = Object.values(roles);

const rolePermissionMatrix = {
  [roles.MEMBER]: [
    "resources.read",
    "reservations.read",
    "reservations.write",
    "orders.read",
    "orders.write",
    "refunds.read",
    "community.read",
    "community.write",
    "community.report",
  ],
  [roles.FRONT_DESK]: [
    "users.read",
    "users.write",
    "resources.read",
    "reservations.read",
    "reservations.write",
    "orders.read",
    "orders.write",
    "refunds.read",
    "refunds.write",
    "community.read",
    "community.report",
  ],
  [roles.MANAGER]: [
    "users.read",
    "users.write",
    "resources.read",
    "resources.write",
    "reservations.read",
    "reservations.write",
    "orders.read",
    "orders.write",
    "refunds.read",
    "refunds.write",
    "audit.read",
    "reports.financial",
    "reports.security",
    "reports.community",
    "community.read",
    "community.write",
    "community.report",
    "community.moderate",
  ],
  [roles.MODERATOR]: [
    "users.read",
    "resources.read",
    "reservations.read",
    "orders.read",
    "refunds.read",
    "reports.community",
    "community.read",
    "community.write",
    "community.report",
    "community.moderate",
  ],
  [roles.AUDITOR]: [
    "orders.read",
    "refunds.read",
    "audit.read",
    "reports.financial",
    "reports.security",
    "community.read",
  ],
};

const roleDashboards = {
  [roles.MEMBER]: {
    title: "Member Dashboard",
    highlights: [
      "Book classes and sessions",
      "Track purchases and request refunds",
      "View personal reservation activity",
    ],
  },
  [roles.FRONT_DESK]: {
    title: "Front Desk Dashboard",
    highlights: [
      "Manage check-ins and walk-ins",
      "Process transactions and booking changes",
      "Assist members with account updates",
    ],
  },
  [roles.MANAGER]: {
    title: "Studio Manager Dashboard",
    highlights: [
      "Configure operating policies and resources",
      "Approve reservation and refund exceptions",
      "Monitor financial and security health",
    ],
  },
  [roles.MODERATOR]: {
    title: "Moderator Dashboard",
    highlights: [
      "Oversee community activity patterns",
      "Review flagged activity snapshots",
      "Coordinate with managers on policy issues",
    ],
  },
  [roles.AUDITOR]: {
    title: "Auditor Dashboard",
    highlights: [
      "Inspect financial transactions",
      "Review security-related audit trails",
      "Produce compliance and integrity findings",
    ],
  },
};

export function normalizeRole(role) {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (!allRoles.includes(normalized)) {
    return roles.MEMBER;
  }
  return normalized;
}

export function getPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);
  return rolePermissionMatrix[normalizedRole] || [];
}

export function hasPermission(role, permission) {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

export function getDashboardForRole(role) {
  const normalizedRole = normalizeRole(role);
  return roleDashboards[normalizedRole] || roleDashboards[roles.MEMBER];
}

export function isManagerRole(role) {
  return normalizeRole(role) === roles.MANAGER;
}
