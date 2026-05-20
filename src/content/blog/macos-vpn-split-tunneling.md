---
title: "macOS VPN Split Tunneling: From 267ms to 28ms Without Touching Your VPN Config"
description: "How I built a client-side split tunneling system for macOS that routes local traffic direct and keeps international traffic on VPN. Covers IP-based route splitting, reversed DNS splitting (clean DNS via VPN tunnel + local DNS for CDN optimization), and a launchd auto-watch daemon."
pubDate: 2026-05-17
tags: ["macOS", "Networking", "VPN", "Split Tunneling", "Shell Scripting", "DevOps"]
---

VPNs love to route **everything** through their tunnel. Every DNS query, every HTTPS request, every ping -- all funneled through a server that might be on another continent. If you're working remotely and your VPN server is far away, this means your local traffic takes a round trip overseas and back, when a direct connection would take 30ms.

This post documents a client-side split tunneling system I built for macOS that:

1. **Routes local/regional IPs directly** via the Wi-Fi gateway (~7,400 CIDR ranges)
2. **Uses clean DNS via VPN tunnel** as the system default (no pollution, no hijacking)
3. **Optimizes regional domains with local DNS** via macOS `/etc/resolver/` for CDN performance
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

### 3. DNS Pollution

This is the problem that killed my first architecture. If you naively override the VPN DNS with a local public DNS (like many split tunneling guides suggest), you may walk straight into DNS pollution: ISPs or network firewalls intercepting DNS queries and returning **fake IP addresses** for certain domains.

My first attempt used a local public DNS as the default, with a whitelist of ~30 domains that needed VPN DNS. The failure mode was catastrophic: **any domain not on the whitelist that was subject to DNS pollution became completely unreachable.** And you can't enumerate every polluted domain -- the list is unbounded and changes constantly.

```
# What DNS pollution looks like:
$ nslookup example.com <local-dns>
Name:    example.com
Address: 192.0.0.88          <-- fake IP, not the real server

$ nslookup example.com 8.8.8.8   # via VPN tunnel
Name:    example.com
Address: 142.251.32.174      <-- real IP
```

Solving all three problems requires a layered approach -- and crucially, the right **direction** for DNS splitting.

## Architecture: Reversed DNS Split

The key insight: **the default DNS must be clean (unpolluted), and regional optimization is the exception, not the rule.**

If you miss a domain in the optimization list, the penalty is slightly suboptimal CDN routing (acceptable). In my first approach, missing a domain in the VPN DNS whitelist meant that domain was completely broken (unacceptable). Reversing the direction eliminates the catastrophic failure mode.

```
                     +------------------+
                     |  macOS Resolver  |
                     +--------+---------+
                              |
              +---------------+----------------+
              |                                |
     /etc/resolver/ match?               No match (default)
              |                                |
              v                                v
      Local DNS                       Clean DNS (e.g. Google 8.8.8.8)
      (direct, fast CDN)             (via VPN tunnel, unpolluted)
              |                                |
    e.g. regional sites              e.g. international sites
         country-code TLD                 any unlisted domain
         major local CDNs
```

