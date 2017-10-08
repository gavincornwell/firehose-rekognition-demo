'use strict';

const aws = require('aws-sdk');
const http = require('http');

const s3 = new aws.S3({ apiVersion: '2006-03-01' });
const rekognition = new aws.Rekognition();

exports.handler = (event, context, callback) => {
    
    console.log('Received S3 event:', JSON.stringify(event, null, 2));

    // Get the object from the event and show its content type
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const params = {
        Bucket: bucket,
        Key: key,
    };
    s3.getObject(params, (err, data) => {
        if (err) {
            const message = `Error getting object ${key} from bucket ${bucket}. Make sure they exist and your bucket is in the same region as this function.`;
            console.log(message);
            callback(message);
        } else {
                
            var s3FileContent = data.Body.toString('utf8');
            console.log("S3 file content: " + s3FileContent);
        
            // the last element is empty due to trailing line feed so remove
            var allEvents = s3FileContent.split("\n");
            var alfrescoEvents = allEvents.slice(0, allEvents.length-1);
            console.log("alfrescoEvents: " + alfrescoEvents);
            console.log("Number of events: " + alfrescoEvents.length);
            var eventIndex = 0, successfulEvents = 0, failedEvents = 0;

            var processCallback = function(error, result) {
                // adjust counters
                if (error) {
                    failedEvents++;
                    console.log("Error: " + error);
                } else {
                    successfulEvents++;
                }
                
                eventIndex++;
                
                if (eventIndex < alfrescoEvents.length) {
                    // process the next event
                    processAlfrescoEvent(alfrescoEvents[eventIndex], processCallback);
                } else {
                    // output processing results and call main callback
                    const message = `Processed ${alfrescoEvents.length} events, ${successfulEvents} succeeded, ${failedEvents} failed.`;
                    console.log(message);
                    callback(null, message);
                }
            };
            
            // process the first event string
            processAlfrescoEvent(alfrescoEvents[eventIndex], processCallback);
        }
    });
};

var processAlfrescoEvent = function(alfEventString, callback) {
    
    // parse the event string into an object
    var alfEventJson;
    try {
        alfEventJson = JSON.parse(alfEventString);
        console.log("Processing alfresco event: ", alfEventJson);
    } catch (e) {
        callback(e);
        return;
    }

    // grab the node id
    var nodeId = alfEventJson.nodeId
    console.log("nodeId: " + nodeId);
    
    // grab the REPO_HOST and PASSWORD
    var repoHost = process.env.REPO_HOST;
    var repoPwd = process.env.REPO_PASSWORD;
    
    // get the content using REPO_URL
    var nodePath = "/alfresco/api/-default-/public/alfresco/versions/1/nodes/" + nodeId + "/content";
    console.log("retrieving content from: " + repoHost + nodePath);
    
    var options = {
        hostname: repoHost,
        path: nodePath,
        auth: "admin:" + repoPwd
    };
    
    const request = http.request(options, function (response) {
        var bytes = [];
        response.on('data', function (chunk) {
            bytes.push(chunk);
        });

        response.on('end', function () {
            console.log('Retrieved content with status: ' + response.statusCode);
            
            // call the rekognition API to get suggested labels using bytes of image
            var params = {
              Image: {
                Bytes: Buffer.concat(bytes)
              },
              MaxLabels: 25,
              MinConfidence: 75
            };
            
            console.log("Analysing image...");
            rekognition.detectLabels(params, function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    console.log("Successfully analysed image: " + JSON.stringify(data, null, 2));
                    
                    // iterate through labels to identify
                    var imageType, imageTypeDetected, label;
                    var labels = data.Labels;
                    for (var idx = 0; idx < labels.length; idx++) {
                        imageTypeDetected = false;
                        label = labels[idx];

                        switch (label.Name) {
                            case "Car":
                                imageType = "Car";
                                imageTypeDetected = true;
                                break;
                            case "Motorcycle":
                                imageType = "Motorcycle";
                                imageTypeDetected = true;
                                break;
                            case "Boat":
                                imageType = "Boat";
                                imageTypeDetected = true;
                                break;
                            case "Electronics":
                                imageType = "Electronics";
                                imageTypeDetected = true;
                                break;
                            case "Jewelry":
                                imageType = "Jewelry";
                                imageTypeDetected = true;
                                break;
                            case "Wristwatch":
                                imageType = "Wristwatch";
                                imageTypeDetected = true;
                                break;
                            case "Clock":
                                imageType = "Clock";
                                imageTypeDetected = true;
                                break;
                            case "Bicycle":
                                imageType = "Bicycle";
                                imageTypeDetected = true;
                                break;
                            case "Sport":
                                imageType = "Sport";
                                imageTypeDetected = true;
                                break;
                            case "Furniture":
                                imageType = "Furniture";
                                imageTypeDetected = true;
                                break;
                            default:
                                imageType = "Unknown";
                        }

                        // break if the image has been identified
                        if (imageTypeDetected) {
                            break;
                        }
                    }
                    
                    // call the REST API to set metadata appropriately
                    var nodeInfoPath = "/alfresco/api/-default-/public/alfresco/versions/1/nodes/" + nodeId;
                    var options = {
                        hostname: repoHost,
                        path: nodeInfoPath,
                        method: "PUT",
                        auth: "admin:" + repoPwd,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    };
                    
                    // define the update request
                    const updateRequest = http.request(options, function (updateResponse) {
                        var bytes = [];
                        updateResponse.on('data', function (chunk) {
                            bytes.push(chunk);
                        });

                        updateResponse.on('end', function () {
                            console.log("Successfully updated image with status: " + updateResponse.statusCode);
                            callback(null, "Processing alfresco event complete");
                        });
                    });
                    
                    // update request error handler
                    updateRequest.on('error', function (err) {
                        console.log("Failed to update image: " + err);
                        callback(err);
                    });
                    
                    // update body appropriately
                    var updateBody = {
                        nodeType: "acme:insuranceClaimImage",
                        properties: {
                            "acme:imageId": Date.now(),
                            "acme:claimType": imageType
                        }
                    };
                    
                    // execute the update request
                    var updateBodyString = JSON.stringify(updateBody);
                    console.log("Updating image '" + nodeId + "' with: " + updateBodyString);
                    updateRequest.write(updateBodyString);
                    updateRequest.end();
                }
            });
        });
    });
    
    // content request error handler
    request.on('error', function (err) {
        callback(err);
    });
    
    // make the remote call to get the content
    request.end();
};