---
title: "macOS VPN Split Tunneling: From 267ms to 28ms Without Touching Your VPN Config"
description: "How I built a client-side split tunneling system for macOS that routes local traffic direct and keeps international traffic on VPN. Covers IP-based route splitting, DNS override, per-domain resolver configuration, and a launchd auto-watch daemon."
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

VPNs love to route **everything** through their tunnel. Every DNS query, every HTTPS request, every ping -- all funneled through a server that might be on another continent. If you're working remotely and your VPN server is far away, this means your local traffic takes a round trip overseas and back, when a direct connection would take 30ms.

This post documents a client-side split tunneling system I built for macOS that:

1. **Routes local/regional IPs directly** via the Wi-Fi gateway (~7,400 CIDR ranges)
2. **Overrides VPN DNS** with a faster, geographically closer DNS for CDN optimization
3. **Preserves VPN DNS for specific domains** via macOS `/etc/resolver/`
4. **Runs automatically** via a launchd daemon that detects VPN connect/reconnect

The result: a CDN-backed website went from 267ms/20% packet loss to **28ms/0% loss**. Same VPN, same network, no IT ticket required.

## The Problem: Three Layers of Slowness

When a VPN sets itself as the default gateway, three things happen:

### 1. Route Hijacking

The VPN adds a default route through its tunnel interface (e.g., `ipsec0` or `utun*`), taking priority over your Wi-Fi gateway. Every packet, regardless of destination, enters the encrypted tunnel.

```
default            link#25            UCSg          ipsec0    <-- VPN grabs default
default            192.168.x.1        UGScIg        en0       <-- Wi-Fi gateway demoted
```

Visiting a local website? Your packet goes: Mac -> VPN tunnel -> VPN server (far away) -> destination server (nearby) -> VPN server -> Mac. That's two unnecessary trips across the globe.

### 2. DNS Hijacking

The VPN pushes its own DNS servers as the system's primary resolver. This means:

- **DNS queries are slow** (every lookup goes through the VPN tunnel: +150ms)
- **CDN routing is wrong** (the DNS server returns IPs optimized for its own location, not yours)

This is the sneaky one. Even if you fix the routes, DNS misconfiguration silently degrades performance by returning geographically suboptimal server IPs.

### 3. DNS Inconsistency

If you naively switch to a local public DNS to fix problem #2, some domains may return different IPs than expected -- certain services detect your region via the DNS resolver location and may redirect you to a localized version, or return IPs that don't serve the content you need.

Solving all three problems requires a layered approach.

## Architecture: Two-Layer Split

```
                   +------------------+
                   |  VPN DNS         |
                   |  (pushed by VPN) |
                   +--------+---------+
                            |
                   /etc/resolver/*    <-- specific domains that need VPN DNS
                            |
+----------+    +-----------+------------+    +----------+
|  Local   | -> | macOS DNS Resolution   | <- | Specific |
|  Sites   |    +------------+-----------+    | Domains  |
+----------+                 |                +----------+
      |              Default: local DNS               |
      |              (fast, nearby)                    |
      v                                               v
+-----+------+                            +--------+-------+
| Wi-Fi GW   |                            | VPN Tunnel     |
| (direct)   |                            | (encrypted)    |
+-----+------+                            +--------+-------+
      |                                            |
  Regional IPs                                Everything
  ~7,400 CIDR                                    else
```

