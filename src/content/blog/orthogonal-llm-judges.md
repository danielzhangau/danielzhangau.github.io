---
title: "I Ran Three LLM Judges on the Same Answers: The Disagreement Was the Only Signal"
description: "A build log for evaluating a domain chatbot with no ground truth. Why a single LLM judge and temperature sampling both produce noise instead of signal, how to design orthogonal evaluation axes so judges disagree structurally, and the four harness decisions that determine whether any of it means anything."
pubDate: 2026-07-28
draft: true
tags: ["LLM", "Evaluation", "LLM-as-Judge", "Domain Chatbot", "Production AI", "Prompt Engineering"]
---

At the end of [the last post](/blog/rag-to-full-context-domain-chatbot), where I deleted two generations of RAG in favor of injecting the whole knowledge base into the system prompt, I wrote an honest caveat: I had no evaluation set, only manual spot-checks, and "a real eval set is the obvious next step."

This is what happened when I took that step. It did not go the way I expected, and the useful part is not the harness — it is a design constraint I ended up with: **for outputs with no correct answer, disagreement between judges is only informative if it comes from structure, not from sampling.** A single judge, or one judge sampled five times at high temperature, produces variance. Variance is not signal.

This post is the build log for that: what broke, what I threw away, the four decisions that turned out to matter more than the axis names, and the rule I now use to decide whether an eval harness is worth building at all.

## The Problem: I Could Not Tell If I Had Made It Worse

The chatbot answers questions about construction installation documentation — framing, fasteners, welds, and a dense page of standards specifications. Its architecture went through three generations: client-side RAG, then server-side RAG, then full-context injection with prefix caching.

Each migration was justified by an argument I still believe. But an argument is not a measurement. After the final switch I was left holding a question I could not answer: **are the answers better now, or did I just make the system simpler and quietly worse?**

The obvious move is to measure accuracy. That works for exactly one slice of this domain — the part where the documentation states a number:

> Nut tightening torque: M12 chemset anchor 40Nm, M16 80Nm, M20 135Nm.

If a user asks for the M16 torque, there is a correct string. You can assert on it. No judge required, and you should not use one — a regex is cheaper, deterministic, and cannot be sweet-talked.

But most real questions do not look like that. They look like "what do I need to check before installing this wall connection?" The answer is three paragraphs: the relevant spec, the conditions under which it applies, a cross-reference to the standards page, and — when the documentation genuinely does not cover the case — a refusal telling the user to consult a structural engineer.

There is no correct string for that. There are better and worse answers, and the difference matters, and nothing in my pipeline could see it.

## First Attempt: Look At Them Myself

I did what the previous post described: read the answers by hand, check the high-risk ones against the source documents, confirm citations resolve. This caught real defects. But as a way to answer "did the architecture change help," it fails for three reasons, and only the third surprised me.

**It does not scale.** Obvious, and the least interesting problem.

**It is not repeatable.** My standard on a Tuesday evening is not my standard on a Saturday morning. When the thing you are measuring is a small delta, an unstable ruler is worse than no ruler.

**I was grading my own architecture.** This is the one that actually killed it. I knew which version produced which answer, and I had just spent a week arguing myself into the full-context design. No amount of care fixes that — the bias is in knowing, not in trying. Worse, I was spot-checking the questions I thought of when I designed the system, which are precisely the cases it already handles. Manual review samples from your own imagination, and your imagination is correlated with your prompt.

## Second Attempt: One LLM Judge

So: hand it to a model. Give it the question, the documentation, and the answer, and ask for a score. The first version looked like every LLM-as-judge example you have seen — rate this answer 1-5 on accuracy, completeness, and clarity, and explain your reasoning.

It did not work, in three specific and instructive ways.

**Everything scored high.** The distribution collapsed into the top of the scale. [TODO: Daniel — the actual distribution, e.g. "N% scored 4 or 5"; directionally, near-total collapse into the top two bands.] A scale where almost every sample lands in two adjacent bands is not measuring the thing; it is measuring the model's reluctance to be harsh.

