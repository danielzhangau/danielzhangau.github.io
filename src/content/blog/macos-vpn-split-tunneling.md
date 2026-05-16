---
title: "macOS VPN Split Tunneling: From 267ms to 28ms Without Touching Your Corporate VPN"
description: "How I built a client-side split tunneling system for macOS that routes domestic traffic direct and keeps international traffic on VPN. Covers IP-based route splitting, DNS hijack reversal, per-domain resolver overrides, and a launchd auto-watch daemon."
pubDate: 2026-05-17
tags:
  [
    "macOS",
    "Networking",
    "VPN",
    "Split Tunneling",
    "Shell Scripting",
    "DevOps",
  ]
---

Corporate VPNs love to route **everything** through their tunnel. Every DNS query, every HTTPS request, every ping -- all funneled through a server that might be on another continent. If you're in mainland China on a Cisco IPSec VPN, this means your domestic traffic takes a 500ms round trip through the VPN server and back, when a direct connection would take 30ms.

This post documents a client-side split tunneling system I built for macOS that:

1. **Routes China IPs directly** via the local Wi-Fi gateway (~7,400 CIDR ranges)
2. **Overrides VPN DNS hijacking** with domestic DNS for CDN optimization
3. **Preserves VPN DNS for blocked domains** via macOS `/etc/resolver/`
4. **Runs automatically** via a launchd daemon that detects VPN connect/reconnect

The result: LinkedIn went from 267ms/20% packet loss to **28ms/0% loss**. Same VPN, same network, no IT ticket required.

## The Problem: Three Layers of Slowness

When a corporate VPN sets itself as the default gateway, three things happen:

### 1. Route Hijacking

The VPN adds a default route through its tunnel interface (`ipsec0`), taking priority over your Wi-Fi gateway. Every packet, regardless of destination, enters the encrypted tunnel.

```
default            link#25            UCSg          ipsec0    <-- VPN grabs default
default            192.168.1.1        UGScIg        en1       <-- Wi-Fi gateway demoted
```

Visiting `baidu.com` from China? Your packet goes: Mac -> VPN tunnel -> VPN server (overseas) -> Baidu server (China) -> VPN server -> Mac. That's two unnecessary ocean crossings.

### 2. DNS Hijacking

The VPN pushes its own DNS servers (e.g., `103.86.96.100`) as the system's primary resolver. This means:

- **DNS queries are slow** (every lookup goes through the VPN tunnel: +150ms)
- **CDN routing is wrong** (the DNS server returns IPs optimized for its own location, not yours)

This is the sneaky one. Even if you fix the routes, DNS hijacking silently degrades performance by returning geographically suboptimal server IPs.

### 3. DNS Pollution (China-specific)

If you naively switch to a domestic DNS like AliDNS (`223.5.5.5`) to fix problem #2, you hit a new issue: the Great Firewall returns **poisoned DNS responses** for blocked domains. YouTube resolves to `104.244.42.197` (a fake IP) instead of `142.251.40.110` (real Google infrastructure). And LinkedIn redirects to `linkedin.cn` because the CDN node sees a domestic IP.

Solving all three problems requires a layered approach.

## Architecture: Two-Layer Split

```
                   +------------------+
                   |  VPN DNS         |
                   |  103.86.96.100   |
                   +--------+---------+
                            |
                   /etc/resolver/*    <-- youtube.com, google.com, linkedin.com, ...
                            |
+----------+    +-----------+------------+    +----------+
|  China   | -> | macOS DNS Resolution   | <- | Blocked/ |
|  Sites   |    +------------+-----------+    | Intl     |
+----------+                 |                +----------+
      |              Default: AliDNS               |
      |              223.5.5.5                      |
      v                                             v
+-----+------+                            +--------+-------+
| Wi-Fi GW   |                            | VPN Tunnel     |
| 192.168.1.1|                            | ipsec0         |
| (direct)   |                            | (encrypted)    |
+-----+------+                            +--------+-------+
      |                                            |
  China IPs                                   Everything
  ~7,400 CIDR                                    else
```

