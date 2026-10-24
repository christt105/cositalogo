import unittest

from match import decide
from parse import group_covers, parse_cover, parse_heading, parse_languages, series_season, split_series_heading
from plan import AUTO_TAG, SCAN_USER_ID, plan

LANGUAGES = {
    "audio": ["Castellano", "Latino", "Inglés", "Japonés", "Catalán", "VO"],
    "subs": ["Castellano", "Latino", "Inglés", "Catalán", "Forzados"],
}


def cover(message_id, text, files=(), date="2025-03-09T10:00:00+00:00"):
    messages = [{"id": message_id, "date": date, "text": text, "media": {"kind": "MessageMediaPhoto"}}]
    messages += [{"id": message_id + i + 1, "date": date, "text": "", "media": {"kind": "MessageMediaDocument", "name": name}}
                 for i, name in enumerate(files)]
    return group_covers(messages)[0]


class HeadingTest(unittest.TestCase):
    def test_title_year_quality_and_tags(self):
        self.assertEqual(parse_heading("Hulk (2003) (1080p y 1080p REMUX)"),
                         {"title": "Hulk", "year": "2003", "quality": "1080p", "tags": ["REMUX"]})
        self.assertEqual(parse_heading("La gran familia (1962) [1080p]")["year"], "1962")
        self.assertEqual(parse_heading("Civil War (4K HDR)"), {"title": "Civil War", "year": None, "quality": "4K", "tags": ["HDR"]})

    def test_brackets_that_belong_to_the_title_stay(self):
        self.assertEqual(parse_heading("[REC] 2 (1080p)")["title"], "REC 2")

    def test_edition_suffix_is_dropped(self):
        self.assertEqual(parse_heading("Halloween: El Origen - Director's Cut (1080p)")["title"], "Halloween: El Origen")
        self.assertEqual(parse_heading("X-Men 2 (1080p Remasterizada)")["tags"], ["Remasterizado"])

    def test_heading_is_the_last_line_of_the_first_paragraph(self):
        entry = cover(1, "Rocas Cochambrosas\nCumbres Borrascosas (2026) (1080p)\n\nSINOPSIS:\n\nUna historia.")
        self.assertEqual(parse_cover(entry, "movie", "1080p")["title"], "Cumbres Borrascosas")


class LanguagesTest(unittest.TestCase):
    def test_short_line(self):
        self.assertEqual(parse_languages("Luca (1080p)\n\nCastellano, Latino y VOSE\n\n(Son 6 partes en zip)"),
                         (["Castellano", "Latino", "VO"], ["Castellano"]))

    def test_dash_lists(self):
        text = ("Pinocho (1940)  [1080p]\n\nAudio:\n- Latino\n- Inglés (+Audiodescripción)\n- Japonés\n\n"
                "Subtítulos:\n- Castellano\n- Latino (+Forzados)\n- Inglés")
        self.assertEqual(parse_languages(text), (["Latino", "Inglés", "Japonés"], ["Castellano", "Latino", "Forzados", "Inglés"]))

    def test_vo_marker_and_country_variants(self):
        text = "Mulán\n\nAudio:\n- Inglés [VO]\n- Español (España)\n\nSubtítulos:\n- Español (Latinoamérica)"
        self.assertEqual(parse_languages(text), (["Inglés", "VO", "Castellano"], ["Latino"]))


class SeriesTest(unittest.TestCase):
    def test_split_and_season(self):
        self.assertEqual(split_series_heading("Castlevania - Temporada 4"), ("Castlevania", "Temporada 4"))
        self.assertEqual(series_season("Castlevania - Temporada 4", "Temporada 4"), 4)
        self.assertEqual(series_season("Veneno - Miniserie", "Miniserie"), "all")
        self.assertEqual(series_season("X - Especial", "Especial"), 0)

    def test_season_in_brackets_and_unclear_ones(self):
        head = "Kimetsu no Yaiba - Arco de la aldea de los herreros (Temporada 3) (1080p)"
        self.assertEqual(series_season(head, "Arco de la aldea de los herreros"), 3)
        self.assertIsNone(series_season("Helluva Boss - Temporadas 1 y 2", "Temporadas 1 y 2"))

    def test_default_quality_and_file_ids(self):
        entry = cover(9, "Bestial - Miniserie\n\nCastellano", files=["Bestial (2024) [tmdbid-123] - 1x01.mkv"])
        parsed = parse_cover(entry, "series", "1080p")
        self.assertEqual((parsed["title"], parsed["season"], parsed["quality"], parsed["tmdb_ids"], parsed["year"]),
                         ("Bestial", "all", "1080p", [123], "2024"))


def parsed(**fields):
    return {"title": "It", "year": None, "decade": None, "synopsis": "", "tmdb_ids": [], "date": "2025-01-01T00:00:00+00:00", **fields}


