/**
 *
 * @brief: command line interface mp3 player based on Node.js
 * @author: [turingou](http://guoyu.me)
 * @created: [2013/07/20]
 *
 **/

var fs = require('fs');
var util = require('util');
var path = require('path');
var events = require('events');
var lame = require('lame');
var Speaker = require('speaker');
var http = require('http');
var https = require('https');
var helper = require('./helper');

/**
 * 播放器构造函数
 */
var Player = function (songs, options) {
  events.EventEmitter.call(this);
  this.currentIndex = -1;
  this.list = songs || [];
  options = options || {};
  this.mode = options.mode || 'loop';
  this.downloads = options.downloads || path.join(helper.getUserHome(), '_player');
};

// 继承EventEmitter
util.inherits(Player, events.EventEmitter);

// 播放
Player.prototype.play = function () {
  var self = this;
  var src = self.nextSong();
  if (!src) {
    // 演出结束
    self.emit('finish');
    self.currentIndex = -1;
    return;
  }
  self.read(src, function (readable) {
    var decoder = new lame.Decoder();
    var speaker = new Speaker();
    self.currentDecoder = decoder;
    self.currentSpeaker = speaker;
    self.currentStream = readable;
    readable.pipe(decoder).pipe(speaker);
    self.emit('playing', src);

    speaker.on('close', function () {
      self.emit('playend', src);
      // 继续播放
      self.play();
    });

    readable.on('error', function (err) {
      self.emit('error', err);
      // 继续播放
      self.play();
    });
  });
};

Player.prototype.next = function () {
  this.stop();
  this.play();
};

Player.prototype.nextSong = function () {
  switch (this.mode) {
  case 'loop':
    this.currentIndex++;
    if (this.currentIndex >= this.list.length) {
      this.currentIndex = 0;
    }
    break;
  case 'random':
    this.currentIndex = Math.floor(Math.random() * this.list.length);
    break;
  case 'order':
    this.currentIndex++;
  }
  return this.list[this.currentIndex];
};

/**
 * 添加新歌
 */
Player.prototype.add = function(song) {
  this.list.push(song);
};

/**
 * 添加目录
 */
Player.prototype.addFolder = function(folder, callback) {
  var self = this;
  fs.readdir(folder, function (err, files) {
    if (err) {
      return callback(err);
    }
    files.forEach(function (item) {
      if (path.extname(item) === '.mp3') {
        self.add(path.join(folder, item));
      }
    });
    callback(null);
  });
};

/**
 * 停止当前歌曲
 */
Player.prototype.stop = function() {
  if (this.currentSpeaker) {
    this.currentSpeaker.removeAllListeners('close');
    this.currentSpeaker.end();
  }
};

/**
 * 下载歌曲
 */
Player.prototype.download = function (src, cached, callback) {
  var self = this;
  self.emit('downloading', src);
  var urllib = src.indexOf('https') !== -1 ? https : http;
  urllib.get(src, function (readable) {
    // 创建只写流
    var writable = fs.createWriteStream(cached);
    // 管道
    readable.pipe(writable);

    // 错误事件
    writable.on('error', function (err) {
      self.emit('error', err);
    });

    readable.on('end', function () {
      self.emit('downloaded', src);
    });
    // 返回网络流
    callback(readable);
  });
};

/**
 * 从src读取内容，如果是网络内容，返回网络下载流；如果是磁盘文件，返回只读流
 */
Player.prototype.read = function (src, callback) {
  // 从磁盘读
  if (src.indexOf('http') === -1) {
    return callback(fs.createReadStream(src));
  }
  var self = this;
  // 获取文件名
  var filename = helper.fetchName(src);
  // 缓存的目标文件名
  var cached = path.join(self.downloads, filename);
  fs.exists(cached, function (exists) {
    if (exists) {
      // 从本地播放
      return callback(fs.createReadStream(cached));
    }
    // 从网络下载
    self.download(src, cached, callback);
  });
};

module.exports = Player;
