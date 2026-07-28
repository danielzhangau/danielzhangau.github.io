---
title: "I Ran Three LLM Judges on the Same Answers: The Disagreement Was the Only Signal"
description: "A build log for evaluating a domain chatbot with no ground truth. Why a single LLM judge and temperature sampling both produce noise instead of signal, how I designed orthogonal evaluation axes so judges disagree structurally, and when this is worth building at all."
pubDate: 2026-07-28
draft: true
tags: ["LLM", "Evaluation", "LLM-as-Judge", "Domain Chatbot", "Production AI", "Prompt Engineering"]
---

At the end of [the last post](/blog/rag-to-full-context-domain-chatbot), where I deleted two generations of RAG in favor of injecting the whole knowledge base into the system prompt, I wrote an honest caveat: I had no evaluation set, only manual spot-checks, and "a real eval set is the obvious next step."

This is what happened when I took that step. It did not go the way I expected, and the useful part is not the harness — it is a design constraint I ended up with: **for outputs with no correct answer, disagreement between judges is only informative if it comes from structure, not from sampling.** A single judge, or one judge sampled five times at high temperature, produces variance. Variance is not signal.

This post is the build log for that: what broke, what I threw away, and the rule I now use to decide whether an eval harness is worth building at all.

## The Problem: I Could Not Tell If I Had Made It Worse

The chatbot answers questions about construction installation documentation — framing, fasteners, welds, and a dense page of standards specifications. Its architecture went through three generations: client-side RAG, then server-side RAG, then full-context injection with prefix caching.

Each migration was justified by an argument I still believe. But an argument is not a measurement. After the final switch I was left holding a question I could not answer: **are the answers better now, or did I just make the system simpler and quietly worse?**

The obvious move is to measure accuracy. That works for exactly one slice of this domain — the part where the documentation states a number:

> Nut tightening torque: M12 chemset anchor 40Nm, M16 80Nm, M20 135Nm.

If a user asks for the M16 torque, there is a correct string. You can assert on it. No judge required, and you should not use one — a regex is cheaper, deterministic, and cannot be sweet-talked.

But most real questions do not look like that. They look like "what do I need to check before installing this wall connection?" The answer is three paragraphs: the relevant spec, the conditions under which it applies, a cross-reference to the standards page, and — when the documentation genuinely does not cover the case — a refusal telling the user to consult a structural engineer.

There is no correct string for that. There are better and worse answers, and the difference matters, and nothing in my pipeline could see it.

## First Attempt: Look At Them Myself

I did what the previous post described: read the answers by hand, check the high-risk ones against the source documents, confirm citations resolve.

This is not worthless. It caught real defects. But as a way to answer "did the architecture change help," it fails for three reasons, and only the third one surprised me.

**It does not scale.** Obvious, and the least interesting problem.

**It is not repeatable.** My standard on a Tuesday evening is not my standard on a Saturday morning. When the thing you are measuring is a small delta, an unstable ruler is worse than no ruler.

**I was grading my own architecture.** This is the one that actually killed it. I knew which version produced which answer. I had just spent a week arguing myself into the full-context design. I am not a neutral evaluator of whether it worked, and no amount of care fixes that — the bias is in knowing, not in trying.

Worse, I was spot-checking the questions I thought of when I designed the system. Those are precisely the cases the system already handles. Manual review samples from your own imagination, and your imagination is correlated with your prompt.

## Second Attempt: One LLM Judge

So: hand it to a model. Write a judge prompt, give it the question, the documentation, and the answer, and ask for a score.

The first version looked like every LLM-as-judge example you have seen — rate this answer 1-5 on accuracy, completeness, and clarity, and explain your reasoning.

It did not work, in a specific and instructive way.

**Everything scored high.** The distribution collapsed into the top of the scale. [TODO: Daniel — the actual score distribution, e.g. "N% of answers scored 4 or 5"; directionally, near-total collapse into the top two bands.] A scale where almost every sample lands in two adjacent bands is not measuring the thing; it is measuring the model's reluctance to be harsh.

