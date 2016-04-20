
# Why?
  The library solve the need of a multi process and multi server oriented messaging API in Node.js.
  <br> Using the known [EventEmitter](https://nodejs.org/api/events.html/) API, listeners registration and events emitting is super simple.
  <br> A new 'emitToOne' method allows one-to-one events notification, intended for request/response flows on clustered services. 
  <br> The classic 'emit' method broadcast custom events to local and distributed listeners.

# Quick Start
1. Mailer server (A.js):

  ```js
  var EventEmitter = require('distributed-eventemitter');
  var events = new EventEmitter(); // host: localhost, port: 61613
  events.connect().then(() => {
    events.on('email.send', (message, resolve, reject) => {
      console.log('sending email...');
      //... send email
      // ...

      resolve('sent');
    });
  });
  ```

2. Run mailer server as a cluster with [PM2](https://www.npmjs.com/package/pm2):

  ```bash
  pm2 start A.js -i 4 --node-args="--harmony"
  ```

3. Mailer client  (B.js):

  ```js
  var EventEmitter = require('distributed-eventemitter');
  var events = new EventEmitter(); // host: localhost, port: 61613
  events.connect().then(() => {
    events.emitToOne('email.send', {
      to: 'kyberneees@gmail.com',
      subject: 'Hello Node.js',
      body: 'Introducing easy distributed messaging for Node.js...'
    }, 3000).then((response) => {
      if ('sent' === response) {
        console.log('email was sent!');
      }
    }).catch(console.log.bind());
  });
  ```
4. Run mailer client:

  ```bash
  node --harmony B.js
  ```

# Requirements
- Running [STOMP compliant server](http://activemq.apache.org/installation.html) instance. Default client destinations are:
  1. _/topic/distributed-eventemitter_: Used for events broadcast (emit)
  - _/queue/distributed-eventemitter_: Used for one-to-one events (emitToOne)

    > If the server require clients to be authenticated, you can use:

  ```js
  {
    'host': 'localhost',
    'connectHeaders': {
      'heart-beat': '5000,5000',
      'host': '',
      'login': 'username',
      'passcode': 'password'
    }
  }
  ```

# Installation

```bash
$ npm install distributed-eventemitter
```

# Features
- Extends [eventemitter2](https://www.npmjs.com/package/eventemitter2/). ([wildcards](https://www.npmjs.com/package/eventemitter2/#api) are enabled). 
- ECMA6 Promise based API.
- Request/Response communication intended for service clusters (emitToOne). Uncaught exceptions automatically invoke 'reject(error.message)'  
- Events broadcast to local and distributed listeners (emit)
- Works with any STOMP compliant server (ie. ActiveMQ, RabbitMQ,  ...).
- Uses [stompit](https://www.npmjs.com/package/stompit/) as STOMP client. (automated server reconnection is supported)

# Config params
```js
var config = {};
config.destination = 'distributed-eventemitter'; // server topic and queue destinations
config.excludedEvents = []; // events that are not distributed
config.servers = [{
  'host': 'localhost',
  'port': 61613,
  'connectHeaders': {
    'heart-beat': '5000,5000',
    'host': '',
    'login': '',
    'passcode': ''
  }
}];
config.reconnectOpts = {
  maxReconnects: 10;
}

var events = new EventEmitter(config);
```
  For more details about 'servers' and 'reconnectOpts' params please check: http://gdaws.github.io/node-stomp/api/connect-failover/ 

# Internal events
```js
events.on('connected', (emitterId) => {
    // triggered when the emitter has been connected to the network (STOMP server)
});

events.on('disconnected', (emitterId) => {
    // triggered when the emitter has been disconnected from the network (STOMP server)
});

events.on('error', (error) => {
   // triggered when an error ocurrs in the connection channel. 
}):

events.on('connecting', (connector) => {
   // triggered when the STOMP client is trying to connect to a server.
}):

events.on('request', (event, request, raw) => {
   // triggered before invoke a listener using emitToOne feature
   
   // request data filtering and modification is allowed
   // example:
   request.data = ('string' === typeof request.data) ? request.data.toUpperCase() : request.data
}):

events.on('response', (event, response, raw) => {
   // triggered after invoke a listener using emitToOne feature
   
   // response data filtering and modification is allowed
   // example:
   if (response.ok)
     response.data = ('string' === typeof response.data) ? response.data.toUpperCase() : response.data
   else 
     console.log('error ocurred: ' + response.data.message);
}):

```

# API
**getId**: Get the emitter instance unique id.

```js
events.getId(); // UUID v4 value
```

**connect**: Connect the emitter to the server. Emit the 'connected' event.

```js
events.connect().then(()=> {
  console.log('connected');
});
```

**disconnect**: Disconnect the emitter from the server. Emit the 'disconnected' event.

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

1. Express integration.

# Known limitations
  - The feature 'emitAsync' from the EventEmitter2, only work locally(not distributed).

# Tests

```bash
$ npm install
$ npm test
```
# History changes

## 1.1.x
  - From version 1.1.0+ we use Stompit as STOMP client because Stompjs does not support server reconnections and is also unmaintained.
  - No API changes from 1.0 version except the configuration params, since now we consider a list of STOMP servers to connect/reconnect.

## 1.1.1
  - Supporting request/request events intended for pre invocation content filtering and modification.

## 1.1.2
  - Fixing dependencies declaration (due to automatic modification from 'npm update --save').