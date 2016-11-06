/*
 * Copyright (c) 2013 OmniTI Computer Consulting, Inc.
 * All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var uuid = require('uuid');
var net = require('net');
var async = require('async');

var FqCommand = require('./command');
var FqMessage = require('./message');
var ConnectionPair = require('./connectionPair');
var EnhancedBuffer = require('./enhancedBuffer');

var FQ_PROTO = {
    CMD_MODE: 0xcc50cafe,
    DATA_MODE: 0xcc50face,
    PEER_MODE: 0xcc50fade
};

function Client (connOpts){
    var self = this;
    connOpts = connOpts ? connOpts : {};
    self.connOpts = {
        host: connOpts.host || 'localhost',
        port: connOpts.port || 8765,
        user: connOpts.user || 'node-fq',
        pass: connOpts.pass || 'pass',
        queue: connOpts.queue || uuid.v4(),
        queueType: connOpts.queueType || "mem"
    };

    self.connection = new ConnectionPair(
        self.connOpts.host,
        self.connOpts.port,
        self.connOpts.reconnect
    );

    self.cmdHeartbeat = {
        ms: connOpts.heartbeat || 0,
        timer: null,
        last: process.hrtime(),
        hb: new FqCommand.Heartbeat()
    };

    self.clientKey = null;

    self.cmdQueue = async.queue(function(fqCmd, asyncCallback){
        fqCmd.send(self, function(err){
            if(err){
                return asyncCallback();
            }
            fqCmd.process(self, function(err, res){
                return asyncCallback(err, res);
            });
        });
    },1);
}
util.inherits(Client, EventEmitter);

Client.prototype.setHeartbeat = function(cmdHeartbeatMs){
    var self = this;
    clearInterval(self.cmdHeartbeat.timer);
    if(cmdHeartbeatMs !== undefined){
        self.cmdHeartbeat.ms = cmdHeartbeatMs;
    }
    var ms = self.cmdHeartbeat.ms;
    if(!ms){
        return;
    }
    var hbReq = new FqCommand.HeartbeatRequest(ms);
    self.sendCmd(hbReq);
    var hb = self.cmdHeartbeat.hb;
    self.cmdHeartbeat.timer =
        setInterval(function(){
            // Send a heartbeat. No in band response, so don't wait.
            self.sendCmd(hb);
            // Check when the last time we received a heartbeat
            var hrDiff = process.hrtime(self.cmdHeartbeat.last);
            var nsDiff = hrDiff[0] * 1e9 + hrDiff[1]; // nanoseconds
            var nsHBInterval = self.cmdHeartbeat.ms * 1e6; //ms to ns
            if(nsDiff > (nsHBInterval * 3)){
                var error =
                    new Error('Have not received heartbeat in too long');
                self.emit('error', error);
            }
        }, self.cmdHeartbeat.ms);
};

Client.prototype.receiveHeartbeat = function(){
    this.cmdHeartbeat.last = process.hrtime();
};

Client.prototype.connect = function(){
    var self = this;
    var conn = self.connection;
    conn.connect();
    conn.on('connect', function(){
        self.emit('connect');
        self.cmdHeartbeat.last = process.hrtime(); // Reset timer
        var buff = new Buffer(4);
        buff.writeUInt32BE(FQ_PROTO.CMD_MODE,0);
        self.cmdWrite(buff);
        self.doAuth(function(err, success){
            if(err){
                self.emit('error', err);
                return conn.reconnect();
            }
            self.setHeartbeat();
            conn.cmdSocket.on('readable', function(){
                // Commands waiting for in band responses will accept
                // heartbeats. If there are none waiting when data comes in, go
                // and check for hb
                if((self.cmdQueue.length() + self.cmdQueue.running()) === 0){
                    self.cmdHeartbeat.hb.process(self, function(){});
                }
            });
            return conn.emit('auth', success);
        });
    });
    conn.on('error', function(e){
        self.emit('error', e);
    });
    conn.on('reconnecting', function(){
        clearInterval(self.cmdHeartbeat.timer);
    });
    conn.on('auth', function(success){
        if(!success){
            self.emit('error', new Error('Unsuccessful auth'));
            return conn.reconnect();
        }
        var buff = new EnhancedBuffer(4 + 2 + self.clientKey.length);
        buff.writeUInt32BE(FQ_PROTO.DATA_MODE);
        buff.writeUInt16BE(self.clientKey.length);
        buff.write(self.clientKey);
        self.dataWrite(buff.buffer);
        self.emit('ready');

    });
};

Client.prototype.reset = function(){
    var self = this;
    clearInterval(self.cmdHeartbeat.timer);
    self.connection.reconnect()
};

Client.prototype.shutdown = function(){
    clearInterval(this.cmdHeartbeat.timer);
    this.connection.disconnect(true);
};

Client.prototype.doAuth = function(callback){
    var self = this;
    var auth = new FqCommand.PlainAuth(
        self.connOpts.user,
        self.connOpts.pass,
        self.connOpts.queue,
        self.connOpts.queueType
    );

    self.sendCmd(auth, function(err, key){
        if(err){
            return callback(err);
        }
        self.clientKey = key;
        return callback(null, self.clientKey !== null);
    });
};

Client.prototype.dataRead = function(size, callback){
    var self = this;
    var buff = self.connection.dataSocket.read(size);
    if(buff){
        return callback(null, buff);
    }
    else {
        self.connection.dataSocket.once('readable', function(){
            return self.dataRead(size, callback);
        });
    }
};

Client.prototype.cmdRead = function(size, callback){
    var self = this;
    var buff = self.connection.cmdSocket.read(size);
    if(buff){
        return callback(null, buff);
    }
    else {
        self.connection.cmdSocket.once('readable', function(){
            return self.cmdRead(size, callback);
        });
    }
};

Client.prototype.cmdReadShortBuffer = function(callback){
    var self = this;
    self.cmdRead(2, function(err, lengthBuff){
        if(lengthBuff === null){
            return callback(null,null);
        }
        var stringLen = lengthBuff.readInt16BE(0);
        if(stringLen === 0){
            return callback(null, new Buffer(0));
        }
        self.cmdRead(stringLen, function(err, res){
            return callback(err, res);
        });
    });
};

Client.prototype.cmdReadShortString = function(callback){
    this.cmdReadShortBuffer(function(err, buff){
        if(buff === null){
            return callback(null,null);
        }
        return callback(null,buff.toString());
    });
};

Client.prototype.cmdWrite = function(buff, callback){
    if(this.connection.cmdSocket === null && callback){
        return callback(new Error("Can't write to closed cmd socket"));
    }
    return this.connection.cmdSocket.write(buff, undefined, callback);
};

Client.prototype.dataWrite = function(buff, callback){
    if(this.connection.dataSocket === null && callback){
        return callback(new Error("Can't write to closed data socket"));
    }

    return this.connection.dataSocket.write(buff, undefined, callback);
};

Client.prototype.sendCmd = function(fqCmd, callback){
    var self = this;
    if(fqCmd.hasInBandResponse){
        self.cmdQueue.push(fqCmd, callback);
    } else {
        fqCmd.send(self, callback);
    }
};

Client.prototype.bind = function(exchange, program, flags, callback){
    var bind = this.binding = new FqCommand.BindRequest(
        exchange,
        program,
        flags
    );
    this.sendCmd(bind, callback);
};

Client.prototype.unbind = function(callback){
    var unbind = new FqCommand.UnbindRequest(this.binding);
    this.binding = null;
    this.sendCmd(unbind, function(err){
        return callback(err, unbind.getSuccess());
    });
};

Client.prototype.status = function(callback){
    var statusReq = new FqCommand.StatusRequest();
    this.sendCmd(statusReq, callback);
};

Client.prototype.sendMsg = function(fqMsg, callback){
    fqMsg.send(this, callback);
};

Client.prototype.publish = function(options, callback){
    var fqMsg = new FqMessage();
    fqMsg.setMsgId(options.msgId || uuid.v4());
    fqMsg.setRoute(options.route);
    fqMsg.setExchange(options.exchange);
    fqMsg.setPayload(options.payload);
    fqMsg.send(this, callback);
};

Client.prototype.consume = function(){
    var self = this;
    var msg = new FqMessage();
    if(self.connection.shutdown){
      return;
    }
    msg.read(self, function(err){
        if(err){
            self.emit('error',err);
        } else {
            self.emit('message', msg);
        }
        setImmediate(self.consume.bind(self));
    });
};

module.exports = Client;
