'use strict';

let ingestion = require('./firehose-image-processor.js');

// TODO: Add a recent S3 event object here (needs to refer to nodes present in the repository)
var s3Event = {};

// run the tests
console.log("Running tests...");

// TODO: Add the public IP/host name of the repository
process.env.REPO_HOST = "";

// execute the handler
ingestion.handler(s3Event, {}, function(error, result) {
    if (error) {
        console.log("FAILED: " + error);
    } else {
        console.log("SUCCESS: " + result);
    }
});