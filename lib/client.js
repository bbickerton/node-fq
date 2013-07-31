var util = require('util');
var EventEmitter = require('events').EventEmitter;
//var uuid = require('libuuid');
var uuid = require('node-uuid');
var net = require('net');
var async = require('async');

var FqCommand = require('./command');
var FqMessage = require('./message');
var EnhancedBuffer = require('./enhancedBuffer');

var FQ_PROTO = {
    CMD_MODE: 0xcc50cafe,
    DATA_MODE: 0xcc50face,
    PEER_MODE: 0xcc50fade
};

function Client (connOpts, options){
    connOpts = connOpts ? connOpts : {};
    options = options ? options : {};
    var self = this;
    self.connOpts = {
        host: connOpts.host || 'localhost',
        port: connOpts.port || 8765,
        user: connOpts.user || 'node-fq',
        pass: connOpts.pass || 'pass',
        queue: connOpts.queue || uuid(),
        queueType: connOpts.queueType || "mem"
    };

    self.connection = {
        cmdConnected: false,
        cmdConnecting: false,
        dataConnected: false,
        dataConnecting: false,
        shuttingDown: false,
        dataReady: false,
        dataSocket: null,
        cmdSocket: null,
    };
    self.cmdHeartbeat = {
        ms: options.heartbeat || 0,
        timer: null,
        last: process.hrtime(),
        hb: new FqCommand.Heartbeat()
    };

    self.clientKey = null;

    self.cmdQueue = async.queue(function(fqCmd, asyncCallback){
        fqCmd.send(self, function(err){
            if(err) return asyncCallback();
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
    if(cmdHeartbeatMs !== undefined) self.cmdHeartbeat.ms = cmdHeartbeatMs;
    var ms = self.cmdHeartbeat.ms;
    if(!ms) return;
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
            var nsHBInterval = self.cmdHeartbeat.ms * 1e6; //milliseconds to nanoseconds
            if(nsDiff > (nsHBInterval * 3)){
                var error = new Error('Have not received heartbeat in too long');
                self.emit('error', error);
            }
        }, self.cmdHeartbeat.ms);
};

Client.prototype.receiveHeartbeat = function(){
    this.cmdHeartbeat.last = process.hrtime();
};

Client.prototype.connect = function(){
    var self = this;
    self.reset();

    var errorEmitted = false;

    var cmdSocket = self.connectCmd();
    cmdSocket.on('auth', function(success){
        if(!success){
            return self.emit('error', new Error('Unsuccessful auth'));
        }
        var dataSocket = self.connectData();
        dataSocket.on('dataReady', function(){
            self.connection.dataReady = true;
            self.emit('ready');
        });

        dataSocket.on('error', function(e){
            self.reset();
            if(!errorEmitted) self.emit('error', e);
            errorEmitted = true;
        });
    });
    cmdSocket.on('error', function(e){
        self.reset();
        if(!errorEmitted) self.emit('error', e);
        errorEmitted = true;
    });
    cmdSocket.on('readable', function(){
        // Commands waiting for in band responses will accept heartbeats
        // If there are none waiting when data comes in, go and check for hb
        if((self.cmdQueue.length() + self.cmdQueue.running()) === 0){
            self.cmdHeartbeat.hb.process(self, function(){
                // Check if we've received a response recently
                var hrDiff = process.hrtime(self.cmdHeartbeat.last);
                var nsDiff = hrDiff[0] * 1e9 + hrDiff[1]; // nanoseconds
                var nsHBInterval = self.cmdHeartbeat.ms * 1e6; //milliseconds to nanoseconds
                if(nsDiff > (nsHBInterval * 3)){
                    var error = new Error('Have not received heartbeat in too long');
                    self.emit('error', error);
                }
            });
        }
    });
};

Client.prototype.connectData = function(){
    var self = this;
    if(self.connection.dataConnecting) return;
    self.connection.dataConnecting = true;

    var host = self.connOpts.host;
    var port = self.connOpts.port;
    var socket = net.connect( {host: host, port: port }, function(){
        self.connection.dataConnecting = false;
        self.connection.dataConnected = true;
        var buff = new EnhancedBuffer(4 + 2 + self.clientKey.length);
        buff.writeUInt32BE(FQ_PROTO.DATA_MODE);
        buff.writeUInt16BE(self.clientKey.length);
        buff.write(self.clientKey);
        self.dataWrite(buff.buffer);
        socket.emit('dataReady');
    });
    socket.on('error', function(e){
        console.error('Data Socket: Error',e);
    });
    socket.on('close', function(){
        console.log('Data Socket: Close');
    });
    socket.on('end', function(){
        console.log('Data Socket: End');
    });
    self.connection.dataSocket = socket;
    return socket;
};

Client.prototype.connectCmd = function(){
    var self = this;
    if(self.connection.cmdConnecting) return;
    self.connection.cmdConnecting = true;
    var host = self.connOpts.host;
    var port = self.connOpts.port;
    var socket = net.connect( {host: host, port: port}, function(){
        self.connection.cmdConnected = true;
        self.connection.cmdConnecting = false;
        var buff = new Buffer(4);
        buff.writeUInt32BE(FQ_PROTO.CMD_MODE,0);
        self.cmdWrite(buff);
        self.doAuth(function(err, success){
            if(err) return socket.emit('error', err);
            self.setHeartbeat();
            return socket.emit('auth', success);
        });
    });
    socket.on('error', function(e){
        console.error('Cmd Socket: Error',e);
    });
    socket.on('close', function(){
        console.log('Cmd Socket: Close');
    });
    socket.on('end', function(){
        console.log('Cmd Socket: End');
    });
    self.connection.cmdSocket = socket;
    return socket;
};

Client.prototype.reset = function(){
    clearInterval(this.cmdHeartbeat.timer);
    if(this.connection.dataSocket) this.connection.dataSocket.destroy();
    if(this.connection.cmdSocket) this.connection.cmdSocket.destroy();

    this.connection.dataSocket = null;
    this.connection.cmdSocket = null;

    this.connection.cmdConnected = false;
    this.connection.cmdConnecting = false;
    this.connection.dataConnected = false;
    this.connection.dataConnecting = false;
    this.connection.dataReady = false;

    this.cmdHeartbeat.last = process.hrtime();
};

Client.prototype.shutdown = function(){
    this.reset();
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
        if(err) return callback(err);
        self.clientKey = key;
        return callback(null, self.clientKey !== null);
    });
};

