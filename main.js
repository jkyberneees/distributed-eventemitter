/*
 Copyright (C) 2016 Rolando Santamaria Maso <kyberneees@gmail.com>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specifi8c language governing permissions and
 limitations under the License.0
 */
/*jshint esversion: 6*/

const Stomp = require('stompit');
const UUID = require('uuid');
const EventEmitter = require('eventemitter2').EventEmitter2;

class DistributedEventEmitter extends EventEmitter {
    constructor(config) {
        super({
            wildcard: true,
            newListener: true
        });

        var self = this;
        self.id = UUID.v4();
        this.subscriptions = {};

        config = config || {};
        this.config = config;
        config.servers = config.servers || [{
            'host': 'localhost',
            'port': 61613,
            'connectHeaders': {
                'heart-beat': '5000,5000',
                'host': '',
                'login': '',
                'passcode': ''
            }
        }];
        config.reconnectOpts = config.reconnectOpts || {
            maxReconnects: 10
        };
        config.destination = config.destination || 'distributed-eventemitter';
        config.excludedEvents = config.excludedEvents || [];
        config.excludedEvents.push(...['newListener', 'removeListener', 'connected', 'error', 'connecting', 'disconnected', 'request', 'response']);

        const callback1 = (event, isQueue, raw) => {
            raw.readString('utf8', (error, jsonstr) => {
                var data = JSON.parse(jsonstr).d;

                if (!isQueue) {
                    var args = [event];
                    args.push(...data);
                    args.push(raw);
                    self.emit.apply(self, args);
                } else {
                    self.callOneListener(event, data, raw, (response) => {
                        self.channels.channel((error, channel) => {
                            if (error) {
                                self.emit('error', error);
                                return;
                            }

                            var data = JSON.stringify({ d: (undefined === response ? null : response) });
                            var headers = {
                                'destination': '/queue/' + self.config.destination,
                                'ok': true,
                                'target': raw.headers['sender'],
                                'correlation-id': raw.headers['correlation-id']
                            };

                            channel.send(headers, data, (error) => {
                                if (error)
                                    self.emit('error', error);
                            });
                        });
                    }, (reason) => {
                        self.channels.channel((error, channel) => {
                            if (error) return;

                            var data = JSON.stringify({ d: (undefined === reason ? null : reason) });
                            var headers = {
                                'destination': '/queue/' + self.config.destination,
                                'ok': false,
                                'target': raw.headers['sender'],
                                'correlation-id': raw.headers['correlation-id']
                            };
                            channel.send(headers, data, (error) => {
                                if (error)
                                    self.emit('error', error);
                            });
                        });
                    });
                }
            });
        };

        // automatically subscribing on new event listeners
        this.on('newListener', (event, listener) => {
            if (self.config.excludedEvents.indexOf(event) < 0) {
                if (self.listeners(event).length === 0) {
                    var comparison = " = '" + event + "'";
                    if (event.indexOf('*') >= 0) {
                        comparison = " LIKE '" + event.replace(/\*/g, '%') + "'";
                    }

                    self.subscriptions[event] = {};
                    self.channels.channel((error, channel) => {
                        channel.subscribe({
                            destination: '/topic/' + config.destination,
                            selector: "event " + comparison + " AND sender <> '" + self.getId() + "'",
                            ack: 'auto'
                        }, (error, message, subscription) => {
                            self.subscriptions[event].topic = subscription;
                            callback1(event, false, message);
                        });

                        channel.subscribe({
                            destination: '/queue/' + config.destination,
                            ack: 'auto',
                            selector: "event " + comparison + " AND sender <> '" + self.getId() + "'"
                        }, (error, message, subscription) => {
                            self.subscriptions[event].queue = subscription;
                            callback1(event, true, message);
                        });
                    });
                }
            }
        });

        // automatically unsubscribing if all listeners are removed
        this.on('removeListener', (event, listener) => {
            if (self.config.excludedEvents.indexOf(event) < 0) {
                if (self.listeners(event).length === 0)
                    if (self.subscriptions.hasOwnProperty(event)) {
                        if (undefined !== self.subscriptions[event].topic)
                            self.subscriptions[event].topic.unsubscribe();
                        if (undefined !== self.subscriptions[event].queue)
                            self.subscriptions[event].queue.unsubscribe();
                    }
            }
        });
    }

