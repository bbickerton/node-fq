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

function EnhancedBuffer(input, encoding){
    this.buffer = (input instanceof Buffer) ? input : new Buffer(input, encoding);
    this.offset = 0;
}

// Write/copy bits directly from a buffer
EnhancedBuffer.prototype.write = function(source){
    // For buffers ~ 75 bytes and below, a for-loop performs better than the
    // Buffer.copy method
    if(source.length > 75){
        source.copy(this.buffer,this.offset);
    } else {
        var buff = this.buffer;
        var off = this.offset;
        for(var i = 0, len = source.length; i < len; i++){
            this.buffer[off++] = source[i];
        }
    }
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
