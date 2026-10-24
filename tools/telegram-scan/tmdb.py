"""TMDB search and details with an on-disk cache, so reruns cost no requests."""
import hashlib
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.themoviedb.org/3"


class Tmdb:
    def __init__(self, cache_dir, api_key=None, language="es-ES"):
        self.key = api_key or os.environ["TMDB_API_KEY"]
        self.language = language
        self.cache = Path(cache_dir)
        self.cache.mkdir(parents=True, exist_ok=True)

    def _get(self, path, **params):
        params = {"language": self.language, **{k: v for k, v in params.items() if v is not None}}
        query = urllib.parse.urlencode(sorted(params.items()))
        name = hashlib.sha1(f"{path}?{query}".encode()).hexdigest()
        cached = self.cache / f"{name}.json"
        if cached.exists():
            return json.loads(cached.read_text())
        url = f"{API}{path}?{query}&api_key={self.key}"
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=20) as resp:
                    data = json.load(resp)
                break
            except urllib.error.HTTPError as err:
                if err.code == 404:
                    data = None
                    break
                if err.code != 429 or attempt == 4:
                    raise
                time.sleep(2 ** attempt)
        partial = cached.with_suffix(f".{threading.get_ident()}.tmp")
        partial.write_text(json.dumps(data, ensure_ascii=False))
        partial.replace(cached)
        return data

    def search(self, kind, query, year=None):
        """kind is 'movie' or 'tv'; year filters by primary release / first air year."""
        key = "primary_release_year" if kind == "movie" else "first_air_date_year"
        data = self._get(f"/search/{kind}", query=query, include_adult="false", **{key: year})
        return data["results"] if data else []

    def details(self, kind, tmdb_id):
        return self._get(f"/{kind}/{tmdb_id}", append_to_response="translations,alternative_titles")
