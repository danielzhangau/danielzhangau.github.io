---
title: "RUSHB Network Protocol Suite"
description: "Custom network protocol implementation with server, adapter, and switch components for reliable data transmission across networks."
tags: ["Computer Networks", "TCP/IP", "Protocol Design", "Python"]
featured: false
order: 14
category: "academic"
github: "https://github.com/danielzhangau/Computer-Networks"
image: "/img/network_layer_mapping.png"
---

## Overview

Developed a complete network protocol suite for reliable data transmission, consisting of three components that work together to route data across a custom network architecture.

## Components

- **RUSHBSvr**: Network server capable of sending and receiving messages using the custom RUSHB protocol
- **RUSHBAdapter**: TCP adapter bridging external processes (netcat, servers, stdin) to the RUSHB network
- **RUSHBSwitch**: Network router supporting both local subnet and global inter-network routing

## Design Goals

- Lossless, error-free data transmission across complex network topologies
- Support for arbitrary data payloads attached through the adapter layer
- RFC-compliant protocol design with proper handshaking and flow control

## Key Learnings

- Internet architecture design and component interaction patterns
- Communication protocol design across network layers (application, transport, network)
- Network security threat modeling and countermeasure implementation
- Protocol analysis using packet inspection tools (Wireshark)
