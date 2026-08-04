# Account Detail Page - Design Brief

## Context

Sprouts is building a unified B2B GTM platform. The Discovery module lets users search for accounts using natural language prompts (e.g., "Series B-D fintechs in the US hiring RevOps"). Results appear as a table with columns: Account Name, Match %, Primary Industry, Sub-Industry, Revenue, Employees, Funding, Founded, Country.

Currently, there is no account detail view. When a user clicks on an account in the results list, nothing happens. This brief defines the two-tier account detail experience we need to build.

**Important constraint:** All data points listed below come from a single enrichment data file per account. No additional AI/LLM processing is run at this stage - we only use pre-computed fields from the data source. Deeper AI intelligence is triggered only after the user adds an account to a Segment.

---

## UX Pattern: Two-Tier Progressive Disclosure

### Tier 1: Side Drawer
- Opens when user clicks on any account row in Discover results
- The user stays on the Discover page - the drawer slides in from the right
- Purpose: 15-second triage - "Is this account worth pursuing?"
- Contains a CTA to open the full account detail page (Tier 2)

### Tier 2: Full Page (Tabbed)
- Opens when user clicks "View Full Profile" from the drawer
- Full-page view with tabbed navigation for deep exploration
- Purpose: Deep account research for prospecting strategy, meeting prep, buying committee mapping

---

## Tier 1: Side Drawer

### Drawer Header
Data points to display:
- Company name
- Domain (clickable link to company website)
- Primary industry
- HQ location: city, country (from `location.city`, `location.country`)
- Employee count (use `employees_number` - the exact count, NOT `employees_range`)
- Founded year (`founding_year`)
- Funding stage (`funding.stage`)
- Revenue (`funding.revenue.value_usd`) - display as formatted currency; hide field if null
- Operating status (`operating_status`)
- Match score (%) - carried from the Discover results context
- Signal strength (`signal.signal_type` - values like "Very strong") with `signal.sources_count` as supporting detail

### Company Summary
- Use `llm_extracted.concise_summary` as the primary one-liner
- Below that, show `llm_extracted.summary` as a 2-3 sentence expanded description
- These are pre-computed fields from the data, not runtime AI

### Quick Facts (compact display)
Surface a handful of notable data points in a scannable format (chips, icon+value pairs, or a compact grid):
- Business models: `business_models` (e.g., B2B, SaaS, B2C)
- Activity regions: `llm_extracted.activity_regions` (e.g., North America, Europe)
- Number of clients: `llm_extracted.number_of_clients`
- LinkedIn followers: `num_linkedin_followers`
- Employee growth 1Y: `employees_growth_1y` (show as percentage with up/down indicator)
- Patents granted: `intellectual_property.num_patent_granted` (hide if 0 or null)
- Total funding raised: `funding.money_raised.value_usd`

### Founders
- List from `founders` array: name and primary role
- Show up to 3 founders

### Key Links (icon row)
- LinkedIn: `urls_linkedin[0]`
- Twitter/X: `urls_twitter[0]`
- Crunchbase: `urls_crunchbase[0]`
- Facebook: `urls_facebook[0]`
- YouTube: `urls_youtube[0]`
- Only show icons for links that exist in the data

### Drawer CTAs
- Primary: "Add to Segment" (the most common action from Discover triage)
- Secondary: "View Full Profile" (opens Tier 2)

---

## Tier 2: Full Page Account Detail

### Persistent Header (always visible above tabs)
Same data as the drawer header:
- Company name, domain, primary industry
- HQ location, employee count, founded year
- Funding stage, revenue, operating status
- Signal strength, match score
- "Add to Segment" CTA accessible from header

### Tab Structure

---

#### Tab 1: Overview

**Company Description**
- `description.value` (full description)
- `llm_extracted.mission_or_vision`
- `llm_extracted.slogan`

