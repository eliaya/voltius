export interface SshHost {
  alias: string;
  hostname: string;
  user: string;
  port: number;
  identityFile?: string;
  proxyJump?: string;
}

interface HostBlock {
  patterns: string[];
  options: Partial<Omit<SshHost, "alias">>;
}

export const DEFAULT_IDENTITY_FILES = [
  "~/.ssh/id_ed25519",
  "~/.ssh/id_ecdsa",
  "~/.ssh/id_rsa",
];

export function identityFileCandidates(host: SshHost): string[] {
  return host.identityFile ? [host.identityFile] : DEFAULT_IDENTITY_FILES;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if ((ch === "'" || ch === "\"") && line[i - 1] !== "\\") {
      quote = quote === ch ? null : quote ?? ch;
    }
    if (ch === "#" && quote === null) return line.slice(0, i);
  }
  return line;
}

function splitWords(value: string): string[] {
  const words: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    words.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return words.filter(Boolean);
}

function hasWildcard(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return regex.test(value);
}

function blockMatchesAlias(block: HostBlock, alias: string): boolean {
  let matched = false;
  for (const rawPattern of block.patterns) {
    const negated = rawPattern.startsWith("!");
    const pattern = negated ? rawPattern.slice(1) : rawPattern;
    if (!pattern) continue;
    const isMatch = hasWildcard(pattern) ? globMatches(pattern, alias) : pattern === alias;
    if (isMatch && negated) return false;
    if (isMatch) matched = true;
  }
  return matched;
}

function setIfUnset<T extends keyof HostBlock["options"]>(
  target: HostBlock["options"],
  key: T,
  value: HostBlock["options"][T],
) {
  if (target[key] === undefined && value !== undefined) target[key] = value;
}

export function parseSshConfig(content: string): SshHost[] {
  const blocks: HostBlock[] = [];
  let current: HostBlock | null = null;

  for (const rawLine of content.split("\n")) {
    const line = stripComment(rawLine).trim();
    if (!line || line.startsWith("#")) continue;

    const spaceIdx = line.search(/\s/);
    if (spaceIdx === -1) continue;

    const key = line.slice(0, spaceIdx).toLowerCase();
    const value = line.slice(spaceIdx).trim();

    if (key === "host") {
      current = { patterns: splitWords(value), options: {} };
      blocks.push(current);
    } else if (current) {
      switch (key) {
        case "hostname":     current.options.hostname = splitWords(value)[0] ?? value; break;
        case "user":         current.options.user = splitWords(value)[0] ?? value; break;
        case "port":         current.options.port = parseInt(value, 10) || 22; break;
        case "identityfile": current.options.identityFile = splitWords(value)[0] ?? value; break;
        case "proxyjump":    current.options.proxyJump = splitWords(value)[0] ?? value; break;
      }
    }
  }

  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const rawPattern of block.patterns) {
      if (rawPattern.startsWith("!") || hasWildcard(rawPattern)) continue;
      if (!seen.has(rawPattern)) {
        aliases.push(rawPattern);
        seen.add(rawPattern);
      }
    }
  }

  const hosts: SshHost[] = [];
  for (const alias of aliases) {
    const options: HostBlock["options"] = {};
    for (const block of blocks) {
      if (!blockMatchesAlias(block, alias)) continue;
      setIfUnset(options, "hostname", block.options.hostname);
      setIfUnset(options, "user", block.options.user);
      setIfUnset(options, "port", block.options.port);
      setIfUnset(options, "identityFile", block.options.identityFile);
      setIfUnset(options, "proxyJump", block.options.proxyJump);
    }
    if (options.user) {
      hosts.push({
        alias,
        hostname: options.hostname ?? alias,
        user: options.user,
        port: options.port ?? 22,
        identityFile: options.identityFile,
        proxyJump: options.proxyJump,
      });
    }
  }

  return hosts;
}
