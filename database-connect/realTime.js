/*
#     CloudBoost - Core Engine that powers Bakend as a Service
#     (c) 2014 HackerBay, Inc.
#     CloudBoost may be freely distributed under the Apache 2 License
*/

module.exports = function(io) {

    var g = {};
    io.use(function(socket, next) {
        next();
    });
    io.on('connection', function(socket) {

        try {
            socket.on('app-init', function(data) {
                try {
                    socket.join(data);
                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            /* Custom Channel Listeners. */

            socket.on('join-custom-channel', function(data) {
                try {
                    console.log('++++++++ Joined Realtime Channel+++++');
                    console.log(data);
                    socket.join(data);

                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            socket.on('socket-disconnect', function(data) {
                try {
                    socket.disconnect();
                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            socket.on('leave-custom-channel', function(data) {
                try {
                    console.log('++++++++ Left Realtime Channel+++++');
                    console.log(data);
                    socket.leave(data);
                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            socket.on('publish-custom-channel', function(data) {
                try {
                    console.log('++++++++ Publish Realtime Channel+++++');
                    console.log(data);
                    //if this doucment is an instance of a table Object.
                    var roomSockets = io.to(data.channel);
                    var sockets = roomSockets.sockets;

                    if (typeof sockets === "object") {
                        for (var key in sockets) {
                            if (sockets[key]) {
                                sockets[key].emit(data.channel, data.data);
                            }
                        }
                    }

                    io.emit(data.channel, data.data);

                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            /* CloudObject Channel Listeners. */
            socket.on('join-object-channel', function(data) {
                try {
                    console.log('++++++++ Joined Object Realtime Channel+++++');
                    console.log(data);

                    if (typeof data === 'string') { // Backward Compatibility : data only has the room id
                        socket.join(data);
                    } else { //data has both the room id and the sessionId.
                        socket.join(data.room);
                        //connect socket.id and sessionId together
                        global.socketQueryHelper.setData(socket.id, data.data);
                        global.socketSessionHelper.saveSession(socket.id, data.sessionId);
                    }
                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            socket.on('leave-object-channel', function(data) {
                try {
                    console.log('++++++++ Leave Object Realtime Channel+++++');
                    console.log(data);
                    global.socketQueryHelper.getData(socket.id, data.eventType, function(err, socketData) {
                        if (err)
                            throw err;
                        else {
                            socket.leave(data.event + socketData.timestamp);
                            socket.emit('leave' + data.event + data.timestamp, socketData.timestamp); //to removeAlListeners
                            global.socketQueryHelper.deleteData(socket.id, data.event);
                        }
                    });
                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

            socket.on('disconnect', function() {
                try {
                    global.socketSessionHelper.deleteSession(socket.id); //deletes the lnk between this socket and session.
                } catch (e) {
                    global.winston.log('error', {
                        "error": String(e),
                        "stack": new Error().stack
                    });
                }
            });

        } catch (e) {
            global.winston.log('error', {
                "error": String(e),
                "stack": new Error().stack
            });
        }

    });

    g.sendObjectNotification = function(appId, document, eventType, isMasterKey) {
        //pass masterkey to access events as default ACL for event R/W is set to false
        try {
            //event type can be created, updated, deleted.
            if (document && document._tableName) {
                console.log('++++++++ Sending Realtime Object Notification+++++');
                console.log(eventType + ' event');
                console.log(document);
                //if this doucment is an instance of a table Object.
                var roomSockets = io.to(appId.toLowerCase() + 'table' + document._tableName.toLowerCase() + eventType.toLowerCase());
                var sockets = roomSockets.sockets;

                var promises = [];

                //check for ACL and then send.

                if (typeof sockets === "object") {
                    for (var key in sockets) {
                        if (sockets[key]) {
                            promises.push(_sendNotification(appId, document, sockets[key], eventType, isMasterKey));
                        }
                    }
                } else {
                    for (var i = 0; i < sockets.length; i++) {
                        var socket = sockets[i];
                        promises.push(_sendNotification(appId, document, socket, eventType, isMasterKey));
                    }
                }

                global.q.all(promises).then(function() {
                    console.log("Notifications Sent");
                }, function() {
                    console.log("Error on sending Notifications");
                });
            }
        } catch (e) {
            global.winston.log('error', {
                "error": String(e),
                "stack": new Error().stack
            });
        }
    };

    return g;

};

/**
 */

function _sendNotification(appId, document, socket, eventType, isMasterKey) {
    //pass masterkey to access events as default ACL for event R/W is set to false
    var deferred = global.q.defer();
    try {
        global.socketSessionHelper.getSession(socket.id, function(err, session) {
            if (err) {
                deferred.reject();
            }
            if (!session || global.aclHelper.isAllowedReadAccess(session.userId, session.roles, document.ACL) || isMasterKey) {
                global.socketQueryHelper.getData(socket.id, eventType, function(err, socketData) {
                    var socketQueryValidate = true;
                    if (socketData && socketData.query)
                        socketQueryValidate = global.socketQueryHelper.validateSocketQuery(document, socketData.query.query);
                    if (socketQueryValidate) {
                        if (!socketData)
                            socketData = {
                                timestamp: ''
                            };
                        console.log(appId.toLowerCase() + 'table' + document._tableName.toLowerCase() + eventType.toLowerCase() + socketData.timestamp)
                        socket.emit(appId.toLowerCase() + 'table' + document._tableName.toLowerCase() + eventType.toLowerCase() + socketData.timestamp, JSON.stringify(document));
                        console.log("Socket Emited.", document);
                    } else {
                        console.log('Socket Query doesn\'t satsfies the current document');
                    }
                    deferred.resolve();
                });
            } else {
                console.log("JUST RESOLVED");
                deferred.resolve();
            }
        });
    } catch (e) {
        global.winston.log('error', {
            "error": String(e),
            "stack": new Error().stack
        });
        deferred.reject(e);
    }
    return deferred.promise;
}
