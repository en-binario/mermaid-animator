import { describe, expect, it } from 'vitest';
import { compileDiagram, stepEnd } from '@mermaid-animator/core';
import { Player, type PlayerOptions } from '../src/player';

const options: PlayerOptions = { speed: 1, loop: false, onEnd: 'stop', reverse: 'animate', snap: true };

function setup(body = 'A->>B: one\nB->>C: two\nC->>A: three', o: Partial<PlayerOptions> = {}) {
  const d = compileDiagram(`sequenceDiagram\n${body}`);
  const timeline = d.sequence!.timeline;
  return { player: new Player(timeline, { ...options, ...o }), timeline };
}

/** Advances in 16 ms frames until idle (or a limit). */
function run(player: Player, maxMs = 60_000): number {
  let elapsed = 0;
  while (player.isActive && elapsed < maxMs) {
    player.tick(16);
    elapsed += 16;
  }
  return elapsed;
}

describe('stepping', () => {
  it('plays exactly one transition forward and rests', () => {
    const { player, timeline } = setup();
    player.next();
    expect(player.snapshot()).toMatchObject({ displayStep: 1, animating: true, playing: false });
    const took = run(player);
    expect(player.time).toBe(stepEnd(timeline, 0));
    expect(took).toBeGreaterThanOrEqual(timeline.transitions[0]! - 16);
    player.next();
    run(player);
    expect(player.snapshot().displayStep).toBe(2);
    expect(player.time).toBe(stepEnd(timeline, 1));
  });

  it('steps back by animating the transition in reverse at double speed', () => {
    const { player, timeline } = setup();
    player.goTo(2);
    player.previous();
    const took = run(player);
    expect(player.time).toBe(stepEnd(timeline, 0));
    expect(player.snapshot().displayStep).toBe(1);
    expect(took).toBeLessThan(timeline.transitions[1]!);
  });

  it('cuts back immediately when reverse is "cut"', () => {
    const { player, timeline } = setup(undefined, { reverse: 'cut' });
    player.goTo(2);
    player.previous();
    expect(player.isActive).toBe(false);
    expect(player.time).toBe(stepEnd(timeline, 0));
  });

  it('goes to the first, last and numbered steps', () => {
    const { player, timeline } = setup();
    player.last();
    expect(player.time).toBe(timeline.duration);
    expect(player.snapshot().displayStep).toBe(3);
    player.first();
    expect(player.snapshot().displayStep).toBe(0);
    player.goTo(2);
    expect(player.time).toBe(stepEnd(timeline, 1));
    player.goTo(99);
    expect(player.snapshot().displayStep).toBe(3);
  });
});

describe('autoplay', () => {
  it('plays to the end and stops showing the complete diagram', () => {
    const { player, timeline } = setup();
    player.play();
    run(player);
    expect(player.time).toBe(timeline.duration);
    expect(player.isPlaying).toBe(false);
  });

  it('loops when loop is on', () => {
    const { player, timeline } = setup(undefined, { loop: true });
    player.play();
    player.tick(timeline.duration - 1);
    player.tick(10);
    expect(player.isPlaying).toBe(true);
    expect(player.time).toBe(0);
  });

  it('respects speed', () => {
    const { player } = setup(undefined, { speed: 2 });
    player.play();
    player.tick(100);
    expect(player.time).toBe(200);
  });

  it('restarts from the beginning when played at the end', () => {
    const { player } = setup();
    player.last();
    player.play();
    expect(player.time).toBe(0);
  });

  it('stops at a @pause hold', () => {
    const { player, timeline } = setup('%% @pause\nA->>B: wait here\nB->>A: next');
    player.play();
    run(player);
    expect(player.time).toBe(stepEnd(timeline, 0));
    expect(player.isPlaying).toBe(false);
  });

  it('pauses while held (hidden panel, hover) and resumes afterwards', () => {
    const { player } = setup();
    player.play();
    player.hold('hidden', true);
    expect(player.tick(100)).toBe(false);
    expect(player.time).toBe(0);
    player.hold('hidden', false);
    player.tick(100);
    expect(player.time).toBe(100);
  });
});

describe('scrubbing', () => {
  it('seeks continuously and snaps to the nearest boundary on release', () => {
    const { player, timeline } = setup();
    player.beginScrub();
    player.scrub(timeline.starts[1]! + 50);
    expect(player.time).toBe(timeline.starts[1]! + 50);
    player.endScrub();
    const ends = [0, ...timeline.starts.map((_, i) => stepEnd(timeline, i))];
    expect(ends).toContain(player.time);
  });

  it('does not snap when snapping is off', () => {
    const { player, timeline } = setup(undefined, { snap: false });
    player.beginScrub();
    player.scrub(timeline.starts[1]! + 50);
    player.endScrub();
    expect(player.time).toBe(timeline.starts[1]! + 50);
  });
});

describe('live reload', () => {
  it('rests at the given step of a new timeline', () => {
    const { player } = setup();
    const other = compileDiagram('sequenceDiagram\nA->>B: x\nB->>A: y').sequence!.timeline;
    player.setTimeline(other, 1);
    expect(player.time).toBe(stepEnd(other, 1));
    player.setTimeline(other, -1);
    expect(player.time).toBe(0);
  });
});