**The delta was smaller than the noise.** Comparing two versions of the system, the difference in mean score was smaller than the spread I got from re-running the same judge on the same answers. [TODO: Daniel — confirm this held, and roughly by how much.] If your effect is inside your error bars, you have not measured anything, you have generated a number.

**One score is a lossy compression of exactly what I wanted to see.** Consider two answers:

- Answer A states the correct torque value and no citation at all.
- Answer B cites three sections correctly and never answers the question.

A single "overall quality" judge gives both a mid-to-high score, for opposite reasons, and hands me one number that cannot distinguish them. But those are completely different defects with completely different fixes. A is a citation-enforcement problem in the system prompt. B is a relevance problem. Collapsing them into one scalar throws away the only information I would have acted on.

That was the moment the problem reframed itself. I did not need a better judge. I needed more than one, and they needed to be able to disagree.

## The Turn: Temperature Does Not Produce Disagreement

The intuitive way to get disagreement is sampling. Run the same judge prompt five times at a higher temperature, look at the spread, treat high variance as "this answer is contentious."

I tried it. It is wrong, and it is wrong in a way worth being precise about.

Temperature-driven variance is **the same evaluator, applying the same criteria, landing on different tokens.** It is a random walk around one judgment. When those five samples disagree, they are not disagreeing about whether the answer is good — they are disagreeing about which of several near-equivalent verbalizations of the same judgment to emit. You are measuring decoding stochasticity.

And it is uncorrelated with what I care about. An answer can be unambiguously bad and get five consistent low scores; an answer can be perfectly fine, sit near a scoring boundary, and get five scattered ones. Sorting by sampling variance sorts your outputs by proximity to a decision boundary, not by quality.

So: **if two judges are asking the same question, their disagreement is noise. If they are asking different questions, their disagreement is information.** The engineering task is not "get a more reliable score" — it is "construct evaluators that are structurally capable of disagreeing, so that when they do, the disagreement localizes a defect."

## Designing Orthogonal Axes

The design goal, stated as a constraint: for each pair of axes, I should be able to write down a real answer that scores high on one and low on the other. If I cannot construct that example, the two axes are measuring the same thing and should be merged.

The three I landed on. [TODO: Daniel — confirm these axis names and paste the actual judge prompt for each; the descriptions below are my reconstruction of the intent.]

**Outcome.** Did the person who asked this get what they needed to do their job? Not "is it well written," not "is it sourced" — can they act on it. A terse, ugly, uncited answer with the right number scores high here. This axis is deliberately blind to form.

**Expression.** Is the answer in the shape this domain requires? Direct answer first, units on every quantity, no hedging, no padding, no restating the question. This axis is deliberately blind to whether the content is correct.

**Verifiability.** Can every factual claim be traced to a specific location in the source documentation, and does that location actually contain the claim? This axis does not care whether the answer is useful or well written — only whether a human on site could check it.

The orthogonality is not an aspiration; each pair has a concrete failure mode that separates them:

| Combination                      | What it looks like in this domain                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| High Outcome / low Verifiability | Correct spec, no citation. Right answer that an installer cannot confirm before drilling.       |
| High Verifiability / low Outcome | Three perfect citations that recite the documentation without answering the question asked.     |
| High Expression / low Outcome    | Confident, well-formatted, correctly-united, wrong. The most dangerous quadrant in this domain. |
| High Outcome / low Expression    | Right answer buried in four paragraphs of preamble, or a number with no unit.                   |

That last column is the actual design work. Anyone can name three plausible-sounding dimensions. The test is whether you can produce a real example of each off-diagonal combination from your own logs. If every example you try to construct feels contrived, your axes are collinear and you have built one judge wearing three hats.

Each axis runs on a **different model**. [TODO: Daniel — which model per axis, and the reasoning behind the assignment.] The intent is that axis independence should not be undermined by three prompts sharing one set of weights — though as the limitations section says, this buys less independence than it looks like.

The evaluation set is two sources, deliberately: **hand-written high-risk questions** covering the specs where a wrong answer is a structural defect rather than an inconvenience, and **QA pairs synthesized from the source documents** for breadth. [TODO: Daniel — size of each set, and whether the synthesized pairs were reviewed before use.] The hand-written set covers what I know to be dangerous; the synthesized set covers what I did not think to ask. Neither is real user traffic, which is a gap I come back to.

