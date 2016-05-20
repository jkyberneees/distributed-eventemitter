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

const EventEmitter = require('../main.js');
const co = require('co');
const events = new EventEmitter(); // host: localhost, port: 61613

co(function*() {
    try {
        yield events.connect();
        let response = yield events.emitToOne('email.send', {
            to: 'kyberneees@gmail.com',
            subject: 'Hello Node.js',
            body: 'Introducing easy distributed messaging for Node.js...'
        }, 3000);

        if ('sent' === response) {
            console.log('email was sent!');
        }
    } catch (error) {
        console.log('error: ' + error);
    }
});