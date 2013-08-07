var FqClient = require('../lib/client');

exports['Connecting with wrong parameters'] = function(test){
    test.expect(1);
    var client = new FqClient({host:'foo', port:1234});
    client.connect();
    client.on('connect', function(){
        test.ok(false,'connect');
        client.shutdown();
        test.done();
    });
    client.on('error', function(e){
        test.ok(e instanceof Error, 'error');
        client.shutdown();
        test.done();
    });
};

exports['Connecting with correct parameters'] = function(test){
    test.expect(1);
    var client = new FqClient({host:'localhost', port:8765});
    client.connect();
    client.on('connect', function(){
        test.ok(true, 'error');
    });

    client.on('ready', function(){
        client.shutdown();
        test.done();
    });

    client.on('error', function(e){
        console.log('err');
        test.ok(false, 'error');
        client.shutdown();
        test.done();
    });
};

exports['Connecting with no parameters'] = function(test){
    test.expect(1);
    var client = new FqClient();
    client.connect();
    client.on('connect', function(){
        test.ok(true, 'error');
    });

    client.on('ready', function(){
        client.shutdown();
        test.done();
    });

    client.on('error', function(e){
        console.log('err');
        test.ok(false, 'error');
        client.shutdown();
        test.done();
    });
};

