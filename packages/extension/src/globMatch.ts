/**
 * Minimal glob matching for workspace-relative paths (`**`, `*`, `?`, `{a,b}`, `[…]`), used to apply
 * `files.exclude` / `search.exclude` to file-watcher events the same way `findFiles` applies them.
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches any number of folders (including none); a trailing `**` matches the rest.
        const slash = glob[i + 2] === '/';
        out += slash ? '(?:[^/]*/)*' : '.*';
        i += slash ? 2 : 1;
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      depth++;
      out += '(?:';
    } else if (c === '}' && depth > 0) {
      depth--;
      out += ')';
    } else if (c === ',' && depth > 0) out += '|';
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end < 0) out += '\\[';
      else {
        out += `[${glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else out += /[.+^$()|\\/]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${out}$`);
}

/** Whether a workspace-relative path (forward slashes) is excluded by any of the patterns. */
export function excludedBy(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => {
    const re = globToRegExp(p);
    // A folder pattern (`**/node_modules`) excludes everything inside it too.
    if (re.test(path)) return true;
    const parts = path.split('/');
    for (let n = 1; n < parts.length; n++) if (re.test(parts.slice(0, n).join('/'))) return true;
    return false;
  });
}

/** Patterns switched on (`true`) in a `files.exclude`-style object; `when` clauses are ignored. */
export function enabledPatterns(setting: Record<string, unknown> | undefined): string[] {
  return Object.entries(setting ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}
