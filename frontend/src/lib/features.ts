/**
 * Pages that are temporarily hidden. They are removed from the sidebar and any
 * visit is redirected to HOME_PATH. The pages themselves are kept: to bring one
 * back, delete it from this list.
 */
export const HIDDEN_PATHS: string[] = ["/dashboard", "/admin/audit"];

/** Where users land after signing in, and where hidden pages redirect to. */
export const HOME_PATH = "/leaves";

export function isHidden(pathname: string): boolean {
  return HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