**Layer 1 -- Route Splitting:** Download regional IP ranges from [APNIC](https://ftp.apnic.net/apnic/stats/apnic/delegated-apnic-latest) (~7,400 CIDR blocks for a typical country allocation) and add routes pointing them to the Wi-Fi gateway, bypassing the VPN tunnel.

**Layer 2 -- DNS Splitting (reversed):** Override the VPN's DNS with a clean DNS like Google (8.8.8.8) that's routed through the VPN tunnel -- queries are encrypted inside the tunnel, immune to local DNS pollution. Then create `/etc/resolver/` entries for regional domains pointing to a fast local DNS for CDN optimization.

## Implementation

The entire system is a single Bash script (`vpn-split-tunnel.sh`) with six commands: `start`, `stop`, `status`, `update`, `install`, `uninstall`.

### Route Splitting

The IP list is sourced from APNIC (parsed to CIDR format, ~7,400 entries for a typical country). `detect_gateway` returns both the Wi-Fi gateway IP and its interface name; both are needed for `-ifscope` (explained in the next section). Routes are added in parallel using `xargs -P`:

```bash
PARALLEL_JOBS=50

add_routes() {
    local gw="$1" iface="$2" ip_file="$3" label="$4"
    grep -v '^\s*$\|^\s*#' "$ip_file" | \
        xargs -P "$PARALLEL_JOBS" -I {} \
        route -n add -net {} "$gw" -ifscope "$iface" 2>/dev/null || true
}
```

Sequential `route` calls take ~80 seconds for 7,400 entries. With 50 parallel workers, it finishes in under 10 seconds.

The IP list auto-updates every 7 days. A `custom-direct.txt` file allows adding specific IPs that should always bypass VPN.

### Why `-ifscope`?

Without `-ifscope`, the route says "go via Wi-Fi" but macOS **source-IP selection runs independently of route selection**. When the VPN interface ranks above Wi-Fi in NWI (Network Interface ranking), the socket gets the VPN's inner IP as source, but the packet exits via Wi-Fi -- a mismatch that fails with `EADDRNOTAVAIL` ("Can't assign requested address"). Every browser, `curl`, and JDK call to a regional IP breaks instantly.

`-ifscope <iface>` binds the route to that interface for source selection too, so it works regardless of NWI ranking. Skip it and the script may "just work" for a few days, then break the moment NWI ranking flips during a reconnect or VPN node change -- no warning, no log line, just universal `EADDRNOTAVAIL`. This is the difference between "works on my Mac" and "works on any Mac, any day".

### DNS Splitting (Reversed)

This is the part that made the biggest difference -- and the part I had to redesign.

**Step 1:** Find and overwrite the VPN's DNS key in `scutil` with a clean DNS:

```bash
# Find VPN DNS service key (the one bound to the VPN interface)
vpn_dns_key=$(scutil <<-EOF | grep "State:/Network/Service/.*/DNS" ...
list
quit
EOF
)

# Override with clean DNS (routed through VPN tunnel, immune to pollution)
scutil <<-EOF
d.init
d.add ServerAddresses * <CLEAN_DNS_PRIMARY> <CLEAN_DNS_SECONDARY>
set ${vpn_dns_key}
quit
EOF
```

Since the clean DNS IP (e.g. 8.8.8.8) is not a regional IP, it's **not** in the route-splitting bypass list. Queries to it travel through the VPN tunnel, encrypted end-to-end, arriving at Google's DNS servers unpolluted. This is the key trick: the VPN tunnel that slows down regular traffic becomes an asset for DNS -- it shields queries from local interference.

**Step 2:** Create per-domain resolver overrides for regional domains:

```bash
# /etc/resolver/<country-code-tld>  -- covers the entire ccTLD
nameserver <LOCAL_DNS_PRIMARY>
nameserver <LOCAL_DNS_SECONDARY>

# /etc/resolver/example-regional-site.com  -- major regional .com domain
nameserver <LOCAL_DNS_PRIMARY>
nameserver <LOCAL_DNS_SECONDARY>
```

macOS reads `/etc/resolver/<domain>` files and uses the specified nameservers for matching domains (including subdomains). A country-code TLD entry (e.g., `/etc/resolver/de` for `.de` domains) alone covers thousands of regional domains. A curated list of ~100 major non-ccTLD regional domains handles the rest.

The script tracks which resolver entries it creates in a marker file for exact cleanup on `stop` -- no stale entries left behind.

**Why this direction is better:**

|                   | Old approach (local DNS default)             | New approach (clean DNS default)        |
| ----------------- | -------------------------------------------- | --------------------------------------- |
| Missing from list | Domain is unreachable (DNS pollution)        | Domain works, slightly slower CDN       |
| Failure severity  | **Catastrophic**                             | **Graceful degradation**                |
| List maintenance  | Must track every polluted domain (unbounded) | Only need major regional domains (~100) |

### Auto-Watch Daemon

VPN reconnections reset the routing table and DNS configuration. A launchd daemon polls every 15 seconds:

```bash
cmd_watch() {
    local last="unknown"
    while true; do
        sleep "$CHECK_INTERVAL"

        # Detect VPN by interface address, not by parsing default routes -- the
        # latter races during reconnect and IPv6 link-local utun defaults can
        # confuse a naive grep.
        if ! ifconfig ipsec0 2>/dev/null | grep -q "inet "; then
            [[ "$last" != "down" ]] && log "VPN down" && last="down"
            [[ -f "$ROUTE_MARKER" ]] && rm -f "$ROUTE_MARKER"
            continue
        fi

        if routes_actually_applied; then
            [[ "$last" != "ok" ]] && log "Split tunnel healthy" && last="ok"
            continue
        fi

        log "VPN up but routes stale -- re-applying"
        cmd_start && last="applied"
    done
}

routes_actually_applied() {
    local gw iface
    read -r gw iface <<< "$(detect_gateway 2>/dev/null)" || return 1
    # Count ifscope-marked routes via the Wi-Fi interface. Healthy state
    # has thousands; threshold well below real count is immune to stray
    # auto-cloned host routes that would fool a single-IP probe.
    local count
    count=$(netstat -rn -f inet 2>/dev/null \
        | awk -v if_="$iface" '$NF == if_ && $3 ~ /I/ {c++} END {print c+0}')
    [[ "${count:-0}" -ge 1000 ]]
}
```

Two robustness choices worth calling out. **VPN detection** uses interface address rather than default-route parsing -- the routing table races during reconnect, and the `grep "^default.*utun"` pattern also matches IPv6 link-local default routes on inactive `utun*` interfaces. **Health check** counts ifscope-marked routes rather than probing a single known IP -- macOS occasionally creates an auto-cloned host route (flag `W`) that overrides a CIDR more specifically, ignoring `-ifscope`, which would make a single-IP probe falsely report "routes missing" and trigger an infinite re-apply loop.

The daemon is a standard launchd plist with `RunAtLoad` and `KeepAlive`:

```bash
sudo ~/scripts/vpn-split-tunnel.sh install    # One-time setup
# Survives reboots, auto-restarts on crash
```

## Results

Tested on the same network, same VPN connection. The gains depend on which category a site falls into:

**Sites with regional IPs (route splitting only):**

| Target                      | Before        | After             | Improvement                                                     |
| --------------------------- | ------------- | ----------------- | --------------------------------------------------------------- |
| Popular local search engine | 31ms, 0% loss | **29ms, 0% loss** | Marginal -- already a regional IP, route splitting bypasses VPN |

These sites benefit from route splitting alone. Their IPs are in the regional list, so traffic goes direct regardless of DNS.

**Sites with CDN that responds to DNS location (route + DNS splitting):**

| Target               | Before          | After             | Improvement     |
| -------------------- | --------------- | ----------------- | --------------- |
| CDN-backed docs site | 312ms, 33% loss | **36ms, 0% loss** | **8.7x faster** |

This is the sweet spot. The VPN DNS was returning a CDN node on another continent (312ms). Local DNS returned a nearby CDN node instead. That IP happened to fall in the regional IP ranges, so route splitting sent it direct. Two optimizations compounding: better DNS resolution + direct routing.

**International sites (clean DNS via VPN tunnel):**

| Target   | Before (old arch)      | After (new arch) | Why                                           |
| -------- | ---------------------- | ---------------- | --------------------------------------------- |
| YouTube  | Broken (DNS pollution) | ~230ms, working  | Clean DNS resolves correctly, traffic via VPN |
| LinkedIn | Broken (DNS pollution) | ~280ms, working  | Clean DNS resolves correctly, traffic via VPN |

In the old architecture with local DNS as default, these sites would silently break whenever they weren't in the VPN DNS whitelist. Now they just work -- the default clean DNS handles them correctly via the VPN tunnel.

**The takeaway:** the biggest wins come from CDN-backed sites that are in your region. The architecture change from V1 to V2 eliminated an entire class of failures (DNS pollution) at the cost of slightly slower DNS lookups for regional sites not in the optimization list -- a trade-off that's clearly worth it.

## File Structure

```
~/scripts/
  vpn-split-tunnel.sh         # Main script (single file, ~550 lines)
  README.md
  data/
    regional-ip-list.txt       # ~7,400 regional CIDR ranges (auto-updated weekly)
    regional-domains.txt       # Regional domains for local DNS CDN optimization (~100)
    custom-direct.txt          # User-defined IPs to bypass VPN
```

## Limitations

- **VPN tunnel quality is unchanged.** International sites still go through the tunnel. This optimizes what _can_ go direct, not what _must_ stay on VPN.
- **Regional domain list is best-effort.** Unlisted regional domains still work (via clean DNS through VPN), just without CDN optimization. The ccTLD entry covers the majority automatically.
- **Clean DNS adds a hop.** DNS queries for non-regional domains go through the VPN tunnel to reach Google DNS -- about 50-100ms extra per lookup compared to a local DNS. This is cached after the first query and is a worthwhile trade-off for correctness.
- **Split DNS pitfall.** If a `/etc/resolver/<domain>` entry points at a DNS server that isn't directly reachable, `getaddrinfo()` times out on that domain while `nslookup <domain>` (which queries the system primary) still works -- a confusing asymmetry between applications and command-line tools. Fix by adding the DNS server IP to `custom-direct.txt` so it gets a direct ifscoped route, or temporarily put the target domain in `/etc/hosts`.
- **Why not Clash/Surge?** They're proxy clients that compete for the routing table. This operates at a lower layer and coexists with any VPN client.
- **The proper fix** is server-side split tunneling -- one config change on the VPN server. This is a client-side Plan B for when that's not an option.

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
DNS primary:    8.8.8.8
Regional DNS:   82 domains -> local DNS
Regional IPs:   7456 ranges
Custom direct:  3 entries
Routes via GW:  ~7464
```

The approach is generic -- while I built this for routing domestic traffic in a specific region, the same architecture works anywhere you have a VPN that routes everything through a distant server. Swap the IP list for your region's APNIC allocation, point the clean DNS to any reliable public resolver reachable through your VPN tunnel, and the rest stays the same.