describe('camera hold', () => {
  it('freezes both autoplay and stepping until released', () => {
    const { player } = setup();
    player.next();
    player.hold('camera', true);
    expect(player.isActive).toBe(false);
    expect(player.tick(100)).toBe(false);
    expect(player.time).toBe(0);
    player.hold('camera', false);
    expect(player.tick(100)).toBe(true);
    expect(player.time).toBe(100);
  });
});

describe('A-B loop', () => {
  it('repeats the range during autoplay and can be cleared', () => {
    const { player, timeline } = setup('A->>B: 1\nB->>A: 2\nA->>B: 3\nB->>A: 4');
    player.goTo(1);
    player.markRange('from');
    player.goTo(3);
    player.markRange('to');
    expect(player.snapshot().range).toEqual({ from: 0, to: 2 });
    player.goTo(1);
    player.play();
    let wrapped = false;
    for (let i = 0; i < 400 && !wrapped; i++) {
      const before = player.time;
      player.tick(16);
      if (player.time < before) wrapped = true;
    }
    expect(wrapped).toBe(true);
    expect(player.time).toBe(stepEnd(timeline, 0));
    player.clearRange();
    expect(player.snapshot().range).toBeUndefined();
  });

  it('orders the bounds when set backwards', () => {
    const { player } = setup('A->>B: 1\nB->>A: 2\nA->>B: 3');
    player.goTo(3);
    player.markRange('from');
    player.goTo(1);
    player.markRange('to');
    expect(player.snapshot().range).toEqual({ from: 0, to: 2 });
  });
});

describe('focused playback skip set', () => {
  it('steps over skipped steps in both directions', () => {
    const { player, timeline } = setup('A->>B: 1\nB->>C: 2\nC->>D: 3\nA->>B: 4');
    player.setSkip(new Set([1, 2]));
    player.next();
    run(player);
    expect(player.time).toBe(stepEnd(timeline, 0));
    player.next();
    run(player);
    expect(player.time).toBe(stepEnd(timeline, 3));
    player.previous();
    run(player);
    expect(player.time).toBe(stepEnd(timeline, 0));
  });

  it('jumps over skipped steps during autoplay', () => {
    const { player, timeline } = setup('A->>B: 1\nB->>C: 2\nC->>D: 3\nA->>B: 4');
    player.setSkip(new Set([1, 2]));
    player.goTo(1);
    player.play();
    const visited = new Set<number>();
    for (let i = 0; i < 2000 && player.isPlaying; i++) {
      player.tick(16);
      const t = player.time;
      timeline.starts.forEach((start, k) => {
        if (t > start && t < stepEnd(timeline, k)) visited.add(k);
      });
    }
    expect(visited.has(1)).toBe(false);
    expect(visited.has(2)).toBe(false);
    expect(visited.has(3)).toBe(true);
  });
});

describe('gate', () => {
  it('waits at rest before a gated step, even at the beginning', () => {
    const { player } = setup('A->>B: 1\nB->>A: 2');
    player.setGate((k) => k === 0);
    player.play();
    expect(player.isPlaying).toBe(false);
    player.next();
    expect(player.time).toBe(0);
    player.setGate(undefined);
    player.play();
    expect(player.isPlaying).toBe(true);
  });
});

describe('initial overview', () => {
  function overviewSetup(o: Partial<PlayerOptions> = {}) {
    const d = compileDiagram('sequenceDiagram\nA->>B: one\nB->>C: two', { overview: true, dwellMs: 900 });
    const timeline = d.sequence!.timeline;
    return { player: new Player(timeline, { ...options, ...o }), timeline };
  }

  it('skips the overview dwell on Next and plays the clear before resting on step 1', () => {
    const { player, timeline } = overviewSetup();
    player.next();
    expect(player.time).toBe(timeline.starts[0]);
    expect(player.snapshot().displayStep).toBe(1);
    const took = run(player);
    expect(player.time).toBe(stepEnd(timeline, 0));
    // The clear is part of step 1's transition.
    expect(took).toBeGreaterThanOrEqual(timeline.transitions[0]! - 16);
    expect(timeline.transitions[0]).toBeGreaterThan(timeline.clear!);
  });

  it('returns to the overview on Previous from step 1', () => {
    const { player } = overviewSetup();
    player.goTo(1);
    player.previous();
    run(player);
    expect(player.time).toBe(0);
    expect(player.snapshot().displayStep).toBe(0);
  });

  it('rests on the overview for the dwell when autoplay starts', () => {
    const { player, timeline } = overviewSetup();
    player.play();
    player.tick(timeline.starts[0]! - 10);
    expect(player.snapshot().displayStep).toBe(0);
    player.tick(20);
    expect(player.snapshot().displayStep).toBe(1);
  });
});

describe('pausing from a user camera move', () => {
  it('stays paused when the hover hold ends', () => {
    const { player } = setup();
    player.play();
    player.hold('hover', true);
    // A pan or zoom during playback pauses it (spec playback: automatic pausing).
    player.pause();
    player.hold('hover', false);
    expect(player.isPlaying).toBe(false);
    expect(player.isActive).toBe(false);
  });
});
