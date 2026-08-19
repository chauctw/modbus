const TokenType = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  EOF: 'EOF',
};

const RE = {
  [TokenType.NUMBER]: /^-?\d+(?:\.\d+)?/,
  [TokenType.IDENT]: /^[A-Za-z_][A-Za-z0-9_\.]*/,
  [TokenType.OP]: /^[+\-*/]/,
  [TokenType.LPAREN]: /^\(/,
  [TokenType.RPAREN]: /^\)/,
  [TokenType.COMMA]: /^,/,
};

function tokenize(expr) {
  const tokens = [];
  let s = String(expr).trim();
  while (s.length > 0) {
    let matched = false;
    for (const type of [TokenType.NUMBER, TokenType.IDENT, TokenType.OP, TokenType.LPAREN, TokenType.RPAREN, TokenType.COMMA]) {
      const m = s.match(RE[type]);
      if (m) {
        tokens.push({ type, value: m[0] });
        s = s.slice(m[0].length).trim();
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`Ký tự không hợp lệ trong biểu thức: "${s[0]}"`);
    }
  }
  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };

function parse(tokens) {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume(type) {
    const t = tokens[pos];
    if (type && t.type !== type) throw new Error(`Kỳ vọng ${type}, nhận ${t.type} ("${t.value}")`);
    pos++;
    return t;
  }

  function parseExpression(minPrec = 0) {
    let left = parsePrimary();
    while (peek().type === TokenType.OP && PRECEDENCE[peek().value] >= minPrec) {
      const op = consume(TokenType.OP).value;
      const next = parseExpression(PRECEDENCE[op] + 1);
      left = { kind: 'binop', op, left, right: next };
    }
    return left;
  }

  function parsePrimary() {
    const t = peek();
    if (t.type === TokenType.NUMBER) {
      consume(TokenType.NUMBER);
      return { kind: 'number', value: Number(t.value) };
    }
    if (t.type === TokenType.IDENT) {
      consume(TokenType.IDENT);
      if (peek().type === TokenType.LPAREN) {
        consume(TokenType.LPAREN);
        const args = [];
        if (peek().type !== TokenType.RPAREN) {
          args.push(parseExpression(1));
          while (peek().type === TokenType.COMMA) {
            consume(TokenType.COMMA);
            args.push(parseExpression(1));
          }
        }
        consume(TokenType.RPAREN);
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'ref', name: t.value };
    }
    if (t.type === TokenType.LPAREN) {
      consume(TokenType.LPAREN);
      const inner = parseExpression(1);
      consume(TokenType.RPAREN);
      return inner;
    }
    throw new Error(`Kỳ vọng giá trị, nhận ${t.type} ("${t.value}")`);
  }

  const ast = parseExpression(0);
  if (peek().type !== TokenType.EOF) throw new Error(`Biểu thức dư thừa tại "${peek().value}"`);
  return ast;
}

function evaluate(ast, getValue) {
  if (ast.kind === 'number') return ast.value;
  if (ast.kind === 'ref') {
    const v = getValue(ast.name);
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    return Number(v);
  }
  if (ast.kind === 'call') {
    const fn = ast.name.toLowerCase();
    const args = ast.args.map((a) => evaluate(a, getValue));
    if (args.some((a) => a === null || Number.isNaN(a))) return null;
    switch (fn) {
      case 'abs':
        return Math.abs(args[0]);
      case 'round': {
        const p = args[1] ?? 0;
        const f = Math.pow(10, p);
        return Math.round(args[0] * f) / f;
      }
      case 'min':
        return Math.min(...args);
      case 'max':
        return Math.max(...args);
      default:
        throw new Error(`Hàm không hỗ trợ: ${fn}()`);
    }
  }
  if (ast.kind === 'binop') {
    const l = evaluate(ast.left, getValue);
    const r = evaluate(ast.right, getValue);
    if (l === null || r === null || Number.isNaN(l) || Number.isNaN(r)) return null;
    switch (ast.op) {
      case '+':
        return l + r;
      case '-':
        return l - r;
      case '*':
        return l * r;
      case '/':
        if (r === 0) return null;
        return l / r;
      default:
        throw new Error(`Toán tử không hỗ trợ: ${ast.op}`);
    }
  }
  throw new Error('Biểu thức không hợp lệ');
}

function compile(expr) {
  const tokens = tokenize(expr);
  const ast = parse(tokens);
  return (getValue) => evaluate(ast, getValue);
}

module.exports = { compile };
