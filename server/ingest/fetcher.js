// A hardened HTTP fetcher for untrusted URLs.
//
//  - Every hop (including redirects) is validated before it is requested.
//  - Redirects are followed manually, capped, and re-validated each time.
//  - DNS answers are vetted at connection time (see ssrf.js makeLookup).
//  - One overall deadline covers connect, redirects and body download.
//  - The body is streamed and aborted as soon as it exceeds the size cap.
//
// Returns { status, headers, body, finalUrl, notModified }. Throws IngestError.

import { Agent, fetch } from "undici";
import { IngestError } from "./errors.js";
import { DEFAULT_ALLOWED_PORTS, isBlockedAddress, makeLookup, validateUrl } from "./ssrf.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BINARY_TYPE = /^(image|audio|video|font)\/|^application\/(pdf|zip|gzip|octet-stream|x-tar)/i;

function causeCode(err) {
  for (let e = err, i = 0; e && i < 5; e = e.cause, i++) {
    if (e.code) return e.code;
  }
  return undefined;
}

function decodeBody(buffer, contentType) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType || "")?.[1] || "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export function createSafeFetcher({
  timeoutMs = 10_000,
  maxBytes = 2 * 1024 * 1024,
  maxRedirects = 3,
  isAddressBlocked = isBlockedAddress,
  allowedPorts = DEFAULT_ALLOWED_PORTS,
  blockedHostSuffixes,
  userAgent = "IN-FORM/0.1 (personal orientation tool; feed reader)",
} = {}) {
  const agent = new Agent({
    connect: { lookup: makeLookup(isAddressBlocked), timeout: timeoutMs },
  });
  const validation = { isAddressBlocked, allowedPorts, blockedHostSuffixes };

  async function safeFetch(startUrl, { headers = {}, maxBytes: limit = maxBytes } = {}) {
    const signal = AbortSignal.timeout(timeoutMs);
    let current = validateUrl(startUrl, validation);

    try {
      for (let hop = 0; hop <= maxRedirects; hop++) {
        const res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          dispatcher: agent,
          signal,
          headers: {
            "user-agent": userAgent,
            accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
            ...headers,
          },
        });

        if (REDIRECT_STATUSES.has(res.status)) {
          await res.body?.cancel();
          const location = res.headers.get("location");
          if (!location) throw new IngestError("redirect", "Redirect without a Location header");
          if (hop === maxRedirects) throw new IngestError("redirect", "Too many redirects");
          let next;
          try {
            next = new URL(location, current);
          } catch {
            throw new IngestError("redirect", "Redirect to an invalid URL");
          }
          current = validateUrl(next.href, validation);
          continue;
        }

        const responseHeaders = Object.fromEntries(res.headers);

        if (res.status === 304) {
          await res.body?.cancel();
          return { status: 304, headers: responseHeaders, body: "", finalUrl: current.href, notModified: true };
        }
        if (res.status < 200 || res.status >= 300) {
          await res.body?.cancel();
          throw new IngestError("http", `HTTP ${res.status}`, { status: res.status });
        }

        const contentType = responseHeaders["content-type"] || "";
        if (BINARY_TYPE.test(contentType)) {
          await res.body?.cancel();
          throw new IngestError("content_type", `Unsupported content type: ${contentType.split(";")[0]}`);
        }
        const declared = Number(responseHeaders["content-length"]);
        if (Number.isFinite(declared) && declared > limit) {
          await res.body?.cancel();
          throw new IngestError("too_large", "Response is larger than the size limit");
        }

        const chunks = [];
        let received = 0;
        if (res.body) {
          for await (const chunk of res.body) {
            received += chunk.length;
            if (received > limit) {
              // Throwing out of for-await cancels the underlying stream; calling
              // cancel() here would fail because the iterator holds the lock.
              throw new IngestError("too_large", "Response is larger than the size limit");
            }
            chunks.push(chunk);
          }
        }
        return {
          status: res.status,
          headers: responseHeaders,
          body: decodeBody(Buffer.concat(chunks), contentType),
          finalUrl: current.href,
          notModified: false,
        };
      }
      throw new IngestError("redirect", "Too many redirects");
    } catch (err) {
      if (err instanceof IngestError) throw err;
      if (err?.name === "TimeoutError" || err?.name === "AbortError" || causeCode(err) === "UND_ERR_CONNECT_TIMEOUT") {
        throw new IngestError("timeout", "Request timed out");
      }
      if (causeCode(err) === "ESSRF_BLOCKED") {
        throw new IngestError("blocked", "Address is not allowed");
      }
      throw new IngestError("network", causeCode(err) || err?.message || "Network error");
    }
  }

  safeFetch.close = () => agent.close();
  return safeFetch;
}
