// SSRF protection: decide whether a URL / IP address is safe to fetch from the
// server. The goal is that user-supplied sources can never be used to reach
// loopback, private networks, link-local/metadata services, or other internal
// targets.
//
// Two layers work together (see fetcher.js):
//   1. validateUrl()     - syntax, scheme, credentials, port, hostname, IP literals
//   2. makeLookup()      - runs at connection time and rejects any resolved
//                          address that is blocked. Because the check and the
//                          connection use the same DNS answer, DNS rebinding
//                          cannot swap in an internal IP after validation.

import net from "node:net";
import dns from "node:dns";
import { IngestError } from "./errors.js";

const V4_BLOCKED = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const V6_BLOCKED = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
];

const v4List = new net.BlockList();
for (const [addr, prefix] of V4_BLOCKED) v4List.addSubnet(addr, prefix, "ipv4");
const v6List = new net.BlockList();
for (const [addr, prefix] of V6_BLOCKED) v6List.addSubnet(addr, prefix, "ipv6");

// Expand any IPv6 text form into eight 16-bit numbers.
function expandIPv6(input) {
  let addr = input.split("%")[0];
  if (addr.includes(".")) {
    const lastColon = addr.lastIndexOf(":");
    const p = addr.slice(lastColon + 1).split(".").map(Number);
    const hi = ((p[0] << 8) | p[1]).toString(16);
    const lo = ((p[2] << 8) | p[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.map((g) => parseInt(g, 16));
}

// IPv6 forms that wrap an IPv4 address (mapped, compatible, NAT64, 6to4). The
// wrapped IPv4 address is what actually gets contacted, so it is what we check.
function embeddedIPv4(address) {
  const g = expandIPv6(address);
  if (g.length !== 8 || g.some(Number.isNaN)) return null;
  const v4 = (a, b) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  const zeros = (from, to) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && g[5] === 0xffff) return v4(g[6], g[7]); // ::ffff:a.b.c.d
  if (zeros(0, 6)) return v4(g[6], g[7]); // ::a.b.c.d (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return v4(g[6], g[7]); // 64:ff9b::/96
  if (g[0] === 0x2002) return v4(g[1], g[2]); // 6to4
  return null;
}

/** True when the address must NOT be contacted. Fails closed on anything odd. */
export function isBlockedAddress(address) {
  const bare = String(address).split("%")[0];
  const family = net.isIP(bare);
  if (family === 4) return v4List.check(bare, "ipv4");
  if (family === 6) {
    const inner = embeddedIPv4(bare);
    if (inner) return isBlockedAddress(inner);
    return v6List.check(bare, "ipv6");
  }
  return true;
}

export const DEFAULT_ALLOWED_PORTS = [80, 443, 8080, 8443];

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa"];

/**
 * Validate a URL before any network activity. Returns a URL object or throws
 * IngestError. `isAddressBlocked`, `allowedPorts` and `blockedHostSuffixes` are
 * injectable so tests can point at a local server; production uses defaults.
 */
export function validateUrl(
  raw,
  {
    isAddressBlocked = isBlockedAddress,
    allowedPorts = DEFAULT_ALLOWED_PORTS,
    blockedHostSuffixes = BLOCKED_HOST_SUFFIXES,
  } = {},
) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    throw new IngestError("invalid_url", "URL is missing or too long");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestError("invalid_url", "URL is not valid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestError("invalid_url", "Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new IngestError("invalid_url", "URLs with credentials are not allowed");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new IngestError("invalid_url", "URL has no host");

  if (allowedPorts) {
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (!allowedPorts.includes(port)) {
      throw new IngestError("blocked", `Port ${port} is not allowed`);
    }
  }

  // A suffix such as ".localhost" blocks both "localhost" and "x.localhost".
  const stripped = host.replace(/\.$/, "");
  if (blockedHostSuffixes.some((s) => stripped === s.slice(1) || stripped.endsWith(s))) {
    throw new IngestError("blocked", "Internal hostnames are not allowed");
  }

  // URL parsing already normalises odd IPv4 spellings (decimal, hex, octal).
  if (net.isIP(host) && isAddressBlocked(host)) {
    throw new IngestError("blocked", "Address is not allowed");
  }
  return url;
}

/**
 * dns.lookup replacement for undici's `connect.lookup`. Rejects if ANY address
 * the name resolves to is blocked, then hands the vetted addresses to the
 * socket so the connection cannot be redirected after the check.
 */
export function makeLookup(isAddressBlocked = isBlockedAddress) {
  return (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    dns.lookup(hostname, { all: true, family: options.family, hints: options.hints }, (err, addrs) => {
      if (err) return callback(err);
      const bad = addrs.find((a) => isAddressBlocked(a.address));
      if (bad) {
        const e = new Error(`Blocked address for ${hostname}`);
        e.code = "ESSRF_BLOCKED";
        return callback(e);
      }
      if (options.all) return callback(null, addrs);
      return callback(null, addrs[0].address, addrs[0].family);
    });
  };
}
