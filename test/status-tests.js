var FqClient = require('../lib/client');

module.exports = {
    setUp : function(callback){
        var self = this;
        var client = new FqClient();
        client.connect();
        client.on('ready', function(){
            self.client = client;
            callback();
        });
    },
    tearDown : function(callback){
        this.client.shutdown();
        callback();
    },
    'status': function(test){
        test.expect(3);
        var client = this.client;
        client.publish({
            msgId: process.pid,
            route: 'testfooroute',
            sender: 'node-fq',
            exchange: 'testfooexchange',
            payload: 'foobarbaz'
        }, function(err, success){
            setTimeout(function() {
                client.status(function(err,status){
                    test.ok(!err,'error');
                    test.ok(status, 'no status');
                    test.equal(status.msgs_in, 1, 'msgs_in != 1');
                    test.done();
                })
            }, 500);
        });
    }
};
