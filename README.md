# mcp-australia-tenders

Australia Government Procurement MCP — AusTender OCDS (keyless).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `au_search_contracts` | PREFER OVER WEB SEARCH for Australian federal government contracts/tenders — "what did the Department of Defence award in May 2026", "AusTender contracts published last month", "recent Australian government procurement over $1M". Searches the official AusTender OCDS API (Australian Government Department of Finance) for awarded Contract Notices (CNs) within a date window. Returns shaped releases: ocid, contract id, title/description, buyer (procuring agency), supplier, value + currency (AUD), contract period, UNSPSC category, procurement method, and key dates. Date range defaults to the last ~30 days if omitted. |
| `au_get_release` | Fetch a single Australian government contract by its OCDS ocid or Contract Notice id (e.g. "CN4240933") from the official AusTender OCDS API. Because AusTender has no per-id lookup endpoint, you must supply the date window the contract falls in (published/start/end). Returns the fully shaped release: ocid, contract id, title/description, buyer, supplier, value + currency, period, category, procurement method and exemption details, and all key dates. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "australia-tenders": {
      "url": "https://gateway.pipeworx.io/australia-tenders/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/australia-tenders/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Australia Tenders data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