Client.prototype.dataRead = function(size, callback){
    var self = this;
    var buff = self.connection.dataSocket.read(size);
    if(buff) return callback(null, buff);
    else {
        self.connection.dataSocket.once('readable', function(){
            return self.dataRead(size, callback);
        });
    }
};

Client.prototype.cmdRead = function(size, callback){
    var self = this;
    var buff = self.connection.cmdSocket.read(size);
    if(buff) return callback(null, buff);
    else {
        self.connection.cmdSocket.once('readable', function(){
            return self.cmdRead(size, callback);
        });
    }
};

Client.prototype.cmdReadShortBuffer = function(callback){
    var self = this;
    self.cmdRead(2, function(err, lengthBuff){
        if(lengthBuff === null) return callback(null,null);
        var stringLen = lengthBuff.readInt16BE(0);
        if(stringLen === 0) return callback(null, new Buffer(0));
        self.cmdRead(stringLen, function(err, res){
            return callback(err, res);
        });
    });
};

Client.prototype.cmdReadShortString = function(callback){
    this.cmdReadShortBuffer(function(err, buff){
        if(buff === null) return callback(null,null);
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

Client.prototype.bind = function(exchange, program, peerMode, callback){
    var bind = this.binding = new FqCommand.BindRequest(
        exchange,
        program,
        peerMode
    );
    this.sendCmd(bind, callback);
};

Client.prototype.unbind = function(callback){
    var unbind = new FqCommand.UnbindRequest(this.binding);
    this.binding = null;
    this.sendCmd(unbind, callback);
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
    fqMsg.setMsgId(options.msgId || uuid());
    fqMsg.setRoute(options.route);
    fqMsg.setExchange(options.exchange);
    fqMsg.setPayload(options.payload);
    fqMsg.send(this, callback);
};

Client.prototype.consume = function(){
    var self = this;
    var msg = new FqMessage();
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
