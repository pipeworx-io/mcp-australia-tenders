interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Australia Government Procurement MCP — AusTender OCDS (keyless).
 *
 * Wraps the public, no-auth AusTender OCDS API at https://api.tenders.gov.au/ocds,
 * published by the Australian Government Department of Finance. Covers awarded
 * contract notices (Contract Notices / CNs) from AusTender, the central portal
 * for Australian federal government procurement.
 *
 * The only public endpoint is date-window search:
 *   /ocds/findByDates/{dateType}/{dateFrom}/{dateTo}
 * where dateType ∈ {contractPublished, contractLastModified, contractStart,
 * contractEnd} and dates are ISO-8601 UTC (e.g. 2026-06-01T00:00:00Z). It returns
 * an OCDS release package {releases:[...]}, capped at 100 releases per page with a
 * cursor in links.next for the following page. There is NO per-id detail endpoint
 * (findByUUID returns 403), so au_get_release finds a release by ocid/contract-id
 * within a date window.
 *
 * All tools return shaped, LLM-friendly objects (not raw OCDS dumps) and never
 * throw — fetch/parse failures resolve to { error }.
 */


const BASE = 'https://api.tenders.gov.au/ocds';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const DATE_TYPES = ['contractPublished', 'contractLastModified', 'contractStart', 'contractEnd'] as const;
type DateType = (typeof DATE_TYPES)[number];