def result(id, title, date, votes=0, overview=""):
    return {"id": id, "title": title, "original_title": title, "release_date": date, "vote_count": votes, "overview": overview}


class DecideTest(unittest.TestCase):
    def test_title_and_year(self):
        results = [result(1, "It", "2017-09-06"), result(2, "It", "1990-11-18")]
        self.assertEqual(decide(parsed(year="1990"), results)["tmdb_id"], 2)

    def test_never_takes_the_first_result_blindly(self):
        results = [result(1, "It", "2017-09-06", votes=100), result(2, "It", "1990-11-18", votes=50)]
        decision = decide(parsed(), results)
        self.assertEqual((decision["status"], decision["tmdb_id"]), ("ambiguous", None))

    def test_far_more_votes_is_only_a_suggestion(self):
        results = [result(1, "It", "2017-09-06", votes=5000), result(2, "It", "1990-11-18", votes=50)]
        self.assertEqual(decide(parsed(), results)["status"], "title_votes")

    def test_synopsis_beats_title(self):
        text = "un grupo de periodistas recorre estados unidos en plena guerra civil para llegar a washington antes que los rebeldes"
        results = [result(1, "Capitán América: Civil War", "2016-04-27", votes=9000), result(2, "Civil War", "2024-04-10", overview=text)]
        self.assertEqual(decide(parsed(title="Civil War", synopsis=text), results)["status"], "synopsis")

    def test_releases_after_the_post_are_ignored(self):
        results = [result(1, "It", "2027-01-01"), result(2, "It", "1990-11-18")]
        self.assertEqual(decide(parsed(), results)["tmdb_id"], 2)


def link(id, key, tmdb, **fields):
    return {"id": id, "link_key": key, "url": key.replace("/2229558644/", "/2229558644/2/"), "type": "movie", "tmdb_id": tmdb,
            "season": None, "quality": "1080p", "audio": [], "subs": [], "tags": [], "added_by": None, "created_at": 1, **fields}


def scanned(key, tmdb, status):
    message_id = int(key.rsplit("/", 1)[1])
    return {"link_key": key, "url": key.replace("/2229558644/", "/2229558644/2/"), "type": "movie", "heading": "X (1080p)",
            "date": "2025-01-01T00:00:00+00:00", "season": None, "quality": "1080p", "tags": [], "audio": ["Castellano"],
            "subs": [], "message_id": message_id, "match": {"status": status, "tmdb_id": tmdb, "candidates": []}}


class PlanTest(unittest.TestCase):
    def test_recasts_untouched_links_and_leaves_people_alone(self):
        a, b, c = (f"https://t.me/c/2229558644/{n}" for n in (10, 20, 30))
        links = {a: link(1, a, 100), b: link(2, b, 100, added_by=7), c: link(3, c, 100)}
        audit = [{"user_id": SCAN_USER_ID, "target": "link:3"}]
        scan = [scanned(a, 200, "synopsis"), scanned(b, 200, "synopsis"), scanned(c, 200, "synopsis")]
        ops = plan(scan, links, audit, {}, LANGUAGES)["ops"]
        moved = {op["id"] for op in ops if op["op"] == "move"}
        self.assertEqual(moved, {1, 3})
        self.assertTrue(all(op["fields"]["tags"] == [AUTO_TAG] for op in ops if op["op"] == "update" and op["id"] in moved))
        self.assertEqual({op["id"] for op in ops if op["op"] == "date"}, {1, 2, 3})
        self.assertNotIn(2, {op["id"] for op in ops if op["op"] == "update"})

    def test_doubtful_links_stay_and_get_the_tag(self):
        a = "https://t.me/c/2229558644/10"
        result_ = plan([scanned(a, None, "ambiguous")], {a: link(1, a, 100)}, [], {}, LANGUAGES)
        update = next(op for op in result_["ops"] if op["op"] == "update")
        self.assertEqual(update["fields"]["tags"], [AUTO_TAG, "dudoso"])
        self.assertEqual(result_["kept"][0]["why"], "doubtful")

    def test_confirmed_links_need_no_tag(self):
        a = "https://t.me/c/2229558644/10"
        ops = plan([scanned(a, 100, "title_year")], {a: link(1, a, 100)}, [], {}, LANGUAGES)["ops"]
        self.assertEqual([op["fields"] for op in ops if op["op"] == "update"], [{"audio": ["Castellano"]}])

    def test_new_posts_are_added_only_when_confident(self):
        a, b = "https://t.me/c/2229558644/10", "https://t.me/c/2229558644/20"
        result_ = plan([scanned(a, 100, "title_votes"), scanned(b, 100, "file_id")], {}, [], {}, LANGUAGES)
        self.assertEqual([op["link"] for op in result_["ops"] if op["op"] == "add"], [scanned(b, 0, "")["url"]])
        self.assertEqual(len(result_["needs_person"]), 1)


if __name__ == "__main__":
    unittest.main()
