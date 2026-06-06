---
title: "I Built RAG for a Domain Chatbot, Then Deleted It: When You Don't Need Vector Search"
description: "A build log for a customer-facing construction documentation assistant. How I started with client-side RAG, shipped a server-side RAG, and finally deleted all of it in favor of full-context injection plus prefix caching — and the rule of thumb that tells you which one you actually need."
pubDate: 2026-06-06
draft: false
tags: ["RAG", "LLM", "DeepSeek", "Domain Chatbot", "Prompt Engineering", "Production AI"]
---

The default answer to "build me a chatbot over my documents" has become reflexive: chunk the docs, embed them, store the vectors, retrieve top-k, stuff the results into the prompt. RAG. Everyone reaches for it first.

I built a domain chatbot the conventional way — twice — and then deleted the entire retrieval layer. The replacement is embarrassingly simple: I inject the **whole** knowledge base into the system prompt on every request and let the model's prefix cache absorb the cost. It is simpler, it hallucinates less, and it is cheaper to run.

This post is the build log: what the chatbot is for, the two RAG architectures I threw away, why a 656MB model file was the turning point, and the one number that should decide whether you need vector search at all.

![Three architectures over one knowledge base — client-side RAG, then server-side RAG, then full-context injection](/img/blog/rag-to-fullcontext-evolution.svg)

## The Problem: A Phone Call I Wanted to Eliminate

The chatbot answers questions about **XStructE** installation guides — Light Gauge Steel (LGS) framing and structural steel construction. The documentation covers floor, wall, roof, sub-floor, and purlin installation, plus a dense "General Notes" page of Australian Standards (AS/NZS) specifications.

It is customer-facing and not commercialized. The goal is narrow and concrete: let installers and engineers on site look something up instantly instead of phoning the manufacturer. Every question the bot answers correctly is a phone call that does not happen.

That framing matters, because of what the questions look like. Here is the kind of thing the documentation actually specifies:

> Nut tightening torque: M12 chemset anchor 40Nm, M16 80Nm, M20 135Nm. Minimum continuous fillet weld (CFW) size 6mm U.N.O. Weld quality SP per AS1554.1 using E48XX consumables.

These are not trivia. Someone on a job site reads "M16 chemset 80Nm" and torques a structural anchor to that value. If the bot invents a number — or retrieves the wrong section and confidently cites it — the failure mode is not an awkward answer. It is a structural one. In this domain, **hallucination and wrong retrieval are the same category of risk**, and the bar is unforgiving.

## Detour One: Client-Side RAG (and a 656MB Model)

The first architecture put retrieval in the browser. The idea was appealing: no backend, no per-request inference cost for embeddings, everything runs on the client. To do that, the page had to download an embedding model and run vector search locally.

That meant shipping a **656MB model file** to every visitor before the chat could answer a single question.

Stated plainly, it sounds absurd, and it was. A documentation site whose entire value is "look something up fast" was gating its smartest feature behind a several-hundred-megabyte download. On a desktop with a warm cache it was tolerable; for the actual users — people on site, on phones, on patchy mobile connections — it was the opposite of fast. The retrieval was clever and the user experience was backwards.

## Detour Two: Server-Side RAG

So I moved retrieval to the server: chunk the docs, embed them, store vectors, retrieve top-k per question, inject the matches into the prompt. The browser got light again. This is the architecture most "chat over your docs" tutorials describe, and it worked — mostly.

But "mostly" is exactly the problem in a safety-critical domain. RAG's failure mode is silent: when retrieval misses, the model answers from whatever made it into the top-k window, and it answers _confidently_. The specs in this documentation are also heavily cross-referential — a wall connection cites a General Notes weld spec, which cites an Australian Standard. Chunk that web of references and a retriever can hand the model three plausible fragments while dropping the one clause that changes the answer. You cannot see the gap in the output. Neither can the installer.

I kept tuning chunk sizes and retrieval counts. Each fix traded one failure for another. That is usually the signal that the architecture, not the parameters, is wrong.

## The Realization: The Knowledge Base Is Tiny

Then I measured the thing I had been busy retrieving _from_. The build script that compiles the docs reports it directly (file path abbreviated):

```
Found 6 markdown files
Output: data/docs-content.json
  Content: 32389 chars (~10797 tokens)
  Sources: 6 documents
```

The entire corpus — all six installation guides plus the General Notes — is about **32,000 characters, roughly 11,000 tokens**. That is a small fraction of a modern model's context window. It fits, whole, with enormous room to spare.

