---
title: "I Ran Three LLM Judges on the Same Answers: The Disagreement Was the Only Signal"
description: "A build log for evaluating a domain chatbot that has no ground truth. Why one LLM judge and temperature sampling both produce noise, how to design evaluation axes that can disagree with each other, and what I got wrong wiring the harness up."
pubDate: 2026-08-05
draft: false
tags: ["LLM", "Evaluation", "LLM-as-Judge", "Domain Chatbot", "Production AI", "Prompt Engineering"]
---

At the end of [the last post](/blog/rag-to-full-context-domain-chatbot), where I deleted two generations of RAG and injected the whole knowledge base into the system prompt instead, I admitted I had no evaluation set — only manual spot-checks — and that a real one was the obvious next step.

I built it. It still cannot answer the question I built it for, and working out why turned out to be worth more than the harness.

The short version: for answers with no correct string, judges only tell you something when they can disagree for structural reasons. One judge gives you one opinion. The same judge sampled five times at high temperature gives you five samples of one opinion. Neither is a second opinion.

## The Problem: I Could Not Tell If I Had Made It Worse

The chatbot answers questions about construction installation documentation — framing, fasteners, welds, and a dense page of standards specifications. Its architecture went through three generations: client-side RAG, then server-side RAG, then full-context injection with prefix caching.

Each migration was justified by an argument I still believe. But an argument is not a measurement, and after the last switch I was holding a question I could not answer: are the answers better now, or did I make the system simpler and quietly worse?

The obvious move is to measure accuracy. That works for one slice of this domain — the part where the documentation states a number:

> Nut tightening torque: M12 chemset anchor 40Nm, M16 80Nm, M20 135Nm.

If someone asks for the M16 torque, there is a correct string, and you can assert on it. No judge required, and you should not use one: a regex is cheaper, deterministic, and cannot be sweet-talked.

Most real questions do not look like that. They look like "what do I need to check before installing this wall connection?" The answer runs three paragraphs — the relevant spec, the conditions it applies under, a cross-reference to the standards page, and, when the documentation genuinely does not cover the case, a refusal telling the user to consult a structural engineer.

There is no correct string for that. There are better and worse answers, the difference matters, and nothing in my pipeline could see it.

## First Attempt: Read Them Myself

I did what the previous post described: read the answers by hand, check the high-risk ones against the source documents, confirm the citations resolve. It caught real defects. As a way to answer "did the architecture change help," it failed for three reasons, and only the third surprised me.

**It does not scale.** The least interesting problem.

**It is not repeatable.** My standard on a Tuesday evening is not my standard on a Saturday morning, and the effect I was looking for was small enough to disappear into that.

**I was grading my own architecture.** I knew which version produced which answer, and I had just spent a week arguing myself into the full-context design. No amount of care fixes that; the bias is in knowing, not in trying. Worse, I was spot-checking the questions I thought of while designing the system, which are exactly the cases it already handles. Manual review samples from your own imagination, and your imagination is correlated with your prompt.

## Second Attempt: One LLM Judge

So hand it to a model. Give it the question, the documentation, and the answer, and ask for a score. My first version looked like every LLM-as-judge example you have seen — rate this 1-5 on accuracy, completeness, and clarity, and explain your reasoning.

It failed in three ways.

**Almost everything scored well.** The scores clustered in the top bands. This is the normal behaviour of pointwise absolute scoring rather than a quirk of my prompt: a scale where nearly every sample lands in two adjacent bands is measuring the model's reluctance to be harsh.

**The difference I cared about was smaller than the judge's own wobble.** Comparing two versions of the system, the gap in mean score was not distinguishable from what I got re-running the same judge over the same answers.

**One score threw away the thing I wanted.** Consider two answers:

- Answer A gives the correct torque value and no citation at all.
- Answer B cites three sections correctly and never answers the question.