    getId() {
        return this.id;
    }

    callOneListener(event, data, raw, resolve, reject) {
        var self = this;
        var resolveproxy = (response) => {
            let obj = { data: response, ok: true };
            self.emit("response", event, obj, raw);

            resolve(obj.data);
        };
        var rejectproxy = (reason) => {
            let obj = { data: reason, ok: false };
            self.emit("response", event, obj, raw);

            reject(obj.data);
        };

        var listeners = this.listeners(event);
        if (listeners.length > 0) {
            setImmediate(() => {
                try {
                    let obj = { data: data };
                    self.emit("request", event, obj, raw);

                    listeners[0](obj.data, resolveproxy, rejectproxy, raw);
                } catch (error) {
                    rejectproxy(error.message);
                }
            });

            return true;
        }

        return false;
    }

    connect() {
        var self = this;
        self.promises = {};

        return new Promise((resolve, reject) => {
            self.connections = new Stomp.ConnectFailover(self.config.servers, self.config.reconnectOpts);
            self.channels = new Stomp.ChannelPool(self.connections);

            self.connections.on('error', (error) => {
                self.emit('error', error);
            });
            self.connections.on('connecting', (connector) => {
                self.emit('connecting', connector);
            });

            self.channels.channel((error, channel) => {
                if (error) {
                    reject(error);
                } else {
                    channel.subscribe({
                        destination: '/queue/' + self.config.destination,
                        ack: 'auto',
                        selector: "target = '" + self.getId() + "'"
                    }, (error, raw, subscription) => {
                        if (error) {
                            self.emit('error', error);
                            return;
                        }

                        raw.readString('utf8', (error, jsonstr) => {
                            var msgId = raw.headers['correlation-id'];
                            var p = self.promises[msgId];
                            delete self.promises[msgId];

                            if (undefined !== p) {
                                var data = JSON.parse(jsonstr).d;
                                if ('true' === raw.headers.ok) {
                                    p.resolve(data);
                                } else {
                                    p.reject(data);
                                }
                            }
                        });
                    });

                    self.emit('connected', self.getId());
                    resolve();
                }
            });
        });
    }

    disconnect() {
        var self = this;
        return new Promise((resolve, reject) => {
            self.channels.close();
            self.emit('disconnected', self.getId());
            resolve();
        });
    }

    emitToOne(event, message, timeout) {
        timeout = timeout || 0;
        var self = this;
        return new Promise((resolve, reject) => {
            var msgId = UUID.v4();

            var tid;
            if (timeout > 0) {
                tid = setTimeout(() => {
                    self.promises[msgId].reject('timeout');
                }, timeout);
            }
            self.promises[msgId] = {
                resolve: (response) => {
                    clearTimeout(tid);
                    delete self.promises[msgId];
                    resolve(response);
                },
                reject: (reason) => {
                    clearTimeout(tid);
                    delete self.promises[msgId];
                    reject(reason);
                }
            };

            if (!(self.callOneListener(event, message, null, self.promises[msgId].resolve, self.promises[msgId].reject))) {
                self.channels.channel((error, channel) => {
                    if (error) return;

                    var data = JSON.stringify({ d: (undefined === message ? null : message) });
                    var headers = {
                        'destination': '/queue/' + self.config.destination,
                        'event': event,
                        'sender': self.getId(),
                        'priority': 9,
                        'correlation-id': msgId
                    };

                    if (timeout > 0) {
                        headers.expires = new Date().getTime() + timeout;
                    }
                    channel.send(headers, data, (error) => {
                        if (error)
                            self.emit('error', error);
                    });
                });
            }
        });
    }

    emit(event, ...args) {
        var self = this;
        return new Promise((resolve, reject) => {
            if (self.config.excludedEvents.indexOf(event) < 0)
                self.channels.channel((error, channel) => {
                    if (error) return;

                    var data = JSON.stringify({ d: (undefined === args ? [] : args) });
                    var headers = {
                        'destination': '/topic/' + self.config.destination,
                        'event': event,
                        'sender': self.getId(),
                        'priority': 9
                    };

                    channel.send(headers, data, (error) => {
                        if (error)
                            self.emit('error', error);
                    });
                });

            super.emit.apply(this, arguments);

            resolve();
        });
    }
}

module.exports = DistributedEventEmitter;
