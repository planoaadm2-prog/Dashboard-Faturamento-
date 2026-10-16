const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const folder = process.cwd();
const source = fs.readFileSync(path.join(folder, 'pacote.txt'), 'utf8');
const match = source.match(/\$pacote\s*=\s*@'\r?\n([\s\S]*?)\r?\n'@/);

if (!match) {
  throw new Error('Salve o bloco completo da mensagem anterior no arquivo pacote.txt.');
}

const text = match[1].replace(/\s/g, '');

if (!/^[a-z]+$/.test(text) || text.length > 100000) {
  throw new Error('O pacote foi copiado incorretamente.');
}

let number = 0n;

for (let i = 0; i < text.length; i += 10) {
  const part = text.slice(i, i + 10);
  let digit = 0;
  for (const c of part) digit = digit * 26 + c.charCodeAt(0) - 97;
  number = number * (26n ** BigInt(part.length)) + BigInt(digit);
}

const data = Buffer.from(number.toString(16).padStart(53668, '0'), 'hex');
const hash = crypto.createHash('sha256').update(data).digest('hex');

if (hash !== 'f5a970c3ef7443850e7f71ccf1add42adadccc1740490a01de12058a439be5f2') {
  throw new Error('O texto esta incompleto ou alterado. Nenhum arquivo do aplicativo foi criado.');
}

const files = JSON.parse(zlib.brotliDecompressSync(data).toString('utf8'));

for (const name of Object.keys(files)) {
  if (path.basename(name) !== name) throw new Error('Nome de arquivo invalido.');
  if (fs.existsSync(path.join(folder, name))) {
    throw new Error('O arquivo ' + name + ' ja existe. Nao foi sobrescrito.');
  }
}

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(folder, name), content, {
    encoding: 'utf8',
    flag: 'wx'
  });
}

console.log('Arquivos do dashboard criados. Agora execute npm.cmd install.');
