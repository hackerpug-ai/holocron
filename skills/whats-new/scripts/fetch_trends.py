#!/usr/bin/env python3
"""Fetch trending content from multiple platforms for /whats-new skill.

Usage:
    python3 fetch_trends.py reddit --subreddits ClaudeAI,LocalLLaMA --days 7 --limit 15
    python3 fetch_trends.py hn --tags show_hn --min-points 20 --days 7 --query "AI coding"
    python3 fetch_trends.py bluesky --query "AI coding tool" --days 7 --limit 15
    python3 fetch_trends.py github --query "topic:ai-coding" --min-stars 50 --days 7
    python3 fetch_trends.py devto --tags ai,devtools --days 7 --limit 15
    python3 fetch_trends.py lobsters --days 7 --limit 15
    python3 fetch_trends.py all --days 7 --limit 10

Output: Structured JSON to stdout. Errors/progress to stderr.
Dependencies: requests + stdlib only.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import quote

try:
    import requests
except ImportError:
    print(json.dumps({
        "platform": "error",
        "error": "requests library not installed. Run: pip install requests"
    }))
    sys.exit(1)

USER_AGENT = "fetch_trends/1.0 (whats-new skill; +https://github.com)"


def _log(msg):
    """Log to stderr."""
    print(f"[fetch_trends] {msg}", file=sys.stderr)


def _safe_get(url, headers=None, params=None, timeout=15):
    """Wrapper around requests.get with timeout and error handling.

    Returns (data, error) tuple. data is parsed JSON or None.
    """
    try:
        h = {"User-Agent": USER_AGENT}
        if headers:
            h.update(headers)
        resp = requests.get(url, headers=h, params=params, timeout=timeout)
        resp.raise_for_status()
        return resp.json(), None
    except requests.exceptions.Timeout:
        return None, f"Timeout fetching {url}"
    except requests.exceptions.HTTPError as e:
        return None, f"HTTP {e.response.status_code} from {url}"
    except requests.exceptions.ConnectionError:
        return None, f"Connection error for {url}"
    except json.JSONDecodeError:
        return None, f"Invalid JSON from {url}"
    except Exception as e:
        return None, f"Error fetching {url}: {str(e)}"


def _make_item(title, url, score=0, source="", timestamp="", summary="", tags=None):
    """Normalize any platform result to standard item format."""
    return {
        "title": title,
        "url": url,
        "score": score,
        "source": source,
        "timestamp": timestamp,
        "summary": summary,
        "tags": tags or [],
    }


def _build_result(platform, query_params, items, errors=None):
    """Wrap items in standard envelope."""
    return {
        "platform": platform,
        "query_params": query_params,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "items": items,
        "errors": errors or [],
    }


def _days_ago(days):
    """Return UTC datetime N days ago."""
    return datetime.now(timezone.utc) - timedelta(days=days)


# ---------------------------------------------------------------------------
# Reddit
# ---------------------------------------------------------------------------

def fetch_reddit(args):
    """Fetch top posts from Reddit subreddits."""
    subreddits = args.subreddits.split(",") if args.subreddits else ["ClaudeAI", "LocalLLaMA"]
    days = args.days
    limit = args.limit
    cutoff = _days_ago(days)

    _log(f"Reddit: scanning {len(subreddits)} subreddits, last {days} days")

    items = []
    errors = []

    # Join subreddits with + for multi-sub query
    sub_str = "+".join(s.strip() for s in subreddits)
    time_filter = "day" if days <= 1 else "week" if days <= 7 else "month" if days <= 30 else "year"

    url = f"https://www.reddit.com/r/{sub_str}/top.json"
    params = {"t": time_filter, "limit": min(limit * 2, 100)}  # overfetch for date filtering

    data, err = _safe_get(url, params=params)
    if err:
        errors.append(err)
        return _build_result("reddit", {"subreddits": subreddits, "days": days}, items, errors)

    for post in data.get("data", {}).get("children", []):
        d = post.get("data", {})
        created = datetime.fromtimestamp(d.get("created_utc", 0), tz=timezone.utc)
        if created < cutoff:
            continue

        items.append(_make_item(
            title=d.get("title", ""),
            url=f"https://reddit.com{d.get('permalink', '')}",
            score=d.get("score", 0),
            source=f"r/{d.get('subreddit', '')}",
            timestamp=created.isoformat(),
            summary=d.get("selftext", "")[:200] if d.get("selftext") else "",
            tags=["discussion"],
        ))

    # Sort by score descending, limit
    items.sort(key=lambda x: x["score"], reverse=True)
    items = items[:limit]

    _log(f"Reddit: found {len(items)} posts")
    return _build_result("reddit", {"subreddits": subreddits, "days": days, "limit": limit}, items, errors)


# ---------------------------------------------------------------------------
# Hacker News
# ---------------------------------------------------------------------------

def fetch_hn(args):
    """Fetch from Hacker News via Algolia API."""
    tags = args.tags or "story"
    days = args.days
    limit = args.limit
    min_points = args.min_points
    query = args.query or ""
    cutoff = _days_ago(days)
    cutoff_ts = int(cutoff.timestamp())

    _log(f"HN: tags={tags}, query='{query}', min_points={min_points}, last {days} days")

    items = []
    errors = []

    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "tags": tags,
        "numericFilters": f"created_at_i>{cutoff_ts},points>{min_points}",
        "hitsPerPage": min(limit * 2, 100),
    }
    if query:
        params["query"] = query

    data, err = _safe_get(url, params=params)
    if err:
        errors.append(err)
        return _build_result("hackernews", {"tags": tags, "query": query, "days": days}, items, errors)

    for hit in data.get("hits", []):
        created = hit.get("created_at", "")
        items.append(_make_item(
            title=hit.get("title", ""),
            url=hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
            score=hit.get("points", 0),
            source="hackernews",
            timestamp=created,
            summary=f"{hit.get('num_comments', 0)} comments",
            tags=[tags.replace("_", " ")],
        ))

    items.sort(key=lambda x: x["score"], reverse=True)
    items = items[:limit]

    _log(f"HN: found {len(items)} items")
    return _build_result("hackernews", {"tags": tags, "query": query, "days": days, "min_points": min_points, "limit": limit}, items, errors)


# ---------------------------------------------------------------------------
# Bluesky
# ---------------------------------------------------------------------------

def _bluesky_auth():
    """Authenticate with Bluesky and return access token."""
    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")

    if not handle or not password:
        return None, "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD env vars required"

    try:
        resp = requests.post(
            "https://bsky.social/xrpc/com.atproto.server.createSession",
            json={"identifier": handle, "password": password},
            headers={"User-Agent": USER_AGENT},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("accessJwt"), None
    except Exception as e:
        return None, f"Bluesky auth failed: {str(e)}"


def fetch_bluesky(args):
    """Fetch from Bluesky search API."""
    query = args.query or "AI coding tool"
    days = args.days
    limit = args.limit
    cutoff = _days_ago(days)

    _log(f"Bluesky: query='{query}', last {days} days")

    items = []
    errors = []

    token, err = _bluesky_auth()
    if err:
        errors.append(err)
        return _build_result("bluesky", {"query": query, "days": days}, items, errors)

    url = "https://bsky.social/xrpc/app.bsky.feed.searchPosts"
    params = {
        "q": query,
        "limit": min(limit * 2, 100),
        "sort": "top",
    }
    headers = {"Authorization": f"Bearer {token}"}

    data, err = _safe_get(url, headers=headers, params=params)
    if err:
        errors.append(err)
        return _build_result("bluesky", {"query": query, "days": days}, items, errors)

    for post in data.get("posts", []):
        record = post.get("record", {})
        created_str = record.get("createdAt", "")
        try:
            created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            if created < cutoff:
                continue
        except (ValueError, TypeError):
            pass

        author = post.get("author", {})
        handle = author.get("handle", "unknown")
        display_name = author.get("displayName", handle)
        text = record.get("text", "")

        # Build AT URI into web URL
        uri = post.get("uri", "")
        rkey = uri.split("/")[-1] if "/" in uri else ""
        web_url = f"https://bsky.app/profile/{handle}/post/{rkey}" if rkey else ""

        like_count = post.get("likeCount", 0)

        items.append(_make_item(
            title=f"@{handle}: {text[:100]}",
            url=web_url,
            score=like_count,
            source=f"bluesky/@{handle}",
            timestamp=created_str,
            summary=text[:300],
            tags=["social"],
        ))

    items.sort(key=lambda x: x["score"], reverse=True)
    items = items[:limit]

    _log(f"Bluesky: found {len(items)} posts")
    return _build_result("bluesky", {"query": query, "days": days, "limit": limit}, items, errors)


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------

def fetch_github(args):
    """Fetch trending repos from GitHub search API."""
    query = args.query or "AI coding"
    days = args.days
    limit = args.limit
    min_stars = args.min_stars
    cutoff = _days_ago(days)
    date_str = cutoff.strftime("%Y-%m-%d")

    _log(f"GitHub: query='{query}', min_stars={min_stars}, last {days} days")

    items = []
    errors = []

    # Build search query
    q = f"{query} pushed:>{date_str}"
    if min_stars > 0:
        q += f" stars:>={min_stars}"

    headers = {}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"token {token}"
        _log("GitHub: using GITHUB_TOKEN for auth")

    url = "https://api.github.com/search/repositories"
    params = {
        "q": q,
        "sort": "stars",
        "order": "desc",
        "per_page": min(limit, 100),
    }

    data, err = _safe_get(url, headers=headers, params=params)
    if err:
        errors.append(err)
        return _build_result("github", {"query": query, "days": days, "min_stars": min_stars}, items, errors)

    for repo in data.get("items", []):
        items.append(_make_item(
            title=repo.get("full_name", ""),
            url=repo.get("html_url", ""),
            score=repo.get("stargazers_count", 0),
            source="github",
            timestamp=repo.get("pushed_at", ""),
            summary=repo.get("description", "") or "",
            tags=[t for t in (repo.get("topics") or [])[:5]] + ["repo"],
        ))

    items = items[:limit]

    _log(f"GitHub: found {len(items)} repos")
    return _build_result("github", {"query": query, "days": days, "min_stars": min_stars, "limit": limit}, items, errors)


# ---------------------------------------------------------------------------
# Dev.to
# ---------------------------------------------------------------------------

def fetch_devto(args):
    """Fetch articles from Dev.to API."""
    tags_str = args.tags or "ai"
    days = args.days
    limit = args.limit
    tags = [t.strip() for t in tags_str.split(",")]
    cutoff = _days_ago(days)

    _log(f"Dev.to: tags={tags}, last {days} days")

    items = []
    errors = []
    seen_urls = set()

    for tag in tags:
        url = "https://dev.to/api/articles"
        params = {
            "tag": tag,
            "top": days,
            "per_page": min(limit, 30),
        }

        data, err = _safe_get(url, params=params)
        if err:
            errors.append(err)
            continue

        if not isinstance(data, list):
            errors.append(f"Unexpected response format for tag '{tag}'")
            continue

        for article in data:
            article_url = article.get("url", "")
            if article_url in seen_urls:
                continue
            seen_urls.add(article_url)

            published = article.get("published_at", "")
            try:
                pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
                if pub_dt < cutoff:
                    continue
            except (ValueError, TypeError):
                pass

            items.append(_make_item(
                title=article.get("title", ""),
                url=article_url,
                score=article.get("positive_reactions_count", 0),
                source=f"devto/{article.get('user', {}).get('username', '')}",
                timestamp=published,
                summary=article.get("description", ""),
                tags=article.get("tag_list", []) if isinstance(article.get("tag_list"), list) else [],
            ))

        # Be polite between tag requests
        if len(tags) > 1:
            time.sleep(0.5)

    items.sort(key=lambda x: x["score"], reverse=True)
    items = items[:limit]

    _log(f"Dev.to: found {len(items)} articles")
    return _build_result("devto", {"tags": tags, "days": days, "limit": limit}, items, errors)


# ---------------------------------------------------------------------------
# Lobsters
# ---------------------------------------------------------------------------

def fetch_lobsters(args):
    """Fetch from Lobsters hottest feed."""
    days = args.days
    limit = args.limit
    cutoff = _days_ago(days)

    _log(f"Lobsters: last {days} days")

    items = []
    errors = []

    url = "https://lobste.rs/hottest.json"
    data, err = _safe_get(url)
    if err:
        errors.append(err)
        return _build_result("lobsters", {"days": days}, items, errors)

    if not isinstance(data, list):
        errors.append("Unexpected response format from Lobsters")
        return _build_result("lobsters", {"days": days}, items, errors)

    for story in data:
        created = story.get("created_at", "")
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if created_dt < cutoff:
                continue
        except (ValueError, TypeError):
            pass

        submitter = story.get("submitter_user", "unknown")
        if isinstance(submitter, dict):
            submitter = submitter.get("username", "unknown")

        items.append(_make_item(
            title=story.get("title", ""),
            url=story.get("url") or story.get("short_id_url", ""),
            score=story.get("score", 0),
            source="lobsters",
            timestamp=created,
            summary=f"{story.get('comment_count', 0)} comments | by {submitter}",
            tags=story.get("tags", []),
        ))

    items.sort(key=lambda x: x["score"], reverse=True)
    items = items[:limit]

    _log(f"Lobsters: found {len(items)} stories")
    return _build_result("lobsters", {"days": days, "limit": limit}, items, errors)


# ---------------------------------------------------------------------------
# All platforms
# ---------------------------------------------------------------------------

DEFAULT_ALL_CONFIG = {
    "reddit": {"subreddits": "ClaudeAI,LocalLLaMA,ChatGPT,MachineLearning,devtools"},
    "hn": {"tags": "story", "min_points": 20, "query": ""},
    "github": {"query": "AI coding", "min_stars": 50},
    "devto": {"tags": "ai,devtools,llm"},
    "lobsters": {},
}


def fetch_all(args):
    """Run all platforms sequentially with sensible defaults."""
    _log("Running all platforms...")

    results = []

    # Reddit
    args.subreddits = getattr(args, "subreddits", None) or DEFAULT_ALL_CONFIG["reddit"]["subreddits"]
    results.append(fetch_reddit(args))

    # HN
    args.tags = getattr(args, "tags", None) or DEFAULT_ALL_CONFIG["hn"]["tags"]
    args.min_points = getattr(args, "min_points", None) or DEFAULT_ALL_CONFIG["hn"]["min_points"]
    args.query = getattr(args, "query", None) or DEFAULT_ALL_CONFIG["hn"]["query"]
    results.append(fetch_hn(args))

    # GitHub
    args.query = DEFAULT_ALL_CONFIG["github"]["query"]
    args.min_stars = getattr(args, "min_stars", None) or DEFAULT_ALL_CONFIG["github"]["min_stars"]
    results.append(fetch_github(args))

    # Dev.to
    args.tags = DEFAULT_ALL_CONFIG["devto"]["tags"]
    results.append(fetch_devto(args))

    # Lobsters
    results.append(fetch_lobsters(args))

    # Bluesky (only if creds available)
    if os.environ.get("BLUESKY_HANDLE") and os.environ.get("BLUESKY_APP_PASSWORD"):
        args.query = "AI coding tool"
        results.append(fetch_bluesky(args))
    else:
        _log("Bluesky: skipped (no BLUESKY_HANDLE/BLUESKY_APP_PASSWORD env vars)")

    _log(f"All platforms complete: {len(results)} sources")

    return {
        "platform": "all",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "sources": len(results),
        "results": results,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fetch trending content from multiple platforms",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="platform", help="Platform to fetch from")

    # Reddit
    p_reddit = subparsers.add_parser("reddit", help="Fetch from Reddit")
    p_reddit.add_argument("--subreddits", default="ClaudeAI,LocalLLaMA", help="Comma-separated subreddits")
    p_reddit.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_reddit.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")

    # Hacker News
    p_hn = subparsers.add_parser("hn", help="Fetch from Hacker News")
    p_hn.add_argument("--tags", default="story", help="HN tags: story, show_hn, ask_hn (default: story)")
    p_hn.add_argument("--min-points", type=int, default=10, help="Minimum points (default: 10)")
    p_hn.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_hn.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")
    p_hn.add_argument("--query", default="", help="Search query (optional)")

    # Bluesky
    p_bsky = subparsers.add_parser("bluesky", help="Fetch from Bluesky")
    p_bsky.add_argument("--query", default="AI coding tool", help="Search query")
    p_bsky.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_bsky.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")

    # GitHub
    p_gh = subparsers.add_parser("github", help="Fetch from GitHub")
    p_gh.add_argument("--query", default="AI coding", help="Search query")
    p_gh.add_argument("--min-stars", type=int, default=50, help="Minimum stars (default: 50)")
    p_gh.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_gh.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")

    # Dev.to
    p_devto = subparsers.add_parser("devto", help="Fetch from Dev.to")
    p_devto.add_argument("--tags", default="ai", help="Comma-separated tags")
    p_devto.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_devto.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")

    # Lobsters
    p_lob = subparsers.add_parser("lobsters", help="Fetch from Lobsters")
    p_lob.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_lob.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")

    # All
    p_all = subparsers.add_parser("all", help="Fetch from all platforms")
    p_all.add_argument("--days", type=int, default=7, help="Lookback days (default: 7)")
    p_all.add_argument("--limit", type=int, default=10, help="Max results per platform (default: 10)")
    p_all.add_argument("--subreddits", default=None, help="Override subreddits for Reddit")
    p_all.add_argument("--query", default=None, help="Override search query")
    p_all.add_argument("--min-points", type=int, default=None, help="Override HN min points")
    p_all.add_argument("--min-stars", type=int, default=None, help="Override GitHub min stars")
    p_all.add_argument("--tags", default=None, help="Override tags")

    args = parser.parse_args()

    if not args.platform:
        parser.print_help(sys.stderr)
        print(json.dumps({"platform": "error", "error": "No platform specified"}))
        sys.exit(1)

    dispatch = {
        "reddit": fetch_reddit,
        "hn": fetch_hn,
        "bluesky": fetch_bluesky,
        "github": fetch_github,
        "devto": fetch_devto,
        "lobsters": fetch_lobsters,
        "all": fetch_all,
    }

    fn = dispatch.get(args.platform)
    if not fn:
        print(json.dumps({"platform": "error", "error": f"Unknown platform: {args.platform}"}))
        sys.exit(1)

    result = fn(args)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
