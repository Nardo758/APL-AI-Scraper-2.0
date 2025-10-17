const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'server.js');
const src = fs.readFileSync(filePath, 'utf8');

let state = 'code';
const stack = [];
let line = 1;
let col = 0;

for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  const next = src[i + 1];

  if (ch === '\n') {
    line++;
    col = 0;
  } else {
    col++;
  }

  if (state === 'code') {
    if (ch === '"') { state = 'dq'; continue; }
    if (ch === '\'') { state = 'sq'; continue; }
    if (ch === '`') { state = 'bt'; continue; }
    if (ch === '/' && next === '*') { state = 'cmt'; i++; continue; }
    if (ch === '/' && next === '/') { state = 'linec'; i++; continue; }
    if (ch === '{') { stack.push({pos: i, line, col}); }
    if (ch === '}') { stack.pop(); }
  } else if (state === 'dq') {
    if (ch === '"' && src[i - 1] !== '\\') state = 'code';
  } else if (state === 'sq') {
    if (ch === '\'' && src[i - 1] !== '\\') state = 'code';
  } else if (state === 'bt') {
    if (ch === '`' && src[i - 1] !== '\\') state = 'code';
  } else if (state === 'cmt') {
    if (ch === '*' && next === '/') { state = 'code'; i++; }
  } else if (state === 'linec') {
    if (ch === '\n') state = 'code';
  }
}

if (stack.length === 0) {
  console.log('All braces balanced.');
  process.exit(0);
}

const last = stack[stack.length - 1];
console.log(`Unmatched '{' at index ${last.pos} (approx line ${last.line}, col ${last.col})`);

// print context lines
const lines = src.split('\n');
const start = Math.max(0, last.line - 6);
const end = Math.min(lines.length, last.line + 6);
console.log('--- context ---');
for (let i = start; i < end; i++) {
  const ln = i + 1;
  const marker = ln === last.line ? '>>' : '  ';
  console.log(`${marker} ${ln.toString().padStart(4)} | ${lines[i]}`);
}

process.exit(1);
