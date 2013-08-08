var FqClient = require('../lib/client');

var opts = {
    exc: 'testfooexchange',
    p: 'prefix:"test.prefix." sample(1)',
    pm: 0
};

module.exports = {
    setUp : function(callback){
        var self = this;
        var clientSender = new FqClient();
        clientSender.connect();
        clientSender.on('ready', function(){
            self.clientSender = clientSender;
            var clientReceiver = new FqClient();
            clientReceiver.connect();
            clientReceiver.on('ready', function(){
                clientReceiver.bind(opts.exc, opts.p, opts.pm, function(){
console.log('bound');
                    clientReceiver.consume();
                    self.clientReceiver = clientReceiver;
                    callback();
                });
            });
        });

    },
    tearDown : function(callback){
        this.clientReceiver.shutdown();
        this.clientSender.shutdown();
        callback();
    },
    'receive': function(test){
        test.expect(2);
        this.clientReceiver.on('message', function(m){
            test.ok(m, 'no message received');
            test.equal(m.payload.toString(), 'foobarbaz', 'payload');
            test.done();
        });
        this.clientSender.publish({
            msgId: process.pid,
            route: 'test.prefix.foo',
            sender: 'node-fq',
            exchange: opts.exc,
            payload: 'foobarbaz'
        }, function(err, success){});
    }
};
