import { Router } from "express";
import { cache } from "../lib/cache";

const router = Router();

/* Plain-English labels for common economic event names */
const EVENT_LABELS: Record<string, { label: string; plain: string }> = {
  "Nonfarm Payrolls":                  { label: "Jobs Report",          plain: "How many jobs were added to the economy last month" },
  "CPI":                               { label: "Inflation (CPI)",      plain: "How much prices rose for everyday goods and services" },
  "Core CPI":                          { label: "Core Inflation",       plain: "Inflation excluding food & energy — the Fed watches this closely" },
  "PPI":                               { label: "Producer Prices",      plain: "How much businesses are paying — a leading inflation signal" },
  "Core PPI":                          { label: "Core Producer Prices",  plain: "Business input costs excluding food & energy" },
  "Federal Funds Rate":                { label: "Fed Rate Decision",    plain: "The Fed sets interest rates — this moves every market" },
  "FOMC Meeting Minutes":              { label: "Fed Meeting Minutes",  plain: "Notes from the Fed's last meeting — reveals their thinking" },
  "GDP":                               { label: "GDP Growth",           plain: "Total size of the US economy — shows if we're growing or shrinking" },
  "GDP Growth Rate":                   { label: "GDP Growth Rate",      plain: "How fast the economy grew last quarter" },
  "Retail Sales":                      { label: "Consumer Spending",    plain: "How much Americans spent at stores — 70% of the economy is spending" },
  "Core Retail Sales":                 { label: "Core Spending",        plain: "Consumer spending excluding cars (smoother read on trends)" },
  "Unemployment Rate":                 { label: "Unemployment Rate",    plain: "Share of people without a job who are looking for one" },
  "Initial Jobless Claims":            { label: "Weekly Job Losses",    plain: "New unemployment claims filed this week — a real-time jobs gauge" },
  "Continuing Jobless Claims":         { label: "Ongoing Job Losses",   plain: "Total people still collecting unemployment benefits" },
  "ISM Manufacturing PMI":             { label: "Factory Activity",     plain: "Health of US manufacturing — above 50 means expansion" },
  "ISM Services PMI":                  { label: "Services Activity",    plain: "Health of the service sector — above 50 means growth" },
  "Consumer Confidence":               { label: "Consumer Confidence",  plain: "How optimistic Americans feel about the economy" },
  "Michigan Consumer Sentiment":       { label: "Consumer Sentiment",   plain: "University of Michigan's survey on how people feel about spending" },
  "Housing Starts":                    { label: "New Home Building",    plain: "Number of new homes construction started — measures housing health" },
  "Existing Home Sales":               { label: "Home Sales",           plain: "How many previously owned homes were sold last month" },
  "New Home Sales":                    { label: "New Home Sales",       plain: "Sales of newly built homes — a forward-looking housing indicator" },
  "Durable Goods Orders":              { label: "Big-Ticket Orders",    plain: "Orders for items lasting 3+ years (planes, machines) — business investment gauge" },
  "Trade Balance":                     { label: "Trade Balance",        plain: "Difference between what the US exports vs imports" },
  "PCE Price Index":                   { label: "Fed's Fav Inflation",  plain: "The Fed's preferred inflation measure — key for rate decisions" },
  "Core PCE Price Index":              { label: "Core PCE Inflation",   plain: "Inflation stripping out food & energy — the Fed's true target" },
  "Personal Income":                   { label: "Personal Income",      plain: "How much Americans are earning — drives future spending" },
  "Personal Spending":                 { label: "Personal Spending",    plain: "How much Americans are actually spending right now" },
  "ADP Employment Change":             { label: "Private Jobs (ADP)",   plain: "Private sector job estimates from ADP — preview of Friday's jobs report" },
  "Building Permits":                  { label: "Building Permits",     plain: "Permits to build new homes — leading indicator for construction" },
  "Industrial Production":             { label: "Factory Output",       plain: "How much US factories, mines & utilities produced" },
  "Capacity Utilization":              { label: "Factory Utilization",  plain: "How much of industrial capacity is being used — inflation signal" },
  "Job Openings":                      { label: "Job Openings (JOLTS)", plain: "How many unfilled jobs exist — shows demand for workers" },
  "CB Consumer Confidence":            { label: "Consumer Confidence",  plain: "Conference Board's measure of how optimistic people are" },
};

function enrich(event: string): { label: string; plain: string } {
  /* exact match */
  if (EVENT_LABELS[event]) return EVENT_LABELS[event];
  /* partial match */
  for (const [key, val] of Object.entries(EVENT_LABELS)) {
    if (event.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { label: event, plain: "" };
}

function dateRange(days = 14) {
  const from = new Date();
  const to   = new Date(Date.now() + days * 86_400_000);
  const fmt  = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(from), to: fmt(to) };
}

router.get("/economic-calendar", async (req, res) => {
  const cacheKey = "economic-calendar";
  const cached   = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.json({ events: [], available: false, generatedAt: new Date().toISOString() });
  }

  try {
    const { from, to } = dateRange(14);
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });

    if (!response.ok) {
      req.log.error({ status: response.status }, "Finnhub economic calendar failed");
      return res.status(502).json({ error: "Failed to fetch calendar" });
    }

    const raw: any = await response.json();
    const events: any[] = raw?.economicCalendar ?? [];

    /* Filter to US events only and shape the data */
    const shaped = events
      .filter((e: any) => e.country === "US" || !e.country)
      .map((e: any) => {
        const { label, plain } = enrich(e.event ?? "");
        const datetime = e.time ?? "";
        const [datePart, timePart] = datetime.split(" ");
        return {
          event:    e.event ?? "",
          label,
          plain,
          date:     datePart ?? "",
          time:     timePart ? timePart.slice(0, 5) : "",
          impact:   (e.impact ?? "low") as "high" | "medium" | "low",
          actual:   e.actual  ?? null,
          forecast: e.estimate ?? e.forecast ?? null,
          previous: e.prev    ?? e.previous  ?? null,
          unit:     e.unit    ?? "",
          country:  e.country ?? "US",
        };
      })
      .filter(e => e.date)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    const result = { events: shaped, from, to, generatedAt: new Date().toISOString() };
    cache.set(cacheKey, result, 30 * 60_000); /* 30 min cache */
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Economic calendar fetch failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