**Layer 1 -- Route Splitting:** Download all China IP ranges from [APNIC/GitHub](https://github.com/17mon/china_ip_list) (~7,400 CIDR blocks) and add routes pointing them to the Wi-Fi gateway, bypassing the VPN tunnel.

**Layer 2 -- DNS Splitting:** Override the VPN's DNS with AliDNS (`223.5.5.5`) for CDN-optimized resolution, then create `/etc/resolver/` entries for blocked/international domains that must use VPN DNS.

## Implementation

The entire system is a single Bash script (`vpn-split-tunnel.sh`) with six commands: `start`, `stop`, `status`, `update`, `install`, `uninstall`.

### Route Splitting

The China IP list is sourced from GitHub (pre-compiled CIDR format, ~7,400 entries) with APNIC as fallback. Routes are added in parallel using `xargs -P`:

```bash
GITHUB_URL="https://raw.githubusercontent.com/17mon/china_ip_list/master/china_ip_list.txt"
PARALLEL_JOBS=50

add_routes() {
    local gw="$1" ip_file="$2" label="$3"
    grep -v '^\s*$\|^\s*#' "$ip_file" | \
        xargs -P "$PARALLEL_JOBS" -I {} \
        route -n add -net {} "$gw" 2>/dev/null || true
}
```

Sequential `route` calls take ~80 seconds for 7,400 entries. With 50 parallel workers, it finishes in under 10 seconds.

The IP list auto-updates every 7 days. A `custom-direct.txt` file allows adding specific IPs that should always bypass VPN.

### DNS Splitting

This is the part that made the biggest difference. The VPN pushes DNS via macOS's `scutil` configuration system. Simply calling `networksetup -setdnsservers` doesn't work -- the VPN's DNS takes priority in the resolver chain.

**Step 1:** Find and overwrite the VPN's DNS key in `scutil`:

```bash
# Find VPN DNS service key (the one bound to ipsec0)
vpn_dns_key=$(scutil <<-EOF | grep "State:/Network/Service/.*/DNS" ...
list
quit
EOF
)

# Override it with domestic DNS
scutil <<-EOF
d.init
d.add ServerAddresses * 223.5.5.5 119.29.29.29
set ${vpn_dns_key}
quit
EOF
```

**Step 2:** Create per-domain resolver overrides for domains that need VPN DNS:

```bash
# /etc/resolver/youtube.com
nameserver 103.86.96.100
nameserver 103.86.99.100
```

macOS reads `/etc/resolver/<domain>` files and uses the specified nameservers for matching domains (including subdomains). This is a native macOS mechanism -- no third-party DNS proxy needed.

The domain list (`vpn-domains.txt`) is small and stable (~25 entries): Google services, YouTube, LinkedIn, Facebook, Twitter, GitHub, Telegram, Wikipedia. These rarely change.

### Auto-Watch Daemon

VPN reconnections reset the routing table and DNS configuration. A launchd daemon (`com.user.vpn-split-tunnel`) polls every 15 seconds:

```bash
cmd_watch() {
    while true; do
        sleep "$CHECK_INTERVAL"

        # Skip if no VPN
        if ! netstat -rn | grep -q "^default.*ipsec\|^default.*utun"; then
            continue
        fi

        # Check actual routing table, not just marker file
        if routes_actually_applied; then
            continue
        fi

        # VPN active but routes missing -> apply
        cmd_start
    done
}

routes_actually_applied() {
    local gw=$(detect_gateway) || return 1
    # Probe: does Alibaba DNS (a known China IP) route through Wi-Fi gateway?
    route -n get 223.5.5.5 | grep -q "gateway: $gw"
}
```

Key design choice: `routes_actually_applied()` checks the **real routing table** by probing a known China IP, rather than trusting a marker file. This handles VPN reconnections that clear routes but leave stale state files.

The daemon is a standard launchd plist with `RunAtLoad` and `KeepAlive`:

```bash
sudo ~/scripts/vpn-split-tunnel.sh install    # One-time setup
# Survives reboots, auto-restarts on crash
```

## Results

Tested on the same network, same VPN connection, before and after:

| Target | Before | After | Improvement |
|--------|--------|-------|-------------|
| Baidu (domestic) | 31ms, 0% loss | 29ms, 0% loss | Marginal (already direct via IP) |
| Sipeed wiki (domestic CDN) | 312ms, 33% loss | **36ms, 0% loss** | **8.7x faster** (DNS returned nearby CDN node) |
| LinkedIn | 267ms, 20% loss | **28ms, 0% loss** | **9.5x faster** (DNS returned China CDN node) |
| YouTube | 240ms, 66% loss | 227ms, 0% loss | Same latency (must use VPN), but **0% packet loss** |

The LinkedIn result is the most interesting. The VPN DNS was returning `150.171.22.12` (a US server). AliDNS returned `52.130.75.155` -- a LinkedIn CDN node in China, which our route splitting then sent **direct** instead of through the VPN. Same website, 9.5x faster, because DNS resolution location determines CDN node selection.

YouTube can't benefit from CDN optimization (it's blocked in China), but correct DNS resolution via the `/etc/resolver/` override eliminated the 66% packet loss caused by DNS poisoning.