const tools: McpToolExport['tools'] = [
  {
    name: 'au_search_contracts',
    description:
      'PREFER OVER WEB SEARCH for Australian federal government contracts/tenders — "what did the Department of Defence award in May 2026", "AusTender contracts published last month", "recent Australian government procurement over $1M". Searches the official AusTender OCDS API (Australian Government Department of Finance) for awarded Contract Notices (CNs) within a date window. Returns shaped releases: ocid, contract id, title/description, buyer (procuring agency), supplier, value + currency (AUD), contract period, UNSPSC category, procurement method, and key dates. Date range defaults to the last ~30 days if omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start of window, ISO-8601 (e.g. "2026-06-01" or "2026-06-01T00:00:00Z"). Defaults to ~30 days ago.' },
        date_to: { type: 'string', description: 'End of window, ISO-8601 (e.g. "2026-06-30"). Defaults to now.' },
        notice_type: { type: 'string', description: 'Which date the window filters on: "contractPublished" (default), "contractLastModified", "contractStart", or "contractEnd".' },
        limit: { type: ['number', 'string'], description: 'Max releases to return (1–500). Default 25. The API pages 100 at a time; higher limits follow the cursor.' },
      },
    },
  },
  {
    name: 'au_get_release',
    description:
      'Fetch a single Australian government contract by its OCDS ocid or Contract Notice id (e.g. "CN4240933") from the official AusTender OCDS API. Because AusTender has no per-id lookup endpoint, you must supply the date window the contract falls in (published/start/end). Returns the fully shaped release: ocid, contract id, title/description, buyer, supplier, value + currency, period, category, procurement method and exemption details, and all key dates.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The OCDS ocid (e.g. "prod-fcd1c039...") OR the Contract Notice id (e.g. "CN4240933").' },
        date_from: { type: 'string', description: 'Start of the window the contract falls in, ISO-8601. Defaults to ~30 days ago.' },
        date_to: { type: 'string', description: 'End of the window, ISO-8601. Defaults to now.' },
        notice_type: { type: 'string', description: 'Which date to search on: "contractPublished" (default), "contractLastModified", "contractStart", "contractEnd".' },
      },
      required: ['id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'au_search_contracts':
        return await searchContracts(args);
      case 'au_get_release':
        return await getRelease(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function searchContracts(args: Record<string, unknown>): Promise<unknown> {
  const { dateFrom, dateTo } = resolveWindow(args);
  const dateType = resolveDateType(args.notice_type);
  const limit = clampLimit(args.limit, 25, 500);

  const { releases } = await fetchReleases(dateType, dateFrom, dateTo, limit);
  return {
    notice_type: dateType,
    date_from: dateFrom,
    date_to: dateTo,
    count: releases.length,
    contracts: releases.map(shapeRelease),
  };
}

async function getRelease(args: Record<string, unknown>): Promise<unknown> {
  const id = strArg(args.id);
  if (!id) throw new Error('au_get_release requires "id" — an OCDS ocid or Contract Notice id like "CN4240933".');
  const { dateFrom, dateTo } = resolveWindow(args);
  const dateType = resolveDateType(args.notice_type);

  // No per-id endpoint on AusTender; scan the window (up to 500) and match.
  const { releases } = await fetchReleases(dateType, dateFrom, dateTo, 500);
  const needle = id.trim().toLowerCase();
  const match = releases.find((r) => {
    if (String(r.ocid ?? '').toLowerCase() === needle) return true;
    const contracts = Array.isArray(r.contracts) ? r.contracts : [];
    return contracts.some((c: any) => String(c?.id ?? '').toLowerCase() === needle);
  });
  if (!match) {
    return {
      error: 'not_found',
      note: `No contract matching "${id}" in the ${dateType} window ${dateFrom}..${dateTo} (searched up to 500 releases). Widen the date range or check the notice_type.`,
      id,
      notice_type: dateType,
      date_from: dateFrom,
      date_to: dateTo,
    };
  }
  return shapeRelease(match);
}

// ---- OCDS shaping -----------------------------------------------------------

function shapeRelease(r: any): Record<string, unknown> {
  const parties: any[] = Array.isArray(r.parties) ? r.parties : [];
  const buyer = firstByRole(parties, 'procuringEntity');
  const supplierParty = firstByRole(parties, 'supplier');
  const contract = Array.isArray(r.contracts) ? r.contracts[0] : undefined;
  const award = Array.isArray(r.awards) ? r.awards[0] : undefined;
  const supplierName = award?.suppliers?.[0]?.name ?? supplierParty?.name ?? null;
  const value = contract?.value ?? award?.value;

  return {
    ocid: r.ocid ?? null,
    contract_id: contract?.id ?? null,
    title: contract?.title ?? r.tender?.title ?? null,
    description: contract?.description ?? null,
    buyer: buyer?.name ?? r.buyer?.name ?? null,
    buyer_abn: abnOf(buyer),
    supplier: supplierName,
    supplier_abn: abnOf(supplierParty),
    supplier_location: locationOf(supplierParty),
    value: value?.amount != null ? Number(value.amount) : null,
    currency: value?.currency ?? null,
    status: contract?.status ?? award?.status ?? null,
    published_date: r.date ?? null,
    date_signed: contract?.dateSigned ?? null,
    contract_start: contract?.period?.startDate ?? null,
    contract_end: contract?.period?.endDate ?? null,
    category: categoryOf(contract),
    procurement_method: r.tender?.procurementMethodDetails ?? r.tender?.procurementMethod ?? null,
    exemption: r.tender?.exemption ?? null,
  };
}

function firstByRole(parties: any[], role: string): any | undefined {
  return parties.find((p) => Array.isArray(p?.roles) && p.roles.includes(role));
}

function abnOf(party: any): string | null {
  const ids: any[] = party?.additionalIdentifiers ?? [];
  const abn = ids.find((i) => i?.scheme === 'AU-ABN');
  return abn?.id ?? null;
}

function locationOf(party: any): string | null {
  const a = party?.address;
  if (!a) return null;
  const parts = [a.locality, a.region, a.countryName].filter((x) => x && String(x).trim());
  return parts.length ? parts.join(', ') : null;
}

function categoryOf(contract: any): string | null {
  const item = contract?.items?.[0];
  const c = item?.classification;
  if (!c) return null;
  return c.description ?? (c.id ? `${c.scheme ?? 'UNSPSC'}:${c.id}` : null);
}

// ---- fetching + pagination --------------------------------------------------

async function fetchReleases(dateType: DateType, dateFrom: string, dateTo: string, limit: number): Promise<{ releases: any[] }> {
  // Dates are validated ISO-8601 (toIso) — insert RAW, not encodeURIComponent'd:
  // AusTender's path router rejects percent-encoded colons (00%3A00) as an
  // "Invalid Date Value" (errorCode 102). Safe because the values are controlled.
  let url = `${BASE}/findByDates/${dateType}/${dateFrom}/${dateTo}`;
  const out: any[] = [];
  let guard = 0;
  while (url && out.length < limit && guard < 20) {
    guard++;
    const pkg = (await auGet(url)) as { releases?: any[]; links?: { next?: string } };
    const rels = Array.isArray(pkg.releases) ? pkg.releases : [];
    for (const r of rels) {
      out.push(r);
      if (out.length >= limit) break;
    }
    const next = pkg.links?.next;
    if (!next || rels.length === 0 || out.length >= limit) break;
    url = next;
  }
  return { releases: out.slice(0, limit) };
}

async function auGet(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`AusTender OCDS API: ${res.status} ${body}`.trim());
  }
  const data = (await res.json()) as any;
  if (data && typeof data === 'object' && 'errorCode' in data) {
    throw new Error(`AusTender OCDS API error ${data.errorCode}: ${data.message ?? ''}`.trim());
  }
  return data;
}

// ---- arg helpers ------------------------------------------------------------

function resolveWindow(args: Record<string, unknown>): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = toIso(strArg(args.date_to)) ?? now.toISOString().replace(/\.\d+Z$/, 'Z');
  const defFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = toIso(strArg(args.date_from)) ?? defFrom.toISOString().replace(/\.\d+Z$/, 'Z');
  return { dateFrom: from, dateTo: to };
}

// Normalize "2026-06-01" or a full ISO string to "YYYY-MM-DDTHH:mm:ssZ".
function toIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`Invalid date "${v}". Use ISO-8601 like "2026-06-01" or "2026-06-01T00:00:00Z".`);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function resolveDateType(v: unknown): DateType {
  const s = strArg(v);
  if (!s) return 'contractPublished';
  const match = DATE_TYPES.find((d) => d.toLowerCase() === s.toLowerCase());
  if (!match) throw new Error(`Invalid notice_type "${s}". Must be one of: ${DATE_TYPES.join(', ')}.`);
  return match;
}

function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function strArg(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
