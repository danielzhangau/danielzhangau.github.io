# Draft notes — `src/content/blog/orthogonal-llm-judges.md`

Working notes for the orthogonal-judges post. Not part of the Astro content
collection, so nothing here is ever built or published. Delete this file once
the post ships.

Post status: `draft: true`. Do not flip to `false` until every P0 below is
resolved — the empirical section is currently a placeholder.

## TODO checklist, ordered by how badly the post needs it

### P0 — post cannot publish without these

1. **"What Actually Diverged" is entirely a placeholder.** Which axes separated
   across system versions, and which converged? Directional statements only,
   per your disclosure call. This is the empirical core; without it the post is
   a design essay, not a build log — and the build-log framing is the whole
   reason it fits alongside the other three.
2. **Confirm the three axis names** (Outcome / Expression / Verifiability) and
   paste the actual judge prompt for each. The descriptions in the post are my
   reconstruction of the intent from your brief and may not match what you
   built.
3. **Which model runs which axis, and the reasoning behind the assignment.**
   Referenced in "Designing Orthogonal Axes" and load-bearing for the first
   limitation.
4. **Single-judge failure evidence.** The score distribution shape, and whether
   the cross-version delta really was smaller than run-to-run spread. Two
   separate claims in "Second Attempt" depend on this; both are marked inline.

### P1 — significantly weakens the post if missing

5. **Cross-model vs. same-model-multi-role comparison, if you ran both.** The
   post flags this as "the most valuable paragraph" and I stand by that — it is
   the direct empirical test of the convergence claim. Your original framing
   assumed a shared base model; the actual setup is cross-model, so the
   limitation is now argued from shared preference training rather than shared
   weights. That argument needs either your data or an explicit "I have not
   measured this" qualifier.
6. **Eval set sizes** (hand-written high-risk set / synthesized QA pairs), and
   whether the synthesized pairs were human-reviewed before use. Unreviewed
   synthetic pairs are a meaningful caveat if so.
7. **Scoring scale actually used** — 1-5, binary, pairwise? The post says 1-5 in
   the single-judge section. Verify, and confirm the three axes use the same
   scale as each other.

### P2 — nice to have

8. **Refusal-path negative samples.** Whether the eval set includes questions
   the documentation deliberately does not cover. You did not select this
   option, so I did not assume it. If it exists it belongs in the eval-set
   paragraph and links back cleanly to the previous post's refusal-path
   section.
9. **An SVG diagram**, matching the other two posts. The natural one: three
   axes as columns, a handful of answers as rows, off-diagonal cells
   highlighted as the disagreement queue. Cannot be drawn until item 1 lands.
10. **Whether the harness lives in a public repo** worth linking at the bottom.

## Questions I could not resolve myself

These are the technical decisions where I could not tell what you actually did,
and where guessing would have changed the argument.

1. **How is an axis score aggregated across the eval set, and how do you decide
   a version regressed?** Mean per axis, worst-case, or count of answers below
   a floor? For a safety-relevant domain, mean is arguably the wrong statistic —
   one dangerous answer matters more than ten mediocre ones — but I do not know
   which you used, and it changes the "how I read the results" framework.

2. **Do the judges see the source documentation, or only the question and
   answer?** This is the single biggest determinant of what Verifiability can
   possibly measure. With docs in context it is a grounding check; without, it
   is a plausibility check wearing the same name.

3. **Do judges score one answer at a time, or compare two versions side by
   side?** Pairwise comparison usually has far better discriminative power than
   absolute scoring, and would directly address the "everything scores high"
   collapse. If you used absolute scoring, that is worth one sentence of
   justification in the post; if pairwise, several paragraphs need rewriting.

4. **Is the disagreement queue thresholded or ranked?** The post claims the
   queue is the real deliverable. Concretely: what counts as "the axes split" —
   a fixed gap, a rank inversion, a disagreement on the pass/fail side of a
   floor?

5. **Did you control for position or verbosity bias?** LLM judges reliably
   favour longer answers. Full-context injection plausibly changed answer
   length relative to RAG, which would confound every axis simultaneously and
   in the same direction. If you did not check this, it belongs in Limitations,
   because it is the most likely alternative explanation for any measured
   improvement.

6. **Are judge runs pinned and reproducible?** Model version, temperature,
   seed. Without pinning, a judge model silently updating underneath you
   invalidates cross-version comparison — which is the entire purpose of the
   harness. This is the thing most likely to bite you six months out.

7. **What does the Outcome axis actually receive as input?** If it sees only the
   answer, it is judging self-sufficiency. If it also sees the question's
   intent or a reference answer, it is judging something closer to task
   completion. The post names the axis "Outcome," which is a strong claim.

8. **Is there any signal from real usage** — thumbs, follow-up questions,
   repeat queries, session abandonment? Even weak behavioural signal would
   partly close the "no human baseline" gap, and it is the natural next post.

## Constraints applied while drafting

- No employer, client, or product names. The system is described only as
  "construction installation documentation." Note that the previous post names
  the product directly; this one deliberately does not, per your brief. Worth a
  consistency decision before publishing — the two posts are explicitly linked,
  so a reader will connect them regardless.
- No invented numbers, model versions, costs, timings, or experimental results.
  Everything unknown is an inline `[TODO: Daniel — ...]` marker.
- No external or industry data cited, so there is nothing to source-check.
- `draft: true` keeps the post out of the listing, the RSS feed, and the
  sitemap until the TODOs are filled.

## Alternate titles

- **A (current):** I Ran Three LLM Judges on the Same Answers: The Disagreement
  Was the Only Signal
- **B:** Temperature Doesn't Create Disagreement, Roles Do: Evaluating a Domain
  Chatbot With No Right Answers
- **C:** One LLM Judge Told Me Nothing: Designing Orthogonal Eval Axes for
  Outputs With No Ground Truth