**Business Profile**
- Company types: `types` (e.g., Corporate, Venture Capital, Angel Investor, Accelerator/Incubator)
- Business models: `business_models`
- Primary industry: `industry`
- All industries: `industries` array
- Industries served: `llm_extracted.industries_served`
- Activity regions: `llm_extracted.activity_regions`
- Activity countries: `llm_extracted.activity_countries`
- Language: `language`
- SIC codes: `industries_codes_sic`
- NAICS codes: `industries_codes_naics`

**Products & Technology**
- Products list: `products` array (name, description, URLs) - show as a list/table
- Technologies: `llm_extracted.technologies`
- Certifications & compliance: `llm_extracted.certifications_and_compliance`

**Value Proposition & Strategy**
- Value proposition: `llm_extracted.value_proposition` (array of items)
- Market presence: `llm_extracted.market_presence`
- Trends: `llm_extracted.trends`
- R&D focus: `llm_extracted.research_and_development`
- Awards & recognitions: `llm_extracted.awards_and_recognitions`

**Sustainability & ESG** (collapsible section)
- `llm_extracted.environmental_impact_summary`
- `llm_extracted.social_impact_summary`
- `llm_extracted.sustainability_initiatives_summary`
- `llm_extracted.sustainability_esg_indicator`
- `financials.esg_label`, `financials.esg_rank`, `financials.esg_present`
- Environment / Social / Governance risk scores

**Diversity** (collapsible section)
- `llm_extracted.diversity_indicator`
- `employees_diversity` array (e.g., unconscious bias training, diversity hiring practices, ERGs)
- `employees_female_percent`
- `founders_female_percent`

---

#### Tab 2: People & Contact

**Founders**
- `founders` array: name, gender, roles/titles (from `employments` array)

**Contact Information**
- Contact emails: `emails_contact` array (e.g., info@, sales@, support@)
- Domain emails: `emails_domain` array (show count + expandable list)
- Phone numbers: `phones` array
- International phones: `phones_international` array

**Social Profiles** (clickable links)
- LinkedIn: `urls_linkedin`
- Twitter/X: `urls_twitter`
- Facebook: `urls_facebook`
- YouTube: `urls_youtube`
- Crunchbase: `urls_crunchbase`
- Apple App Store: `urls_apple_apps`
- Google Play: `urls_google_apps`

---

#### Tab 3: Signals & Activity

**Signal Strength**
- `signal.signal_type` (e.g., "Very strong")
- `signal.sources_count` (e.g., 290 sources)

**Social Posts** (timeline/feed format, sorted by recency)
- From `posts` array: timestamp, text content, num_likes, publisher, URLs
- Show as a scrollable feed

**Events**
- From `events` array: title, appearance_type (e.g., "sponsor"), date, description, sources
- Show as a list sorted by recency

**Recent Events & Milestones**
- `llm_extracted.recent_events_and_milestones`

**Employee Growth Trend**
- `employees_number` (current)
- `employees_growth_1y`, `employees_growth_3y`, `employees_growth_5y`
- Consider a small trend visualization (sparkline or bar) showing the three growth rates

---

#### Tab 4: Financials & Funding

**Financial Summary**
- Revenue: `funding.revenue.value_usd` + `funding.is_revenue_guessed` (flag if guessed)
- Total raised: `funding.money_raised.value_usd`
- Funding stage: `funding.stage`
- IPO status: `funding.ipo.status`
- Stock exchange: `funding.ipo.stock_exchange` (if public)
- Stock label: `funding.ipo.stock_label` (if public)
- Went public on: `funding.ipo.went_public_on` (if public)

**Financial Metrics** (show available fields, hide nulls)
- Market capitalization: `financials.market_capitalization`
- Price-to-sales ratio: `financials.price_to_sales_ratio`
- P/E ratio: `financials.pe_ratio`
- Price-to-book ratio: `financials.price_to_book_ratio`
- PEG ratio: `financials.peg_ratio`
- Total assets: `financials.total_assets`
- Total equity: `financials.total_equity`
- Total debt: `financials.total_debt`
- EBIT / EBITDA / Net income / Gross profit / Operating income
- Margins: EBIT margin, EBITDA margin, Net profit margin
- EPS: basic, diluted
- Shares outstanding: `financials.total_shares`, `financials.shares_outstanding`
- Growth rates: Revenue CAGR, Net income CAGR, EPS CAGR, FCF CAGR, Dividends CAGR

