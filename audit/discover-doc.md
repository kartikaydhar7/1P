Discover: Solutioning Document for One Platform
Author: Ayan Choudhary Version: v1.0 Date: 24 Jul 2026 Module code: DISC
# 1. Executive summary
1.1 The problem
When an SDR or AE starts from a subjective targeting brief, they must either learn a rigid filter syntax or accept a list of source links they cannot trust. Building a usable, defensible account or contact list is therefore slow, manual, and hard to justify to a manager - exactly at the moment the rep is trying to decide who to go after.
1.2 What we are building
Discover is the natural-language entry point to account and contact search. The user asks a question — structured ("agritech companies in India, funding > $10M") or semantic ("US CEOs who pivoted to Voice AI in the last five years") — and Discover returns a verified, exportable list in which each result shows why it matched, with the evidence attached. It is a single adaptive surface, not a set of separate search modes. Two of our design principles govern this module: Prompt-First with Controls Available (natural language is the primary input; structured filters stay available for refinement) and AI as Synthesizer (Discover returns a synthesized, evidence-backed answer rather than a reading list).
1.3 Why now
The market is consolidating around unified "ask → answer → act" platforms (Clari + Salesloft, Apollo + Pocus, Zoom + Common Room, all within about eight months), and Discover is being rebuilt as a core surface of the One Platform migration. Shipping a natural-language discovery surface now is what keeps Sprouts competitive as that consolidation closes the gap.
1.4 Scope in one line
v1 delivers synthesized NL search, a single adaptive query surface, and per-result verification for the SDR, AE, and RevOps personas. Configurable model selection and enrichment-on-demand are explicitly deferred to the fast-follow release.
1.5 How we will know it worked
Primary metric — list-completion rate: the share of Discover sessions that end in a saved or exported list.. Secondary measures (semantic-query precision on a benchmark set, time-to-first-list) are detailed in the metrics section of the full PRD.
# 2. Scope
## In scope
- Natural-language query parsing into structured constraints (industry, geography, funding, headcount, role/seniority, technographics) plus fuzzy/semantic concepts ("pivoted to Voice AI," "companies that look like X").
- Dual-entity search — companies and people, with the ability to pivot ("find the CEOs at these companies").
- Structured filters as a refinement and fallback layer — firmographic, technographic, funding, geography, role/seniority, signals — interoperable with natural language.
- Per-result verification and rationale — each row annotated pass / uncertain against criteria with a short "why it matched" explanation.
- Saved searches, lists, and monitors for recurring queries.
- Export and JSON/API so lists flow into CRM, sequences, and downstream agents.
- Enrichment on demand — for a verified entity, fetch additional fields (CEO name, funding amount, contact email).
## Out of scope
- General web / enterprise knowledge search — Discover is scoped to B2B accounts and contacts, not Glean-style document search or ChatGPT-style open-web Q&A.
- Outreach, sequencing, and dialing — belongs to a downstream "Engage" surface; keeping Discover clean avoids the multi-interface confusion seen in Exa.
- Deal / pipeline forecasting — the Revenue Intelligence category (Gong, Clari), adjacent but distinct.
- Full autonomous SDR execution — 11x / Artisan / Landbase territory; Discover is the discovery brain, not the outreach robot.
# 3. Goals and non-goals
## 3.1 Goals
- A rep can turn a plain-language brief into a usable, exported list without learning a filter syntax.
- Discover answers semantic, non-filterable questions that no incumbent can, and does so with evidence a user can defend.
- Every result is trusted on sight — the user can see why it matched and where the claim came from.
- The surface feels fast: simple questions return immediately, and deep research never looks like a frozen screen.
- Discovered lists flow cleanly into the rest of the platform and the CRM, with their rationale intact.
## 3.2 Non-goals
Things a reader would reasonably expect to be in scope but are not, each with a one-line reason. This section prevents rework.
- Becoming an outreach or sequencing tool — that is Engage; bundling it recreates the interface sprawl we are trying to avoid.
- Owning intent / signal generation as a product — signals feed Discover as inputs; we are not rebuilding a 6sense-style intent engine.
- Being the widest database on the market — the bet is synthesis and trust over raw record counts, not out-scaling ZoomInfo on volume.
- Open-web or internal-document Q&A — Discover stays scoped to B2B accounts and contacts.
# 4. Where this sits against the benchmarking
Two perceptual-map frameworks from the competitive research position Discover and, more usefully, show where the value is.
Map A — NL/semantic sophistication (Y) × proprietary data breadth and freshness (X). The top-right is empty in the market today. Incumbents sit bottom-right (data, shallow NL); NL-native engines sit top-left (NL, rented data). Discover targets top-right.
Map A — natural-language sophistication against proprietary data breadth and freshness.
Map B — source-list retrieval → synthesized/verified answer (Y) × developer-first → business-user-first (X). Exa sits top-left (synthesized but developer-centric and interface-heavy); incumbents sit bottom-right (business-user but filter/list). Discover targets top-right.
Map B — source-list versus synthesized answer, against developer-first versus business-user-first.
## What to borrow from Exa, and what to improve on
From the hands-on walkthrough. Exa is the closest reference point for the natural-language experience, so it is worth being specific about where it earns its reputation and where it falls short.
Borrow from Exa
Improve on
Best-in-class scraping and crawling controls — search type, result count, category, character limits, live-crawl, domain exclusions, highlight extraction.
Search surfaces sources but does not synthesize a precise answer. A global semiconductor-funding query returned only articles, while a general AI overview gave a direct figure (~$10.7B).
End-to-end structured JSON output on every query — genuinely developer- and agent-friendly.
High latency on deep research with no partial output. One agent run took ~181 seconds across 258 sources, with a blocking wait.
The agent synthesizes across many sources and returns structured output — the most capable of its interfaces.
Three overlapping interfaces (Search / Answer / Agent) accept the same query and look alike; a first-time user cannot tell which to use.
Monitors — scheduled recurring searches that push results to a webhook — a strong pattern for signals.
Monitor result relevance is inconsistent; low-quality and off-topic sources surfaced and would need filtering before trust.
Pre-built templates (Outbound Research, Equity Research Brief) as useful starting points to build on.
No voice input, and no obvious path from a result into a CRM or downstream tool.
# 5. Personas and jobs to be done
Persona
Primary job to be done
Frequency
What success feels like (their words)
SDR
When I get a new territory or a subjective targeting brief from my AE, I want to describe the accounts and people I need in my own words, so I can build a working prospect list without learning a filter model.
Daily
“I typed what I wanted and got a clean list I could act on in minutes — and I trust it because I can see why each account is on it.”
AE
When I am researching whether a set of companies fits a new play (a pivot, a funding event, a tech adoption), I want to ask a precise semantic question, so I can qualify the play before investing time in outreach.
Weekly
“I asked a question no filter tool could answer and got back a defensible short list with the evidence attached.”
RevOps
When marketing or sales defines an ICP, I want to translate it into a reusable, auditable list with an honest member count, so I can hand a trustworthy audience to the team and to downstream systems.
At setup, then weekly refinement
“The audience is explainable, the count is real, and I can defend every rule in it to a stakeholder.”
Demand Gen (secondary)
When I plan a campaign against a theme (an industry, a trigger, a region), I want to size and pull a matching audience quickly, so I can validate reach before committing spend.
Per campaign
“I sized the audience myself in one query instead of filing a data request and waiting.”
# 6. Pain points
Five broad pains, drawn from user needs, from where Exa falls short, and from gaps in Sprouts’ current Discover. Type is tagged as User need · Exa gap · Sprouts today. Each maps to a capability in section 7.
#
Pain point
Type
Why it matters / where it shows up
PP-1
Shallow answers — sources without synthesis
User need
The user asks for a finding or a figure and gets a reading list to sift through, not a direct, synthesized answer with depth. Seen clearly in Exa: a funding query returned articles, not the number.
PP-2
High latency on deep research, with no partial output
Exa gap
Deep queries run for minutes behind a blocking wait, with nothing shown while they work, so the surface feels slow and users abandon. Exa’s agent took ~181s across 258 sources on one query.
PP-3
Mode confusion — too many overlapping search interfaces
Exa gap
Multiple modes accept the same query and look identical, with no guidance on which to use. Exa’s Search / Answer / Agent split leaves first-time users lost.
PP-4
No flexibility in model selection
Sprouts today
The user cannot choose the intelligence powering a query — no way to trade speed against depth or cost, or to swap models as needs change. A gap in Discover today.
PP-5
Low trust — results without rationale or source control
User need
Results arrive with no reason-for-match, no citation, and no control over source quality, so a user cannot trust or defend the list. Exa monitors surfacing low-quality sources is the same problem in another form.
# 7. Capabilities that address them
#
Capability
What it does
Solves
CAP-1
Synthesized answers with depth
Returns a direct answer — the figure, the shortlist, the finding — with the reasoning and the sources behind it, instead of a list of links to read. For semantic queries, the answer carries its supporting evidence inline.
PP-1
CAP-2
Fast-path / deep-path routing with streamed results
Classifies query complexity: simple queries return in seconds; deep research streams partial results as it runs and can notify the user when it completes, so nothing feels like a blocking wait.
PP-2
CAP-3
Single adaptive query surface
One box that detects intent and routes automatically between the fast and deep paths. The user never has to choose a mode or know which engine to use.
PP-3
CAP-4
Configurable model selection
Exposes a choice of model / intelligence tier per query, with a sensible default and a system override, so users can trade speed, depth, and cost as the task demands.
PP-4
CAP-5
Per-result rationale, citations, and source controls
Every result shows why it matched and links the evidence behind it; users can constrain domains and source quality so the output is trustworthy and defensible.
PP-5
# 8. Functional requirements
Priority. P0 the release does not ship without it; removing it breaks the core job. P1 expected by users at launch; ships in v1 unless the timeline forces a conscious, recorded cut. P2 valuable, planned for fast-follow; specified now so the architecture does not preclude it.
Acceptance criteria. Given [precondition], when [action], then [observable result]. One criterion per condition; if someone who did not write it cannot test it, it is rewritten.
CAP-1 — Synthesized answers with depth
ID
Requirement
Description
Job to be done
Acceptance criteria
Dependencies
DISC-SYNTH-01
P0
Return a synthesized answer, not a link list
For any query, Discover returns a direct answer — a list, a figure, or a finding — assembled from the underlying data and sources, rather than a set of links for the user to read.
When I ask a question, I want the answer itself, so I do not have to open and reconcile a dozen sources myself.
1. Given a valid query, when results return, then the primary output is a synthesized answer (list/figure/finding), not only a set of source links.
2. Given a query with no confident answer, when results return, then Discover says so rather than padding with loosely related links.
Query engine; data layer
DISC-SYNTH-02
P0
Structured query returns explicit, editable constraints and a count
A filter-expressible query is parsed into a structured, fully editable constraint set with every inferred constraint shown explicitly, plus an estimated result count before anything is saved.
When I describe accounts in plain language, I want to see and adjust how the system interpreted me, so I can trust the list before I use it.
1. Given a structured prompt, when submitted, then a constraint set is returned with each constraint labelled inferred or explicit.
2. Given a returned constraint set, when the user edits a constraint, then the estimated count updates without a full page reload.
3. Given a prompt that would return zero results, when computed, then the user is told which constraint is the limiting one.
CAP-3 surface; data layer
DISC-SYNTH-03
P0
Semantic query returns an evidence-backed answer
A non-filterable query (a pivot, an event, a behaviour) is decomposed into role/geography/event/timeframe, researched over unstructured sources, and returned as matches with supporting evidence.
When I ask a question no database tracks, I want a defensible short list, so I can qualify a play without manual research.
1. Given a semantic query, when submitted, then the interpreted sub-conditions are shown for confirmation before the deep run starts.
2. Given a time-bound clause, when results return, then each result’s triggering event carries a date inside the stated window.
3. Given no confident matches, when the run completes, then zero matches are reported rather than low-confidence guesses.
CAP-5 evidence; entity resolution
CAP-2 — Fast-path / deep-path routing with streamed results
ID
Requirement
Description
Job to be done
Acceptance criteria
Dependencies
DISC-ROUTE-01
P0
Classify and route each query by complexity
Discover classifies every query as structured (fast path) or semantic (deep path) and routes it automatically, without asking the user to pick.
When I ask anything, I want the system to work out how hard it is, so I do not have to choose an engine.
1. Given any query, when submitted, then it is routed without the user selecting a mode.
2. Given a query the classifier is unsure about, when routing, then it defaults to the path that shows intermediate results and states the path taken.
CAP-3 surface
DISC-ROUTE-02
P1
Stream partial results and allow async completion
On the deep path, Discover streams partial results as they are found and lets the user leave and be notified when the run completes, rather than holding a blocking screen.
When a query takes minutes, I want to see progress or walk away, so the tool never feels frozen.
1. Given a deep-path query beyond the interactive threshold, when running, then partial results and progress are shown rather than a blocking spinner.
2. Given a long run, when the user navigates away, then they can opt to be notified and can retrieve the completed result later.
DISC-ROUTE-01; notifications
CAP-3 — Single adaptive query surface
ID
Requirement
Description
Job to be done
Acceptance criteria
Dependencies
DISC-SURF-01
P0
One adaptive input, no mode selection
A single natural-language box is the entry point for all queries; the interface adapts to the routed path instead of exposing separate Search / Answer / Agent modes.
When I come to Discover, I want one place to ask, so I never have to learn which mode does what.
1. Given the Discover surface, when the user arrives, then there is a single query input rather than competing mode tabs.
2. Given a completed search, when results render, then the user can see whether a fast or deep path produced them.
DISC-ROUTE-01
DISC-SURF-02
P1
Natural language and filters are interoperable
Any NL query renders as editable filters, and any filter state can be described back in natural language; the two are one model, not two surfaces.
When the NL result is close but not exact, I want to adjust it with filters, so I can fine-tune without starting over.
1. Given an NL query, when parsed, then the equivalent filter state is shown and editable.
2. Given a manually edited filter state, when requested, then a plain-language summary of the current query is shown.
DISC-SYNTH-02
CAP-4 — Configurable model selection
ID
Requirement
Description
Job to be done
Acceptance criteria
Dependencies
DISC-MODEL-01
P1
Choose the intelligence tier per query
Discover exposes a choice of model / intelligence tier for a query, with a sensible default and a system override, so speed, depth, and cost can be traded off as the task demands.
When a task is simple or urgent, I want a faster/cheaper model, and when it is high-stakes I want the deepest one, so I control the trade-off.
1. Given the query surface, when the user opens model options, then available tiers are listed with a default pre-selected.
2. Given a selected tier, when a query runs, then the chosen tier is used (unless a system override applies) and the choice is visible on the result.
3. Given a credit-consuming tier, when selected, then the cost implication is shown before the query runs.
Model routing; credit metering
CAP-5 — Per-result rationale, citations, and source controls
ID
Requirement
Description
Job to be done
Acceptance criteria
Dependencies
DISC-VER-01
P0
Per-result match rationale
Every result carries a short, human-readable statement of why it matched each stated criterion, and a pass / uncertain flag per criterion.
When I hand a list to my team or manager, I want to explain why each item is on it, so I can trust and defend it.
1. Given a result, when displayed, then each stated criterion shows a pass or uncertain flag.
2. Given a criterion marked uncertain, when the user opens the result, then the reason for uncertainty is shown.
3. Given a list, when exported, then the per-criterion match state is included per row.
CAP-1 answer; DISC-EXPORT (fast-follow)
DISC-VER-02
P0
Evidence citation for semantic matches
For semantic / event matches, each result links to at least one supporting source with a retrieval date, so the claimed event is checkable.
When the match depends on a claim, I want to see the source, so I can verify before I act.
1. Given a semantic match, when displayed, then at least one dated supporting source is attached.
2. Given a source, when opened, then it is the specific source supporting the claimed event, not a generic company page.
3. Given a source that cannot be retrieved at view time, when displayed, then the result is flagged unverifiable rather than shown as confirmed.
DISC-SYNTH-03; source gathering
DISC-SRC-01
P1
Domain and source-quality controls
The user can constrain which domains or source types are trusted for a query, so low-quality or off-topic sources can be excluded before results are built.
When I know some sources are noise, I want to exclude them, so my results stay clean and trustworthy.
1. Given a query, when the user sets a domain include/exclude list, then results respect it.
2. Given a result, when displayed, then its source is identifiable so the user can judge quality.
DISC-VER-02
# Appendix A — Market observations
A-1 Consolidation wave (2025–2026)
Three GTM-intelligence consolidations closed in about eight months: Clari + Salesloft (Dec 2025 — per Business Wire, Gartner named Clari a Leader and Salesloft a Visionary in its first Magic Quadrant for Revenue Action Orchestration, with Steve Cox as CEO of the combined company); Apollo + Pocus (March 2026 — signals + contact data + outreach converging toward an "AI-native GTM operating system"); and Zoom + Common Room (July 2026). The category is converging on unified, AI-native "ask → answer → act" platforms — which is the backdrop for building Discover now.
A-2 Focus towards unbundled tools with rationale-first approach
Bottom = bundled enterprise platform. One big all-in-one suite that does everything (scoring, intent, ads, orchestration). You buy the whole thing on a multi-year contract.
Top = unbundled point tool. A small, focused tool that does one job well, which you plug into a stack alongside other point tools.
Market consolidation and the shift toward unified ask → answer → act platforms.
# Appendix B — Competitor landscape
Reference benchmarking across the sixteen most relevant tools for a discovery use case. Coverage figures are vendor-reported and directional.
Company
One-liner / positioning
NL vs structured search
Data coverage strength
Synthesized answer?
UX pattern to borrow / avoid
Exa (primary benchmark)
Search engine + API for AI agents
NL/semantic-native; Websets = prompt-to-verified-list
Live web index; 1B+ people, 50M+ companies
Yes — Answer + Agent, per-row verified rationale
Borrow: verification + enrichment, JSON. Avoid: interface sprawl, no CRM path, async latency
ZoomInfo
GTM platform, Copilot AI sales agent
Assistant-over-filters; NL explanations of prioritization
300M–500M contacts, 100M+ companies; NA-strong
Partial — Copilot summaries, Earnings Scoops
Borrow: "why prioritized" rationale. Avoid: inconsistent claims, price
Apollo
All-in-one prospecting OS
Smart NL query + advanced params; AI Assistant
~275M contacts, 60M companies; strong free tier
Partial — AI research / summaries
Borrow: NL↔filter interoperability. Now owns Pocus signals
Clay
Data orchestration + AI research
Sculptor NL workflow builder; Claygent per-row research
Waterfall across 100+ providers (no proprietary DB)
Yes — Claygent synthesizes per row
Borrow: per-row agentic research; NL-to-logic. Avoid: spreadsheet complexity for non-technical
Cognism
GDPR-first EMEA data
Filter-first + added NL search
EMEA/UK depth; Diamond human-verified mobiles
No
Borrow: human-verified data trust. Avoid: opaque pricing, thin NA/India
Explorium
Unified B2B data API + MCP
API / agent-first
150M+ companies, 800M+ contacts, 4,000+ data points
Via agents
Borrow: MCP / agent-native access
6sense
ABM/GTM intelligence, predictive intent
Account-level intent + AI agents
Signalverse: 1T+ signals/day; 5,000+ intent topics
Predictive scoring, Gem-style agents
Borrow: signal breadth. Avoid: black-box, 4–12 wk implementation, $60K+
Common Room
Person-level community/signal aggregator
Signal search across GitHub/Slack/social
Person360 signal stitching
Signal scoring
Borrow: person-level signal fusion. (Acquired by Zoom, 2026)
Koala
PLG website-visitor + product-usage signals
Signal feed, not NL search
First-party product/web signals only
No
Borrow: real-time intent feed. Narrow scope
Warmly
Website de-anonymization + orchestration
Signal-triggered, not NL
Visitor ID + enrichment
No
Borrow: real-time visitor→action loop
UserGems / Champify
Job-change / champion tracking
Signal-based
Job-change signals (~70K/day tracked by 6sense for comparison)
No
Borrow: relationship / job-change signals as filter
Unify
Agentic warm-outbound GTM platform
NL chat interface + signals
Waterfall enrichment + intent
Research agent
Borrow: single-chat research→list. Backed by OpenAI Fund
Pocus
Signal-based selling / account research
Rep-friendly list building + AI research
1st + 3rd party signal fusion
AI research briefs
Acquired by Apollo (2026) — validates convergence
Perplexity
Answer engine with citations
NL-native
Open web + Carbon connectors
Yes — cited answers
Borrow: cited-synthesis UX
Glean
Enterprise internal search
NL + knowledge graph
Internal docs (permission-aware)
Yes
Borrow: semantic knowledge graph
Seamless.ai / Lusha / RocketReach / UpLead / LeadIQ
Contact-data prospecting tools
Mostly filter-first
Varies; real-time verification (UpLead)
No
Borrow: real-time email verification at export (UpLead)