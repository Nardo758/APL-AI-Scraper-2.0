const fs = require('fs');
const path = require('path');

class InMemoryCredentials {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async set(key, value) {
    this.store.set(key, value);
  }

  async delete(key) {
    this.store.delete(key);
  }
}

class FileBackedCredentials {
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), 'tmp-creds.json');
    this._ensureFile();
    this.cache = this._readFile();
  }

  _ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, JSON.stringify({}), 'utf8');
  }

  _readFile() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || {};
    } catch (e) {
      return {};
    }
  }

  _writeFile() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8');
  }

  async get(key) {
    this.cache = this._readFile();
    return this.cache[key] ?? null;
  }

  async set(key, value) {
    this.cache = this._readFile();
    this.cache[key] = value;
    this._writeFile();
  }

  async delete(key) {
    this.cache = this._readFile();
    delete this.cache[key];
    this._writeFile();
  }
}

module.exports = {
  InMemoryCredentials,
  FileBackedCredentials,
};
