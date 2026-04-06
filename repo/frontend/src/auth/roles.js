export const roles = {
  MEMBER: "member",
  FRONT_DESK: "front-desk",
  MANAGER: "manager",
  MODERATOR: "moderator",
  AUDITOR: "auditor",
};

export const roleOptions = [
  { value: roles.MEMBER, label: "Member" },
  { value: roles.FRONT_DESK, label: "Front Desk Staff" },
  { value: roles.MANAGER, label: "Studio Manager" },
  { value: roles.MODERATOR, label: "Moderator" },
  { value: roles.AUDITOR, label: "Auditor" },
];

const rolePermissions = {
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
    "security.permissions.manage",
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

const roleStorageKey = "studio-active-role";

export function getRoleLabel(role) {
  const option = roleOptions.find((item) => item.value === role);
  return option ? option.label : "Member";
}

export function getActiveRole() {
  const value = localStorage.getItem(roleStorageKey);
  if (!value || !roleOptions.some((item) => item.value === value)) {
    return roles.MEMBER;
  }
  return value;
}

export function setActiveRole(role) {
  if (!roleOptions.some((item) => item.value === role)) return;
  localStorage.setItem(roleStorageKey, role);
}

export function getPermissionsForRole(role) {
  return rolePermissions[role] || rolePermissions[roles.MEMBER];
}

export function hasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}