**The delta was smaller than the noise.** When I compared two versions of the system, the difference in mean score was smaller than the spread I got from re-running the same judge on the same answers. [TODO: Daniel — confirm this held, and roughly by how much; only the direction goes in the post.] If your effect is inside your error bars, you have not measured anything, you have generated a number.

**One score is a lossy compression of exactly what I wanted to see.** This is the real problem. Consider two answers:

- Answer A states the correct torque value and no citation at all.
- Answer B cites three sections correctly and never answers the question.

A single "overall quality" judge gives both of these a mid-to-high score, for opposite reasons, and hands me one number that cannot distinguish them. But those are completely different defects with completely different fixes. A is a citation-enforcement problem in the system prompt. B is a relevance problem. Collapsing them into one scalar throws away the only information I would have acted on.

That was the moment the problem reframed itself. I did not need a better judge. I needed more than one, and they needed to be able to disagree.

## The Turn: Temperature Does Not Produce Disagreement

The intuitive way to get disagreement is sampling. Run the same judge prompt five times at a higher temperature, look at the spread, treat high variance as "this answer is contentious."

I tried it. It is wrong, and it is wrong in a way worth being precise about.

Temperature-driven variance is **the same evaluator, applying the same criteria, landing on different tokens.** It is a random walk around one judgment. When those five samples disagree, they are not disagreeing about whether the answer is good — they are disagreeing about which of several near-equivalent verbalizations of the same judgment to emit. You are measuring decoding stochasticity.

That distinction has a practical consequence: temperature variance is roughly uncorrelated with the thing you care about. An answer can be unambiguously bad and get five consistent low scores (low variance, real problem). An answer can be perfectly fine and sit near a scoring boundary and get five scattered scores (high variance, no problem). Sorting your outputs by sampling variance sorts them by proximity to a decision boundary, not by quality.

So: **if two judges are asking the same question, their disagreement is noise. If they are asking different questions, their disagreement is information.**

That reframing is the whole post. The engineering task is not "get a more reliable score." It is "construct evaluators that are structurally capable of disagreeing, so that when they do, the disagreement localizes a defect."

## Designing Orthogonal Axes

The design goal, stated as a constraint: for each pair of axes, I should be able to write down a real answer that scores high on one and low on the other. If I cannot construct that example, the two axes are measuring the same thing and should be merged.

The three I landed on. [TODO: Daniel — confirm these are the final axis names and paste the actual judge prompt for each; the descriptions below are my reconstruction of the intent.]

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

The evaluation set is two sources, deliberately: **hand-written high-risk questions** covering the specs where a wrong answer is a structural defect rather than an inconvenience, and **QA pairs synthesized from the source documents** for breadth. [TODO: Daniel — size of each set, and whether the synthesized pairs were reviewed before use.] The hand-written set covers what I know to be dangerous; the synthesized set covers what I did not think to ask. Neither is real user traffic, which is a gap I will come back to.

## What Actually Diverged

This is where I have to be careful, because this is the part of a post like this that is most tempting to write ahead of the data. The harness is still a prototype and I am still iterating on the judge prompts, so what follows is how I read the results, not a claim about final numbers.

[TODO: Daniel — the core empirical result. Which axes separated across system versions, and which collapsed together? Directional statements only, per your call on disclosure. This is the load-bearing section of the post and it is currently a placeholder.]

The reading framework I use on the output, which does not depend on the specific numbers:

**If two axes correlate tightly across the whole set, they are not orthogonal.** Either the prompts leaked into each other — a Verifiability prompt that says "a good answer cites its sources" has quietly imported a quality judgment — or the underlying property really is one property, and I should merge them and reclaim the eval budget.

**If an axis gives nearly every answer the same score, it has no discriminative power.** That has two possible causes and they need different responses. Either the bar is set where all my outputs already clear it, in which case the axis is real but I should raise the bar until it separates; or the axis is not something a judge can assess from this input, in which case it should not be a judge at all.

**If two axes disagree on a specific answer, that answer is the interesting one.** This turned out to be the most practically useful output of the whole exercise, more than any aggregate. Not the mean of each axis — the _list of answers where the axes split._ Those are the cases where something real is going on, and they are the only queue I actually review by hand now. The harness's job is not to score my system; it is to shrink the set of answers I have to read from all of them down to the contested ones.

