const dgram = require("dgram");
const net = require("net");
const crypto = require("crypto");
const Builder = require("./Builder");
const Parser = require("./Parser");
const SDPParser = require("./SDPParser");
const Dialog = require("./Dialog");
const SIPMessage = require("./SIPMessage");
const Transaction = require("./Transaction");
const os = require("os");
const EventEmitter = require('events');

const Logger = require('./logger');
const logger = new Logger('SIP');

const generateCallid = () => {
  const branchId = Math.floor(Math.random() * 10000000000000);
  return `${branchId}`;
};

class Listener {
  constructor() {

  }
}

class SIP {
  constructor(props) {
    props = (typeof props !== 'undefined') ? props : {};
    this.ip = (typeof props.ip !== 'undefined') ? props.ip : "";
    this.listen_ip = (typeof props.listen_ip !== 'undefined') ? props.listen_ip : "";
    this.listen_port = (typeof props.listen_port !== 'undefined') ? props.listen_port : 5060;
    this.port = (typeof props.port !== 'undefined') ? props.port : 5060;
    this.username = (typeof props.username !== 'undefined') ? props.username : "";
    this.password = (typeof props.password !== 'undefined') ? props.password : "";
    this.domain = (typeof props.domain !== 'undefined') ? props.domain : "";
    this.type = (typeof props.type !== 'undefined') ? props.type : "client";
    this.Socket = dgram.createSocket("udp4");
    this.callId = generateCallid();
    this.events = [];
    this.transactions = []
    this.message_stack = {};
    this.dialog_stack = {};
    this.NAT_TABLE = {}
    this.log_buffer = {}



    this.Socket.bind(this.listen_port, this.listen_ip)
    this.Listen()
    this.emitter = new EventEmitter();

    return this;
  }

  AddNATRoute(old_route, new_route) {
    this.NAT_TABLE[old_route] = new_route;
  }

  FixNAT(sip_message) {
    var s = Builder.Build(sip_message.message);
    for (var old in this.NAT_TABLE) {
      s = s.replace(new RegExp(old, 'g'), this.NAT_TABLE[old]);
    }
    return this.Message(Parser.parse(s))
  }

  push_to_stack(message) {
    if (typeof this.message_stack[message.tag] == 'undefined') {
      this.message_stack[message.tag] = [message];
    } else {
      this.message_stack[message.tag].push(message);
    }
  }

  push_to_dialog_stack(dialog) {
    this.dialog_stack[dialog.tag] = dialog;
  }

  DialogExists(tag) {
    return Object.keys(this.dialog_stack).includes(tag);
  }

  on(event, callback) {
    this.events[event] = callback;
  }

  ONMESSAGE(callback) {
    this.emitter.on('MESSAGE', (ev) => {
      callback(ev.toString())
    });
  }

  ONSENDMESSAGE(callback) {
    this.emitter.on('SENDMESSAGE', (ev) => {
      callback(ev.toString());
    })
  }

  Listen() {
    this.Socket.on('message', (res_message) => {
      var ret;
      var message = res_message.toString();
      if (message.length > 4) {
        var sipMessage = this.FixNAT(this.Message(message));
        var message_ev = sipMessage.message.isResponse ? String(sipMessage.message.statusCode) : sipMessage.message.method;
        this.push_to_stack(sipMessage);
        if (typeof this.dialog_stack[sipMessage.tag] !== 'undefined') {
          this.dialog_stack[sipMessage.tag].messages.push(sipMessage)
        }

        //this.emitter.emit('MESSAGE', Builder.Build(sipMessage.message));
        this.emitter.emit('MESSAGE', message)
        if (this.DialogExists(sipMessage.tag)) {
          var d = this.dialog_stack[sipMessage.tag];
          if (Object.keys(d.events).includes(message_ev)) {
            d.events[message_ev](sipMessage);
          }
          ret = d;
        } else {
          //if there is not dialog for this message create one with the first message in the stack
          this.Dialog(this.message_stack[sipMessage.tag][0]).then((dialog) => {
            ret = dialog;
          })

          if (Object.keys(this.events).includes(message_ev)) {
            this.events[message_ev](sipMessage);
          }
        }
        return ret;
      }
    })
    //setInterval(() => {}, 1000);
  }

  send(message, identity) {
    identity = (typeof identity !== 'undefined') ? identity : { ip: this.ip, port: this.port };
    message = typeof message.message !== 'undefined' ? message : this.Message(message);
    var constructed_message = typeof message === 'object' ? Builder.Build(message.message) : message;
    return new Promise((resolve) => {
      if (typeof identity.port !== 'undefined' && typeof identity.ip !== 'undefined') {
        let host = identity.ip;
        let port = Number(identity.port);

        this.Socket.send(constructed_message, 0, constructed_message.length, port, host, (error) => {
          if (!error) {
            this.push_to_stack(message);
            logger.d('Send: host: %s, port: %s, message: %s', host, port, message);
            if (typeof this.dialog_stack[message.tag] !== 'undefined') {
              this.dialog_stack[message.tag].messages.push(message)
            }
            this.emitter.emit("SENDMESSAGE", JSON.stringify({ message: constructed_message, identity: identity }))
          }
        });
      }
    });
  }

  Dialog(message) {
    return new Promise(resolve => {
      var dialog = new Dialog(this, message);
      resolve(dialog);
    })
  }

  Message(message) {
    return new SIPMessage(message);
  }

  Register(props) {
    if (typeof props !== 'object') {
      return Promise.reject({
        error: "props must be an object"
      });
    }
    this.username = props.username;
    this.password = props.password;

    let from = `<sip:${props.username}@${this.ip}>;tag=${Builder.generateBranch()}`;
    let to = `<sip:${props.username}@${this.ip}>`;

    if (this.domain) {
      from = `<sip:${props.username}@${this.domain}>;tag=${Builder.generateBranch()}`;
      to = `<sip:${props.username}@${this.domain}>`;
    }

    return new Promise(resolve => {
      var message = this.Message({
        isResponse: false,
        protocol: "SIP/2.0",
        method: "REGISTER",
        requestUri: `sip:${this.ip}:${this.port}`,
        headers: {
          'Via': `SIP/2.0/UDP ${this.listen_ip}:${this.listen_port};branch=${Builder.generateBranch()}`,
          'From': from,
          'To': to,
          'Call-ID': `${this.callId}@${this.listen_ip}`,
          'CSeq': `1 REGISTER`,
          'Contact': `<sip:${props.username}@${this.listen_ip}:${this.listen_port}>`,
          'Max-Forwards': '70',
          'User-Agent': 'Node.js SIP Library',
          'Content-Length': '0'
        },
        body: ''
      })
      this.send(message)

      this.Dialog(message).then(dialog => {
        dialog.on('401', (res) => {
          logger.d('on 401', res)
          var a = message.Authorize({
            username: this.username,
            password: this.password,
            domain: this.domain
          }, res); //generate authorized message from the original invite request
          this.send(a)
        })

        dialog.on('407', (res) => {
          logger.d('on 407', res)
          var a = message.Authorize({
            username: this.username,
            password: this.password,
            domain: this.domain
          }, res); //generate authorized message from the original invite request
          // this.send(a)
        })

        dialog.on('200', (res) => {
          logger.d('on 200', res)
          resolve(dialog);
        })
      })
    })
  }
}

module.exports = SIP
