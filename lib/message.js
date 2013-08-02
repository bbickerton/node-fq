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

var EnhancedBuffer = require('./enhancedBuffer');

function FqMessage (){
    this.msgId = null;
    this.numHops = -1;
    this.hops = null;
    this.routeLen = -1;
    this.route = null;
    this.senderLen = -1;
    this.sender = null;
    this.exchangeLen = -1;
    this.exchange = null;
    this.payloadLen = -1;
    this.payload = null;
    this._complete = false;
    this.iovec = null;
}

FqMessage.prototype.setMsgId = function(val){
    if(this.msgId === null){
        this.msgId = new Buffer(16);
    }
    if(typeof val === 'string'){
        return this.msgId.write(val,0,16,'utf8');
    }
    if(val instanceof Buffer){
        val.copy(this.msg,0,0,16);
    }
};

FqMessage.prototype.setRoute = function(val){
    if(typeof val === 'string'){
        val = new Buffer(val, 'utf8');
    }
    this.route = val;
    this.routeLen = val.length;
};
FqMessage.prototype.getRoute = function(){
    return this.route.toString('utf8');
};

FqMessage.prototype.setSender = function(val){
    if(typeof val === 'string'){
        val = new Buffer(val, 'utf8');
    }
    this.sender = val;
    this.senderLen = val.length;
};
FqMessage.prototype.getSender = function(){
    return this.sender.toString('utf8');
};

FqMessage.prototype.setExchange = function(val){
    if(typeof val === 'string'){
        val = new Buffer(val, 'utf8');
    }
    this.exchange = val;
    this.exchangeLen = val.length;
};
FqMessage.prototype.getExchange = function(){
    return this.exchange.toString('utf8');
};

FqMessage.prototype.getHops = function(){
    return this.hops.map(function(arr){
        return arr.join('.');
    });
};

FqMessage.prototype.setPayload = function(val){
    if(typeof val === 'string'){
        val = new Buffer(val, 'utf8');
    }
    this.payload = val;
    this.payloadLen = val.length;
};

FqMessage.prototype.isComplete = function(peerMode){
    //if(peerMode === undefined) return this._complete;
    if(peerMode){
        if(this.numHops < 0 || this.hops === null || this.senderLen <= 0 ||
          this.sender === null){
            return false;
        }
    }

    if( this.routeLen <= 0 || this.route === null ||
      this.exchangeLen <= 0 || this.exchange === null ||
      this.payloadLen < 0 || this.payload === null || this.msgId === null){
        return false;
    }

    return true;
};

FqMessage.prototype.read = function(client, callback){
    var self = this;
    if(self.isComplete()){
        return callback(null, true);
    }

    // Performs the reading steps in series. Lighter than async.series
    readSeries(0,self,client,function(err, res){
        if(err) return callback(err);
        self._complete = true;
        return callback(null, true);
    });
};

FqMessage.prototype.send = function(client, callback){
    var self = this;
    if(!self.isComplete()){
        return callback(new Error('Incomplete Message'));
    }
    if(self.iovec === null){
        var size =
            1 + self.exchangeLen + // exchange
            1 + self.routeLen + // route
            16 + // msgId
            4 + self.payloadLen;
        if(client.peerMode){
            size = size +
                1 + self.senderLen + // sender
                1 + (4 * self.numHops); //hops
        }
        var iovec = new EnhancedBuffer(size);
        iovec.writeInt8(self.exchangeLen);
        iovec.write(self.exchange);
        iovec.writeInt8(self.routeLen);
        iovec.write(self.route);
        iovec.write(self.msgId);
        if(client.peerMode){
            iovec.writeInt8(self.senderLen);
            iovec.write(self.sender);
            iovec.writeInt8(self.numHops);
            for(var i = 0; i < self.numHops; i++){
                iovec.write(new Buffer(self.hops[i]));
            }
        }
        iovec.writeInt32BE(self.payloadLen);
        iovec.write(self.payload);
            
        self.iovec = iovec.buffer;
    }
    client.dataWrite(self.iovec, callback);
};

/* Methods for each step of reading a message */