RAG exists to solve one problem: your knowledge base is too big to fit in the context window, so you must _select_ the relevant slice before asking. But if the entire corpus fits comfortably in context, retrieval is selecting from a set that did not need selecting. I had built a search engine to choose between six documents I could simply hand over in full. That is not an optimization. It is, in the precise YAGNI sense, solving a problem I did not have — and paying for it in retrieval bugs.

So I deleted it. All of it: the client-side model, the embeddings, the vector store, the top-k logic.

## The Replacement: Full-Context Injection + Prefix Caching

The architecture that replaced two generations of RAG is a single idea: **put the whole documentation in the system prompt, identically, on every request, and let DeepSeek's prefix cache pay for it.**

A build-time script (`generate-docs-content.mjs`) walks `docs/`, concatenates every markdown file into one JSON blob, and records a SHA-256 hash so it only regenerates when the docs actually change:

```js
// Build full content (one blob, all six docs)
const fullContent = docs.map((d) => d.content).join("\n\n---\n\n");

const output = {
  generatedAt: new Date().toISOString(),
  totalDocs: docs.length,
  contentLength: fullContent.length,
  estimatedTokens: Math.ceil(fullContent.length / 3),
  sources, // title + filename + image list, for citation UI
  content: fullContent,
};
```

At runtime the chat endpoint builds the system prompt **once**, at module load, and reuses it for every request (simplified to the essential shape — the actual code uses `push` calls and a TypeScript cast):

```ts
// Built once when the module loads — static for all requests
const CACHED_SYSTEM_PROMPT = buildSystemPrompt(docsData.content);

// Per request: same system prompt, then short history, then the question
const llmMessages = [
  { role: "system", content: CACHED_SYSTEM_PROMPT }, // ~11K tokens, identical every time
  ...recentHistory, // last 6 turns, max
  { role: "user", content: question },
];
```

The key is that the large, expensive part of the prompt — the docs — is **byte-for-byte identical across requests**. DeepSeek applies prefix caching automatically: an unchanged prompt prefix is billed as a cache hit instead of as fresh input tokens. So the "wasteful" thing — sending the full documentation on every single call — is almost entirely absorbed by the cache. The docs are static; only the short tail (history + question) is new each time.

I measured this against the live DeepSeek API using the production system prompt. Each request carries **10,342 prompt tokens** (docs + instructions + few-shot exemplars). The first, cold request is all cache miss; every request after it looks like this:

| Request  | Prompt tokens | Cache hit | Cache miss |
| -------- | ------------- | --------- | ---------- |
| 1 (cold) | 10,342        | 0         | 10,342     |
| 2 (warm) | 10,342        | 10,240    | 102        |
| 3 (warm) | 10,342        | 10,240    | 102        |