**Funding Rounds** (timeline or table, sorted by recency)
- From `funding.rounds` array: announced_on, type/type_original, money_raised, investors list

**Investors**
- `funding.investors` array (full list of all investors across rounds)
- Also available: `investor_names` as a flattened list

**Grants**
- From `grants` array: program_name, status, date_start, date_end, funded_by, contribution

---

#### Tab 5: Ecosystem & Relationships

**Acquisitions Made**
- From `funding.acquisitions` array: company name, announced_on date
- Sorted by recency

**Investments Made (Outbound)**
- From `funding.rounds_out` array: invested_in company name, round type, announced_on, co-investors
- Sorted by recency

**Exits**
- `funding.exits` array (portfolio company exits)
- `funding.exited` array (investors who exited this company)

**Acquired By**
- `funding.acquired_by` (if applicable)

**Corporate Relationships**
- Clients: `clients` array (company names)
- Number of clients: `llm_extracted.number_of_clients` (aggregate count)
- Partnerships: `partnerships` array
- Suppliers: `suppliers` array
- Affiliates: `affiliates` array
- Joint ventures: `joint_ventures` array
- Subsidiary of: `subsidiary_of`
- Is subsidiary: `llm_extracted.is_subsidiary`
- Attachments: `attachments` array
- Ownership types: `ownerships`

**Related Domains**
- `related_domains_by_redirects` (domains that redirect to this company)
- `related_domains_by_name` (domains with similar naming, e.g., stripe.dev, stripe.press)

---

#### Tab 6: Locations

**Headquarters**
- `location.address`, `location.city`, `location.country`
- `location.coordinates.lat`, `location.coordinates.lon`

**All Office Locations** (map view + list)
- From `llm_locations` array: address, city, country, coordinates (lat/lon)
- Show on an interactive map with pins
- List view alongside or below the map

---

## Data Quality Notes for Design

1. **Many fields can be null or empty.** Design should gracefully hide sections/fields when data is unavailable rather than showing empty rows. Accounts will range from data-rich (like Stripe with 329 tags, 46 offices, 67 posts) to data-sparse (early-stage startups with minimal public footprint).

2. **`employees_range` vs `employees_number`:** These can be inconsistent. Always prefer `employees_number` (exact count). Suppress `employees_range` if exact count is available.

3. **`funding.is_revenue_guessed`:** When true, display a visual indicator (e.g., "estimated" label) next to the revenue figure so the user knows it's not verified.

4. **Tags field (329 items for Stripe):** This is extremely noisy and unstructured. Do not display raw tags to the user. They can be used for backend search/filtering but should not appear on the account page.

5. **Founder data quality:** The `founders` array can have deduplication issues (e.g., "John and Patrick Collison" and "Patrick Collison John Collison" as separate entries). Display as-is for now but be aware the data isn't always clean.

6. **Financial fields for private companies:** Most granular financial fields (EBIT, margins, EPS, etc.) will be null for private companies. The Financials tab should feel useful even when only revenue, total raised, and funding stage are populated.

7. **`signal.signal_type`:** Known values include "Very strong" - design should accommodate a range of signal strength labels.

8. **Timestamps:** Data has `first_update` and `last_update` timestamps. Consider showing `last_update` as a "Data last updated" indicator somewhere on the page to convey freshness.

---

## Reference: Current Discover UI

The current Discover module shows:
- Natural language search bar at top
- Filter chips (Industry, Employee count, Country, Funding stage)
- "Thinking Complete" section showing query parsing steps
- Results table with columns: Account Name, Match %, Primary Industry, Sub-Industry, Revenue, Employees, Funding, Founded, Country
- "Add to Segment" CTA on the results page
- Left sidebar with Recent Searches history

The side drawer should integrate naturally with this existing layout - sliding in from the right when an account row is clicked, without navigating away from the Discover results.
