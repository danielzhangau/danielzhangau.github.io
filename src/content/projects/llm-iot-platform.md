---
title: "LLM-Powered IoT Device Monitoring Platform"
description: "Intelligent monitoring platform using LLM function calling to orchestrate multi-step telemetry investigation, cross-signal anomaly correlation, and automated report generation for IoT device fleets."
tags: ["LLMs", "Function Calling", "Claude", "Elasticsearch", "GCP", "Python"]
featured: true
order: 3
category: "production"
image: "/img/iot-monitoring-concept.svg"
---

## Problem

IoT device fleets generate large volumes of telemetry — GPS signals, camera status, CPU load, temperature readings, and error logs — stored across Elasticsearch indices. Our operations engineers monitored this by hand in Kibana, running queries and reading dashboards. That surfaces a single-signal threshold breach easily enough, but the time-consuming work was everything after: correlating signals across devices, separating real faults from benign patterns, and judging whether a fleet going quiet meant an outage or simply a public holiday. That reasoning stayed manual, and subtle cross-signal patterns preceding device failures were often missed.

## Solution

As the primary developer, I designed and built the core components of an LLM-powered monitoring platform on Google Cloud Platform, automating telemetry analysis through function-calling orchestration:

- **LLM Function-Calling Orchestration**: Built the core agent loop where Claude runs a multi-step investigation — selecting a tool, filling its parameters, reading the result, and deciding what to look at next — rather than running a fixed batch of queries every run
- **Predefined Tool Functions**: Wrapped Elasticsearch access behind a fixed set of callable functions (e.g. `get_device_metrics(device_id, time_range, signal_type)`), plus data cleaning, aggregation, and report-formatting tools. The model selects which to call and fills parameters; it does not author raw Elasticsearch DSL, which keeps queries reliable and the schema in code rather than in the prompt
- **Multi-Step Context Management**: The orchestrator accumulates cross-device context across sequential calls, correlating signals such as CPU, temperature, and GPS to distinguish a single-unit fault from an environmental issue
- **Automated Daily Reports**: Output is classified and priority-ranked, with a root-cause hypothesis and a recommended next step for each flagged issue

## Architecture

```
Elasticsearch (telemetry data)
  │
  ▼
Predefined Tool Functions
  ├─ get_device_metrics(device_id, time_range, signal_type)
  ├─ data cleaning / aggregation
  └─ report formatting
  │
  ▼
Claude Orchestrator (function calling) ── multi-step loop (each result drives the next)
  ├─ selects tool & fills parameters
  ├─ decides the next step from results
  └─ accumulates cross-device context
  │
  ▼
Daily Report
  ├─ classified & priority-ranked issues
  └─ root-cause hypotheses + recommended actions

Cloud Scheduler ──> Cloud Run (daily) ──> Claude API
```

## Impact

- Replaced manual dashboard review with an automated daily report, freeing our operations engineers to focus on remediation rather than detection
- Correctly distinguished routine conditions from real faults using context a threshold rule lacks — for example, framing a fleet-wide "no data" reading as a public holiday rather than firing a blind outage alert
- Improved early fault detection by correlating multi-signal patterns (combined CPU, temperature, and GPS signatures) that single-query review consistently missed

## Technical Highlights

- LLM function calling for adaptive, multi-step investigation — each tool result drives the next call rather than a fixed query batch
- Elasticsearch access wrapped in a predefined tool suite; the model orchestrates calls and fills parameters instead of generating raw DSL
- Robust parameter extraction and validation to ensure correct tool invocation
- Cross-device context accumulation for fleet-wide signal correlation
- Root-cause hypotheses grounded in retrieved data, with guards against unsupported claims in generated reports
- Evaluated multiple models during development and selected Claude (official API) for the best balance of function-calling stability, parameter accuracy, report quality, and cost
- Deployed as a managed service on GCP: Cloud Scheduler triggers a Cloud Run job daily, calling the Claude API
