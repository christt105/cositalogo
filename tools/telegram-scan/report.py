"""Markdown report of a plan, for a person to review before applying it.

Usage: python report.py <scan.json> <plan.json> <d1_export_dir> <out.md> <tmdb_cache_dir>
"""
import json
import sys
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


def candidates(row):
    return "; ".join(f"{c['title']} ({c['year']}) [{c['id']}]" for c in row.get("candidates", [])) or "-"


def cell(text):
    return str(text).replace("|", "\\|")


def main(scan_path, plan_path, export_dir, out_path, tmdb_cache):
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
            out.append(f"| [{cell(scan[url]['heading'])}]({url}) | {cell(name(titles, op['from']['type'], op['from']['tmdb']))} "
                       f"| {cell(name(titles, op['type'], op['tmdb'], lookup))} | {op['reason']} |")

    out += ["", "## Dudosos que se quedan donde están", "",
            "| Portada | Ahora | Motivo | Sugerido | Candidatos |", "|---|---|---|---|---|"]
    for row in plan["kept"]:
        if row["why"] == "doubtful":
            out.append(f"| [{cell(row['heading'])}]({row['link']}) | {cell(name(titles, row['current']['type'], row['current']['tmdb']))} "
                       f"| {row['status']} | {row['suggested'] or '-'} | {cell(candidates(row))} |")

    out += ["", "## Portadas sin casar que no se añaden", "", "| Portada | Fecha | Motivo | Candidatos |", "|---|---|---|---|"]
    for row in plan["needs_person"]:
        out.append(f"| [{cell(row['heading'])}]({row['link']}) | {row['posted']} | {row['status']} | {cell(candidates(row))} |")

    out += ["", "## Links cuyo mensaje ya no existe", "", "| Link | Título | Posible nuevo mensaje |", "|---|---|---|"]
    for row in plan["kept"]:
        if row["why"] == "message_gone":
            out.append(f"| {row['link']} | {cell(name(titles, row['current']['type'], row['current']['tmdb']))} | {row['repost'] or '-'} |")

    out += ["", "## Links nuevos", "", "| Portada | Título | Por qué |", "|---|---|---|"]
    for op in plan["ops"]:
        if op["op"] == "add":
            out.append(f"| [{cell(scan[op['link']]['heading'])}]({op['link']}) | {cell(name(titles, op['type'], op['tmdb'], lookup))} | {op['reason']} |")
    Path(out_path).write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main(*sys.argv[1:])
