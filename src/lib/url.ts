/** Prefixes a site path with the base path, e.g. url("carousel") → "/photobooks/carousel". */
export function url(
  path: string,
  base: string = import.meta.env.BASE_URL,
): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, "");
}
