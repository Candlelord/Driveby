import { hash } from '../path.js';

/**
 * The other crews. All invented — names, teams and the way they drive.
 *
 * `skill` scales how long a rival takes over a stage relative to par: under 1
 * is quicker than a car cruising the whole way, over 1 is slower. A player who
 * holds the pedal and handles the slides beats most of them; one who ambles
 * finishes mid-field.
 */
export const RIVALS = [
  { name: 'Mara Okonkwo', team: 'Harmattan Works', skill: 0.93 },
  { name: 'Jules Verlaine', team: 'Rhône Racing', skill: 0.965 },
  { name: 'Tunde Bakare', team: 'Lagos Lions', skill: 0.995 },
  { name: 'Ines Duarte', team: 'Sahel Sprint', skill: 1.03 },
  { name: 'Kofi Mensah', team: 'Gold Coast GT', skill: 1.075 },
];

// Prize money by finishing position, and what a clean run adds.
const PRIZE = [900, 650, 480, 340, 230, 140];
const BASE = 150;
const CLEAN = 200;

/** Par for a stage: how long a steady car takes, given its length and surface. */
export function parTime(length, dirtShare, speedBase) {
  // Cruise, less the lifts for corners and the slower going on loose ground.
  const average = speedBase * 0.86 * (1 - dirtShare * 0.12);
  return length / average;
}

/** Where the rivals are on a stage: finishing times, in seconds. */
export function rivalTimes(par, stageIndex) {
  return RIVALS.map((rival, i) => par * rival.skill * (1 + (hash(stageIndex * 13 + i * 3.7) - 0.5) * 0.05));
}

/**
 * Work out a finished stage: the table, the player's position, the overall
 * standing and the prize.
 *
 * @param {number[]} rivals this stage's rival times
 * @param {number} player the player's time
 * @param {{player:number, rivals:number[]}} totals cumulative times before this stage
 */
export function settle(rivals, player, totals, { clean }) {
  const rows = [
    { name: 'You', team: 'Privateer', time: player, player: true },
    ...RIVALS.map((r, i) => ({ name: r.name, team: r.team, time: rivals[i] })),
  ].sort((a, b) => a.time - b.time);
  const best = rows[0].time;
  rows.forEach((row, i) => {
    row.position = i + 1;
    row.gap = row.time - best;
  });
  const position = rows.findIndex((r) => r.player) + 1;

  const overall = {
    player: totals.player + player,
    rivals: totals.rivals.map((t, i) => t + rivals[i]),
  };
  const overallRows = [
    { name: 'You', player: true, time: overall.player },
    ...RIVALS.map((r, i) => ({ name: r.name, time: overall.rivals[i] })),
  ].sort((a, b) => a.time - b.time);
  const overallPosition = overallRows.findIndex((r) => r.player) + 1;
  const overallGap = overall.player - overallRows[0].time;

  const prize = PRIZE[position - 1] + BASE + (clean ? CLEAN : 0);
  return { rows, position, prize, clean, overall, overallPosition, overallGap, best };
}

/** 1:23.45 */
export function formatTime(seconds, digits = 2) {
  const sign = seconds < 0 ? '-' : '';
  const t = Math.abs(seconds);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const fixed = s.toFixed(digits).padStart(digits + 3, '0');
  return `${sign}${m}:${fixed}`;
}

/** +1.84 / -0.62 */
export function formatDelta(seconds) {
  return `${seconds >= 0 ? '+' : '-'}${Math.abs(seconds).toFixed(2)}`;
}
