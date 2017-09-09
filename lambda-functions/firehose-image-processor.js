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
                    
                    var isCar = false;
                    var isMotorcycle = false;
                    var isBicycle = false;
                    
                    var labels = data.Labels;
                    labels.forEach(function(entry) {
                        if (entry.Name == "Car") {
                            isCar = true;
                        } else if (entry.Name == "Motorcycle") {
                            isMotorcycle = true;
                        } else if (entry.Name == "Bicycle") {
                            isBicycle = true;
                        }
                    });
                    
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
                    
                    var updateBody = {
                        nodeType: "acme:insuranceClaimImage",
                        properties: {
                            "acme:imageId": Date.now()
                        }
                    };
                    
                    // update body appropriately
                    if (isCar) {
                        updateBody.properties["acme:claimType"] = "Car";
                    } else if (isMotorcycle) {
                        updateBody.properties["acme:claimType"] = "Motorcycle";
                    } else if (isBicycle) {
                        updateBody.properties["acme:claimType"] = "Bicycle";
                    } else {
                        // add the missing property aspect, note: ideally here
                        // we would retrieve the latest version of the node to
                        // get the current aspect names
                        var aspects = [
                            "rn:renditioned",
                            "cm:versionable",
                            "cm:titled",
                            "cm:auditable",
                            "cm:author",
                            "cm:thumbnailModification",
                            "exif:exif",
                            "acme:missingClaimTypeProperty"
                            ];
                        updateBody.aspectNames = aspects;
                    }
                    
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