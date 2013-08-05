var util = require('util');
var EventEmitter = require('events').EventEmitter;
var net = require('net');

function ConnectionPair(host, port, reconnectMs){
    this.host = host || 'localhost';
    this.port = port || 8765;

    this.dataSocket = null;
    this.cmdSocket = null;

    this.cmdHighWaterMark = 262144;
    this.dataHighWaterMark = 262144;

    this.reconnectMs = (reconnectMs) ? reconnectMs : 1000;
    this.reconnectTimer = null;
}
util.inherits(ConnectionPair, EventEmitter);

ConnectionPair.prototype.connect = function(){
    var self = this;

    var params = {
        host: self.host,
        port: self.port,
        highWaterMark: self.highWaterMark
    };

    self.cmdSocket = net.connect(params);
    self.dataSocket = net.connect(params);

    // Wait until both are connected to emit 
    pairEvents(self, 'connect', 2, function(){
        self.reconnectTimer = null;
    });
    // Only emit on the first since we will destroy/reconnect the pair
    pairEvents(self, 'end', 1, self.reconnect.bind(self));
    pairEvents(self, 'close', 1, self.reconnect.bind(self));
    pairEvents(self, 'error', 1, self.reconnect.bind(self));
};

ConnectionPair.prototype.reconnect = function(){
    var self = this;
    // Only have one reconnect flow at a time
    if(self.reconnectingTimer && self.reconnectingTimer.ontimeout !== null){
        return;
    }

    // Get a clean slate
    self.disconnect();

    // Schedule a connect based on the reconnect
    if(self.reconnect){
        self.reconnectTimer =
            setTimeout(self.connect.bind(self), self.reconnectMs);
        self.emit('reconnecting');
        return true;
    } else {
        return false;
    }
};

ConnectionPair.prototype.disconnect = function(){
    // Destroy any open sockets, but remove listners so we don't trigger
    // another restart
    if(this.cmdSocket){
        this.cmdSocket.removeAllListeners();
        this.cmdSocket.destroy();
        this.cmdSocket = null;
    }
    if(this.dataSocket){
        this.dataSocket.removeAllListeners();
        this.dataSocket.destroy();
        this.dataSocket = null;
    }

    return;
};

function pairEvents(pair, eventName, mode, callback){
    // Mode dictates how to combine the two
    // 0 - emit on either
    // 1 - emit on first only
    // 2 - emit after both
    var method = null;

    if(mode === 2){
        var tracker = {
            cmd: false,
            data: false
        };
        method = function(type){
            return function(data){
                tracker[type] = true;
                if(tracker.cmd && tracker.data){
                    pair.emit(eventName, data);
                    if(callback){
                        callback(data);
                    }
                }
            };
        };

        pair.cmdSocket.on(eventName, method('cmd'));
        pair.dataSocket.on(eventName, method('data'));
        return true;
    }

    if(mode === 0){
        method = function(data){
            pair.emit(eventName, data);
            if(callback){
                callback(data);
            }
        };
    } else if(mode === 1){
        var emitted = false;
        method = function(data){
            if(emitted){
                return;
            }
            pair.emit(eventName, data);
            if(callback){
                callback(data);
            }
        };
    }

    if(!method){
        return false;
    }
    pair.cmdSocket.on(eventName, method);
    pair.dataSocket.on(eventName, method);
    return true;
}

module.exports = ConnectionPair;
