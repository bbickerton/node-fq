var FqClient = require('../lib/client');

var opts = {
    ex: 'footest',
    prog: 'prefix:"test.prefix." sample(1)',
    pm: 0
};

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
    'bind': function(test){
        test.expect(3);
        var client = this.client;
        client.bind(opts.ex, opts.prog, opts.pm, function(err, binding){
            test.ok(!err, 'error');
            test.ok(binding, 'binding returned');
            test.equal(typeof binding, 'number', 'binding is number');
            test.done();
        });
    },
    'unbind': function(test){
        var client = this.client;
        test.expect(2);
        var client = this.client;
        client.bind(opts.ex, opts.prog, opts.pm, function(err, binding){
            client.unbind(function(err, success){
                test.ok(!err, 'error');
                test.ok(success, 'unbinding success');
                test.done();
            });
        });
    }
};
