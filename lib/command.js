var util = require('util');
var async = require('async');
var EnhancedBuffer = require('./enhancedBuffer');

var FQ_PROTO = {
    ERROR: 0xeeee,
    HB: 0xbea7,
    AUTH_CMD: 0xaaaa,
    AUTH_PLAIN: 0,
    AUTH_RESP: 0xaa00,
    HBREQ: 0x4848,
    BIND: 0xb171,
    BINDREQ: 0xb170,
    UNBIND: 0x171b,
    UNBINDREQ: 0x071b,
    STATUS: 0x57a7,
    STATUSREQ: 0xc7a7
};


// ========== FqCommand ===================
// An "abstract" prototype for all commands to inherit from

function FqCommand(size){
    this.buff = null;
    this.composed = false;
    if(size !== undefined){
        this.alloc(2 + size);
    }
}
FqCommand.prototype.name = 'FqCommand';
FqCommand.prototype.hasInBandResponse = true;

FqCommand.prototype.compose = function(){};

FqCommand.prototype.send = function(client, callback){
    if(!this.composed){
        this.buff.writeUInt16BE(this.cmd);
        this.compose();
        this.composed = true;
    }
    return client.cmdWrite(this.buff.buffer, callback);
};

FqCommand.prototype.getShortCmd = function(client, callback){
    var cmd = null;
    var self = this;
    async.doWhilst(
        // Find the next command
        function(asyncCallback){
            client.cmdRead(2, function(err, buff){
                if(err){
                    return callback(err);
                }
                if(buff === null){
                    return callback(null,null);
                }
                cmd = buff.readUInt16BE(0);
                if(cmd === FQ_PROTO.HB){
                    client.receiveHeartbeat();
                } else if(cmd === FQ_PROTO.ERROR){
                    return client.cmdReadShortString(function(err, msg){
                        if(err){
                            return asyncCallback(err);
                        }
                        return asyncCallback(new Error(msg));
                    });
                }
                return asyncCallback();
            });
        },
        // Repeat until a non-HB command is found
        function(){
            return self.cmd !== FQ_PROTO.HB && cmd === FQ_PROTO.HB;
        },
        // Finish
        function(err){
            return callback(err, cmd);
        }
    );
};

FqCommand.prototype.process = function(client, callback){
    var self = this;
    self.getShortCmd(client, function(err, cmd){
        if(!err && cmd !== self.responseCmd){
            err = new Error('Expected '+self.responseCmd+', got '+cmd);
        }
        return callback(err, cmd);
    });
};

FqCommand.prototype.alloc = function(size){
    this.buff = new EnhancedBuffer(size);
};


// ========== Heartbeat ===================
//
// Prototype: FqCommand

function Heartbeat(){
    Heartbeat.super_.call(this, 0);
    this.hasInBandResponse = false;
}
util.inherits(Heartbeat, FqCommand);
Heartbeat.prototype.name = 'HeartbeatCmd';

Heartbeat.prototype.cmd = FQ_PROTO.HB;
Heartbeat.prototype.responseCmd = FQ_PROTO.HB;


// ========== HeartbeatRequest ===================
//
// Prototype: FqCommand
function HeartbeatRequest(ms){
    HeartbeatRequest.super_.call(this, 2);
    this.ms = ms & 0xffff;
    this.hasInBandResponse = false;
}
util.inherits(HeartbeatRequest, FqCommand);
HeartbeatRequest.prototype.name = 'HeartbeatRequestCmd';

HeartbeatRequest.prototype.cmd = FQ_PROTO.HBREQ;
HeartbeatRequest.prototype.responseCmd = FQ_PROTO.HBREQ;

HeartbeatRequest.prototype.compose = function(){
    this.buff.writeUInt16BE(this.ms);
};


// ========== Auth ===================
//
// Prototype: FqCommand

function Auth(){
    Auth.super_.call(this);
    this.key = null;
}
util.inherits(Auth, FqCommand);
Auth.prototype.name = 'AuthCmd';

Auth.prototype.success = function(){
    return this.key !== null;
};

Auth.prototype.getKey = function(){
    return this.key;
};


// ========== PlainAuth ===================
//
// Prototype: Auth

function PlainAuth(user, pass, queue, queueType){
    PlainAuth.super_.call(this);
    this.buffUser = new Buffer(user,'utf8');
    this.buffPass = new Buffer(pass,'utf8');
    this.buffQueue = new Buffer(queue,'utf8');
    this.buffQueueType = new Buffer(queueType,'utf8');
    this.extraSpace =
        2 + // plain
        2 + this.buffUser.length + // user
        2 + this.buffQueue.length + 1 + this.buffQueueType.length + // queue
        2 + this.buffPass.length; // password
    this.alloc(2 + this.extraSpace);
}
util.inherits(PlainAuth, Auth);
PlainAuth.prototype.name = 'PlainAuthCmd';

PlainAuth.prototype.cmd = FQ_PROTO.AUTH_CMD;

PlainAuth.prototype.compose = function(){
    var buff = this.buff; // For convenience

    // Auth Plain
    buff.writeUInt16BE(FQ_PROTO.AUTH_PLAIN);

    // User
    buff.writeInt16BE(this.buffUser.length);
    buff.write(this.buffUser);

    // Queue
    var qlen = this.buffQueue.length + 1 + this.buffQueueType.length;
    buff.writeInt16BE(qlen);
    buff.write(this.buffQueue);
    buff.writeInt8(0);
    buff.write(this.buffQueueType);

    // Password
    buff.writeInt16BE(this.buffPass.length);
    buff.write(this.buffPass);
};

