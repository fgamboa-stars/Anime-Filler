# Importing filler data

Adding a new anime is a data change, not a code change. Import a CSV and the anime automatically gets:

- an episode list with type badges
- type, arc and watched filters
- a canon watch order
- watch progress tracking
- arc pages
- the "Filler data available" badge in search, plus a place in the Discover rankings

## 1. Prepare a CSV

Required columns: `animeTitle`, `episodeNumber`, `title`, `type`. Optional: `arc`, `anilistId`.

```csv
animeTitle,episodeNumber,title,type,arc
Bleach,64,Rain of Memories,FILLER,Bount Arc
```

| Column | Rules |
| --- | --- |
| `animeTitle` | Display title. Rows are grouped by this value, so one CSV can hold several anime. |
| `episodeNumber` | Whole number, 1 or higher. Must be unique per anime. |
| `title` | Episode title, not empty. Quote it if it contains commas: `"Mix It, Stretch It"`. |
| `type` | `CANON`, `FILLER`, `MIXED` or `ANIME_CANON`. Also accepted: `Manga Canon`, `Mixed Canon/Filler`, `Anime Canon` (any case). |
| `arc` | Story arc name. Empty means `Standalone Episodes`. Episodes with the same arc name are grouped; an arc can span non-contiguous ranges. |
| `anilistId` | AniList Media ID (optional here; see below). |

Header names are matched loosely, so `Episode`, `Episode Title`, `Classification` and `anilist_id` also work. Files may use LF or CRLF line endings and may start with a UTF-8 BOM (Excel exports are fine).

### Finding the AniList ID

Open the anime on anilist.co. The number in the URL is the ID: `https://anilist.co/anime/269/BLEACH/` → `269`. Make sure you pick the right entry; sequels and remakes have their own IDs (Hunter x Hunter 2011 is not the 1999 series).

## 2. Run the importer

```bash
# Preview without writing anything
npm run import:csv -- data/bleach.csv --anilist-id 269 --dry-run

# Import
npm run import:csv -- data/bleach.csv --anilist-id 269 --alt "BLEACH" --source "Classifications from …"
```

| Option | Purpose |
| --- | --- |
| `--anilist-id <id>` | AniList Media ID. Needed unless the CSV has an `anilistId` column or the anime was imported before. If omitted, the script searches AniList by title and tells you which match it used; check it. |
| `--slug <slug>` | URL slug (`/anime/<slug>`). Defaults to the slugified title, e.g. `bleach`. |
| `--title <title>` | Override the display title. |
| `--alt <title>` | Alternative title used by search. Repeat for several. |
| `--source <text>` | Attribution shown under the episode guide. |
| `--replace` | Replace the existing dataset instead of merging into it. |
| `--dry-run` | Validate and report only. |
| `--strict` | Exit with an error if any row was rejected (useful in CI). |
| `--offline` | Never contact AniList to look up an ID. |
| `--report <path>` | Where to save the report. Default: `reports/import-<timestamp>.md` (git-ignored). |

`--anilist-id`, `--slug` and `--title` only apply to single-anime CSVs. For multi-anime files, add an `anilistId` column.

### What the importer does

1. **Parses** the CSV (quoted fields, escaped quotes, embedded newlines).
2. **Validates** every row and **rejects malformed records** with a line number and reason: missing title, non-numeric or zero episode numbers, unknown types, wrong column counts.
3. **Prevents duplicates**: a repeated episode number in the same file is rejected; when a dataset already exists, rows are **merged** by episode number (updated in place, never duplicated). An AniList ID already used by another dataset is refused.
4. **Converts** each anime to `src/data/anime/<slug>.json`.
5. **Rebuilds** the catalog `src/data/index.json`.
6. **Writes a report**: rows read and rejected, episodes added, updated or unchanged, type counts, filler percentage, and any missing episode numbers.

Example report (from `--dry-run` on `data/examples/example-import.csv`):

```markdown
## Bleach

- Slug: `bleach` → `src/data/anime/bleach.json`
- AniList ID: 269 (--anilist-id)
- Episodes in dataset: 4
- Added 4, updated 0, unchanged 0
- Canon 1, Mixed 0, Anime canon 0, Filler 3 (75% filler)
- ⚠ Missing episode numbers: 2-32, 34-63
```

Rejected rows are listed in a table with their line numbers:

```markdown
| Line | Reason |
| --- | --- |
| 41 | type "SIDE" is not one of CANON, FILLER, MIXED, ANIME_CANON |
```

The importer exits with code 1 if nothing could be imported (or, with `--strict`, if anything was rejected).

## 3. Check and ship

```bash
npm run data:validate   # schema, duplicates, catalog consistency
npm test                # includes dataset checks
npm run dev             # open /anime/<slug>
```

Commit the new `src/data/anime/<slug>.json` and the updated `src/data/index.json`. Deploying rebuilds the site; the new dataset becomes its own lazily loaded chunk automatically.

## Updating an existing anime

Import a CSV containing only the changed or new rows. Merge mode updates matching episode numbers and adds new ones; everything else is kept. Use `--replace` to start over from a complete file.

## Editing JSON by hand

You can edit dataset files directly. Afterwards run `npm run data:index` to refresh the catalog and `npm run data:validate` to check your work.

## Updating an airing show (One Piece)

When new episodes are classified, add rows for them (or re-export the full list) and import in merge mode. Existing episodes are kept and only new or changed rows are written:

```bash
npm run import:csv -- data/seed/one-piece.csv
```

The anime page compares the guide with AniList's aired-episode count and tells visitors when the newest episodes aren't classified yet, so a slightly stale guide is still clear about its coverage.

## Seed data

Every shipped dataset has its source CSV in `data/seed/` (one file per guide, each with an `anilistId` column), so any guide can be rebuilt or corrected and re-imported. The Naruto guides were generated with:

```bash
npm run import:csv -- data/seed/naruto.csv --slug naruto --alt NARUTO --alt ナルト --source "…"
npm run import:csv -- data/seed/naruto-shippuden.csv --slug naruto-shippuden \
  --alt "Naruto: Shippuuden" --alt "Naruto Shippuuden" --alt "Naruto Shippūden" --alt "NARUTO -ナルト- 疾風伝" --source "…"
```

`data/examples/example-import.csv` is a small sample for trying the importer with `--dry-run`.
