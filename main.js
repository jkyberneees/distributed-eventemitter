/*
 Copyright (C) 2016 Rolando Santamaria Maso <kyberneees@gmail.com>

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
"use strict";

const Stomp = require('stompit');
const UUID = require('uuid');
const EventEmitter = require('eventemitter2').EventEmitter2;

const parseDataIn = (jsonstr) => {
    // jwebsocket integration
    let data = JSON.parse(jsonstr);
    if (1 === Object.keys(data).length) {
        data = data.d;
    } else {
        delete data['_sender'];
        delete data['message_uuid'];
        delete data['origin_message_uuid'];
    }

    return data;
};

class DistributedEventEmitter extends EventEmitter {
    constructor(config) {
        super({
            wildcard: true,
            newListener: true
        });

        let self = this;
        self.id = UUID.v4();
        self.subscriptions = {};

        const emit = (args) => {
            super.emit.apply(self, args);
        };

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

        const processMessage = (event, isQueue, raw) => {
            raw.readString('utf8', (error, jsonstr) => {
                let data = parseDataIn(jsonstr);
                if (!isQueue) {
                    let args = [event];
                    args.push(...data);
                    args.push(raw);
                    emit(args);
                } else {
                    self.callOneListener(event, data, raw, (response) => {
                        self.channels.channel((error, channel) => {
                            if (error) {
                                self.emit('error', error);
                                return;
                            }

                            let data = JSON.stringify({
                                d: (undefined === response ? null : response)
                            });
                            let headers = {
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

                            let data = JSON.stringify({
                                d: (undefined === reason ? null : reason)
                            });
                            let headers = {
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
                    let comparison = " = '" + event + "'";
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
                            if (error) {
                                self.emit('error', error);
                            } else {
                                self.subscriptions[event].topic = subscription;
                                processMessage(event, false, message);
                            }
                        });

                        channel.subscribe({
                            destination: '/queue/' + config.destination,
                            ack: 'auto',
                            selector: "event " + comparison + " AND sender <> '" + self.getId() + "'"
                        }, (error, message, subscription) => {
                            if (error) {
                                self.emit('error', error);
                            } else {
                                self.subscriptions[event].queue = subscription;
                                processMessage(event, true, message);
                            }
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
        let self = this;
        let resolveproxy = (response) => {
            let obj = {
                data: response,
                ok: true
            };
            self.emit("response", event, obj, raw);
            resolve(obj.data);
        };
        let rejectproxy = (reason) => {
            let obj = {
                data: reason,
                ok: false
            };
            self.emit("response", event, obj, raw);
            reject(obj.data);
        };

        let listeners = this.listeners(event);
        if (listeners.length > 0) {
            setImmediate(() => {
                try {
                    let obj = {
                        data: data
                    };
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
        let self = this;
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
                            let msgId = raw.headers['correlation-id'];
                            let p = self.promises[msgId];
                            delete self.promises[msgId];

                            if (undefined !== p) {
                                let data = parseDataIn(jsonstr)

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
        let self = this;
        return new Promise((resolve, reject) => {
            self.channels.close();
            self.emit('disconnected', self.getId());
            resolve();
        });
    }

    emitToOne(event, message, timeout) {
        timeout = timeout || 0;
        let self = this;
        return new Promise((resolve, reject) => {
            let msgId = UUID.v4();

            let tid;
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

                    let data = JSON.stringify({
                        d: (undefined === message ? null : message)
                    });
                    let headers = {
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
        let self = this;
        return new Promise((resolve, reject) => {
            if (self.config.excludedEvents.indexOf(event) < 0)
                self.channels.channel((error, channel) => {
                    if (error) return;

                    let data = JSON.stringify({
                        d: (undefined === args ? [] : args)
                    });
                    let headers = {
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