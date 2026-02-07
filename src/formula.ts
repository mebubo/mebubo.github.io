export type Expr =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "unary"; op: string; operand: Expr }
  | { type: "call"; name: string; args: Expr[] };

class Parser {
  private pos = 0;

  constructor(private input: string) {}

  parse(): Expr {
    const expr = this.parseAdditive();
    this.skipWs();
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected '${this.input[this.pos]}' at position ${this.pos}`);
    }
    return expr;
  }

  private skipWs() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    this.skipWs();
    while (this.pos < this.input.length && "+-".includes(this.input[this.pos])) {
      const op = this.input[this.pos++];
      left = { type: "binary", op, left, right: this.parseMultiplicative() };
      this.skipWs();
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parsePower();
    this.skipWs();
    while (this.pos < this.input.length && "*/".includes(this.input[this.pos])) {
      const op = this.input[this.pos++];
      left = { type: "binary", op, left, right: this.parsePower() };
      this.skipWs();
    }
    return left;
  }

  private parsePower(): Expr {
    const base = this.parseUnary();
    this.skipWs();
    if (this.pos + 1 < this.input.length && this.input[this.pos] === "*" && this.input[this.pos + 1] === "*") {
      this.pos += 2;
      return { type: "binary", op: "**", left: base, right: this.parsePower() };
    }
    return base;
  }

  private parseUnary(): Expr {
    this.skipWs();
    if (this.pos < this.input.length && this.input[this.pos] === "-") {
      this.pos++;
      return { type: "unary", op: "-", operand: this.parseUnary() };
    }
    return this.parseAtom();
  }

  private parseAtom(): Expr {
    this.skipWs();

    if (this.input[this.pos] === "(") {
      this.pos++;
      const expr = this.parseAdditive();
      this.skipWs();
      if (this.input[this.pos] !== ")") throw new Error("Expected ')'");
      this.pos++;
      return expr;
    }

    const numMatch = this.input.slice(this.pos).match(/^(\d+\.?\d*([eE][+-]?\d+)?)/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      return { type: "number", value: parseFloat(numMatch[0]) };
    }

    const idMatch = this.input.slice(this.pos).match(/^([a-zA-Z_]\w*)/);
    if (idMatch) {
      this.pos += idMatch[0].length;
      this.skipWs();
      if (this.pos < this.input.length && this.input[this.pos] === "(") {
        this.pos++;
        const args: Expr[] = [];
        this.skipWs();
        if (this.input[this.pos] !== ")") {
          args.push(this.parseAdditive());
          this.skipWs();
          while (this.input[this.pos] === ",") {
            this.pos++;
            args.push(this.parseAdditive());
            this.skipWs();
          }
        }
        if (this.input[this.pos] !== ")") throw new Error("Expected ')'");
        this.pos++;
        return { type: "call", name: idMatch[0], args };
      }
      return { type: "variable", name: idMatch[0] };
    }

    throw new Error(`Unexpected character at position ${this.pos}`);
  }
}

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
};

export function parse(input: string): Expr {
  return new Parser(input).parse();
}

export function evaluate(expr: Expr, vars: Record<string, number>): number {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "variable":
      if (expr.name in vars) return vars[expr.name];
      if (expr.name in CONSTANTS) return CONSTANTS[expr.name];
      throw new Error(`Unknown variable: ${expr.name}`);
    case "binary": {
      const l = evaluate(expr.left, vars);
      const r = evaluate(expr.right, vars);
      switch (expr.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "**": return l ** r;
        default: throw new Error(`Unknown operator: ${expr.op}`);
      }
    }
    case "unary":
      return -evaluate(expr.operand, vars);
    case "call": {
      const fn = FUNCTIONS[expr.name];
      if (!fn) throw new Error(`Unknown function: ${expr.name}`);
      return fn(...expr.args.map((a) => evaluate(a, vars)));
    }
  }
}

export function extractVariables(expr: Expr): string[] {
  const vars = new Set<string>();
  function walk(e: Expr) {
    switch (e.type) {
      case "variable":
        if (!(e.name in CONSTANTS)) vars.add(e.name);
        break;
      case "binary":
        walk(e.left);
        walk(e.right);
        break;
      case "unary":
        walk(e.operand);
        break;
      case "call":
        e.args.forEach(walk);
        break;
    }
  }
  walk(expr);
  return [...vars];
}
