'use strict';

let ingestion = require('./firehose-image-processor.js');

// TODO: Add a recent S3 event object here (needs to refer to nodes present in the repository)
var s3Event = {};

// run the tests
console.log("Running tests...");

// TODO: Add the public IP/host name and password of the repository
process.env.REPO_HOST = "";
process.env.REPO_PASSWORD = "";

// TODO: instantiate client in image-processor function using:
// const rekognition = new aws.Rekognition({region: 'eu-west-1'});

// execute the handler
ingestion.handler(s3Event, {}, function(error, result) {
    if (error) {
        console.log("FAILED: " + error);
    } else {
        console.log("SUCCESS: " + result);
    }
});