A single "overall quality" judge scores both somewhere in the middle-to-high range, for opposite reasons. Those are different defects with different fixes — A is a citation-enforcement problem in the system prompt, B is a relevance problem — and collapsing them into one number discards the only part I would have acted on.

That reframed the problem. I did not need a better judge. I needed more than one, and they needed to be able to disagree.

## Temperature Does Not Produce Disagreement

The intuitive way to get disagreement is sampling: run the same judge prompt five times at a higher temperature, look at the spread, treat high variance as "this answer is contentious."

I tried it. It is the wrong tool, and it is worth being precise about why.

Temperature variance is one evaluator applying one set of criteria and landing on different tokens. When those five samples disagree, they are not disagreeing about whether the answer is good; they are picking between near-equivalent ways of saying the same judgment. You are measuring the decoder.

It also does not correlate with anything useful. An answer can be plainly bad and get five consistent low scores. An answer can be fine, sit near a scoring boundary, and get five scattered ones. Sorting by sampling variance sorts your outputs by how close they are to a decision boundary.

The rule I took from that: if two judges are asking the same question, their disagreement is noise. If they are asking different questions, it is information.

## Designing Axes That Can Disagree

The design constraint I settled on: for each pair of axes, I should be able to write down a real answer that scores high on one and low on the other. If I cannot construct that example, the two axes measure the same thing and should be merged.

The three I landed on:

**Outcome.** Did the person asking get what they needed to do their job? Not whether it is well written, not whether it is sourced — can they act on it. A terse, ugly, uncited answer with the right number scores high here.

**Expression.** Is the answer in the shape this domain requires? Direct answer first, units on every quantity, no hedging, no padding, no restating the question. This axis is blind to whether the content is correct.

**Verifiability.** Can every factual claim be traced to a specific place in the source documentation, and does that place actually contain the claim? A human on site has to be able to check it.

Each pair has a concrete failure mode that separates them:

| Combination                      | What it looks like in this domain                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| High Outcome / low Verifiability | Correct spec, no citation. Right answer that an installer cannot confirm before drilling.       |
| High Verifiability / low Outcome | Three perfect citations that recite the documentation without answering the question asked.     |
| High Expression / low Outcome    | Confident, well-formatted, correctly-united, wrong. The most dangerous quadrant in this domain. |
| High Outcome / low Expression    | Right answer buried in four paragraphs of preamble, or a number with no unit.                   |

That last column is the actual design work. Anyone can name three plausible-sounding dimensions. The test is whether you can produce a real example of each off-diagonal combination from your own logs. If the examples all feel contrived, your axes are collinear and you have built one judge wearing three hats.

Each axis runs on a different model, so that independence between axes does not rest entirely on three prompts sharing one set of weights. As the limitations section says, this buys less than it looks like.

The evaluation set comes from two places: hand-written questions covering the specs where a wrong answer is a structural defect rather than an inconvenience, and QA pairs synthesized from the source documents for breadth. The hand-written set covers what I know is dangerous; the synthesized set covers what I did not think to ask. Neither is real user traffic.

## Four Decisions, None of Them Implemented

Naming three axes was the easy part. What follows is what decides whether the numbers mean anything — and the status first, because it changes how to read the rest.

What I have run is pointwise scoring on all three axes, with every judge receiving the source documentation. None of the four decisions below is in the harness yet. Three describe machinery I have not built; the fourth describes a defect I have not fixed.

**1. Pairwise for the verdict, pointwise for the diagnosis.**

Asking a model to hold a stable absolute standard across runs and across months is asking it for the thing it is worst at. Pairwise comparison — here are two answers to the same question, which is better on this axis — is a much easier question, and it is the one I actually have. I do not need to know that the system scores 4.2. I need to know whether version B beat version A.

The two do different jobs and I built the wrong one first. Pointwise tells me which axis is weak in absolute terms and which answers fall below a floor. Pairwise tells me whether a change helped. I have been reading pointwise means as though they were verdicts, which is the mistake.