## Where This Breaks Down

Six honest limitations, in descending order of how much they bother me.

**Different models do not buy as much independence as it seems.** Running each axis on a different model removes shared weights, but it does not remove shared preferences. Contemporary instruction-tuned models have been through broadly similar preference training, and they inherit a broadly similar aesthetic: longer is more thorough, structured is more rigorous, hedged is more careful, polite is better. So the more holistic a question you ask, the more different models converge — not because they agree about the answer, but because they were shaped to like the same _kind_ of answer. Orthogonality survives only as long as each axis stays narrow and mechanical. Ask any judge for "overall quality" and you get the same underlying preference back, whatever the nameplate on the model says. [TODO: Daniel — did the cross-model setup actually show more disagreement than the same-model multi-role version, if you ran both? That comparison would be the most valuable paragraph in this post.]

**Verifiability should probably not be a judge at all.** "Does this citation point to a real section, and does that section contain this claim?" is close to a programmatic check: resolve the anchor, fetch the text, string-match the specification. I used a judge because it was fast to write. Anything a judge does that an assertion could do is a place where you have chosen a slower, more expensive, non-deterministic tool for no reason. This is a defect in my harness, not a finding.

**Outcome is a proxy, and I named it optimistically.** No judge knows whether the person on the job site got what they needed. It is a model's estimate of usefulness, evaluated without the situation, the site conditions, or the follow-up question the user would have asked. Calling the axis "Outcome" makes it sound like I measured outcomes. I measured a model's guess at them.

**No human baseline.** I have not measured agreement between these judges and a domain expert on the same answers. Without that, I know the axes separate from each other but not whether any of them tracks reality. [TODO: Daniel — is a human-labeled subset feasible? Even 30-50 expert-scored answers would turn this from "the judges disagree with each other" into "the judges agree with a person."]

**The eval set is not user traffic.** Hand-written plus synthesized covers what I imagined and what the documents contain. It does not cover how people actually phrase questions when they are on a roof holding a phone — abbreviations, typos, missing context, three questions at once.

**A prototype's results are provisional.** The judge prompts are still changing. Every prompt edit invalidates comparison with previous runs, which means I do not yet have the thing I originally wanted: a stable ruler I can hold up against the next architecture change. That is the actual finish line, and I am not at it.

## The Rule of Thumb

When this is worth building, and when it is not:

| Situation                                                                                | What to do                                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Output has an exactly checkable correct answer (a number, a unit, a resolvable citation) | **Write an assertion.** Not a judge. Deterministic, free, and cannot be flattered.                                                |
| Output is prose with no correct answer, and you are iterating on it frequently           | **Orthogonal multi-axis judges.** The disagreement queue is the deliverable, not the scores.                                      |
| Output is prose with no correct answer, but the system is stable                         | **A fixed manual checklist.** Twenty questions you re-read after each change beats a harness you built once and stopped trusting. |
| You want one number to report                                                            | **Don't.** A single overall score is the least informative artifact you can produce and the easiest to fool yourself with.        |

The threshold, concretely: build this when you can no longer hold the change's effect in your head — when you have made enough consecutive prompt and architecture changes that you cannot say which one moved the behavior. Below that, manual review is not a compromise, it is correct, and it is faster.

## What I'd Tell You If You're Building One

**Design for disagreement before you write a prompt.** For every pair of axes, write down a real answer that scores high on one and low on the other, using outputs from your actual system. If you cannot, you do not have two axes. This costs an afternoon and saves you from building a harness that produces three correlated numbers and calls it coverage.

**Sampling variance is not evaluator disagreement.** Re-rolling the same judge measures your decoder. If you want two opinions, give them two different questions to answer, not two different random seeds.

**The output you want is a queue, not a score.** The aggregate per-axis numbers are for tracking over time. The thing that changes what you do tomorrow is the list of answers where your axes split — that is where the defects live, and it is small enough to read.

**Be suspicious of convergence.** If all your judges agree all the time, the pleasant interpretation is that your system is good. The likelier one is that you asked them the same question three times.

<!-- Draft notes, TODO checklist, and alternate titles: drafts/orthogonal-llm-judges-NOTES.md (outside the content collection, never built). -->
