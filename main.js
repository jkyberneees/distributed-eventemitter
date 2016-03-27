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

const Stomp = require('stompjs');
const UUID = require('uuid');
const EventEmitter = require('eventemitter2').EventEmitter2;

class DistributedEventEmitter extends EventEmitter {
  constructor(config) {
    super({
      wildcard: true,
      newListener: true
    });
    var self = this;
    const subscriptions = {};

    config = config || {};
    this.config = config;
    config.host = config.host || 'localhost';
    config.port = config.port || 61613;
    config.destination = config.destination || 'distributed-eventemitter';
    config.protocol = config.protocol || 'tcp';
    config.headers = config.headers || {};
    config.headers['client-id'] = config.headers['client-id'] || UUID.v4();
    config.excludedEvents = config.excludedEvents || [];
    config.excludedEvents.push(...['newListener', 'removeListener', 'opened', 'closed', 'error']);

    const callback1 = (event, isQueue, raw) => {
      if (!isQueue) {
        var args = [event];
        args.push(...JSON.parse(raw.body));
        args.push(raw);
        self.emit.apply(self, args);
      } else {
        self.callOneListener(event, JSON.parse(raw.body), raw, (response) => {
          self.client.send(raw.headers['reply-to'], {
            msgId: raw.headers.msgId,
            ok: true
          }, JSON.stringify(undefined === response ? null : response));
        }, (reason) => {
          self.client.send(raw.headers['reply-to'], {
            msgId: raw.headers.msgId,
            ok: false
          }, JSON.stringify(undefined === reason ? null : reason));
        });
      }
    };

    // automatically subscribing on new event listeners
    this.on('newListener', (event, listener) => {
      if (self.config.excludedEvents.indexOf(event) < 0) {
        if (self.listeners(event).length === 0) {
          var comparison = " = '" + event + "'";
          if (event.indexOf('*') >= 0) {
            comparison = " LIKE '" + event.replace(/\*/g, '%') + "'";
          }
          subscriptions[event] = {
            topic: self.client.subscribe('/topic/' + config.destination, callback1.bind(null, event, false), {
              selector: "event " + comparison + " AND sender <> '" + self.getId() + "'"
            }),
            queue: self.client.subscribe('/queue/' + config.destination, callback1.bind(null, event, true), {
              selector: "event " + comparison + " AND sender <> '" + self.getId() + "'"
            })
          };
        }
      }
    });

    // automatically unsubscribing if all listeners are removed
    this.on('removeListener', (event, listener) => {
      if (self.config.excludedEvents.indexOf(event) < 0) {
        if (self.listeners(event).length === 0)
          if (subscriptions.hasOwnProperty(event)) {
            subscriptions[event].topic.unsubscribe();
            subscriptions[event].queue.unsubscribe();
          }
      }
    });
  }

  getId() {
    return this.config.headers['client-id'];
  }

  callOneListener(event, message, raw, resolve, reject) {
    var listeners = this.listeners(event);
    if (listeners.length > 0) {
      setImmediate(() => {
        listeners[0](message, resolve, reject, raw);
      });

      return true;
    }

    return false;
  }

  connect() {
    var self = this;
    self.promises = {};

    return new Promise((resolve, reject) => {
      self.client = 'ws' === self.config.protocol ? Stomp.overWS(self.config.url) : Stomp.overTCP(self.config.host, self.config.port);
      self.client.connect(self.config.username, self.config.password, () => {
        self.client.subscribe('/temp-queue/' + self.getId(), (raw) => {
          var msgId = raw.headers.msgId;
          var p = self.promises[msgId];
          delete self.promises[msgId];

          if (undefined !== p)
            if ('true' === raw.headers.ok) {
              p.resolve(JSON.parse(raw.body));
            } else {
              p.reject(JSON.parse(raw.body));
            }
        }, {});
        resolve();
        self.emit('connected');
      }, (error) => {
        reject(error);
        self.emit('error', error);
      });
    });
  }

  disconnect() {
    var self = this;
    return new Promise((resolve, reject) => {
      self.client.disconnect(() => {
        resolve();
        self.emit('disconnected');
      });
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
        var headers = {
          event: event,
          msgId: msgId,
          sender: self.getId(),
          priority: 9,
          'reply-to': '/temp-queue/' + self.getId()
        };
        if (timeout > 0) {
          headers.expires = new Date().getTime() + timeout;
        }

        self.client.send('/queue/' + self.config.destination, headers, JSON.stringify(message));
      }
    });
  }

  emit(event, ...args) {
    var self = this;
    return new Promise((resolve, reject) => {
      if (self.config.excludedEvents.indexOf(event) < 0) {
        self.client.send('/topic/' + self.config.destination, {
          event: event,
          sender: self.getId()
        }, JSON.stringify(args));
      }
      super.emit.apply(this, arguments);

      resolve();
    });
  }
}

module.exports = DistributedEventEmitter;
