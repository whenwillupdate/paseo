export interface PathBreadcrumb {
  label: string;
  path: string;
}

const HOME_ALIAS = "~";

export function normalizeBrowserPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) return HOME_ALIAS;
  if (trimmed === "/") return "/";
  if (trimmed === HOME_ALIAS || trimmed.startsWith("~/")) {
    return trimmed.replace(/\/+$/g, "") || HOME_ALIAS;
  }
  return trimmed.replace(/\/+$/g, "") || "/";
}

export function joinBrowserPath(basePath: string, childPath: string): string {
  const normalizedChild = normalizeBrowserPath(childPath);
  if (
    normalizedChild === HOME_ALIAS ||
    normalizedChild.startsWith("~/") ||
    normalizedChild.startsWith("/")
  ) {
    return normalizedChild;
  }

  const normalizedBase = normalizeBrowserPath(basePath);
  if (normalizedBase === "/") return `/${normalizedChild}`;
  if (normalizedBase === HOME_ALIAS) return `${HOME_ALIAS}/${normalizedChild}`;
  return `${normalizedBase}/${normalizedChild}`.replace(/\/+/g, "/");
}

export function parentBrowserPath(path: string): string {
  const normalized = normalizeBrowserPath(path);
  if (normalized === HOME_ALIAS || normalized === "/") return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (normalized.startsWith("~/")) {
    if (parts.length <= 1) return HOME_ALIAS;
    return `${HOME_ALIAS}/${parts.slice(1, -1).join("/")}`.replace(/\/$/g, "") || HOME_ALIAS;
  }
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
}

export function buildPathBreadcrumbs(path: string): PathBreadcrumb[] {
  const normalized = normalizeBrowserPath(path);
  if (normalized === HOME_ALIAS) {
    return [{ label: HOME_ALIAS, path: HOME_ALIAS }];
  }

  if (normalized.startsWith("~/")) {
    const parts = normalized.slice(2).split("/").filter(Boolean);
    const breadcrumbs: PathBreadcrumb[] = [{ label: HOME_ALIAS, path: HOME_ALIAS }];
    let current = HOME_ALIAS;
    for (const part of parts) {
      current = `${current}/${part}`;
      breadcrumbs.push({ label: part, path: current });
    }
    return breadcrumbs;
  }

  const parts = normalized.split("/").filter(Boolean);
  const breadcrumbs: PathBreadcrumb[] = [{ label: "/", path: "/" }];
  let current = "";
  for (const part of parts) {
    current = `${current}/${part}`;
    breadcrumbs.push({ label: part, path: current });
  }
  return breadcrumbs;
}

export function uniquedDirectoryPaths(input: { paths: string[]; cwd: string }): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawPath of input.paths) {
    const path = joinBrowserPath(input.cwd, rawPath);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}
