// Taken from https://github.com/bryc/code/blob/master/jshash/PRNGs.md
// Ink uses a seedable PRNG of which there is none in native javascript.
export class PRNG{

	private a: number;
	private b: number;

	constructor(seed: number){
		this.a = seed;
		this.b = seed;
		let r = Math.imul(this.a, 0x9E3779BB); r = (r << 5 | r >>> 27) * 5;
		this.b = this.b ^ this.a; this.a = this.b ^ (this.a << 26 | this.a >>> 6) ^ this.b << 9;
		this.b = this.b << 13 | this.b >>> 19;
}

	public next(): number{
		let r = Math.imul(this.a, 0x9E3779BB); r = (r << 5 | r >>> 27) * 5;
		this.b = this.b ^ this.a; this.a = this.b ^ (this.a << 26 | this.a >>> 6) ^ this.b << 9;
		this.b = this.b << 13 | this.b >>> 19;
		return (r >>> 0) ;
	}
	public nextFloat(): number{
		return this.next() / 4294967296;
	}
}
