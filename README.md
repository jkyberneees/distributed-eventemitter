# Quick Start
1. Mailer service (A.js):

  ```js
  var EventEmitter = require('distributed-eventemitter');
  var events = new EventEmitter(); // host: localhost, port: 61613
  events.connect().then(()=> {
    events.on('email.send', (message, resolve, reject) => {
      //... send email
      // ...

      resolve('sent');
    });
  });
  ```

2. Run mailer service as a cluster with [PM2](https://www.npmjs.com/package/pm2):

  ```bash
  pm2 start A.js -i 4 --node-args="--harmony"
  ```

3. Send email from client process (B.js):

  ```js
  var EventEmitter = require('../main.js');
  var events = new EventEmitter(); // host: localhost, port: 61613
  events.connect().then(() => {
    events.emitToOne('email.send', {
      to: 'kyberneees@gmail.com',
      subject: 'Hello Node.js',
      body: 'Introducing easy distributed messaging for Node.js...'
    }).then((response) => {
      if ('sent' === response) {
        console.log('email was sent!');
      }
    });
  });
  ```

# Requirements
- Running [STOMP compliant broker](http://activemq.apache.org/installation.html) instance. Default client destinations are:
  1. _/topic/distributed-eventemitter_: Used for events broadcast (emit)
  - _/queue/distributed-eventemitter_: Used for one-to-one events (emitToOne)

    > If the broker require clients to be authenticated, you can use:

  ```js
  config.headers = {
    login: 'user',
    passcode: 'password'
  };
  ```

  > A temporary queue per client is used as a reply-to channel.

# Installation

```bash
$ npm install distributed-eventemitter
```

# Features
- Extends [eventemitter2](https://www.npmjs.com/package/eventemitter2/).
- ECMA6 Promise based API.
- Request/Response communication intended for service clusters (emitToOne)  
- Events broadcast to local and distributed listeners (emit)
- Works with any STOMP compliant message broker (ie. ActiveMQ, RabbitMQ,  ...).
- Uses [stompjs](https://www.npmjs.com/package/stompjs/) as STOMP client.

# Config params
Using TCP connections:

```js
var config = {};
config.host = 'localhost'; // STOMP broker IP address
config.port = 61613; // STOMP broker port
config.destination = 'distributed-eventemitter'; // STOMP destination
config.protocol = 'tcp'; // connection type
config.headers = {}; // stompjs client connection headers
config.excludedEvents = []; // events that are not distributed

var events = new EventEmitter(config);
```

Using WebSocket connections:

```js
var config = {};
config.url = 'ws://localhost:61614'; // STOMP broker URL
config.destination = 'distributed-eventemitter'; // STOMP destination
config.protocol = 'ws'; // connection type
config.headers = {}; // stompjs client connection headers
config.excludedEvents = []; // events that are not distributed

var events = new EventEmitter(config);
```

# Why?
  The library solve the need of a multi process and multi server oriented messaging API in Node.js.<br>  Using the known [EventEmitter](https://nodejs.org/api/events.html/) API, listeners registration and events emitting is super simple.<br>  A new 'emitToOne' method allows one-to-one events notification, intended for request/response flows on clustered services. The classic 'emit' method broadcast custom events to local and distributed listeners.

# API
**getId**: Get the STOMP client 'client-id' value.

```js
events.getId(); // commonly an UUID v4 value
```

**connect**: Connect the emitter to the broker instance.

```js
events.connect().then(()=> {
  console.log('connected');
});
```

**disconnect**: Disconnect the emitter from the broker instance.

```js
events.disconnect().then(()=> {
  console.log('disconnected');
});
```

**emitToOne**: Notify a custom event to only one target listener (locally or in the network). The method accept only one argument as event data.

```js
events.on('my.event', (data, resolve, reject) => {
  if ('hello' === data){
    resolve('world');
  } else {
    reject('invalid args');
  }
});

// calling without timeout
events.emitToOne('my.event', 'hello').then((response) => {
  console.log('world' === response);
});

// calling with timeout (ms)
events.emitToOne('my.event', {data: 'hello'}, 100).catch((error) => {
  console.log('invalid args' === error);
});
```
# Roadmap

1. STOMP client reconnection support.
2. Express integration.

# Tests

```bash
$ npm install
$ npm test
```
