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
var async = require('async');

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
    async.series({
        exchangeLen: function(asyncCallback){
            if(self.exchangeLen !== -1){
                return asyncCallback();
            }
            client.dataRead(1, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.exchangeLen = data[0];
                if(self.exchangeLen <= 0 || self.exchangeLen > 127){
                    err = new Error('Invalid exchangeLen: ' + self.exchangeLen);
                }
                return asyncCallback(err);
            });
        },
        exchange: function(asyncCallback){
            if(self.exchange !== null){
                return asyncCallback();
            }
            client.dataRead(self.exchangeLen, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.exchange = data;
                return asyncCallback();
            });
        },
        routeLen: function(asyncCallback){
            if(self.routeLen !== -1){
                return asyncCallback();
            }
            client.dataRead(1, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.routeLen = data[0];
                if(self.routeLen < 0 || self.routeLen > 127){
                    err = new Error('Invalid routeLen: ' + self.routeLen);
                }
                return asyncCallback(err);
            });
        },
        route: function(asyncCallback){
            if(self.route !== null){
                return asyncCallback();
            }
            client.dataRead(self.routeLen, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.route = data;
                return asyncCallback();
            });
        },
        msgId: function(asyncCallback){
            if(self.msgId !== null){
                return asyncCallback();
            }
            client.dataRead(16, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.msgId = data;
                return asyncCallback();
            });
        },
        senderLen: function(asyncCallback){
            if(self.senderLen !== -1){
                return asyncCallback();
            }
            client.dataRead(1, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.senderLen = data[0];
                if(self.senderLen <= 0 || self.senderLen > 127){
                    err = new Error('Invalid senderLen: ' + self.senderLen);
                }
                return asyncCallback(err);
            });
        },
        sender: function(asyncCallback){
            if(self.sender !== null){
                return asyncCallback();
            }
            client.dataRead(self.senderLen, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.sender = data;
                return asyncCallback();
            });
        },
        numHops: function(asyncCallback){
            if(self.numHops !== -1){
                return asyncCallback();
            }
            client.dataRead(1, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.numHops = data[0];
                if(self.numHops <= 0 || self.numHops > 32){
                    err = new Error('Invalid numHops: ' + self.numHops);
                }
                return asyncCallback(err);
            });
        },
        hops: function(asyncCallback){
            if(self.hops !== null){
                return asyncCallback();
            }
            client.dataRead(self.numHops * 4, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.hops = [];
                for(var i = 0, n = self.numHops; i < n; i++){
                    var offset = i * 4;
                    var ipArr = [
                        data[offset],
                        data[offset+1],
                        data[offset+2],
                        data[offset+3],
                        data[offset+4]
                    ];
                       // Array.prototype.slice.call(data, offset, offset+4);
                    self.hops.push(ipArr);
                }
                return asyncCallback();
            });
        },
        payloadLen: function(asyncCallback){
            if(self.payloadLen !== -1){
                return asyncCallback();
            }

            client.dataRead(4, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.payloadLen = data.readInt32BE(0);
                return asyncCallback();
            });
        },
        payload: function(asyncCallback){
            if(self.payload !== null || self.payloadLen <= 0){
                return asyncCallback();
            }
            client.dataRead(self.payloadLen, function(err, data){
                if(err){
                    return asyncCallback(err);
                }
                self.payload = data;
                return asyncCallback();
            });
        }
    }, function(err){
        if(err){
            return callback(err);
        }
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
        var i = 0;
        var iovec = [];
        iovec[i] = new Buffer(1);
        iovec[i++].writeInt8(self.exchangeLen,0);
        iovec[i++] = self.exchange;
        iovec[i] = new Buffer(1);
        iovec[i++].writeInt8(self.routeLen,0);
        iovec[i++] = self.route;
        iovec[i++] = self.msgId;
        if(client.peerMode){
            iovec[i] = new Buffer(1);
            iovec[i++].writeInt8(self.senderLen, 0);
            iovec[i++] = self.sender;
            iovec[i] = new Buffer(1);
            iovec[i++].writeInt8(self.numHops,0);
            var hops = new EnhancedBuffer(self.numHops * 4);
            for(var j=0; j<self.numHops; j++){
                hops.write(new Buffer(self.hops[j]));
            }
            iovec[i++] = hops.buffer;
        }
        iovec[i] = new Buffer(4);
        iovec[i++].writeInt32BE(self.payloadLen, 0);
        iovec[i++] = self.payload;

        self.iovec = iovec;
    }
    // TODO: See if faster with one buffer
    client.dataWrite(Buffer.concat(self.iovec), callback);
};

module.exports = FqMessage;
