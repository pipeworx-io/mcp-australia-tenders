# mcp-australia-tenders

Australia Government Procurement MCP — AusTender OCDS (keyless).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Australia Tenders data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
