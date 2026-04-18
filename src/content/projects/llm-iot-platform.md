---
title: "LLM-Powered IoT Device Monitoring Platform"
description: "Intelligent monitoring platform using LLM function calling to orchestrate data retrieval, analysis, and automated report generation for IoT device fleets."
tags: ["LLMs", "Function Calling", "Elasticsearch", "GCP", "Python", "API Integration"]
featured: true
order: 3
category: "production"
image: "/img/iot-monitoring-concept.svg"
---

## Problem

IoT device fleets generate massive volumes of telemetry data — GPS signals, camera feeds, CPU metrics, temperature readings, and error logs — all stored across Elasticsearch indices. Operations teams were spending significant time manually querying dashboards and sifting through logs to identify issues, often missing subtle cross-signal patterns that indicated impending device failures.

## Solution

I built an LLM-powered monitoring platform deployed on Google Cloud Platform that automates telemetry analysis through intelligent tool orchestration:

- **LLM Function Calling Orchestration**: Designed the core agent loop where the LLM dynamically selects and invokes the right tools based on the analysis context — deciding which data to fetch, how to process it, and what to report
- **Tool Suite**: Built a set of callable tools including Elasticsearch data retrieval (querying device metrics across time ranges), data cleaning and aggregation pipelines, anomaly detection routines, and report formatting functions
- **Context Management**: Implemented structured context passing so the LLM maintains awareness of fleet-wide state across multi-step analysis workflows — correlating anomalies across different devices and signal types
- **Automated Daily Reports**: The system generates comprehensive reports with natural language explanations of device behavior patterns, flagged anomalies with probable root causes, and prioritized recommendations

## Architecture

```
Elasticsearch (telemetry data)
        |
  Tool Functions ── Data retrieval
        |          ── Data cleaning
        |          ── Anomaly detection
        |          ── Report formatting
        |
  LLM Orchestrator (function calling)
        |── Selects tools & parameters
        |── Manages multi-step context
        |── Generates natural language insights
        |
  Daily Analysis Report
```

## Impact

- Reduced daily telemetry review from **~2 hours of manual dashboard querying** to automated reports generated in minutes, freeing operations staff to focus on remediation
- Multiple orchestrated tool functions (ES query, data cleaning, aggregation, anomaly detection, report formatting) dynamically selected by the LLM based on analysis context
- Improved early fault detection through multi-signal correlation — catching cross-device anomaly patterns that manual review consistently missed

## Technical Highlights

- LLM function calling for dynamic tool selection — the model decides which Elasticsearch queries to run and how to interpret results
- Robust parameter extraction and validation to ensure correct tool invocation
- Multi-step reasoning with context accumulation across sequential tool calls
- Deployed as a managed service on GCP with scheduled execution
- Graceful error handling when tools return unexpected data or LLM hallucination detection in generated reports
