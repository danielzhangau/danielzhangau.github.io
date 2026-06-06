---
title: "LLM-Powered IoT Device Monitoring Platform"
description: "An LLM agent that investigates IoT fleet telemetry in Elasticsearch — running a multi-step investigation and writing a daily report, instead of the team reading dashboards by hand."
tags: ["LLMs", "Function Calling", "Claude", "Elasticsearch", "GCP", "Python"]
featured: true
order: 3
category: "production"
image: "/img/iot-monitoring-concept.svg"
---

## The problem

Our IoT fleets generate a lot of telemetry: GPS, camera status, CPU load, temperature, error logs, all stored in Elasticsearch. The team used to go through it by hand, reading dashboards and running queries. That works for the obvious cases, like a single metric spiking, but it's slow, and it tends to miss the problems that only show up when you line up several signals at once.

## Why I used an LLM

The threshold alerts were never the hard part. A simple query already tells you a device's CPU spiked. What actually took the team's time was what came after: working out whether a few unrelated-looking signals added up to one failing device, or whether a whole fleet going silent meant an outage or just everyone off for a public holiday. That judgment is the part I wanted the LLM to handle, not the querying. A dashboard can show you the numbers; it can't tell you which ones matter today.

## What I built

I built the agent loop that runs the investigation. Instead of running a fixed batch of queries every time, it works one step at a time and decides what to look at next based on what it just found. A typical run pulls a fleet overview, notices one device with abnormal CPU, then goes and fetches that device's temperature and error logs, then checks nearby devices to tell a single-unit fault from something environmental. It ends with a short report: the issues worth attention, grouped and ranked, each with a likely cause and a suggested next step.

```
Elasticsearch (telemetry)
   ↑  tool functions: get_device_metrics(device_id, time_range, signal_type), ...
   |
Claude agent loop  →  pick a tool, fill params, read the result, decide the next step
   |
Daily report: grouped + ranked issues, each with a likely cause and next step
```

## How the queries work

My first instinct was to let the model write the Elasticsearch queries itself. It wasn't reliable, and it didn't need to be: the schema is fixed and fairly simple, so there's no reason to make the model rediscover it every run. I moved the schema into a fixed set of tool functions — `get_device_metrics(device_id, time_range, signal_type)` and a few others — and let the model only pick which to call and fill in the parameters. That alone made the output far more consistent.

## Choosing a model

I tried a few models during development and compared their output on the same tasks. The things that mattered for this job were how reliably each one called the right tool, how often it got the parameters right, the quality of the written report, and cost. Claude came out best on that balance, so that's what it runs on, through the official API.

## Running it in production

It runs as a scheduled job on GCP: Cloud Scheduler triggers a Cloud Run job once a day, which calls the Claude API and produces the report. Nothing elaborate, but it means the report is just there every morning instead of someone having to go dig for it.

## What changed

The main thing is the team stopped spending the start of the day sifting through dashboards. The report does that first pass for them, and they go straight to the things that need a decision. The example I keep coming back to is the "no data" one: a quiet fleet used to mean someone had to check whether it was a real outage or just a holiday, and the system now makes that call from the wider context instead of firing a blind alert. It also catches the multi-signal cases — CPU, temperature, and GPS drift together pointing at one overheating device — that were easy to miss when each signal sat on its own chart.
