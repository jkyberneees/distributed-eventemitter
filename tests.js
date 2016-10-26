/*
 Copyright (C) 2016 Rolando Santamaria Maso (@kyberneees)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
const expect = require("chai").expect;
const DistributedEventEmitter = require("./main.js");

// connection opened flag
var connected = false,
    disconnected = false;

// instantiating event emitters
const outgoing = new DistributedEventEmitter();
const incoming = new DistributedEventEmitter();

incoming.on('connected', () => {
    connected = true;
});
incoming.on('disconnected', () => {
    disconnected = true;
});
incoming.on('error', (error) => {
    console.log(error);
});

outgoing.connect();

// message to be sent/published
var messageout = {
    data: 'hello!'
};
// received message
var messagein;

describe('Basic', () => {
    describe('connect', () => {
        it('connecting', (done) => {
            incoming.connect();
            setTimeout(() => {
                expect(connected).to.equal(true);
                done();
            }, 100);
        });
    });

    describe('getId', () => {
        it('getId', () => {
            expect(typeof incoming.getId()).to.equal('string');
        });
    });

    describe('subscribing', () => {
        it('event: news.*', () => {
            var callback = (data) => {
                // should be called only if message is published
                // then, intentionally we set null in 'data' property
                messagein = {
                    data: null
                };
            };

            incoming.on('news.*', callback);
            incoming.on('news.*', (data) => {
                messagein = data;
            });
            incoming.removeListener('news.*', callback);

            incoming.on('news.*', callback);
        });
    });

    describe('emitToOne (distributed)', () => {
        it("emit to 'news.public' > {data: 'hello!'}", (done) => {
            outgoing.emitToOne('news.public', messageout);

            setTimeout(() => {
                expect(messageout.data).to.equal(messagein.data);
                done();
            }, 250);
        });
    });

    describe('emit', () => {
        it("emit to 'news.private' > {data: 'hello!'}", (done) => {
            outgoing.emit('news.private', messageout);

            setTimeout(() => {
                expect(null).to.equal(messagein.data);
                done();
            }, 100);
        });
    });

    describe('disconnect', () => {
        it("disconnecting incoming instance", (done) => {
            incoming.disconnect();

            setTimeout(() => {
                expect(disconnected).to.equal(true);
                done();
            }, 100);
        });
    });
});

describe('Promise', () => {
    describe('connect', () => {
        it('connecting incoming instance', (done) => {
            incoming.connect().then(() => {
                done();
            });
        });
    });

    describe('subscribing', () => {
        it('event: my.action', (done) => {
            incoming.on('request', (event, request) => {
                if ('my.action' === event) {
                    if ('string' === typeof request.data) {
                        request.data = request.data.toUpperCase();
                    }
                }
            });
            incoming.on('response', (event, response) => {
                if ('my.action' === event && response.ok) {
                    response.data = response.data.toUpperCase();
                }
            });
            incoming.on('my.action', (data, resolve, reject) => {
                if (typeof (data) === 'string' && 'HI THERE...' === data) {
                    resolve('hello');
                } else {
                    reject('invalid type');
                }
            });
            incoming.on('my.action2', (data, resolve, reject) => {
                resolve();
            });
            done();
        });
    });

    describe('emitToOne (distributed)', () => {
        it("emitting to 'my.action' > 'Hi there...'", (done) => {
            outgoing.emitToOne('my.action', 'Hi there...').then((response) => {
                expect('HELLO').to.equal(response);
                done();
            });
        });
    });

    describe('emitToOne (local)', () => {
        it("emitting to 'my.action.local' > 'Hi there...'", (done) => {
            outgoing.on('my.action.local', (data, resolve) => {
                if (typeof (data) === 'string')
                    resolve('hello');
                else
                    reject('invalid type');
            });

            outgoing.emitToOne('my.action.local', 'Hi there...', 100).then((response) => {
                expect('hello').to.equal(response);
                done();
            });
        });
    });

    describe('emitToOne (distributed) expecting rejection', () => {
        it("emitting to 'my.action' > 'Hi there...'", (done) => {
            outgoing.emitToOne('my.action', 5, 200).catch((error) => {
                expect('invalid type').to.equal(error);
                done();
            });
        });
    });

    describe('emitToOne (distributed) expecting null response', () => {
        it("emitting to 'my.action2' > 'Hi there...'", (done) => {
            outgoing.emitToOne('my.action2', 'Hi there...', 200).then((response) => {
                done();
            });
        });
    });

    describe('emitToOne (local) expecting null response', () => {
        it("emitting to 'my.action2.local' > 'Hi there...'", (done) => {
            outgoing.on('my.action2.local', (message, resolve) => {
                resolve();
            });
            outgoing.emitToOne('my.action2.local', 'Hi there...').then((response) => {
                done();
            });
        });
    });

    describe('emitToOne expecting timeout', () => {
        it("emitting to 'my.timeout' > 'Hi there...'", (done) => {
            outgoing.emitToOne('my.timeout', 'Hi there...', 25).catch((error) => {
                expect('timeout').to.equal(error);
                done();
            });
        });
    });

    describe('once', () => {
        it("testing 'once' listeners registration", (done) => {
            incoming.once('onetimelistener', (data, resolve) => {
                resolve();
            });
            outgoing.emitToOne('onetimelistener', 'hello').then((error) => {
                return outgoing.emitToOne('onetimelistener', 'hello again', 100);
            }).catch((error) => {
                expect('timeout').to.equal(error);
                done();
            });
        });
    });

    describe('emit', () => {
        it("emit to 'news.private' > {data: 'hello!'}", (done) => {
            outgoing.emit('news.private', messageout).then((response) => {
                done();
            });
        });
    });

    describe('disconnect', () => {
        it('disconnecting', (done) => {
            incoming.disconnect().then(() => {
                return outgoing.disconnect();
            }).then(() => {
                done();
            });
        });
    });
});