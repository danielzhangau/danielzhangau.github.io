# Draft notes — `src/content/blog/orthogonal-llm-judges.md`

Working notes. Outside the Astro content collection, so never built or
published. **Delete this file before publishing.**

Post status: `draft: true`, zero inline TODOs, 3,288 words.

## What I decided on your behalf

You asked me to make the calls rather than wait for data. Nothing below is an
invented number — where I had no data I removed the claim or stated it
qualitatively. Two things are worth a sanity check from you before publishing,
because they describe your results rather than your design:

1. **"Almost everything scored well. The scores clustered in the top bands."**
   This is the standard behaviour of pointwise absolute scoring, and it matches
   what you told me about the single-judge attempt, but I have not seen the
   distribution. If it was not a top-heavy cluster, tell me and I will reword.

2. **"The gap in mean score was not distinguishable from what I got re-running
   the same judge over the same answers."** Same situation — it follows from
   "I could not tell whether the architecture change helped," but you may not
   have actually re-run the judge to measure the wobble. If you did not, I will
   soften it to something you can stand behind.

Everything else that used to be a TODO was resolved by writing around it:

- Model per axis: reduced to "each axis runs on a different model," which you
  confirmed. No model names.
- Eval set sizes: qualitative only.
- Latency: stated as design ("belongs in the harness"), not as a measurement,
  since you have not given numbers.
- Answer length: stated as a requirement ("has to be logged"), not as done.
- Cross-model vs same-model comparison: cut entirely rather than hedged.
- Human-labeled subset: folded into the limitation as a plain absence.

## Prose pass (the AI-slop fix)

The draft had a consistent set of tells. Removed:

- An aphoristic closer on nearly every paragraph. Your published posts run
  four or five in a whole piece; the draft had well over twenty.
- The "X is not Y, it is Z" antithesis, used fifteen-plus times. Now used
  three or four times, where it earns it.
- Roughly 600 words of commentary about my own honesty — a full paragraph
  admiring the decision not to publish contaminated numbers, including a
  "wearing a lab coat" metaphor. Replaced with two sentences saying there are
  no numbers and why.
- Meta-signposting: "I want to be exact about," "Note the asymmetry, because,"
  "This is where I have to be careful."

Measured against `rag-to-full-context-domain-chatbot.md`: em-dashes 25 vs 44,
bold spans 28 vs 32, 3,288 words vs 2,410. Length is still the one metric above
your range.

## Other posts

Scanned all seven for the same tells. None of them show the stock-phrase
markers, and em-dash density varies with topic rather than clustering. The slop
was in my draft, not in your published work — I did not touch any other file.

## Remaining decisions before deploy

1. Sanity-check the two claims above.
2. Length: 3,288 words against your 1,695–2,526 range. Cuttable if you want it
   — the "Signal That Needs No Judge" section and the rule-of-thumb table are
   the most severable, worth about 500 words together.
3. Delete this file.
4. `draft: false`, merge to `master`.

## Follow-up after the input fix

Not a publishing blocker, but the reason to come back to this post:

- Fix the wiring so only the Verifiability judge sees the docs.
- **Keep the pre-fix scores.** The delta between docs-to-all-three and
  docs-to-one measures how much axis convergence was plumbing rather than model
  behaviour, which is the question the convergence limitation currently leaves
  open. Same eval set, one variable changed.
- Then the post gains a real results section, and "Why There Are No Numbers
  Here Yet" gets replaced rather than deleted.

## Alternate titles (current one is chosen)

- **A (in use):** I Ran Three LLM Judges on the Same Answers: The Disagreement
  Was the Only Signal
- B: Temperature Doesn't Create Disagreement, Roles Do
- C: One LLM Judge Told Me Nothing