PlainAuth.prototype.process = function(client, callback){
    client.cmdRead(2, function(err, buff){
        if(err){
            return callback(err);
        }
        var cmd = buff.readUInt16BE(0);
        if(cmd === FQ_PROTO.AUTH_RESP){
            client.cmdReadShortBuffer(function(err, key){
                if(!err && (key === null || key.length > 127)){
                    err = new Error('Bad key');
                }
                return callback(err, key);
            });
        } else if(cmd === FQ_PROTO.ERROR){
            client.cmdReadShortString(function(err, errMsg){
                if(!err && errMsg !== null){
                    err = new Error(errMsg);
                }
                return callback(err);
            });
        } else {
            err = new Error('Unknown auth error');
            return callback(err);
        }
    });
};


// ========== BindRequest ===================
//
// Prototype: FqCommand

function BindRequest(exchange, program, peerMode){
    BindRequest.super_.call(this);
    this.exchange = new Buffer(exchange,'utf8');
    this.program = new Buffer(program, 'utf8');
    this.peerMode = peerMode;
    var extraSpace =
        2 + // peerMode
        2 + this.exchange.length + // exchange
        2 + this.program.length; // program
    this.alloc(2 + extraSpace);
}
util.inherits(BindRequest, FqCommand);
BindRequest.prototype.name = 'BindRequestCmd';

BindRequest.prototype.cmd = FQ_PROTO.BINDREQ;

BindRequest.prototype.responseCmd = FQ_PROTO.BIND;

BindRequest.prototype.compose = function(){
    var buff = this.buff; // convenience

    buff.writeInt16BE( +this.peerMode ); // 1 or 0
    buff.writeInt16BE(this.exchange.length);
    buff.write(this.exchange);
    buff.writeInt16BE(this.program.length);
    buff.write(this.program);
};

BindRequest.prototype.process = function(client, callback){
    var self = this;
    FqCommand.prototype.process.call(self, client, function(err){
        if(err){
            return callback(err);
        }
        client.cmdRead(4, function(err, buff){
            if(err){
                return callback(err);
            }
            if(buff === null){
                return callback(null, null);
            }
            self.binding = buff.readInt32BE(0);
            return callback(null, self.binding);
        });
    });
};


// ========== UnbindRequest ===================
//
// Prototype: FqCommand

function UnbindRequest(bindRequest){
    UnbindRequest.super_.call(this);
    this.bindRequest = bindRequest;
    var extraSpace =
        4 + // routeID
        2 + bindRequest.exchange.length;
    this.alloc(2 + extraSpace);
}
util.inherits(UnbindRequest, FqCommand);
UnbindRequest.prototype.name = 'UnbindRequestCmd';

UnbindRequest.prototype.cmd = FQ_PROTO.UNBINDREQ;

UnbindRequest.prototype.responseCmd = FQ_PROTO.UNBIND;

UnbindRequest.prototype.compose = function(){
    var buff = this.buff; //convenience
    buff.writeInt32BE(this.bindRequest.binding);
    buff.writeInt16BE(this.bindRequest.exchange.length);
    buff.write(this.bindRequest.exchange);
};

UnbindRequest.prototype.process = function(client, callback){
    var self = this;
    FqCommand.prototype.process.call(self, client, function(err){
        if(err){
            return callback(err);
        }
        client.cmdRead(4, function(err, buff){
            if(buff === null){
                return callback(null, null);
            }
            self.success = buff.readInt32BE(0);
            return callback(null, self.success);
        });
    });
};

UnbindRequest.prototype.getBinding = function(){
    return this.bindRequest.binding;
};

UnbindRequest.prototype.getSuccess = function(){
    return (this.success !== null && this.success === this.bindRequest.binding);
};


// ========== StatusRequest ===================
//
// Prototype: FqCommand

function StatusRequest(){
    StatusRequest.super_.call(this,2);
    this.status = {};
}
util.inherits(StatusRequest, FqCommand);
StatusRequest.prototype.name = 'StatusRequestCmd';

StatusRequest.prototype.cmd = FQ_PROTO.STATUSREQ;

StatusRequest.prototype.responseCmd = FQ_PROTO.STATUS;

StatusRequest.prototype.process = function(client, callback){
    var self = this;
    FqCommand.prototype.process.call(self, client, function(err){
        if(err){
            return callback(err);
        }
        self.lastUpdate = new Date();
        var _key = '';
        async.doUntil(
            // Get a status KV pair
            function(asyncCallback) {
                client.cmdReadShortString(function(err, key){
                    if(err){
                        return asyncCallback(err);
                    }
                    _key = key;
                    if(!key || !key.length){
                        return asyncCallback();
                    }
                    client.cmdRead(4, function(err, buff){
                        if(buff === null){
                            err = new Error('Status read failure');
                            return asyncCallback(err);
                        }
                        console.log(key,buff);
                        var value = buff.readInt32BE(0) & 0xffffffff;
                        self.status[key] = value;
                        return asyncCallback();
                    });
                });
            },
            // Stop when everything has been read
            function() {
                return _key.length === 0;
            },
            // Finish
            function(err){
                return callback(err, self.status);
            }
        );
    });
};


module.exports = {
    Heartbeat: Heartbeat,
    HeartbeatRequest: HeartbeatRequest,
    Auth: Auth,
    PlainAuth: PlainAuth,
    BindRequest: BindRequest,
    UnbindRequest: UnbindRequest,
    StatusRequest: StatusRequest
};
