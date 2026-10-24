"""Markdown report of a plan, for a person to review before applying it.

Usage: python report.py <scan.json> <plan.json> <d1_export_dir> <out.md> <tmdb_cache_dir> [<web_base_url>]
"""
import json
import sys
from urllib.parse import urlencode
from pathlib import Path

from plan import read_export
from tmdb import Tmdb

LABELS = {
    "add": "Links nuevos (portadas que no estaban en el catálogo), con `auto`",
    "move": "Links que cambian de título, con `auto`",
    "confirmed_trusted": "Links confirmados con prueba fuerte (id en el archivo, sinopsis, título + año, único resultado), sin `auto`",
    "confirmed_auto": "Links que siguen igual pero solo con prueba débil (el más votado), con `auto`",
    "kept_doubtful": "Links dudosos que se quedan donde están, con `auto`",
    "kept_touched_by_people": "Links tocados por una persona: no se tocan (solo la fecha)",
    "missing_needs_person": "Portadas que no están en el catálogo y no se pueden casar solas: no se añaden",
    "message_gone": "Links cuyo mensaje ya no existe en Telegram",
    "date": "Links a los que se les pone la fecha del mensaje",
    "update_audio": "Links a los que se les rellena el audio",
    "update_subs": "Links a los que se les rellenan los subtítulos",
    "update_tags": "Links a los que les cambian las etiquetas (sobre todo por `auto`)",
    "update_quality": "Links a los que les cambia la calidad",
    "update_season": "Links a los que les cambia la temporada",
}


def name(titles, kind, tmdb, lookup=None):
    title = titles.get((kind, tmdb))
    if title:
        return f"{title['title']} ({title['year']})"
    details = lookup.details("movie" if kind == "movie" else "tv", tmdb) if lookup else None
    if not details:
        return f"{kind}:{tmdb}"
    date = details.get("release_date") or details.get("first_air_date") or ""
    return f"{details.get('title') or details.get('name')} ({date[:4]}) [nuevo]"


WEB = "https://cositalogo.christt105.workers.dev"
TMDB_KIND = {"movie": "movie", "series": "tv"}


def cell(text):
    return str(text).replace("|", "\\|").replace("[", "\\[").replace("]", "\\]")


def title_link(web, kind, tmdb, label):
    return f"[{cell(label)}]({web}/{kind}/{tmdb})"


def tmdb_link(kind, candidate):
    return f"[{cell(candidate['title'])} ({candidate['year']})](https://www.themoviedb.org/{TMDB_KIND[kind]}/{candidate['id']})"


def add_url(web, cover, tmdb=None):
    """The web's add form, filled with what the post says, searching its title or with a title already chosen."""
    params = {"q": cover["title"], "link": cover["url"], "quality": cover["quality"],
              "audio": ",".join(cover["audio"]), "subs": ",".join(cover["subs"]), "tags": ", ".join(cover["tags"])}
    if cover["type"] == "series" and cover["season"] is not None:
        params["season"] = cover["season"]
    if tmdb:
        params.update(type=cover["type"], tmdb=tmdb)
    return f"{web}/add?{urlencode({k: v for k, v in params.items() if v not in ('', None)})}"


def main(scan_path, plan_path, export_dir, out_path, tmdb_cache, web=WEB):
    scan = {row["url"]: row for row in json.loads(Path(scan_path).read_text())}
    plan = json.loads(Path(plan_path).read_text())
    links, titles, _ = read_export(Path(export_dir))
    lookup = Tmdb(tmdb_cache)
    by_id = {link["id"]: link for link in links.values()}
    out = ["# Informe del reescaneo del canal", "", "## Resumen", ""]
    for key, count in plan["counts"].items():
        out.append(f"- {LABELS.get(key, key)}: **{count}**")

    out += ["", "## Cambian de título", "", "| Portada | Antes | Después | Por qué |", "|---|---|---|---|"]
    for op in plan["ops"]:
        if op["op"] == "move":
            url = by_id[op["id"]]["url"]
            before = name(titles, op["from"]["type"], op["from"]["tmdb"])
            after = name(titles, op["type"], op["tmdb"], lookup)
            out.append(f"| [{cell(scan[url]['heading'])}]({url}) | {cell(before)} "
                       f"| {title_link(web, op['type'], op['tmdb'], after)} | {op['reason']} |")

    out += ["", "## Portadas sin casar que no se añaden", "",
            "\"Identificar\" abre Añadir con el enlace, la calidad y los idiomas ya puestos; un candidato lo abre con ese título elegido.", "",
            "| Portada | Fecha | Motivo | Identificar | Candidatos |", "|---|---|---|---|---|"]
    for row in plan["needs_person"]:
        cover = scan[row["link"]]
        picks = "<br>".join(f"[{cell(c['title'])} ({c['year']})]({add_url(web, cover, c['id'])}) · [TMDB](https://www.themoviedb.org/{TMDB_KIND[cover['type']]}/{c['id']})"
                            for c in row.get("candidates", [])) or "-"
        out.append(f"| [{cell(row['heading'])}]({row['link']}) | {row['posted']} | {row['status']} | [Identificar]({add_url(web, cover)}) | {picks} |")

    out += ["", "## Dudosos que se quedan donde están", "",
            "Llevan `auto` y `dudoso`. Si el título es el bueno, \"Está bien\" en su ficha; si no, \"Mover\" al candidato correcto.", "",
            "| Portada | Ahora | Motivo | Candidatos |", "|---|---|---|---|"]
    for row in plan["kept"]:
        if row["why"] == "doubtful":
            kind = row["current"]["type"]
            now = title_link(web, kind, row["current"]["tmdb"], name(titles, kind, row["current"]["tmdb"]))
            picks = "<br>".join(tmdb_link(scan[row["link"]]["type"], c) for c in row.get("candidates", [])) or "-"
            out.append(f"| [{cell(row['heading'])}]({row['link']}) | {now} | {row['status']} | {picks} |")

    out += ["", "## Links cuyo mensaje ya no existe", "", "| Link | Título | Posible nuevo mensaje |", "|---|---|---|"]
    for row in plan["kept"]:
        if row["why"] == "message_gone":
            kind = row["current"]["type"]
            title = title_link(web, kind, row["current"]["tmdb"], name(titles, kind, row["current"]["tmdb"]))
            out.append(f"| {row['link']} | {title} | {row['repost'] or '-'} |")

    out += ["", "## Links nuevos", "", "| Portada | Título | Por qué |", "|---|---|---|"]
    for op in plan["ops"]:
        if op["op"] == "add":
            label = name(titles, op["type"], op["tmdb"], lookup)
            out.append(f"| [{cell(scan[op['link']]['heading'])}]({op['link']}) | {title_link(web, op['type'], op['tmdb'], label)} | {op['reason']} |")
    Path(out_path).write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main(*sys.argv[1:])
