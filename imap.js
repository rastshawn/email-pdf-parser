var Imap = require('imap'),
    inspect = require('util').inspect;
var fs = require('fs');
var account = require('./account');
var base64 = require('base64-stream');
var imap = new Imap({
  user: account.user,
  password: account.password,
  host: 'imap.gmail.com',
  port: 993,
  tls: true
});

var spawn = require('child_process').spawn;

function openInbox(cb) {
  imap.openBox('OPD', true, cb);
}

messages = [];
function findAttachmentParts(struct, attachments) {
  attachments = attachments ||  [];
  for (var i = 0, len = struct.length, r; i < len; ++i) {
    if (Array.isArray(struct[i])) {
      findAttachmentParts(struct[i], attachments);
    } else {
      if (struct[i].disposition && ['INLINE', 'ATTACHMENT'].indexOf(toUpper(struct[i].disposition.type)) > -1) {
        attachments.push(struct[i]);
      }
    }
  }
  return attachments;
}
function toUpper(thing) { return thing && thing.toUpperCase ? thing.toUpperCase() : thing;}
function buildAttMessageFunction(attachment) {
  var filename = attachment.params.name;
  var encoding = attachment.encoding;

  return function (msg, seqno) {
    var prefix = '(#' + seqno + ') ';
    msg.on('body', function(stream, info) {
      //Create a write stream so that we can stream the attachment to file;
      console.log(prefix + 'Streaming this attachment to file', filename, info);
      var writeStream = fs.createWriteStream(filename);
      writeStream.on('finish', function() {
        console.log(prefix + 'Done writing to file %s', filename);
        const pdfLauncher = spawn('./pdfLaunch.sh', [filename]);
        pdfLauncher.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

      });

      //stream.pipe(writeStream); this would write base64 data to the file.
      //so we decode during streaming using 
      if (toUpper(encoding) === 'BASE64') {
        //the stream is base64 encoded, so here the stream is decode on the fly and piped to the write stream (file)
        stream.pipe(base64.decode()).pipe(writeStream);
      } else  {
        //here we have none or some other decoding streamed directly to the file which renders it useless probably
        stream.pipe(writeStream);
      }
    });
    msg.once('end', function() {
      console.log(prefix + 'Finished attachment %s', filename);
    });
  };
}

imap.once('ready', function() {
  openInbox(function(err, box) {
    if (err) throw err;
    var f = imap.seq.fetch('1:*', {
      bodies: ['HEADER'],
      struct: true
    });
  f.on('message', function(msg, seqno) {
    console.log('Message #%d', seqno);
    var prefix = '(#' + seqno + ') ';
    var message = {
            body : "",
            subject : "",
            sender: ""
        };

    msg.on('body', function(stream, info) {
              var buffer = '', count = 0;
      stream.on('data', function(chunk) {
        count += chunk.length;
        buffer += chunk.toString('utf8');
      });
      stream.once('end', function() {
        if (info.which === 'TEXT') {
            message.body = buffer;
            if (message.sender != "") {
                messages.push(message);
            }
        }
        if (info.which !== 'TEXT'){
            var header = Imap.parseHeader(buffer);
            console.log(header);
            message.sender = header.from[0];
            message.subject = header.subject[0];
            if (message.body != "") {
                messages.push(message);
            }
        }

        console.log(msg);
      });
    });

    msg.once('attributes', function(attrs) {
   var attachments = findAttachmentParts(attrs.struct);
        console.log(prefix + 'Has attachments: %d', attachments.length);
        for (var i = 0, len=attachments.length ; i < len; ++i) {
          var attachment = attachments[i];
          /*This is how each attachment looks like {
              partID: '2',
              type: 'application',
              subtype: 'octet-stream',
              params: { name: 'file-name.ext' },
              id: null,
              description: null,
              encoding: 'BASE64',
              size: 44952,
              md5: null,
              disposition: { type: 'ATTACHMENT', params: { filename: 'file-name.ext' } },
              language: null
            }
          */
          console.log(prefix + 'Fetching attachment %s', attachment.params.name);
          var f = imap.fetch(attrs.uid , { //do not use imap.seq.fetch here
            bodies: [attachment.partID],
            struct: true
          });
          //build function to process attachment message
          f.on('message', buildAttMessageFunction(attachment));
        } 
	});
   
  });
  f.once('error', function(err) {
    console.log('Fetch error: ' + err);
  });
  f.once('end', function() {
    console.log('Done fetching all messages!');
    imap.end();
    console.log(messages);
  });
});
});
imap.once('error', function(err) {
  console.log(err);
});

imap.once('end', function() {
  console.log('Connection ended');
});

imap.connect();

