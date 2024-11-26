const path = require('path');

const SIP = require("../../SIP.js");
// const SIPMessage = require("../../SIPMessage.js");
const SDPParser = require("../../SDPParser.js");
// const Parser = require("../../Parser.js");
const Builder = require("../../Builder.js");
const STREAMER = require("./Stream.js")
// const RTPListen = require("./RTPListen.js")
const Converter = require("./Converter.js")
const UTILS = require("../../UTILS.js")
const uuid = require('uuid');

const asteriskDOMAIN = 'test.domain.com';
const clientIP = UTILS.getLocalIpAddress();
const clientPort = 6420
const username = '9998'
const password = '123456';

var Client = new SIP({
    ip: '192.168.1.80',
    port: 6060,
    listen_ip: '192.168.1.241',
    listen_port: clientPort,
    domain: 'test.domain.com'
});

Client.Register({ username: username, password: password }).then(dialog => {
    console.log("REGISTERED")
    call('9999')
    new Converter().convert('song.mp3', 'output_song.wav','ulaw').then(() => {
        console.log('Conversion complete')
    })
})

//receive a call
Client.on('INVITE', (res) => {
    console.log("Received INVITE")
    var d = Client.Dialog(res).then(dialog => {

        Client.send(res.CreateResponse(100))
        Client.send(res.CreateResponse(180))

        var port = SDPParser.parse(res.message.body).media[0].port
        var ip = SDPParser.parse(res.message.body).session.origin.split(' ')[5]
        var s = new STREAMER(path.join(__dirname, 'output_song.wav'), ip, port, 'ulaw')

        s.start(res.message.headers['User-Agent']).then(sdp => {
            var ok = res.CreateResponse(200)
            ok.body = sdp
            Client.send(ok)
            // new_listener('test', 21214);
        })

        dialog.on('BYE', (res) => {
            console.log("BYE")
            res.message.headers['Cseq'] = res.message.headers['CSeq'].split(' ')[0] + ' BYE'
            Client.send(res.CreateResponse(200))
            // dialog.kill()
        })

        dialog.on('CANCEL', (res) => {
            console.log(res.headers)
            console.log(`CANCEL from ${res.headers.From.contact.username} at: ${res.headers.Via.uri.ip}:${res.headers.Via.uri.port}`)
            Client.send(res.CreateResponse(200))
        })
    })
})

//function to make a call
var call = (extension) => {
    var media;
    var message = Client.Message({
        isResponse: false,
        protocol: "SIP/2.0",
        method: "INVITE",
        requestUri: `sip:${extension}@${asteriskDOMAIN}`,
        headers: {
            'Via': `SIP/2.0/UDP ${clientIP}:${clientPort};branch=${Builder.generateBranch()}`,
            'From': `<sip:${username}@${asteriskDOMAIN}>;tag=${Builder.generateBranch()}`,
            'To': `<sip:${extension}@${asteriskDOMAIN}>`,
            // 'Call-ID': `${Builder.generateBranch()}@${clientIP}`,
            'Call-ID': uuid.v4(),
            'CSeq': `1 INVITE`,
            'Contact': `<sip:${username}@${clientIP}:${clientPort}>`,
            'Max-Forwards': '70',
            'User-Agent': 'Node.js SIP Library',
            'Content-Type': 'application/sdp',
            'Content-Length': '0'
        },
        body: ''
    })

    Client.send(message)

    var d = Client.Dialog(message).then(dialog => {
        dialog.on('401', (res) => {
            var a = message.Authorize(res); //generate authorized message from the original invite request
            console.log(`authorize message for ${extension}`)
            Client.send(a)
        })

        dialog.on('200', (res) => {
            console.log(`200 OK ext: ${extension}`)
            Client.send(res.CreateResponse(200))
        })

        dialog.on('INVITE', (res) => {
            console.log(`INVITE from ${extension}`)
            //media.start()
        })

        dialog.on('180', (res) => {
            console.log(`Ringing ${extension}`)
        })
    })
}
