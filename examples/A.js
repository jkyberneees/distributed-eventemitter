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

var EventEmitter = require('../main.js');
var events = new EventEmitter(); // host: localhost, port: 61613
events.connect().then(() => {
    events.on('email.send', (message, resolve, reject) => {
        console.log('sending email...');
        //... send email
        // ...

        resolve('sent');
    });
});