## File Structure

```
~/scripts/
  vpn-split-tunnel.sh         # Main script (single file, ~550 lines)
  README.md
  data/
    china-ip-list.txt          # ~7,400 China IP CIDR ranges (auto-updated weekly)
    custom-direct.txt          # User-defined IPs to bypass VPN
    vpn-domains.txt            # Domains requiring VPN DNS (~25 entries)
```

## Trade-offs and Limitations

**What this solves:**
- Domestic websites load at native speed regardless of VPN state
- CDN-enabled international sites (with China nodes) get optimal routing
- Fully automatic -- no manual intervention after `install`

**What this doesn't solve:**
- VPN tunnel quality. If your VPN has 250ms latency to its server, international sites without China CDN nodes will still be 250ms. This is physics, not software.
- Enterprise DNS requirements. If your company uses internal domains that only resolve on the VPN DNS, you need to add them to `vpn-domains.txt`. The system defaults to "everything uses domestic DNS unless explicitly listed."

**Why not Clash/Surge?**
These are proxy clients designed to replace your VPN. If you're on a corporate VPN you can't replace, they'll compete for the same routing table and virtual interfaces. The route-table approach operates at a lower layer and coexists cleanly with any VPN client.

**The right fix:**
Ask your IT department to enable server-side split tunneling. One configuration change on the VPN server eliminates the need for all of this. But if that's not happening soon, this is a robust Plan B.

## Commands Reference

```bash
sudo ~/scripts/vpn-split-tunnel.sh start      # Enable split tunneling
sudo ~/scripts/vpn-split-tunnel.sh stop       # Disable, restore full VPN
sudo ~/scripts/vpn-split-tunnel.sh status     # Show current status
sudo ~/scripts/vpn-split-tunnel.sh update     # Force update China IP list
sudo ~/scripts/vpn-split-tunnel.sh install    # Install auto-watch daemon
sudo ~/scripts/vpn-split-tunnel.sh uninstall  # Remove auto-watch daemon
```

Status output:
```
=== VPN Split Tunneling Status ===

Wi-Fi gateway:  192.168.1.1
VPN interface:  ipsec0 (active)
Split tunnel:   ACTIVE (gateway: 192.168.1.1)
DNS primary:    223.5.5.5
VPN DNS domains: 25
China IP list:  7456 ranges (updated: 2026-05-16 01:25)
Custom direct:  3 entries
Routes via GW:  ~7464
```

The full script is in my [dotfiles](https://github.com/danielzhangau). If your corporate VPN is making your domestic internet unusable, this might save you a few hundred milliseconds per request -- and a lot of frustration.