In steady state **99% of input tokens hit the cache**. DeepSeek bills cache-hit input at $0.0028/M against $0.14/M for a miss — a 50x difference ([pricing](https://api-docs.deepseek.com/quick_start/pricing), as of June 2026) — so injecting the entire knowledge base on every request costs roughly **97% less on input than the same prompt would uncached**: about $0.00004 of input per request instead of $0.0014. The "send everything, every time" architecture is, in practice, nearly free.

![Measured on the live DeepSeek API — 99% of input tokens hit the prefix cache in steady state, roughly 97% cheaper on input than sending the docs uncached](/img/blog/prefix-cache-measured.svg)

This buys three things that RAG did not:

- **No silent retrieval gaps.** The model always has the complete documentation, including every cross-reference. There is no top-k window to fall outside of.
- **Far less moving machinery.** No embedding model, no vector store, no chunking strategy, no retrieval tuning. The whole "retrieval layer" is a build script and a string concatenation.
- **Cheaper than it looks.** Measured against the live API, 99% of input tokens hit the prefix cache in steady state — roughly 97% lower input cost than sending the docs uncached. Full-context injection is not the budget disaster it sounds like for a corpus this size.

Inference settings are deliberately conservative for a factual domain: `deepseek-chat`, `temperature: 0.3`, `max_tokens: 2000`, streamed over SSE, with at most the last 6 messages carried for multi-turn follow-ups. (DeepSeek is retiring the `deepseek-chat` alias on 2026-07-24, folding it into `deepseek-v4-flash`; the approach here is model-agnostic — anything with automatic prefix caching works.)

## Hallucination Control Is the Real Work

Swapping architectures fixed _retrieval_. It did not, by itself, stop the model from inventing specifications — and in this domain that is the part that actually matters. Most of the engineering effort went into the system prompt, not the plumbing. A few of the load-bearing rules:

- **Answer only from the provided documentation**, never from training data, for any technical spec.
- **An explicit refusal path.** When the docs do not cover something, the required response is to say so and tell the user to consult a structural engineer or the relevant Australian Standard — not to improvise. A confident "I don't know" is a correct answer here; a confident guess is a defect.
- **Mandatory citations.** Every claim has to point back to a section, e.g. "According to [Wall Installation, Item 3](/docs/wall-installation)...", so a human can verify it against the source.
- **Few-shot exemplars** that demonstrate the ideal format — direct answer, cited spec with units (kN, mm, kPa, MPa), referenced figures — so the model copies the shape, not just the facts.

Full-context injection makes these rules _enforceable_: because the entire corpus is in front of the model, "answer only from the documentation" is a constraint it can actually satisfy, rather than a hope that retrieval surfaced the right chunk.

## Evaluating Without a Benchmark Set

Honest caveat: this is a small, non-commercial project, and I do not have a large labeled evaluation set or hard accuracy numbers to show you. I am not going to manufacture a percentage. What I do instead, and keep iterating on, is qualitative and targeted:

- **Spot-check the questions that matter most** — the torque tables, fastener specs, and weld requirements where a wrong answer is dangerous — against the source documents by hand.
- **Check that citations resolve.** A cited section that does not contain the claim is a hallucination wearing a footnote, and it is easy to catch.
- **Probe the refusal path.** Ask things the docs deliberately do not cover and confirm the bot declines instead of inventing a spec.

It is not a formal eval harness, and I would not pretend it is one. For a knowledge base this size and a domain this unforgiving, design-time constraints (full context, low temperature, mandatory citations, an explicit "I don't know") plus disciplined manual review have been the practical path. A real eval set is the obvious next step as the project grows.

## Production Hardening

The chat backend runs in two forms — a Vercel Edge Function in production (`api/chat.ts`) and a local Node proxy in development (`server.js`). They share the same overall structure; production carries the stricter, fuller anti-hallucination and few-shot rules. Around the model call sits the unglamorous but necessary layer:

- **Origin allowlist + CORS** so only the documentation site can call the endpoint from a browser.
- **Per-IP rate limiting via Upstash Redis.** The edge runtime is stateless across instances, so an in-memory counter would not actually limit anything — the counter has to live in an external store. Each request increments a per-minute key with a short TTL.
- **Cloudflare Turnstile** human verification on the endpoint.
- **A request body size cap** to reject oversized payloads before they reach the model.
- **A deliberate fail-open posture.** If rate-limiting or Turnstile secrets are not configured, the endpoint serves rather than blocks — the right default for a low-traffic, non-critical assistant, and a decision I made explicitly rather than by accident.

None of this is novel. It is the difference between a demo and something you are willing to point real customers at.

## The Rule of Thumb

Here is the heuristic I wish I had applied before writing a single embedding:

| Knowledge base size                                                                                  | What to do                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Fits in the context window with room for the answer (roughly, a low five-figure token count or less) | **Inject all of it.** Skip retrieval entirely. Lean on prefix caching for cost. |
| Too big for context, but mostly irrelevant per query                                                 | **RAG.** You genuinely need to select before you ask.                           |
| Huge, and you need freshness or attribution at scale                                                 | **RAG, and invest in it** — rerankers, hybrid search, evals.                    |

RAG is a real solution to a real problem: a corpus that does not fit. The mistake is treating it as the _default_ before checking whether you have that problem. For a surprising number of "chat over our docs" cases — a product manual, an internal wiki, an installation guide — the corpus is small, and the whole retrieval edifice is solving a constraint that a single `Math.ceil(chars / 3)` would have told you that you don't have.

## What I'd Tell You If You're Building One

**Measure the corpus first.** Before you choose an architecture, count the tokens. That one number eliminates entire categories of work. I did the expensive thing twice because I assumed "documents → RAG" without ever checking whether the documents fit.

**Simplicity is a safety feature, not just an aesthetic one.** Every component you delete is a component that cannot fail silently. Removing retrieval did not just simplify the system — it removed a whole class of confident-but-wrong answers that I could not see from the output. In a domain where a wrong torque value is a structural defect, fewer moving parts is a correctness argument.

**Spend your effort where the risk is.** The plumbing — edge function, caching, rate limiting — is mostly solved. The hard, domain-specific work is hallucination control: the anti-invention rules, the mandatory citations, the explicit refusal path. That is where a domain chatbot earns trust, and it is where most of mine actually went.

---

References:

- [DeepSeek API Documentation](https://api-docs.deepseek.com/) — model, pricing, and context-caching behavior
- [Docusaurus](https://docusaurus.io/) — the documentation framework the site is built on
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) — human verification
- [Upstash Redis](https://upstash.com/docs/redis) — stateless-edge rate limiting
