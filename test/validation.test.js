import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ValidationError,
  parseTelegramLink,
  validateQuality,
  validateSeason,
  validateTags,
  validateLanguages,
  validatePoster,
  validateLinkEntry,
  englishTitle,
  keepEnglishTranslations,
} from "../scripts/validation.js";
import { config, GROUP_ID, link } from "./fixtures.js";

describe("parseTelegramLink", () => {
  test("parses a link without topic", () => {
    assert.deepEqual(parseTelegramLink(`https://t.me/c/${GROUP_ID}/42`), {
      groupId: GROUP_ID,
      topicId: null,
      messageId: "42",
    });
  });

  test("parses a link with topic", () => {
    assert.deepEqual(parseTelegramLink(`https://t.me/c/${GROUP_ID}/7/42`), {
      groupId: GROUP_ID,
      topicId: "7",
      messageId: "42",
    });
  });

  test("rejects invite links", () => {
    assert.throws(() => parseTelegramLink("https://t.me/+abcdef"), ValidationError);
    assert.throws(() => parseTelegramLink("https://t.me/joinchat/abcdef"), ValidationError);
  });

  test("rejects public links, trailing slashes and non-strings", () => {
    assert.throws(() => parseTelegramLink("https://t.me/somechannel/42"), ValidationError);
    assert.throws(() => parseTelegramLink(`https://t.me/c/${GROUP_ID}/42/`), ValidationError);
    assert.throws(() => parseTelegramLink(undefined), ValidationError);
    assert.throws(() => parseTelegramLink(42), ValidationError);
  });
});

describe("validateQuality", () => {
  test("accepts a listed quality", () => {
    assert.doesNotThrow(() => validateQuality("1080p", ["1080p", "4K"]));
  });

  test("rejects anything else, listing the allowed values", () => {
    assert.throws(() => validateQuality("720p", ["1080p", "4K"]), {
      name: "Error",
      message: 'quality "720p" is not one of: 1080p, 4K',
    });
  });
});

describe("validateSeason", () => {
  test("accepts integers >= 0 and \"all\" for series", () => {
    assert.doesNotThrow(() => validateSeason(0, "series"));
    assert.doesNotThrow(() => validateSeason(3, "series"));
    assert.doesNotThrow(() => validateSeason("all", "series"));
  });

  test("requires a season for series", () => {
    assert.throws(() => validateSeason(undefined, "series"), ValidationError);
    assert.throws(() => validateSeason(null, "series"), ValidationError);
  });

  test("rejects negative, fractional and string seasons", () => {
    assert.throws(() => validateSeason(-1, "series"), ValidationError);
    assert.throws(() => validateSeason(1.5, "series"), ValidationError);
    assert.throws(() => validateSeason("1", "series"), ValidationError);
  });

  test("rejects any season on movies", () => {
    assert.doesNotThrow(() => validateSeason(undefined, "movie"));
    assert.throws(() => validateSeason(1, "movie"), ValidationError);
  });
});

describe("validateTags", () => {
  test("accepts undefined and arrays of strings", () => {
    assert.doesNotThrow(() => validateTags(undefined));
    assert.doesNotThrow(() => validateTags([]));
    assert.doesNotThrow(() => validateTags(["Extendida"]));
  });

  test("rejects non-arrays and non-string members", () => {
    assert.throws(() => validateTags("Extendida"), ValidationError);
    assert.throws(() => validateTags([1]), ValidationError);
  });
});

describe("validateLanguages", () => {
  const allowed = ["Castellano", "Inglés"];

  test("accepts undefined and listed values", () => {
    assert.doesNotThrow(() => validateLanguages(undefined, "audio", allowed));
    assert.doesNotThrow(() => validateLanguages(["Castellano", "Inglés"], "audio", allowed));
  });

  test("rejects unlisted values", () => {
    assert.throws(() => validateLanguages(["Aleman"], "audio", allowed), {
      message: 'audio "Aleman" is not one of: Castellano, Inglés',
    });
  });

  test("rejects duplicates", () => {
    assert.throws(() => validateLanguages(["Castellano", "Castellano"], "subs", allowed), {
      message: 'subs has duplicate value "Castellano"',
    });
  });

  test("rejects non-arrays", () => {
    assert.throws(() => validateLanguages("Castellano", "audio", allowed), ValidationError);
  });
});

