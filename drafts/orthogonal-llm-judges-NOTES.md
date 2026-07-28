# Draft notes — `src/content/blog/orthogonal-llm-judges.md`

Working notes for the orthogonal-judges post. Not part of the Astro content
collection, so nothing here is ever built or published. Delete this file once
the post ships.

Post status: `draft: true`. Do not flip to `false` until every P0 below is
resolved.

## ⚠️ Read this first: the post now describes a harness you may not have built

You asked me to research best practice and make the calls on questions 1-7. I
did, and I wrote those decisions into the post as decisions — pairwise verdict
plus pointwise floor, both orderings on every comparison, docs to the
Verifiability judge only, programmatic citation resolution, rank inversion as
the disagreement definition, pinned models and prompt hashes.

**That means the post currently describes a design, some of which the prototype
may not implement yet.** Before publishing, either bring the harness in line
with the decisions, or tell me which ones you are not doing and I will rewrite
those passages as recommendations rather than as things you did. A build log
that describes a harness that does not exist is the one failure mode this post
cannot survive, because the honesty is the whole reason anyone reads it.

Section 6 in particular ("Pin everything") asserts you store raw judge output
and prompt hashes. There is an inline TODO on it, but verify it.

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
   pointwise side: one axis clears its floor, another fails.

5. **Verbosity bias is the most likely confound, and it is now in Limitations.**
   Judges favour longer answers; full-context injection plausibly changed answer
   length versus RAG, which would move all three axes in the same direction and
   look exactly like an improvement. Log answer length with every score. Position
   bias is handled structurally by running both orderings.

6. **Reproducibility → pin model IDs, hash judge prompts, store raw judge
   output.** Notably *not* temperature: several current frontier models have
   removed sampling parameters entirely, so a reproducibility story built on
   `temperature=0` is built on something that may not exist on your next judge
   model. Corollary: when a judge prompt changes, re-run the old answers. Old
   results are not comparable.

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
5. **Reconcile the harness with the six decisions** (see the warning above).

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
