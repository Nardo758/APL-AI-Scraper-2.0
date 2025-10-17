// tests/mocks/ioredis-mock.js
const EventEmitter = require('events');

class RedisMock extends EventEmitter {
  constructor() {
    super();
    this.connect = jest.fn().mockResolvedValue(this);
    this.quit = jest.fn().mockResolvedValue('OK');
    this.get = jest.fn().mockResolvedValue(null);
    this.set = jest.fn().mockResolvedValue('OK');
    this.setex = jest.fn().mockResolvedValue('OK');
    this.del = jest.fn().mockResolvedValue(1);
    this.llen = jest.fn().mockResolvedValue(0);
    this.keys = jest.fn().mockResolvedValue([]);
    this.ping = jest.fn().mockResolvedValue('PONG');
  }
}

module.exports = RedisMock;