**2. Every pairwise call runs in both orderings.**

Judges have a position preference: the same two answers, swapped, can flip the verdict. This was documented in the original MT-Bench work alongside verbosity and self-enhancement bias, and it has not gone away.

So each comparison runs twice, A/B and B/A, and only a verdict that survives the swap counts. A flip is recorded as a tie, and a high tie rate on an axis is itself a finding: that axis cannot tell the two versions apart. It doubles the judge cost. An eval you cannot trust is more expensive than one that costs twice as much.

**3. Only the Verifiability judge sees the source documentation.**

Grounding is defined by the source. "Does this claim appear in the documentation" is only answerable with the documentation in context; without it, a judge is scoring whether a claim sounds like something the docs would say.

But giving the docs to all three judges destroys the separation between them. A judge that can see the specs starts scoring correctness whatever its prompt says about form, so the Expression axis becomes a second, worse correctness judge. The input each judge receives is as much a design decision as its prompt.

This one is not a plan but a correction. My harness hands the documentation to all three judges right now. I wired it that way without thinking, because giving each judge everything it might need felt safe, and "give it everything" is what collapses three axes into one. It is the cheapest thing on the list to fix and the first thing I will fix.

**4. Disagreement is a threshold crossing, not a score gap.**

"The axes split" needs a definition you cannot tune into existence by picking a convenient cutoff. Pointwise, that is one axis clearing its floor while another fails on the same answer. Once pairwise exists it gets a sharper form: Outcome prefers version B, Verifiability prefers version A. Two axes pointing in opposite directions on one question is robust to scale drift in a way a score gap is not.

Once disagreement had a definition, the aggregate scores stopped being the interesting output and the split list started being it.

## The Signal That Needs No Judge

One quality signal here needs no evaluation harness at all, and I nearly missed it because it does not look like answer quality: how long the user waits.

It matters more in this system than in most. Full-context injection means every request carries the entire knowledge base in the prompt. Prefix caching makes that nearly free in dollars — that was the whole argument last time — but cost and latency are different questions, and a cache hit is not the same as an instant response.

So time to first token belongs in the harness as a fourth dimension that is not a judge axis, measured per request and tracked per version alongside the three scores. A change that improves Outcome and doubles time to first token is not obviously a win, and no judge would have told me.

The general form: before building a judge for something, check whether it is already a number. Latency is. Citation resolution is. Answer length is. What is left over — is this useful, is this well-formed, is this checkable — is the part that needs judgment.

## Why There Are No Numbers Here Yet

I ran the three axes pointwise over the eval set and got three columns of numbers. I am not going to show them. All three judges were reading the same documents when they produced those scores, and that is the wiring that makes axes agree with each other, so the correlations I have measure my harness rather than the system.

One asymmetry keeps the run from being wasted. Shared inputs push axes together, so convergence in this data means nothing, but divergence still counts. Two axes that disagree despite reading the same material are disagreeing about something real.

What I can give you is the reading framework, which I would have needed anyway:

**If two axes track each other across the whole set, they are not orthogonal.** Three causes, worth ruling out in this order: the inputs leaked, which for me they currently do; the prompts leaked into each other, as when a Verifiability prompt says "a good answer cites its sources" and quietly imports a quality judgment; or the underlying property really is one property and the axes should be merged.

**If an axis gives nearly every answer the same score, it has no discriminative power.** Either the outputs genuinely clear that bar, in which case the axis is real but the bar is too low to be informative, or the axis is not something a judge can assess from the input it gets.

**The answers where the axes split are the product.** Not the per-axis aggregates — the list of answers where one axis passes and another fails. Those are the only ones I review by hand now. The harness's job is not to score the system; it is to shrink the set of answers I have to read down to the contested ones. That part works today, without pairwise.

## Where This Breaks Down

Four limitations, in descending order of how much they bother me.

