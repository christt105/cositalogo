"""Parse the cover posts of the Telegram topics into catalog fields.

A topic is a run of cover posts (a photo whose caption names the title) each
followed by the files of that version. Everything here is pure: messages in,
dicts out, no network.
"""
import re
import unicodedata

QUALITY_RE = re.compile(r"\b(4K|2160p|1080p|720p)\b", re.IGNORECASE)
YEAR_RE = re.compile(r"\((\d{4})\)")
TMDB_FILE_RE = re.compile(r"\[tmdbid-(\d+)\]")
DECADE_RE = re.compile(r"#((?:19|20)\d)0s\b")
BRACKET_RE = re.compile(r"[\(\[]([^()\[\]]*)[\)\]]")
EDITION_RE = re.compile(
    r"\s*[-–:+]\s*(?:versi[oó]n\b.*|montaje del director.*|director'?s cut.*|extendida.*|remasterizad[ao].*)$",
    re.IGNORECASE,
)
TAG_WORDS = {"remux": "REMUX", "hdr": "HDR", "open matte": "Open Matte", "remasterizada": "Remasterizado",
             "remasterizado": "Remasterizado", "remastered": "Remasterizado", "dvdrip": "DVDRip", "bdrip": "BDrip"}

LANGUAGE_WORDS = {
    "castellano": "Castellano", "espanol": "Castellano", "espanol (espana)": "Castellano", "spanish": "Castellano",
    "latino": "Latino", "espanol (latinoamerica)": "Latino", "espanol latino": "Latino",
    "ingles": "Inglés", "english": "Inglés",
    "japones": "Japonés", "japanese": "Japonés",
    "frances": "Francés", "french": "Francés",
    "catalan": "Catalán", "gallego": "Gallego", "euskera": "Euskera", "italiano": "Italiano",
    "portugues": "Portugués", "vo": "VO", "forzados": "Forzados",
}


