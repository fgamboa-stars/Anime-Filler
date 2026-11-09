import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  isContiguous,
  isNonSeriesListing,
  parseAflIndex,
  parseAflShow,
  parseStreamingTitles,
  pickTitle,
  searchTermsFor,
  seasonLabelFor,
  splitSeasons,
  titleMatchScore,
  toImporterCsv,
  verifySeasonTitles,
} from './afl.ts';
import { parseCsv } from './csv.ts';
import { validateRecords } from './importer.ts';

// Hand-written sample in the same shape as an AnimeFillerList show page.
const PAGE = `
<h1>Example Show Filler List</h1>
<table class="EpisodeList">
 <thead><tr><th>#</th><th>Title</th><th>Type</th><th class="Date">Airdate</th></tr></thead>
 <tbody>
 <tr class="filler even" id="eps-0"><td class="Number">0</td><td class="Title">Prologue special</td><td class="Type"><span>Filler</span></td><td class="Date"></td></tr>
 <tr class="manga_canon odd" id="eps-1"><td class="Number">1</td><td class="Title"><a href="/x">Hero&#039;s Start</a></td><td class="Type"><span>Manga Canon</span></td><td class="Date">2001-01-01</td></tr>
 <tr class="filler even" id="eps-2"><td class="Number">2</td><td class="Title"><a href="/y">Beach, Day &amp; Night</a></td><td class="Type"><span>Filler</span></td><td class="Date">2001-01-08</td></tr>
 <tr class="mixed_canon/filler odd" id="eps-3"><td class="Number">3</td><td class="Title"><a href="/z">Mixed</a></td><td class="Type"><span>Mixed Canon/Filler</span></td><td class="Date"></td></tr>
 <tr class="anime_canon even" id="eps-4"><td class="Number">4</td><td class="Title"></td><td class="Type"><span>Anime Canon</span></td><td class="Date"></td></tr>
 <tr class="filler odd" id="eps-5"><td class="Number">5.5</td><td class="Title">Recap</td><td class="Type"><span>Filler</span></td><td class="Date"></td></tr>
 </tbody>
</table>`;

describe('AnimeFillerList parsing', () => {
  it('reads the episode table', () => {
    const show = parseAflShow(PAGE);
    expect(show.title).toBe('Example Show');
    expect(show.episodes).toEqual([
      { number: 1, title: "Hero's Start", type: 'CANON' },
      { number: 2, title: 'Beach, Day & Night', type: 'FILLER' },
      { number: 3, title: 'Mixed', type: 'MIXED' },
      { number: 4, title: 'Episode 4', type: 'ANIME_CANON' },
    ]);
    expect(show.skipped).toEqual(['episode "5.5" is not a whole number']);
  });

  it('returns no episodes when there is no table', () => {
    expect(parseAflShow('<h1>Nothing Filler List</h1>').episodes).toEqual([]);
  });

  it('reads the show index without duplicates', () => {
    const html = '<a href="/shows/naruto">Naruto</a><a href="/shows/naruto">Naruto</a><a href="/shows/a-b">A &amp; B</a><a href="/shows/x/ep">no</a>';
    expect(parseAflIndex(html)).toEqual([
      { slug: 'naruto', name: 'Naruto' },
      { slug: 'a-b', name: 'A & B' },
    ]);
  });

  it('decodes entities', () => {
    expect(decodeEntities('&quot;Hi&quot; &#x27;there&#39; &amp;c &unknown;')).toBe(`"Hi" 'there' &c &unknown;`);
  });

  it('recognises films, OVAs and specials', () => {
    expect(isNonSeriesListing('Naruto Films')).toBe(true);
    expect(isNonSeriesListing('Bleach OVAs')).toBe(true);
    expect(isNonSeriesListing('Attack on Titan OADs')).toBe(true);
    expect(isNonSeriesListing('One Piece Specials')).toBe(true);
    expect(isNonSeriesListing('Food Wars!')).toBe(false);
  });

  it('builds search terms from bracketed alternative names', () => {
    expect(searchTermsFor('Assassination Classroom (Ansatsu Kyoushitsu)')).toEqual(['Assassination Classroom', 'Ansatsu Kyoushitsu']);
    expect(searchTermsFor('Toradora!')).toEqual(['Toradora!']);
    expect(searchTermsFor('Rurouni Kenshin (2023) (Rurouni Kenshin: Meiji Kenkaku Romantan (2023))')).toEqual([
      'Rurouni Kenshin (2023)',
      'Rurouni Kenshin: Meiji Kenkaku Romantan (2023)',
    ]);
  });
});

