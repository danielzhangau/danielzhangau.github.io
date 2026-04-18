---
title: "CANADARM Motion Planning"
description: "Probabilistic Roadmap-based motion planning for the ISS Canadarm2 robotic arm, navigating obstacles in constrained 2D workspace."
tags: ["Motion Planning", "Probabilistic Roadmap", "Robotics", "Python"]
featured: false
order: 13
category: "academic"
github: "https://github.com/danielzhangau/Artificial-Intelligence/tree/master/ass2"
image: "/img/robot_arm.gif"
---

## Overview

Developed motion planning algorithms for a simplified 2D version of the International Space Station's Canadarm2 robotic arm. Given initial and goal configurations, the system finds valid paths through obstacle-filled environments while satisfying multiple kinematic constraints.

## Constraints Handled

- Primitive step limits: joint movement restricted to 0.001 units per step
- Obstacle avoidance for all arm segments
- Self-collision prevention between arm links
- Workspace boundary enforcement within [0,1] x [0,1] space
- Joint angle constraints (15-165 degrees)
- Segment length bounds

## Approach

- **Probabilistic Roadmap (PRM)**: Sampled random configurations in C-space, connected valid neighbors, and searched the resulting graph
- **Collision Detection**: Implemented efficient line-segment intersection tests for arm-obstacle and arm-self collision checking
- **Graph Search**: Applied A\* search on the PRM graph with configuration-space distance heuristics

## Key Learnings

- High-dimensional configuration space planning for multi-joint systems
- Sampling-based motion planning algorithms and their probabilistic completeness guarantees
- Efficient collision detection in 2D environments
- Trade-offs between roadmap density and planning speed