def norm(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", text).strip(" .-").lower()


def is_cover(message):
    return (message.get("media") or {}).get("kind") == "MessageMediaPhoto" and bool(message["text"].strip())


def group_covers(messages):
    """Pair each cover post with the documents posted after it, until the next cover."""
    covers = []
    for message in messages:
        if is_cover(message):
            covers.append({"cover": message, "files": []})
        elif covers and (message.get("media") or {}).get("kind") == "MessageMediaDocument":
            covers[-1]["files"].append(message["media"].get("name") or "")
    return covers


def heading(text):
    """The title line: the last non-empty line of the first paragraph (some posts joke with crossed-out names above)."""
    paragraph = text.strip().split("\n\n", 1)[0]
    lines = [line.strip() for line in paragraph.split("\n") if line.strip() and not line.strip().startswith("#")]
    return lines[-1] if lines else ""


def parse_heading(line):
    year = None
    years = YEAR_RE.findall(line)
    if years:
        year = years[-1]
    extras = [m.group(1) for m in BRACKET_RE.finditer(line) if is_annotation(m.group(1))]
    quality_text = " ".join(extras)
    title = BRACKET_RE.sub(lambda m: " " if is_annotation(m.group(1)) else f" {m.group(1)} ", line)
    if not QUALITY_RE.search(quality_text):
        quality_text = line
        title = QUALITY_RE.sub(" ", title)
    title = re.sub(r"\s+", " ", title).strip(" -–")
    quality = quality_of(quality_text)
    tags = tags_of(quality_text)
    edition = EDITION_RE.search(title)
    if edition:
        title = title[: edition.start()].strip()
    return {"title": title, "year": year, "quality": quality, "tags": tags}


ANNOTATION_RE = re.compile(
    r"^\d{4}$|\b(?:4K|2160p|1080p|720p|576p|480p|360p|blu-?ray|especial|remux|hdr|dvdrip|bdrip|remaster\w*|versi[oó]n|montaje|extendida|"
    r"open matte|director'?s cut|temporadas?|season|completa)\b",
    re.IGNORECASE,
)


def is_annotation(text):
    """Whether a bracketed part of a heading describes the version rather than being part of the title."""
    return bool(ANNOTATION_RE.search(text.strip()))


def quality_of(text):
    found = {q.upper().replace("2160P", "4K") for q in QUALITY_RE.findall(text)}
    if "4K" in found:
        return "4K"
    if "1080P" in found:
        return "1080p"
    return None


def tags_of(text):
    lowered = norm(text)
    tags = []
    for word, tag in TAG_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\b", lowered) and tag not in tags:
            tags.append(tag)
    return tags


def language_tokens(text):
    """Catalog languages named in a fragment like 'Inglés [VO] (7.1)' or 'Castellano, Latino y VOSE'."""
    found = []
    text = re.sub(r"\(?\+\s*forzados?\)?", " , Forzados , ", text.replace("[VO]", " , VO , "), flags=re.IGNORECASE)
    text = re.sub(r"\((?:\+?audiodescripci[oó]n|[\d.| ]+|est[eé]reo|cc|sdh)\)|\[[^\]]*\]", " ", text, flags=re.IGNORECASE)
    for chunk in re.split(r",|/|\+|\by\b|\be\b", text):
        key = norm(chunk)
        if key == "vose":
            found += ["VO", "VOSE"]
            continue
        value = LANGUAGE_WORDS.get(key) or LANGUAGE_WORDS.get(re.sub(r"\s*\(.*\)$", "", key))
        if value:
            found.append(value)
    return found


def dedupe(items):
    return [item for i, item in enumerate(items) if item not in items[:i]]


def parse_languages(text):
    """Audio and subtitle languages from 'Audio:'/'Subtítulos:' sections (inline or as '- ' lists),
    or from a short line near the top such as 'Castellano y VOSE'."""
    audio, subs = [], []
    section = None
    lines = [line.strip() for line in text.split("\n")]
    for line in lines:
        key = norm(line)
        if not key:
            continue
        if key.startswith("audio"):
            section = audio
            rest = line.split(":", 1)[1] if ":" in line else ""
        elif key.startswith(("subtitulos", "subs", "subtitles")):
            section = subs
            rest = line.split(":", 1)[1] if ":" in line else ""
        elif section is not None and line.startswith(("-", "•")):
            rest = line[1:]
        else:
            section = None
            continue
        tokens = language_tokens(rest)
        if "VOSE" in tokens:
            tokens = [t for t in tokens if t != "VOSE"]
            if section is subs:
                tokens = ["Castellano" if t == "VO" else t for t in tokens]
        section += tokens

    if not audio and not subs:
        for line in [l for l in lines if l][1:4]:
            short = re.sub(r"^solo\s+", "", norm(line))
            tokens = language_tokens(short)
            if tokens and len(tokens) >= len(re.split(r",|\by\b|\be\b", short)):
                if "VOSE" in tokens:
                    subs = ["Castellano"]
                audio = [t for t in tokens if t != "VOSE"]
                break
    return dedupe(audio), dedupe([s for s in subs if s != "VO"])


def synopsis(text):
    match = re.search(r"SINOPSIS:?\s*\n(.*?)(?:\n\s*\n(?:audio|subt|\(son|\[|#)|\Z)", text, re.IGNORECASE | re.DOTALL)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else ""


def decade(text):
    match = DECADE_RE.search(text)
    return int(match.group(1)) * 10 if match else None


def file_hints(files):
    tmdb_ids = dedupe([int(m.group(1)) for name in files for m in [TMDB_FILE_RE.search(name)] if m])
    years = dedupe([y for name in files for y in YEAR_RE.findall(name)])
    return {"tmdb_ids": tmdb_ids, "years": years}


SERIES_PART_RE = re.compile(
    r"\s[-–]\s(?P<part>(?:temporadas?|miniserie|serie completa|especial(?:es)?|volumen|libro|arco|episodios|"
    r"los cap[ií]tulos)\b.*)$",
    re.IGNORECASE,
)
SEASON_NUMBER_RE = re.compile(r"\b(?:temporada|volumen|libro)\s+(\d{1,2})", re.IGNORECASE)


def split_series_heading(title):
    """'Castlevania - Temporada 4' -> ('Castlevania', 'Temporada 4'); the part is None when there is none."""
    match = SERIES_PART_RE.search(title)
    if not match:
        return title, None
    return title[: match.start()].strip(), match.group("part").strip()


def season_of(part):
    """Catalog season of a series heading part: an int, "all" for the whole series, or None when unclear
    (several seasons in one post, story arcs, episode ranges)."""
    if part is None:
        return None
    key = norm(part)
    if key.startswith(("miniserie", "serie completa")):
        return "all"
    if key.startswith("especial"):
        return 0
    if key.startswith("temporadas") or len(SEASON_NUMBER_RE.findall(part)) > 1:
        return None
    match = SEASON_NUMBER_RE.search(part)
    return int(match.group(1)) if match else None


def series_season(head, part):
    """Season from the heading part, else from a lone '(Temporada N)' anywhere in the heading."""
    season = season_of(part)
    if season is None and (part is None or not norm(part).startswith("temporadas")):
        numbers = SEASON_NUMBER_RE.findall(head)
        if len(numbers) == 1:
            season = int(numbers[0])
    return season


def original_title(text):
    match = re.search(r"^t[ií]tulo original:\s*\n?\s*(.+)$", text, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else None


def parse_cover(entry, kind, default_quality):
    """Fields of one cover post (as returned by group_covers); kind is 'movie' or 'series'."""
    cover = entry["cover"]
    text = cover["text"]
    head = heading(text)
    fields = parse_heading(head)
    hints = file_hints(entry["files"])
    audio, subs = parse_languages(text)
    if fields["year"] is None and len(hints["years"]) == 1:
        fields["year"] = hints["years"][0]
    season_part = None
    if kind == "series":
        fields["title"], season_part = split_series_heading(fields["title"])
    return {
        "message_id": cover["id"],
        "date": cover["date"],
        "heading": head,
        **fields,
        "quality": fields["quality"] or default_quality,
        "season": series_season(head, season_part) if kind == "series" else None,
        "season_part": season_part,
        "original_title": original_title(text),
        "audio": audio,
        "subs": subs,
        "synopsis": synopsis(text),
        "decade": decade(text),
        "tmdb_ids": hints["tmdb_ids"],
        "files": len(entry["files"]),
    }