## Four Decisions That Decide Whether Any of This Means Anything

Naming three axes is the easy part. What follows determines whether the numbers coming out are worth reading — and before any of it, the status, because it changes how you should read the rest of this post.

**What I have actually run is pointwise scoring on all three axes, with every judge receiving the source documentation. Not one of the four decisions below is implemented.** Three of them describe machinery I have not built. The fourth describes a defect I have not yet fixed. I am writing them down anyway, because working out _why_ the first harness could not answer my question turned out to be the part that transfers — and because a build log that quietly upgrades its plans into its accomplishments is worth nothing.

**1. Pairwise for the verdict, per-axis rubric for the diagnosis.**

The "everything scores 4 or 5" collapse is a known property of pointwise absolute scoring, not a quirk of my prompt. Asking a model to hold a stable absolute standard across runs, across models, and across months is asking it for the thing it is worst at. Pairwise comparison — here are two answers to the same question, which is better on this axis — is a far easier question, and it is the question I actually have. I am not trying to learn that the system scores 4.2. I am trying to learn whether version B beat version A.

The two are for different jobs, and I built the wrong one first. **Pointwise rubric diagnoses**: which axis is weak in absolute terms, and which specific answers fall below a floor. That is what I have. **Pairwise decides**: did this change help, per axis. That is what I wanted, and what I have been reading my pointwise means as if they were — which is the mistake. A pointwise mean is a trend line, not a verdict.

**2. Every pairwise call runs in both orderings.**

LLM judges have a position preference: the same two answers, swapped, can flip the verdict. This was identified in the original MT-Bench work alongside verbosity and self-enhancement bias, and it has not gone away. A single-ordering pairwise result is not a measurement.

So when I build it, each comparison runs twice, A/B and B/A, and only a verdict that survives the swap counts as a preference. A flip is recorded as a tie — and a high tie rate on an axis is itself a finding: that axis cannot tell the two versions apart. This doubles the judge cost and it is non-negotiable. An eval you cannot trust is more expensive than one that costs twice as much.

**3. Only the Verifiability judge sees the source documentation.**

This is a genuine fork, and my first instinct was wrong. Grounding is defined by the source: "does this claim appear in the documentation" is answerable only with the documentation in context. Without it, a judge is scoring whether a claim _sounds like_ the kind of thing the docs would say — plausibility wearing the name of verification.

But handing the docs to all three judges quietly destroys the orthogonality. A judge that can see the specs starts scoring correctness no matter what its prompt says about form; the Expression axis becomes a second, worse correctness judge, and the three axes collapse toward each other. So the docs go to Verifiability only. Outcome and Expression see the question and the answer and nothing else. **Narrow inputs are part of what keeps axes narrow** — the input each judge receives is as much a design decision as the prompt.

This is the one item here that is not a plan but a correction: my harness hands the documentation to all three judges right now. I wired it that way without thinking about it, because giving each judge everything it might need felt obviously safe — and "give it everything" is precisely the instinct that collapses three axes into one. It is the cheapest thing on this list to fix and the first one I will, because until it is fixed I cannot tell a real convergence result from an artifact of my own plumbing.

**4. Disagreement is a threshold crossing, not a score gap.**

"The axes split" needs a definition that cannot be tuned into existence by picking a convenient cutoff. Pointwise, which is what I have, that definition is **one axis clears its floor and another fails on the same answer** — a crossing, not a distance. Once pairwise exists it gets a sharper form: Outcome prefers version B, Verifiability prefers version A. Two axes pointing opposite directions on the same question is unambiguous and robust to scale drift in a way no score gap is.

Either way the consequence is the same, and it is the most useful thing this exercise produced: the moment disagreement had a definition, the aggregate scores stopped being the interesting output. The split list is.

## The Signal That Needs No Judge

There is one quality signal here that requires no evaluation harness at all, and I nearly overlooked it because it does not look like "answer quality": **how long the user waits.**