var readFnArray = [
    readExchangeLen,
    readExchange,
    readRouteLen,
    readRoute,
    readMsgId,
    readSenderLen,
    readSender,
    readNumHops,
    readHops,
    readPayloadLen,
    readPayload
];

function readSeries(i, msg, client, callback){
    var fn = readFnArray[i];
    if(!fn) return callback();
    fn(msg, client, function(err){
        if(err) return callback(err);
        return readSeries(i+1, msg, client, callback);
    });
}

function readExchangeLen(msg, client, callback){
    if(msg.exchangeLen !== -1){
        return callback();
    }
    client.dataRead(1, function(err, data){
        if(err){
            return callback(err);
        }
        msg.exchangeLen = data[0];
        if(msg.exchangeLen <= 0 || msg.exchangeLen > 127){
            err = new Error('Invalid exchangeLen: ' + msg.exchangeLen);
        }
        return callback(err);
    });
}
function readExchange(msg, client, callback){
    if(msg.exchange !== null){
        return callback();
    }
    client.dataRead(msg.exchangeLen, function(err, data){
        if(err){
            return callback(err);
        }
        msg.exchange = data;
        return callback();
    });
}
function readRouteLen(msg, client, callback){
    if(msg.routeLen !== -1){
        return callback();
    }
    client.dataRead(1, function(err, data){
        if(err){
            return callback(err);
        }
        msg.routeLen = data[0];
        if(msg.routeLen < 0 || msg.routeLen > 127){
            err = new Error('Invalid routeLen: ' + msg.routeLen);
        }
        return callback(err);
    });
}
function readRoute(msg, client, callback){
    if(msg.route !== null){
        return callback();
    }
    client.dataRead(msg.routeLen, function(err, data){
        if(err){
            return callback(err);
        }
        msg.route = data;
        return callback();
    });
}
function readMsgId(msg, client, callback){
    if(msg.msgId !== null){
        return callback();
    }
    client.dataRead(16, function(err, data){
        if(err){
            return callback(err);
        }
        msg.msgId = data;
        return callback();
    });
}
function readSenderLen(msg, client, callback){
    if(msg.senderLen !== -1){
        return callback();
    }
    client.dataRead(1, function(err, data){
        if(err){
            return callback(err);
        }
        msg.senderLen = data[0];
        if(msg.senderLen <= 0 || msg.senderLen > 127){
            err = new Error('Invalid senderLen: ' + msg.senderLen);
        }
        return callback(err);
    });
}
function readSender(msg, client, callback){
    if(msg.sender !== null){
        return callback();
    }
    client.dataRead(msg.senderLen, function(err, data){
        if(err){
            return callback(err);
        }
        msg.sender = data;
        return callback();
    });
}
function readNumHops(msg, client, callback){
    if(msg.numHops !== -1){
        return callback();
    }
    client.dataRead(1, function(err, data){
        if(err){
            return callback(err);
        }
        msg.numHops = data[0];
        if(msg.numHops <= 0 || msg.numHops > 32){
            err = new Error('Invalid numHops: ' + msg.numHops);
        }
        return callback(err);
    });
}
function readHops(msg, client, callback){
    if(msg.hops !== null){
        return callback();
    }
    client.dataRead(msg.numHops * 4, function(err, data){
        if(err){
            return callback(err);
        }
        msg.hops = [];
        for(var i = 0, n = msg.numHops; i < n; i++){
            var offset = i * 4;
            // MUCH faster than Array.prototype.slice.call()
            var ipArr = [
                data[offset],
                data[offset+1],
                data[offset+2],
                data[offset+3],
            ];
            msg.hops.push(ipArr);
        }
        return callback();
    });
}
function readPayloadLen(msg, client, callback){
    if(msg.payloadLen !== -1){
        return callback();
    }

    client.dataRead(4, function(err, data){
        if(err){
            return callback(err);
        }
        msg.payloadLen = data.readInt32BE(0);
        return callback();
    });
}
function readPayload(msg, client, callback){
    if(msg.payload !== null || msg.payloadLen <= 0){
        return callback();
    }
    client.dataRead(msg.payloadLen, function(err, data){
        if(err){
            return callback(err);
        }
        msg.payload = data;
        return callback();
    });
}

module.exports = FqMessage;