**It still cannot answer the question I built it for.** Pointwise scoring tells me how the system looks against an absolute rubric. It does not tell me whether the architecture change helped, because a mean that moves less than its own run-to-run spread is not a comparison. That is the failure that started this whole exercise, and swapping one judge for three did not fix it. What three axes bought me is a better diagnosis — which dimension is weak, which answers are contested. The verdict needs pairwise, and pairwise is not built.

**Different models buy less independence than they look like they do.** Running each axis on a different model removes shared weights, not shared preferences. Instruction-tuned models have been through broadly similar preference training and come out with a broadly similar aesthetic: longer reads as more thorough, structured as more rigorous, hedged as more careful. The more holistic the question you ask, the more they converge — not because they agree about the answer but because they were shaped to like the same kind of answer. Separation survives only while each axis stays narrow and mechanical.

That is the interesting explanation for axis convergence, and I have not earned it, because a boring one is sitting in my own harness handing all three judges the same documents. Rule out your plumbing before reaching for a claim about model behaviour.

**Verbosity is the most likely confound.** Judges favour longer answers, which is why length-controlled evaluation exists as a standard correction. Full-context injection plausibly changed answer length relative to RAG, and that would push every axis the same way at once and look like an improvement. So answer length has to be logged with every score, and if the mean moved between versions the comparison needs re-checking on a length-matched subset.

**Nothing in this harness has met a real user.** The Outcome axis is named optimistically: no judge knows whether the person on the job site got what they needed, so what it produces is a model's estimate of usefulness formed without the site, the conditions, or the follow-up question. There is no human baseline either — I have not measured these judges against a domain expert, so I know the axes separate from each other but not whether any of them tracks reality. And the eval set covers what I imagined and what the documents contain, not how someone phrases a question on a roof holding a phone: abbreviations, typos, missing context, three questions at once. Time to first token is the only measurement here that comes from outside my own head.

## The Rule of Thumb

When this is worth building, and when it is not:

| Situation                                                                                 | What to do                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The property is already a number — latency, a resolvable citation, a unit, an exact value | **Assert on it.** Not a judge. Deterministic, free, and cannot be flattered.                                                      |
| Output is prose with no correct answer, and you are iterating on it frequently            | **Multi-axis judges, pairwise for the verdict.** The disagreement queue is the deliverable, not the scores.                       |
| Output is prose with no correct answer, but the system is stable                          | **A fixed manual checklist.** Twenty questions you re-read after each change beats a harness you built once and stopped trusting. |
| You want one number to report                                                             | **Don't.** A single overall score is the least informative artifact you can produce and the easiest to fool yourself with.        |

Concretely: build this when you can no longer hold the change in your head — when you have made enough consecutive prompt and architecture changes that you cannot say which one moved the behaviour. Below that, manual review is faster and correct.

## What I'd Tell You If You're Building One

**Design for disagreement before writing a prompt.** For every pair of axes, write down a real answer that scores high on one and low on the other, using output from your own system. If you cannot, you do not have two axes. That costs an afternoon and saves you from three correlated numbers you mistake for coverage.

**Sampling variance is not evaluator disagreement.** Re-rolling the same judge measures your decoder. If you want two opinions, give them two different questions, not two different seeds.

**Ask the easier question.** Almost every "my judge scores everything 4 out of 5" problem is a pointwise problem. You rarely need an absolute score; you need to know which of two versions is better, and models are much better at that.

**Be suspicious of agreement.** If all your judges agree all the time, the pleasant reading is that the system is good. The likelier one is that you asked them the same question three times, or handed them all the same documents.

---

References:

- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — position, verbosity, and self-enhancement bias in LLM judges, and pairwise comparison as an evaluation protocol
- [Length-Controlled AlpacaEval](https://arxiv.org/abs/2404.04475) — a standard correction for length bias in automatic evaluators
- [What is RAG evaluation?](https://www.braintrust.dev/articles/what-is-rag-evaluation) — groundedness as claim-level traceability against source context
