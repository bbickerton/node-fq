function EnhancedBuffer(input, encoding){
    this.buffer = (input instanceof Buffer) ? input : new Buffer(input, encoding);
    this.offset = 0;
}

// Write/copy bits directly from a buffer
EnhancedBuffer.prototype.write = function(source){
    source.copy(this.buffer,this.offset);
    this.offset += source.length;
};

// Use this one when writing values of the form 0xc7a7
EnhancedBuffer.prototype.writeUInt16BE = function(val){
    this.buffer.writeUInt16BE(val, this.offset);
    this.offset += 2;
};

EnhancedBuffer.prototype.writeUInt32BE = function(val){
    this.buffer.writeUInt32BE(val, this.offset);
    this.offset += 4;
};

EnhancedBuffer.prototype.writeInt16BE = function(val){
    this.buffer.writeInt16BE(val, this.offset);
    this.offset += 2;
};

EnhancedBuffer.prototype.writeInt32BE = function(val){
    this.buffer.writeInt32BE(val, this.offset);
    this.offset += 4;
};

EnhancedBuffer.prototype.writeInt8 = function(val){
    this.buffer.writeInt8(val, this.offset);
    this.offset += 1;
};

EnhancedBuffer.prototype.position = function(offset){
    this.offset = offset;
};

EnhancedBuffer.prototype.read = function(size){
    size = size || 1;

    if(this.remaining() < size) return null;

    var buff = this.buffer.slice(this.offset, this.offset + size);
    this.offset += size;
    return buff;
};

EnhancedBuffer.prototype.remaining = function(){
    return this.buffer.length - this.offset;
};

module.exports = EnhancedBuffer;
