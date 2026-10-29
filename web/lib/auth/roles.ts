export function hasAdminRole(role: string | null | undefined): boolean {
  return role === "system_admin";
}