describe('season splitting', () => {
  const eps = [1, 2, 3, 4, 5].map((n) => ({ number: n, title: `E${n}`, type: 'CANON' as const }));

  it('renumbers each season from 1', () => {
    const parts = splitSeasons(eps, [2, 3]);
    expect(parts.map((p) => p.offset)).toEqual([0, 2]);
    expect(parts[1].episodes.map((e) => [e.number, e.title])).toEqual([
      [1, 'E3'],
      [2, 'E4'],
      [3, 'E5'],
    ]);
  });

  it('refuses counts that do not add up', () => {
    expect(() => splitSeasons(eps, [2, 2])).toThrow(/add up to 4/);
  });

  it('detects gaps', () => {
    expect(isContiguous(eps)).toBe(true);
    expect(isContiguous([eps[0], eps[2]])).toBe(false);
  });
});

describe('naming', () => {
  it('avoids all-caps English titles', () => {
    expect(pickTitle('VINLAND SAGA', 'Vinland Saga')).toBe('Vinland Saga');
    expect(pickTitle('Toradora!', 'Toradora!')).toBe('Toradora!');
    expect(pickTitle(null, 'Ansatsu Kyoushitsu')).toBe('Ansatsu Kyoushitsu');
    expect(pickTitle('86', null)).toBe('86');
  });

  it('labels seasons by what the title adds', () => {
    expect(seasonLabelFor('Assassination Classroom', ['Assassination Classroom'], 0)).toBe('Season 1');
    expect(seasonLabelFor('Assassination Classroom Second Season', ['Assassination Classroom'], 1)).toBe('Second Season');
    expect(seasonLabelFor('Blue Exorcist: Kyoto Saga', ['Blue Exorcist'], 1)).toBe('Kyoto Saga');
    expect(seasonLabelFor('Something Else', ['Blue Exorcist'], 2)).toBe('Season 3');
    expect(seasonLabelFor('Full Metal Panic? Fumoffu', ['Full Metal Panic!'], 1)).toBe('Fumoffu');
  });
});

describe('CSV output', () => {
  it('round-trips through the importer', () => {
    const csv = toImporterCsv('Example, "The" Show', 42, [
      { number: 1, title: 'Beach, Day & Night', type: 'FILLER' },
      { number: 2, title: 'Say "hi"', type: 'CANON' },
    ]);
    const parsed = parseCsv(csv);
    const result = validateRecords(parsed.headers, parsed.records);
    expect(result.rejected).toEqual([]);
    expect(result.valid.map((r) => [r.animeTitle, r.number, r.title, r.type, r.arc, r.anilistId])).toEqual([
      ['Example, "The" Show', 1, 'Beach, Day & Night', 'FILLER', 'Standalone Episodes', 42],
      ['Example, "The" Show', 2, 'Say "hi"', 'CANON', 'Standalone Episodes', 42],
    ]);
  });
});

describe('titleMatchScore', () => {
  it('accepts the same show under English, romaji or a romanization variant', () => {
    expect(titleMatchScore('Assassination Classroom (Ansatsu Kyoushitsu)', ['Ansatsu Kyoushitsu'])).toBe(1);
    expect(titleMatchScore('Buso Renkin', ['Arms Alchemy', 'Busou Renkin'])).toBe(1);
    expect(titleMatchScore('Beyblade Metal Fusion', ['Beyblade: Metal Fusion'])).toBe(1);
  });

  it('rejects a different show whose episode total happens to match', () => {
    expect(titleMatchScore('Fate/stay night [Unlimited Blade Works]', ['Fate/Zero Season 2', 'Fate/Zero 2nd Season'])).toBeLessThan(0.5);
    expect(titleMatchScore('Tsukimonogatari', ['Nekomonogatari Black', 'Nekomonogatari (Kuro)'])).toBe(0);
  });
});

describe('season split check', () => {
  const guide = ['Arrival', 'The Storm', 'Night Market', 'Farewell'].map((title, i) => ({ number: i + 1, title }));

  it('reads streaming titles and renumbers continuously numbered later seasons', () => {
    expect([...parseStreamingTitles(['Episode 26 - Arrival', 'Episode 27 - The Storm'])]).toEqual([
      [1, 'Arrival'],
      [2, 'The Storm'],
    ]);
    // A prologue listed as "Episode 0" keeps its number.
    expect(parseStreamingTitles(['Episode 0 - Omen', 'Episode 1 - Arrival']).get(1)).toBe('Arrival');
  });

  it('accepts lined-up titles and reports a split that is one episode off', () => {
    const same = parseStreamingTitles(guide.map((e) => `Episode ${e.number} - ${e.title}`));
    expect(verifySeasonTitles(guide, same).status).toBe('ok');
    const shifted = parseStreamingTitles(['Recap', ...guide.map((e) => e.title)].map((t, i) => `Episode ${i + 1} - ${t}`));
    expect(verifySeasonTitles(guide, shifted)).toMatchObject({ status: 'shifted', shift: 1 });
    expect(verifySeasonTitles(guide, new Map()).status).toBe('no-data');
  });
});
