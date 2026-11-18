// One error type for everything the ingestion layer can fail at. `kind` is a
// stable machine-readable label that is stored in feed health and shown in the UI.
//
//   invalid_input  the user's source text is unusable
//   invalid_url    URL is malformed or uses a disallowed scheme/port/credentials
//   blocked        target resolves to a private/internal address (SSRF guard)
//   timeout        overall deadline exceeded
//   too_large      response larger than the size cap
//   http           non-2xx status
//   network        DNS/connection/TLS failure
//   redirect       too many redirects or a bad Location header
//   content_type   response is clearly not text/XML/HTML
//   parse          body could not be parsed as a feed
//   no_feed        a site was reachable but no feed could be found

export class IngestError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = "IngestError";
    this.kind = kind;
    Object.assign(this, extra);
  }
}
