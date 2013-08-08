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
    'send': function(test){
        test.expect(1);
        var client = this.client;
        client.publish({
            msgId: process.pid,
            route: 'testfooroute',
            sender: 'node-fq',
            exchange: 'testfooexchange',
            payload: 'foobarbaz'
        }, function(err, success){
            test.ok(!err, 'error');
            test.done();
        });
    }
};