describe("validatePoster", () => {
  test("accepts undefined and https URLs", () => {
    assert.doesNotThrow(() => validatePoster(undefined));
    assert.doesNotThrow(() => validatePoster("https://image.tmdb.org/t/p/w342/a.jpg"));
  });

  test("rejects empty strings and non-strings", () => {
    assert.throws(() => validatePoster(""), ValidationError);
    assert.throws(() => validatePoster("   "), ValidationError);
    assert.throws(() => validatePoster(42), ValidationError);
  });

  test("rejects anything that is not an https URL with a host", () => {
    for (const value of [
      "not-a-url",
      "javascript:alert(1)",
      "http://image.tmdb.org/t/p/w342/a.jpg",
      "https://",
      "https:///a.jpg",
      "https://user@evil.example/a.jpg",
      "https://image.tmdb.org/a b.jpg",
    ]) {
      assert.throws(() => validatePoster(value), ValidationError, value);
    }
  });
});

describe("validateLinkEntry", () => {
  const base = config();

  test("accepts a complete movie entry", () => {
    assert.doesNotThrow(() =>
      validateLinkEntry(
        { quality: "1080p", audio: ["Castellano"], subs: ["Inglés"], tags: ["Extendida"], link: link(1) },
        { type: "movie", ...base }
      )
    );
  });

  test("requires a quality", () => {
    assert.throws(
      () => validateLinkEntry({ link: link(1) }, { type: "movie", ...base }),
      { message: "quality is required" }
    );
  });

  test("rejects unknown telegram groups", () => {
    assert.throws(
      () =>
        validateLinkEntry(
          { quality: "1080p", link: "https://t.me/c/999/1" },
          { type: "movie", ...base }
        ),
      { message: "unknown telegram group id: 999" }
    );
  });

  test("rejects non-objects", () => {
    assert.throws(() => validateLinkEntry(null, { type: "movie", ...base }), ValidationError);
  });
});

describe("englishTitle", () => {
  const tr = (lang, country, data) => ({ iso_639_1: lang, iso_3166_1: country, data });
  const info = (...translations) => ({ translations: { translations } });

  test("returns the en-US movie title", () => {
    const movie = info(tr("en", "GB", { title: "Spirited Away (UK)" }), tr("en", "US", { title: "Spirited Away" }));
    assert.equal(englishTitle(movie, ["El viaje de Chihiro", "千と千尋の神隠し"]), "Spirited Away");
  });

  test("falls back to another English translation when en-US is empty", () => {
    const series = info(tr("en", "US", { name: "" }), tr("en", "GB", { name: "Money Heist" }));
    assert.equal(englishTitle(series, ["La casa de papel"]), "Money Heist");
  });

  test("reads the series name field", () => {
    assert.equal(englishTitle(info(tr("en", "US", { name: "Dark" })), ["Oscuro"]), "Dark");
  });

  test("ignores other languages", () => {
    assert.equal(englishTitle(info(tr("fr", "FR", { title: "Le Voyage" })), ["X"]), null);
  });

  test("is null when it matches the title or original title ignoring case and accents", () => {
    const amelie = info(tr("en", "US", { title: "Amélie" }));
    assert.equal(englishTitle(amelie, ["AMELIE", "Le Fabuleux Destin d'Amélie Poulain"]), null);
    const avengers = info(tr("en", "US", { title: "The Avengers" }));
    assert.equal(englishTitle(avengers, ["Vengadores", "The Avengers"]), null);
  });

  test("is null without translations or with only empty ones", () => {
    assert.equal(englishTitle({}, ["X"]), null);
    assert.equal(englishTitle(info(tr("en", "US", { title: "  " })), ["X"]), null);
  });
});

describe("keepEnglishTranslations", () => {
  test("adds an empty translation list when the response has none", () => {
    assert.deepEqual(keepEnglishTranslations({ id: 1 }), {
      id: 1,
      translations: { translations: [] },
    });
  });
});
