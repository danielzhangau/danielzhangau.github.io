---
title: "AI-Powered Street Waste Detection & Cleanliness Index"
description: "Computer vision system that detects street-level waste and generates a city-wide Cleanliness Index, giving councils a data-driven view of urban cleanliness."
tags: ["PyTorch", "Computer Vision", "Object Detection", "GCP", "Geospatial Analysis"]
featured: true
order: 2
category: "production"
image: "/img/visionhq-cleanliness-index.png"
---

## Problem

Urban councils struggle to maintain consistent street cleanliness across large service areas. Without systematic monitoring, waste and debris accumulation often goes unnoticed until residents complain, leading to uneven maintenance and inefficient resource allocation.

## Solution

I developed a computer vision-based street waste detection system that integrates with the waste truck camera network to generate a **Cleanliness Index** — a quantitative, street-by-street assessment of urban cleanliness:

- **Detection Model**: PyTorch-based object detection pipeline trained to identify various types of street-level waste including litter, illegal dumping, overflowing bins, and road debris
- **Cleanliness Index**: Each street segment receives a cleanliness score based on detected waste density and severity, visualized as a color-coded map (green → clean, yellow → moderate, red → requires attention) with individual waste markers
- **Trend Analysis**: Historical data enables tracking of cleanliness trends over time, identifying chronic problem areas versus one-time incidents
- **Actionable Dashboard**: Councils can drill down from city-wide overview to individual street segments, prioritizing cleanup resources based on objective data rather than reactive complaints

## Impact

- Created a comprehensive, data-driven view of urban cleanliness that was previously impossible through manual inspection alone
- Enabled councils to objectively measure and compare cleanliness across different zones, supporting fair resource allocation
- Facilitated efficient cleanup scheduling by pinpointing waste locations with GPS coordinates

<!-- TODO: Please add specific metrics if available, such as:
  - Coverage area (km^2 or number of suburbs)
  - Detection accuracy
  - Improvement in cleanup response time
-->

## Technical Highlights

- Transfer learning approach to rapidly adapt detection models across different urban environments
- Robust detection under varying conditions: shadows, partial occlusion, wet surfaces
- Geospatial data pipeline integrating detection results with mapping APIs
- Dashboard integration for council operations teams