It matters more in this system than it would in most, because of the architecture from the last post. Full-context injection means every request carries the entire knowledge base in the prompt. Prefix caching makes that nearly free in dollars — that was the whole argument — but cost and latency are different questions, and a cache hit is not the same as an instant response. Time to first token is measurable directly, per request, with no judge, no eval set, and no ambiguity.

So it goes into the harness as a fourth dimension that is not a judge axis: measured, logged, tracked per version alongside the three scores. If a change improves Outcome and doubles time-to-first-token, that is not obviously a win, and no judge would have told me. [TODO: Daniel — current p50/p95 time to first token, and whether it moved across the RAG → full-context migration. Directional is fine.]

The general form: **before building a judge for something, check whether it is already a number.** Latency is. Citation resolution is. Answer length is. What is left over — is this useful, is this well-formed, is this checkable — is the part that actually needs judgment.

## What Actually Diverged

This is where I have to be careful, because it is the part of a post like this that is most tempting to write ahead of the data. The harness is a prototype, the judge prompts are still moving, and everything below comes from pointwise scoring only — so what follows is how I read the output, not a claim about final numbers, and not the version comparison I actually wanted.

[TODO: Daniel — the core empirical result. Which axes separated across system versions, which converged, and the tie rate per axis. Directional statements only, per your call on disclosure. This is the load-bearing section of the post and it is currently a placeholder.]

One caveat has to come before any number, and it is my own fault: **all three judges currently see the source documentation.** Any convergence between axes in this data has a mundane explanation available — three judges that can all check the specs will all, to some degree, end up scoring correctness — and I cannot separate that from a real finding until the inputs are narrowed. Note the asymmetry, because it is what makes the run worth anything at all: shared inputs push the axes _together_, so convergence is currently uninterpretable, while **divergence still counts**. If two axes disagree despite reading the same material, that disagreement is real.

The reading framework, which does not depend on the specific numbers:

**If two axes track each other across the whole set, they are not orthogonal.** Three causes, and they need ruling out in order of dumbness: the inputs leaked, which for me they currently do; or the prompts leaked into each other — a Verifiability prompt that says "a good answer cites its sources" has quietly imported a quality judgment; or the underlying property really is one property, and I should merge the axes and reclaim the budget.

**If an axis gives nearly every answer the same score, it has no discriminative power.** Two causes, different responses. Either the outputs genuinely clear that bar, in which case the axis is real but the bar is too low to be informative; or the axis is not something a judge can assess from the input it gets, in which case it should not be a judge at all.

**The answers where the axes split are the whole product.** Not the per-axis aggregates — the _list of answers where one axis passes and another fails._ Those are the cases where something real is happening, and they are the only queue I review by hand. The harness's job is not to score my system; it is to shrink the set of answers I must read from all of them down to the contested ones. This is the one part of the design that works today, without pairwise.

## Where This Breaks Down

Four honest limitations, in descending order of how much they bother me.

**It still cannot answer the question I built it for.** Pointwise scoring tells me how the current system looks against an absolute rubric. It does not tell me whether the architecture change helped, because a mean whose movement is smaller than its own run-to-run spread is not a comparison — that is the failure that started this whole exercise, and swapping one judge for three orthogonal ones did not fix it. What three axes bought me is a better _diagnosis_: I can now see which dimension is weak and which specific answers are contested. The verdict needs pairwise, and pairwise is not built. I would rather say that plainly than present a diagnostic instrument as if it were a decision procedure.

**Different models do not buy as much independence as it looks — but check your own wiring before you believe that.** Running each axis on a different model removes shared weights, not shared preferences. Contemporary instruction-tuned models have been through broadly similar preference training and inherit a broadly similar aesthetic: longer is more thorough, structured is more rigorous, hedged is more careful. The more holistic a question you ask, the more they converge — not because they agree about the answer, but because they were shaped to like the same _kind_ of answer. Orthogonality survives only as long as each axis stays narrow and mechanical; ask any judge for "overall quality" and you get that shared preference back, whatever the nameplate says.

