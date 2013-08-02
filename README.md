# node-fq

[fq message queue](https://github.com/postwait/fq) client written in [Node.js](http://nodejs.org/).

## Examples

### Publish a Message

    var FQ = require('fq');
    var client = new FQ();
    client.connect();
    client.on('ready',function(){
        client.publish({
            route: 'test.prefix.foo',
            sender: 'bar',
            exchange: 'baz',
            payload: 'bang'
        }, function(err, res){
            console.log('done');
        })
    });

### Consume

    var FQ = require('fq');
    
    var client = new FQ();
    client.connect();
    client.on('ready', function(){
        client.bind('maryland','prefix:"test.prefix." sample(1)',0,function(err, res){
            client.consume();
        });
    });
    client.on('error', function(e){
        console.log('We have an error',e);
    });
    client.on('message', function(msg){
        console.log('Message:', msg);
        process.exit();
    });    

## FqClient

### Configuring the Client

    new Client(connOpts)

`connOpts` contains all of the parameters used in connecting to fq.

Note: There is no actual user authentication done by fq currently, but it requires the related parameters.

* `host: 'localhost'`: (string) Host where fq is running.
* `port: 8765`: (number) Port fq is listening on.
* `user: 'node-fq'`: (string) User to connect to fq as.
* `pass: 'pass'`: (string) Password for user.
* `queue: uuid()`: (string) Which queue to connect to.
* `queueType: 'mem'`: (string) The type of queue.
* `heartbeat: 0`: (number) What millisecond interval to send and look for a heartbeat. Use `0` for no heartbeat.

### FqClient API

#### client.connect()

Connects to fq. This establishes two TCP connections, one for commands and one for data. It performs authorization and associates the two connections. Sets up heartbeat if client is configured to do so. The client will emit `ready` when complete.

#### client.setHeartbeat(hb)

* `hb`: (number) Millisecond interval to send heartbeat

Changes the heartbeat settings and alerts fq of the change.

#### client.bind(exchange, program, peerMode, callback)

* `exchange`: (string) Exchange to bind to
* `program`: (string) Route information.
* `peerMode`: (boolean)
* `callback(err,binding)`: (function) Called after fq responds to the bind request. 

Binds the client connection pair to a specific exchange and routing program. Required before consuming, but not necessary for publishing.

#### client.unbind(callback)

* `callback(err,success)`: (function) Called after the fq responds to the unbind request

Unbinds the client connection pair.


#### client.publish(options, callback)

* `options`: (object)
    * `msgId: uuid()`: (string or buffer) Message ID
    * `exchange`: (string or buffer) Exchange to publish message to
    * `route`: (string or buffer) Routing information for message
    * `payload`: (string or buffer) Message payload
* `callback(err,success)`: (function) Called after the message has been handled

Publishes a new message to the specified exchange with the specified routing information.

#### client.consume()

Turns on message consumption. It will emit `message` events as messages are read.

#### client.status(callback)

* `callback(err, status)`: `Function` Called after fq responds with status info

Returns an object containing information about the current client session. These stats do not contain any aggregate information for fq as a whole. Example output:

    {
      no_exchange: 0,
      no_route: 0,
      routed: 0,
      dropped: 0,
      msgs_in: 0,
      msgs_out: 0
    }

### FqClient Events

#### ready

Emitted when connection and authorization is fully complete. Client is ready to be used.

#### error

* `err`: `Error`

Emitted when a general error is encountered (i.e. not for an explicitly sent command or message).

#### message

* `msg`: `FqMessage` The message received

Emitted when a new message has been read

## FqMessage

FqMessages store values as buffers and hops ips as arrays. It's safer to let to the consumer decide what format it wants the data in. It also makes for faster republishing.

### Example
    { msgId: <Buffer 01 00 00 00 5a e8 5f 00 00 00 48 8b c6 48 8b 40>,
      numHops: 1,
      hops: [ [ 127, 0, 0, 1 ] ],
      routeLen: 15,
      route: <Buffer 74 65 73 74 2e 70 72 65 66 69 78 2e 66 6f 6f>,
      senderLen: 7,
      sender: <Buffer 6e 6f 64 65 2d 66 71>,
      exchangeLen: 8,
      exchange: <Buffer 6d 61 72 79 6c 61 6e 64>,
      payloadLen: 6,
      payload: <Buffer 66 6f 6f 62 61 72>,
      _complete: true,
      iovec: null }

## License

Copyright (c) 2013 OmniTI Computer Consulting, Inc.
All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
