import { describe, expect, it } from 'vitest';
import fixtures from '../../fixtures.json';
import { analyseBirds, birdNote, birdsApply, ebirdUrl, temporaryBirds, type Report } from './birds';
import { HOME_DEFAULT } from './config';
import type { DayScore } from './scoring';
import { SEED_SPOTS } from './spots';
import { rankSpots, TEMP_TYPE } from './where';

const reports = fixtures['ebird_notable_dist50_back7_fetched_2026-11-14'] as Report[];
const spots = SEED_SPOTS.map((s, i) => ({ ...s, id: i + 1 }));
const where = { lat: HOME_DEFAULT.lat, lng: HOME_DEFAULT.lng, spots };
// The fixture was fetched on Nov 14 (late evening).
const groups = analyseBirds(reports, '2026-11-14T23:30', where);
const find = (name: string, loc: string) => groups.find((g) => g.comName === name && g.locName.startsWith(loc));
const day: DayScore = { date: '2026-11-15', shift: false, morning: 70, evening: 80, confidence: 'sharp' };

describe('unusual birds filter (fixtures.json)', () => {
  it('asks eBird for notable reports, 50 km, 7 days', () => {
    const u = new URL(ebirdUrl(29.5633, -95.2861));
    expect(u.pathname).toBe('/v2/data/obs/geo/recent/notable');
    expect(Object.fromEntries(u.searchParams)).toEqual({ lat: '29.5633', lng: '-95.2861', dist: '50', back: '7' });
  });
  it('drops private locations, hybrids and stale groups', () => {
    expect(groups.some((g) => g.locName.includes('Oceania'))).toBe(false); // private
    expect(groups.some((g) => g.comName.includes('hybrid'))).toBe(false);
    expect(find('Baltimore Oriole', 'Cullinan')).toBeUndefined(); // latest Nov 9, too old
    expect(find('Black-headed Grosbeak', 'Keegan')).toBeUndefined(); // Nov 10 06:35, over 4 days
    expect(groups.every((g) => !g.locName.includes('Glenbrook'))).toBe(true); // private
  });
  it('labels by days reported, without waiting for review', () => {
    expect(find("Allen's Hummingbird", 'Riverpark')).toMatchObject({ label: 'Lingering', days: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'] });
    expect(find('Dickcissel', 'Archbishop')?.label).toBe('Returning');
    expect(find('Great Kiskadee', '57-Acre')?.label).toBe('Confirmed');
    expect(find("Yellow-rumped Warbler (Audubon's)", 'F.M. Law')).toMatchObject({ label: 'Returning', form: true });
    expect(find('Wood Stork', 'Brazos Bend')).toMatchObject({ label: 'Watch', qualifies: false });
  });
  it('places Wood Stork at my Brazos Bend spot; the rest are elsewhere', () => {
    const bb = spots.find((s) => s.name === 'Brazos Bend State Park')!;
    expect(find('Wood Stork', 'Brazos Bend')).toMatchObject({ spotId: bb.id, driveMin: 40, driveEstimated: false });
    expect(find("Allen's Hummingbird", 'Riverpark')).toMatchObject({ spotId: undefined, driveEstimated: true, driveMin: 35 });
  });
  it('temporary spots on Nov 15 to 18: Allen\'s Hummingbird and Dickcissel', () => {
    // The fixture shortens eBird's location names, so match on the start of the name.
    const t = temporaryBirds(groups);
    expect(t).toHaveLength(fixtures.expected.temporarySpots_onNov15to18.length);
    fixtures.expected.temporarySpots_onNov15to18.forEach((want, i) => {
      const [loc, rest] = want.split(' - ');
      expect(t[i].locName.startsWith(loc)).toBe(true);
      expect(`${t[i].comName} (${t[i].days.length} days)`).toBe(rest);
    });
  });
  it('Great Kiskadee and Audubon\'s qualify but do not make the top two', () => {
    const q = groups.filter((g) => g.qualifies && g.spotId == null).map((g) => g.comName);
    expect(q).toEqual(expect.arrayContaining(['Great Kiskadee', "Yellow-rumped Warbler (Audubon's)"]));
    expect(temporaryBirds(groups).map((g) => g.comName)).not.toContain('Great Kiskadee');
  });
  it('watch only: Wood Stork tags Brazos Bend and moves nothing', () => {
    const list = rankSpots(spots, day, '2026-11-15T17:25', {}, 45, { birds: groups });
    const bb = list.find((r) => r.spot.name === 'Brazos Bend State Park')!;
    expect(bb.watch?.comName).toBe('Wood Stork');
    expect(bb.bird).toBeUndefined();
    const watchAtMySpots = list.filter((r) => r.watch).map((r) => `${r.watch!.comName} at ${r.watch!.locName}`);
    expect(watchAtMySpots.map((w) => w.split(' at ')[0])).toEqual(fixtures.expected.watchOnly.map((w) => w.split(' at ')[0]));
  });
  it('spot list on a bird day: two temporary entries on top, then my spots nearest first', () => {
    const list = rankSpots(spots, day, '2026-11-15T17:25', {}, 30, { birds: groups });
    expect(list).toHaveLength(10);
    expect(list.slice(0, 2).map((r) => [r.spot.name, r.spot.type, r.temp, r.inRange])).toEqual([
      ['Riverpark Nature Trails (Sugar Land)', TEMP_TYPE, true, false], // ~35 min, beyond 30: keeps its slot, faded
      ['Archbishop Fiorenza Park--W.of Eldridge Pkwy (Eldridge Retention Basin)', TEMP_TYPE, true, false],
    ]);
    expect(list[2].spot.name).toBe('Delores Fenwick Nature Center');
  });
  it('a qualifying bird at my spot moves it to the top, after temporary entries', () => {
    const fake: Report = { ...reports[0], comName: 'Vermilion Flycatcher', speciesCode: 'verfly', locId: 'Lx', locName: 'San Luis Pass',
      lat: 29.0796, lng: -95.1311, obsDt: '2026-11-14 08:00', locationPrivate: false, obsReviewed: true, obsValid: true };
    const g = analyseBirds([...reports, fake], '2026-11-14T23:30', where);
    const list = rankSpots(spots, day, '2026-11-15T17:25', {}, 45, { birds: g });
    expect(list[2]).toMatchObject({ spot: { name: 'San Luis Pass' }, bird: { comName: 'Vermilion Flycatcher', label: 'Confirmed' } });
  });
  it('birds change the list only on the next four days', () => {
    expect([0, 1, 2, 3, 4, 8].map(birdsApply)).toEqual([true, true, true, true, false, false]);
    expect(rankSpots(spots, day, '2026-11-15T17:25', {}, 45)).toHaveLength(8);
  });
  it('writes a plain note', () => {
    expect(birdNote(find("Allen's Hummingbird", 'Riverpark')!)).toBe('Reported on 4 days, Nov 10 to 13. Not yet reviewed.');
    expect(birdNote(find('Great Kiskadee', '57-Acre')!)).toBe('Reported on Nov 12. Reviewer confirmed.');
  });
});
