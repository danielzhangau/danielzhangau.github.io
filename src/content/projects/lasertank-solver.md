---
title: "LaserTank AI Solver"
description: "AI solvers for the LaserTank puzzle game using A* search, MDP planning, and reinforcement learning algorithms."
tags: ["AI Search", "A* Algorithm", "Reinforcement Learning", "MDP", "Python"]
featured: false
order: 12
category: "academic"
github: "https://github.com/danielzhangau/Artificial-Intelligence"
image: "/img/laser_tank.gif"
---

## Overview

Implemented multiple AI solving algorithms for LaserTank, a puzzle game where a tank must navigate to a flag using movement, rotation, and laser interactions with map elements — finding optimal solutions in as few moves as possible.

## Algorithms Implemented

- **Uniform Cost Search & A\* Search**: Graph-based search with custom heuristics for optimal pathfinding
- **Value Iteration & Policy Iteration**: MDP-based planning for stochastic environments
- **Q-Learning & SARSA**: Model-free reinforcement learning for environments with unknown dynamics

## Problem Formulation

The game was formulated as a search problem with:

- State space: tank position, orientation, and map configuration
- Action space: move forward, turn left, turn right, shoot laser
- Uniform cost of 1 per step
- Goal: reach the flag in minimum moves while avoiding game-over conditions

## Key Learnings

- Comparative analysis of search, planning, and learning approaches to the same problem
- Heuristic design and admissibility proofs for A\* optimality
- Convergence properties of value iteration vs. policy iteration
- Exploration-exploitation trade-offs in Q-learning and SARSA
