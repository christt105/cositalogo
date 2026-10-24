"""Strict TMDB matching for parsed cover posts.

Never falls back to "the first result": a cover either gets a title with a
named reason, or stays doubtful with its candidates listed for a person.
"""
import re

from parse import norm

SYNOPSIS_MATCH = 0.6
STOPWORDS = set("el la los las un una unos unas de del al y e o en con por para su sus que se lo le les a the of and".split())


def words(text):
    return {w for w in re.findall(r"[a-z0-9]+", norm(text)) if len(w) > 2 and w not in STOPWORDS}


def synopsis_score(ours, theirs):
    a, b = words(ours), words(theirs)
    if len(a) < 8 or len(b) < 8:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def title_key(text):
    text = norm(text).replace("&", "y")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def candidate_year(result):
    date = result.get("release_date") or result.get("first_air_date") or ""
    return date[:4] or None


def same_title(parsed_title, result):
    key = title_key(parsed_title)
    names = [result.get("title"), result.get("original_title"), result.get("name"), result.get("original_name")]
    return any(name and title_key(name) == key for name in names)


def title_variants(title):
    """The title as posted, then without a subtitle after ':' or '.', for posts that add one TMDB lacks."""
    variants = [title]
    for sep in (":", ". ", " - "):
        if sep in title:
            variants.append(title.split(sep, 1)[0].strip())
    return [v for i, v in enumerate(variants) if v and v not in variants[:i]]


def summarize(result, parsed=None):
    row = {"id": result["id"], "title": result.get("title") or result.get("name"), "year": candidate_year(result)}
    if parsed is not None:
        row["synopsis"] = round(synopsis_score(parsed.get("synopsis", ""), result.get("overview", "")), 2)
    return row


def by_votes(results):
    """The most voted result when it has at least POPULAR_RATIO times the votes of the next one."""
    ranked = sorted(results, key=lambda r: r.get("vote_count") or 0, reverse=True)
    if len(ranked) == 1:
        return ranked[0]
    top, second = (r.get("vote_count") or 0 for r in ranked[:2])
    return ranked[0] if top >= POPULAR_RATIO * max(second, 1) else None


def decide(parsed, results):
    """Pick a TMDB result for a parsed cover from search results, or explain why not.

    Statuses, by confidence (see LEVELS): file_id; synopsis, title_year, year_only_result;
    only_result, title_year_votes; title_votes (a suggestion, never applied on its own);
    and no pick at all for ambiguous, year_mismatch, title_mismatch, no_results.
    """
    if len(parsed["tmdb_ids"]) == 1:
        return {"status": "file_id", "tmdb_id": parsed["tmdb_ids"][0], "candidates": []}
    posted = int(parsed["date"][:4])
    results = [r for r in results if not candidate_year(r) or int(candidate_year(r)) <= posted]
    if not results:
        return {"status": "no_results", "tmdb_id": None, "candidates": []}

    def pick(status, result):
        return {"status": status, "tmdb_id": result["id"] if result else None, "candidates": candidates}

    candidates = [summarize(r, parsed) for r in results[:8]]
    by_synopsis = [r for r in results if synopsis_score(parsed["synopsis"], r.get("overview", "")) >= SYNOPSIS_MATCH]
    if len(by_synopsis) == 1:
        return pick("synopsis", by_synopsis[0])

    titled = [r for r in results if same_title(parsed["title"], r)]
    year = parsed.get("year")
    if year:
        exact = [r for r in titled if candidate_year(r) == year]
        if len(exact) == 1:
            return pick("title_year", exact[0])
        if len(exact) > 1:
            popular = by_votes(exact)
            return pick("title_year_votes", popular) if popular else pick("ambiguous", None)
        same_year = [r for r in results if candidate_year(r) == year]
        if len(same_year) == 1 and len(results) == 1:
            return pick("year_only_result", same_year[0])
        return pick("year_mismatch", None)

    decade = parsed.get("decade")
    if decade:
        titled = [r for r in titled if candidate_year(r) and decade <= int(candidate_year(r)) < decade + 10]
    if len(titled) == 1 and len(results) == 1:
        return pick("only_result", titled[0])
    if titled:
        popular = by_votes(titled)
        return pick("title_votes", popular) if popular else pick("ambiguous", None)
    return pick("title_mismatch", None)


POPULAR_RATIO = 10
LEVELS = {
    "file_id": "certain",
    "synopsis": "strong",
    "title_year": "strong",
    "year_only_result": "strong",
    "only_result": "medium",
    "title_year_votes": "medium",
    "title_votes": "suggested",
}
CONFIDENT = {status for status, level in LEVELS.items() if level != "suggested"}


def check_file_id(tmdb, kind, parsed):
    """Trust a [tmdbid-N] from the file names only when that title agrees with the post's title or year."""
    tmdb_id = parsed["tmdb_ids"][0]
    details = tmdb.details(kind, tmdb_id)
    if details:
        names = [details.get(k) for k in ("title", "original_title", "name", "original_name")]
        names += [t.get("title") for t in (details.get("alternative_titles") or {}).get("titles", [])]
        names += [t.get("data", {}).get("title") or t.get("data", {}).get("name") for t in (details.get("translations") or {}).get("translations", [])]
        keys = {title_key(n) for n in names if n}
        ours = {title_key(parsed["title"])} | ({title_key(parsed["original_title"])} if parsed.get("original_title") else set())
        if keys & ours or (parsed.get("year") and candidate_year(details) == parsed["year"]):
            return {"status": "file_id", "tmdb_id": tmdb_id, "candidates": []}
    candidate = [summarize(details)] if details else []
    return {"status": "file_id_mismatch", "tmdb_id": None, "candidates": candidate}


def match(tmdb, kind, parsed):
    """Search TMDB for a parsed cover and decide; kind is 'movie' or 'tv'."""
    if len(parsed["tmdb_ids"]) == 1:
        return check_file_id(tmdb, kind, parsed)
    if not parsed["title"]:
        return {"status": "unparsed", "tmdb_id": None, "candidates": []}
    best = None
    queries = title_variants(parsed["title"])
    if parsed.get("original_title"):
        queries += [q for q in title_variants(parsed["original_title"]) if q not in queries]
    for title in queries:
        results = tmdb.search(kind, title, parsed.get("year"))
        if not results and parsed.get("year"):
            results = tmdb.search(kind, title)
        decision = decide({**parsed, "title": title}, results)
        if decision["status"] in CONFIDENT:
            return {**decision, "query": title}
        if best is None:
            best = {**decision, "query": title}
    return best
