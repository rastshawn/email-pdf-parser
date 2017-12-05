var fs = require('fs');
var pdf = require('pdf2json');
var pdfParser = new pdf(this, 1);
   pdfParser.on("pdfParser_dataReady", pdfData => {
        //pdfData.pipe(process.stdout);
        console.log(pdfParser.getRawTextContent());
        //fs.writeFile("content.txt", pdfParser.getRawTextContent());
    });

pdfParser.loadPDF('./' + process.argv[2]);
