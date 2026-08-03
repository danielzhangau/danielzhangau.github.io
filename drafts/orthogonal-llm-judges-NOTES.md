# Draft notes — `src/content/blog/orthogonal-llm-judges.md`

Working notes for the orthogonal-judges post. Not part of the Astro content
collection, so nothing here is ever built or published. Delete this file once
the post ships.

Post status: `draft: true`. Do not flip to `false` until every P0 below is
resolved.

## Implementation status (resolved — post now matches)

**Confirmed: pointwise only. Pairwise is not implemented.** The post has been
reframed to say so, prominently, at the top of the decisions section rather than
buried in a caveat. Decisions 1, 2 and 4 are now labelled conclusions rather than
results, and the "Where This Breaks Down" section leads with the honest headline
limitation — the harness still cannot answer the question it was built for,
because the verdict needs pairwise.

This is a better post than the version that implied a pairwise harness. The arc
is now: manual review failed → one judge failed → temperature was the wrong fix
→ three orthogonal axes, built and run pointwise → the split list works today →
the verdict still doesn't, and here is exactly what it would take. That is the
same shape as the RAG post, which ended on an honest "a real eval set is the
obvious next step" rather than a fake resolution.

**One status question is still open, and it is now load-bearing:** decision 3
says only the Verifiability judge sees the source documentation. Is that how the
pointwise run is actually wired, or do all three judges currently see the docs?
There is an inline TODO on it. If all three see them, that is a live candidate
explanation for any axis convergence in the results, and it needs to move into
the results section rather than sit in the design section as if it were settled.

Everything else in the post that describes behaviour — three axes, cross-model
assignment, pointwise scoring, the split queue — should be verified against the
prototype before publishing, but nothing else is known to be aspirational.

## Cut from the post, still worth implementing

Two decisions were pulled from the body to control length. They are engineering
hygiene rather than load-bearing argument, so the post survives without them —
but the harness is worse without them, so they stay here as build instructions.
Neither is referenced anywhere in the post, so nothing dangles.

### Verifiability is half a judge and half an assertion

The judgeable part of that axis is "does the cited section support this claim."
The other part — does the cited anchor resolve to a real section at all — is a
string lookup. Resolve citations programmatically **before** the judge runs: it
catches the most common defect deterministically and for free, and it means the
judge spends its attention only on the part that needs judgment. Anything a
judge does that an assertion could do is a place where you have chosen a slower,
more expensive, non-deterministic tool for no reason.

(The general form of this survives in the post, in "The Signal That Needs No
Judge" — *before building a judge for something, check whether it is already a
number.* Citation resolution is named there as an example, so the idea is
present even though the mechanism is not.)

### Pin everything, and re-baseline rather than compare across judge versions

The entire purpose of the harness is comparison across time, which fails
silently if the ruler moves. Pin and record on every run:

- the exact judge model identifiers,
- a hash of each judge prompt,
- the **raw** judge output, not just the extracted score.

Note what is *not* on that list: temperature. Reaching for `temperature=0` to
make a judge reproducible is a reflex worth dropping — several current frontier
models have removed sampling parameters outright, so a reproducibility story
resting on pinned temperature rests on something that may not exist on the model
you want to use next year. Determinism has to come from pinning and
record-keeping instead.

The rule that follows: **when a judge prompt or judge model changes, previous
results are not comparable.** Re-run the old answers through the new judge. That
costs a full re-run every time you touch a prompt, which is exactly why the
prompts need to stop changing before the numbers start mattering.

**TODO: confirm the harness stores raw judge output and prompt hashes. If not,
that is the first thing to add** — it is cheap now and unrecoverable later, and
without it the cross-version comparison this whole post is about will quietly
stop meaning anything the first time a judge model updates underneath you.

## Decisions I made on your behalf (questions 1-7)

Reasoning is in the post; sources at the bottom of this file. Short version:

1. **Aggregation → pairwise for the verdict, pointwise floor for the gate.**
   Not the mean. Mean is a trend line. The gate is "how many answers fall below
   an absolute floor," because in a safety-relevant domain one dangerous answer
   matters more than ten mediocre ones, and a mean hides exactly that.

2. **Judge sees the docs → Verifiability only.** Grounding is undefined without
   the source, so that judge needs them. But giving all three the docs re-couples
   the axes: any judge that can see the specs starts scoring correctness, and
   Expression becomes a second, worse correctness judge. The input each judge
   gets is as much a design decision as its prompt.

3. **Pairwise, not pointwise, for the version comparison.** This is the direct
   fix for the "everything scores 4 or 5" collapse — it is a known property of
   absolute scoring, not a flaw in your prompt. Keep pointwise for the
   diagnostic and the floor.

4. **Disagreement = rank inversion.** One axis prefers version A, another
   prefers version B. No threshold to tune, robust to scale drift. On the
   pointwise side: one axis clears its floor, another fails. (Post decision 4.)

5. **Verbosity bias is the most likely confound, and it is now in Limitations.**
   Judges favour longer answers; full-context injection plausibly changed answer
   length versus RAG, which would move all three axes in the same direction and
   look exactly like an improvement. Log answer length with every score. Position
   bias is handled structurally by running both orderings.

6. **Reproducibility → pin model IDs, hash judge prompts, store raw judge
   output.** Cut from the post for length; full version above under "Cut from
   the post, still worth implementing." Notably *not* temperature.