That is the interesting explanation for axis convergence, and I am not entitled to it yet, because a boring one is sitting in my own harness giving all three judges the same documents. This is the trap in writing up an eval: the interesting failure mode is the one you want to have found, and it is the one you will reach for first. Rule out your plumbing before you publish a claim about model psychology. [TODO: Daniel — cross-model versus same-model-multi-role, if you ran both. Worth re-running after the input fix; the current numbers cannot separate the two explanations.]

**Verbosity is the most likely confound.** LLM judges reliably favor longer answers, and length-controlled evaluation exists as a standard correction because of it. Full-context injection plausibly changed answer length relative to RAG — which would push every axis in the same direction at once and look exactly like an improvement. So answer length is logged with every score, and if mean length moved between versions, the comparison has to be re-checked on a length-matched subset before I believe it. [TODO: Daniel — did mean answer length change across the migration?]

**Nothing in this harness has met a real user.** Three gaps that are really one gap. The Outcome axis is named optimistically — no judge knows whether the person on the job site got what they needed, so what it produces is a model's estimate of usefulness, formed without the situation, the site conditions, or the follow-up question the user would have asked. There is no human baseline either: I have not measured agreement between these judges and a domain expert, so I know the axes separate from each other but not whether any of them tracks reality. And the eval set is hand-written plus synthesized, which covers what I imagined and what the documents contain, not how someone phrases a question on a roof holding a phone — abbreviations, typos, missing context, three questions at once. Time-to-first-token is the only measurement in the whole system that comes from reality rather than from my own imagination. [TODO: Daniel — is a human-labeled subset feasible? Even 30-50 expert-scored answers would turn this from "the judges disagree with each other" into "the judges agree with a person."]

## The Rule of Thumb

When this is worth building, and when it is not:

| Situation                                                                                 | What to do                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The property is already a number — latency, a resolvable citation, a unit, an exact value | **Assert on it.** Not a judge. Deterministic, free, and cannot be flattered.                                                      |
| Output is prose with no correct answer, and you are iterating on it frequently            | **Orthogonal multi-axis judges, pairwise for the verdict.** The disagreement queue is the deliverable, not the scores.            |
| Output is prose with no correct answer, but the system is stable                          | **A fixed manual checklist.** Twenty questions you re-read after each change beats a harness you built once and stopped trusting. |
| You want one number to report                                                             | **Don't.** A single overall score is the least informative artifact you can produce and the easiest to fool yourself with.        |

The threshold, concretely: build this when you can no longer hold the change's effect in your head — when you have made enough consecutive prompt and architecture changes that you cannot say which one moved the behavior. Below that, manual review is not a compromise, it is correct, and it is faster.

## What I'd Tell You If You're Building One

**Design for disagreement before you write a prompt.** For every pair of axes, write down a real answer that scores high on one and low on the other, using outputs from your actual system. If you cannot, you do not have two axes. That costs an afternoon and saves you from building a harness that produces three correlated numbers and calls it coverage.

**Sampling variance is not evaluator disagreement.** Re-rolling the same judge measures your decoder. If you want two opinions, give them two different questions, not two different random seeds.

**Ask the easier question.** Almost every "my judge scores everything 4 out of 5" problem is a pointwise problem. You rarely need an absolute score; you need to know which of two versions is better, and models are far better at that comparison than at holding a stable absolute scale.

**The output you want is a queue, not a score.** Aggregates are for tracking over time. What changes your Monday is the list of answers where your axes disagree with each other — that is where the defects live, and it is short enough to read. You get that list from the cheap half of this design, before any of the comparison machinery exists.

**Be suspicious of convergence.** If all your judges agree all the time, the pleasant interpretation is that your system is good. The likelier one is that you asked them the same question three times.

---

References:

- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — the original treatment of position, verbosity, and self-enhancement bias in LLM judges, and of pairwise comparison as an evaluation protocol
- [Length-Controlled AlpacaEval](https://arxiv.org/abs/2404.04475) — a standard correction for length bias in automatic evaluators
- [What is RAG evaluation?](https://www.braintrust.dev/articles/what-is-rag-evaluation) — groundedness and faithfulness as claim-level traceability against source context

<!-- Draft notes, TODO checklist, and alternate titles: drafts/orthogonal-llm-judges-NOTES.md (outside the content collection, never built). -->
