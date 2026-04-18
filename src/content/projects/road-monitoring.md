---
title: "AI-Powered Road Infrastructure Monitoring System"
description: "Computer vision system mounted on waste trucks for automated city-wide road defect detection, enabling proactive infrastructure maintenance."
tags: ["PyTorch", "Computer Vision", "Object Detection", "GCP", "Docker"]
featured: true
order: 1
category: "production"
image: "/img/visionhq-road-monitoring.svg"
---

## Problem

Road infrastructure deterioration poses significant safety risks to drivers and commuters. Traditional manual inspection methods are costly, time-consuming, and unable to provide consistent city-wide coverage. Councils often discover road defects reactively — after they've already caused damage or complaints — rather than proactively identifying and prioritizing repairs.

## Solution

I designed and built an AI-powered road monitoring system that leverages the regular coverage patterns of waste collection trucks. By mounting cameras on these vehicles, the system captures imagery of every road in a council's service area during routine collection rounds, then processes the data through a deep learning pipeline:

- **Object Detection Pipeline**: Built with PyTorch, trained to identify and classify multiple types of road defects including potholes, cracking, edge deterioration, and surface deformation
- **Cloud Processing**: Deployed on Google Cloud Platform with containerized inference services (Docker) for scalable batch processing of daily image captures
- **Geospatial Mapping**: Each detected defect is geo-tagged and mapped, creating a comprehensive, continuously updated view of road conditions across the entire service area
- **Priority Scoring**: Defects are ranked by severity and location to help councils allocate maintenance budgets effectively

## Impact

- Enabled automated, city-wide road condition monitoring using existing waste collection infrastructure — no additional vehicle deployments required
- Transformed road maintenance from reactive to proactive, allowing councils to identify emerging issues before they become safety hazards
- Provided councils with data-driven prioritization tools to optimize limited maintenance budgets

<!-- TODO: Please add specific metrics if available, such as:
  - Number of roads/km monitored daily
  - Detection accuracy (mAP score)
  - Reduction in manual inspection costs
  - Number of councils using the system
-->

## Technical Highlights

- End-to-end ML pipeline: data ingestion, preprocessing, model inference, post-processing, and result delivery
- Custom-trained object detection models optimized for varied lighting conditions, weather, and road surfaces
- Scalable cloud architecture handling large volumes of daily image data
- Integration with council GIS systems for seamless defect reporting