7. **Outcome judge input → question and answer only, no docs.** Follows from
   decision 2. The post keeps the honest note that "Outcome" is an optimistic
   name for a model's guess at usefulness.

**Question 8 (your answer: loading time, and concise/clear/strongly relevant)**
became a new section, "The Signal That Needs No Judge." Latency is the one real
usage signal in the system and needs no harness — it is tracked as a fourth
dimension alongside the three judge axes, which matters here specifically
because full-context injection puts a large prompt on every request. Your
"concise and clear" maps onto Expression and "strongly relevant" onto Outcome,
which is a decent independent check that the three axes are the right three.

## TODO checklist, ordered by how badly the post needs it

### P0 — post cannot publish without these

1. **"What Actually Diverged" is a placeholder.** Which axes separated across
   versions, which converged, and the tie rate per axis. Directional only, per
   your disclosure call. Without it the post is a design essay, not a build log
   — and the build-log framing is why it fits alongside the other three.
2. **Confirm the three axis names** (Outcome / Expression / Verifiability) and
   paste the actual judge prompt for each. My descriptions are reconstructions
   from your brief.
3. **Which model runs which axis, and why that assignment.**
4. **Single-judge failure evidence** — the score distribution shape, and whether
   the cross-version delta really was smaller than run-to-run spread. Two
   separate claims depend on this.
5. **Confirm decision 3's wiring** — does only the Verifiability judge see the
   source docs, or do all three? Inline TODO in the post. Load-bearing for how
   the convergence results get explained.

### P1 — significantly weakens the post if missing

6. **Cross-model vs same-model-multi-role comparison, if you ran both.** The
   post calls this "the most valuable paragraph" and I stand by that — it is the
   direct empirical test of the convergence claim. Your original framing assumed
   a shared base model; the actual setup is cross-model, so the limitation is
   now argued from shared preference training rather than shared weights. That
   argument needs your data or an explicit "I have not measured this."
7. **Did mean answer length change across the RAG → full-context migration?**
   Now load-bearing for the verbosity-confound limitation.
8. **Latency numbers** — p50/p95 time to first token, and whether it moved
   across the migration. Directional is fine, but this section is thin without
   any number at all.
9. **Eval set sizes**, and whether the synthesized QA pairs were human-reviewed
   before use. Unreviewed synthetic pairs are a meaningful caveat.
10. **Scoring scale used for the pointwise floor** — 1-5, binary, something else.
    The post says 1-5 in the single-judge section; verify, and confirm the three
    axes share a scale.

### P2 — nice to have

11. **Refusal-path negative samples.** Whether the eval set includes questions
    the docs deliberately do not cover. You did not select this option so I did
    not assume it; if it exists it belongs in the eval-set paragraph and links
    back cleanly to the previous post.
12. **An SVG diagram**, matching the other two posts. The natural one now: two
    system versions as columns, three axes as rows, arrows showing which version
    each axis preferred, with the inversions highlighted. Cannot be drawn until
    item 1 lands.
13. **Whether the harness lives in a public repo** worth linking.

## Remaining open questions

Only two survived the research — everything else I resolved above.

1. **Cost of the design.** Both orderings, three axes, two system versions is
   6 judge calls per eval question per comparison, before the pointwise pass.
   For your eval set size that may or may not be trivial. If it is not, the
   honest cheap version is: run pairwise on the hand-written high-risk set only,
   and pointwise on the synthesized breadth set. Worth a sentence in the post if
   you go that way.

2. **Sample size for a believable pairwise result.** A win rate over a small
   set has wide error bars, and the post's whole thesis is that reporting an
   effect inside your noise is a defect. If your eval set is small, "version B
   won on Outcome" may not be a claim you can make yet — the inversion list
   still is, since it is a per-question observation, not an aggregate. Consider
   leading the results section with the inversions and treating the aggregate
   win rates as secondary.

## Constraints applied while drafting

- No employer, client, or product names. The system is described only as
  "construction installation documentation." Note the previous post names the
  product directly; this one deliberately does not, per your brief. Worth a
  consistency decision before publishing — the two posts are explicitly linked,
  so readers will connect them regardless.
- No invented numbers, model versions, costs, timings, or results. Everything
  unknown is an inline `[TODO: Daniel — ...]`.
- External claims are limited to three sources, all verified reachable and
  cited in the post's References section:
  - <https://arxiv.org/abs/2306.05685> — MT-Bench; position/verbosity/
    self-enhancement bias, pairwise protocol
  - <https://arxiv.org/abs/2404.04475> — Length-Controlled AlpacaEval; the
    standard length-bias correction
  - <https://www.braintrust.dev/articles/what-is-rag-evaluation> — groundedness
    as claim-level traceability against source context
  No borrowed statistics appear in the body — the claims are qualitative and
  the reader can follow the links.
- `draft: true` keeps the post out of the listing, RSS, and sitemap.

## Alternate titles

- **A (current):** I Ran Three LLM Judges on the Same Answers: The Disagreement
  Was the Only Signal
- **B:** Temperature Doesn't Create Disagreement, Roles Do: Evaluating a Domain
  Chatbot With No Right Answers
- **C:** One LLM Judge Told Me Nothing: Designing Orthogonal Eval Axes for
  Outputs With No Ground Truth