**Layer 1 -- Route Splitting:** Download regional IP ranges from [APNIC](https://ftp.apnic.net/apnic/stats/apnic/delegated-apnic-latest) or a [pre-compiled list](https://github.com/17mon/china_ip_list) (~7,400 CIDR blocks) and add routes pointing them to the Wi-Fi gateway, bypassing the VPN tunnel.

**Layer 2 -- DNS Splitting:** Override the VPN's DNS with a faster local DNS for CDN-optimized resolution, then create `/etc/resolver/` entries for specific domains that must use VPN DNS.

## Implementation

The entire system is a single Bash script (`vpn-split-tunnel.sh`) with six commands: `start`, `stop`, `status`, `update`, `install`, `uninstall`.

### Route Splitting

The IP list is sourced from GitHub (pre-compiled CIDR format, ~7,400 entries) with APNIC as fallback. Routes are added in parallel using `xargs -P`:

```bash
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
# Find VPN DNS service key (the one bound to the VPN interface)
vpn_dns_key=$(scutil <<-EOF | grep "State:/Network/Service/.*/DNS" ...
list
quit
EOF
)

# Override it with a faster DNS
scutil <<-EOF
d.init
d.add ServerAddresses * <LOCAL_DNS_PRIMARY> <LOCAL_DNS_SECONDARY>
set ${vpn_dns_key}
quit
EOF
```

**Step 2:** Create per-domain resolver overrides for domains that need VPN DNS:

```bash
# /etc/resolver/example.com
nameserver <VPN_DNS_PRIMARY>
nameserver <VPN_DNS_SECONDARY>
```

macOS reads `/etc/resolver/<domain>` files and uses the specified nameservers for matching domains (including subdomains). This is a native macOS mechanism -- no third-party DNS proxy needed.

The domain list (`vpn-domains.txt`) is small and stable (~25 entries): domains that must be resolved through VPN DNS for correct routing or content access. These rarely change.

### Auto-Watch Daemon

VPN reconnections reset the routing table and DNS configuration. A launchd daemon polls every 15 seconds:

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
    # Probe: does a known regional IP route through Wi-Fi gateway?
    route -n get <KNOWN_REGIONAL_IP> | grep -q "gateway: $gw"
}
```

Key design choice: `routes_actually_applied()` checks the **real routing table** by probing a known regional IP, rather than trusting a marker file. This handles VPN reconnections that clear routes but leave stale state files.

The daemon is a standard launchd plist with `RunAtLoad` and `KeepAlive`:

```bash
sudo ~/scripts/vpn-split-tunnel.sh install    # One-time setup
# Survives reboots, auto-restarts on crash
```

## Results

Tested on the same network, same VPN connection, before and after:

| Target | Before | After | Improvement |
|--------|--------|-------|-------------|
| Local website (domestic IP) | 31ms, 0% loss | 29ms, 0% loss | Marginal (already direct via IP routing) |
| Documentation site (has nearby CDN) | 312ms, 33% loss | **36ms, 0% loss** | **8.7x faster** (DNS returned nearby CDN node) |
| LinkedIn | 267ms, 20% loss | **28ms, 0% loss** | **9.5x faster** (DNS returned regional CDN node) |
| YouTube | 240ms, 66% loss | 227ms, 0% loss | Same latency (must use VPN), **0% packet loss** |

The LinkedIn result is the most interesting. The VPN DNS was returning a server IP on a different continent. Switching to a geographically appropriate DNS returned a nearby CDN node, which our route splitting then sent **direct** instead of through the VPN. Same website, 9.5x faster, because DNS resolution location determines CDN node selection.

## File Structure

```
~/scripts/
  vpn-split-tunnel.sh         # Main script (single file, ~550 lines)
  README.md
  data/
    regional-ip-list.txt       # ~7,400 regional CIDR ranges (auto-updated weekly)
    custom-direct.txt          # User-defined IPs to bypass VPN
    vpn-domains.txt            # Domains requiring VPN DNS (~25 entries)
```

## Trade-offs and Limitations

**What this solves:**
- Local/regional websites load at native speed regardless of VPN state
- CDN-enabled international sites (with regional nodes) get optimal routing
- Fully automatic -- no manual intervention after `install`

**What this doesn't solve:**
- VPN tunnel quality. If your VPN has 250ms latency to its server, sites without regional CDN nodes will still be 250ms. This is physics, not software.
- Enterprise DNS requirements. If your organization uses internal domains that only resolve on the VPN DNS, you need to add them to `vpn-domains.txt`. The system defaults to "everything uses local DNS unless explicitly listed."

**Why not Clash/Surge?**
These are proxy clients designed to manage your own tunnel. If you're on a VPN you can't replace, they'll compete for the same routing table and virtual interfaces. The route-table approach operates at a lower layer and coexists cleanly with any VPN client.

**The right fix:**
Ask your IT department to enable server-side split tunneling. One configuration change on the VPN server eliminates the need for all of this. But if that's not happening soon, this is a robust Plan B.

## Commands Reference

```bash
sudo ~/scripts/vpn-split-tunnel.sh start      # Enable split tunneling
sudo ~/scripts/vpn-split-tunnel.sh stop       # Disable, restore full VPN
sudo ~/scripts/vpn-split-tunnel.sh status     # Show current status
sudo ~/scripts/vpn-split-tunnel.sh update     # Force update regional IP list
sudo ~/scripts/vpn-split-tunnel.sh install    # Install auto-watch daemon
sudo ~/scripts/vpn-split-tunnel.sh uninstall  # Remove auto-watch daemon
```

Status output:
```
=== VPN Split Tunneling Status ===

Wi-Fi gateway:  192.168.x.1
VPN interface:  ipsec0 (active)
Split tunnel:   ACTIVE (gateway: 192.168.x.1)
DNS primary:    <LOCAL_DNS>
VPN DNS domains: 25
Regional IPs:   7456 ranges
Custom direct:  3 entries
Routes via GW:  ~7464
```

The approach is generic -- while I built this for routing domestic traffic in a specific region, the same architecture works anywhere you have a VPN that routes everything through a distant server. Swap the IP list for your region's APNIC allocation, point DNS to your nearest public resolver, and the rest stays the same.
