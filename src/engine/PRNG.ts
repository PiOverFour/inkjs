// Taken from https://github.com/bryc/code/blob/master/jshash/PRNGs.md
// Ink uses a seedable PRNG of which there is none in native javascript.
export class PRNG {
  public seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  public next(): number {
    let a = this.seed;
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this.seed = a;
    return (t ^ (t >>> 14)) >>> 0;
  }
  public nextFloat(): number {
    return this.next() / 4294967296;
  }
}
