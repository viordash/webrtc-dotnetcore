"use strict";

var connection = new signalR.HubConnectionBuilder().withUrl("/WebRTCHub").build();

/****************************************************************************
* Initial setup
****************************************************************************/

let peerConn;

const roomNameTxt = document.getElementById('roomNameTxt');
const edStunAddress = document.getElementById('edStunAddress');
const edStunUsername = document.getElementById('edStunUsername');
const edStunPassword = document.getElementById('edStunPassword');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomTable = document.getElementById('roomTable');
const connectionStatusMessage = document.getElementById('connectionStatusMessage');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let myRoomId;
let myStunAddress;
let myStunUsername;
let myStunPassword;
let localStream;
let remoteStream;
let isInitiator = false;
let hasRoomJoined = false;


$(roomTable).DataTable({
    columns: [
        { data: 'RoomId', "width": "5%" },
        { data: 'Name', "width": "30%" },
        { data: 'StunAddress', "width": "50%" },
        { data: 'StunUsername', "width": "5%" },
        { data: 'Button', "width": "10%" }
    ],
    "lengthChange": false,
    "searching": false,
    "language": {
        "emptyTable": "No room available"
    }
});

/****************************************************************************
* Signaling server
****************************************************************************/

// Connect to the signaling server
connection.start().then(function () {

    connection.on('updateRoom', function (data) {
        var obj = JSON.parse(data);
        $(roomTable).DataTable().clear().rows.add(obj).draw();
    });

    connection.on('created', function (roomId) {
        console.log('Created room', roomId);
        roomNameTxt.disabled = true;
        edStunAddress.disabled = true;
        edStunUsername.disabled = true;
        edStunPassword.disabled = true;
        createRoomBtn.disabled = true;
        hasRoomJoined = true;
        connectionStatusMessage.innerText = 'You created Room ' + roomId + '. Waiting for participants...';
        myRoomId = roomId;
        var data = $(roomTable).DataTable().data().filter((item, index) => item.RoomId === roomId)[0];
        myStunAddress = data.StunAddress;
        myStunUsername = data.StunUsername;
        myStunPassword = data.StunPassword;

        if (myStunUsername?.length > 0) {
            const configuration = {
                'iceServers': [{
                    urls: myStunAddress,
                    username: myStunUsername,
                    credential: myStunPassword
                }]
            };
            peerConn = new RTCPeerConnection(configuration);
        } else {
            const configuration = {
                'iceServers': [{
                    'urls': myStunAddress
                }]
            };
            peerConn = new RTCPeerConnection(configuration);
        }


        isInitiator = true;

        grabWebCamVideo();
    });

    connection.on('joined', function (roomId) {
        console.log('This peer has joined room', roomId);
        myRoomId = roomId;

        var data = $(roomTable).DataTable().data().filter((item, index) => item.RoomId === roomId)[0];
        myStunAddress = data.StunAddress;
        myStunUsername = data.StunUsername;
        myStunPassword = data.StunPassword;

        if (myStunUsername?.length > 0) {
            const configuration = {
                'iceServers': [{
                    urls: myStunAddress,
                    username: myStunUsername,
                    credential: myStunPassword
                }]
            };
            peerConn = new RTCPeerConnection(configuration);
        } else {
            const configuration = {
                'iceServers': [{
                    'urls': myStunAddress
                }]
            };
            peerConn = new RTCPeerConnection(configuration);
        }

        isInitiator = false;
    });

    connection.on('error', function (message) {
        alert(message);
    });

    connection.on('ready', function () {
        console.log('Socket is ready');
        roomNameTxt.disabled = true;
        edStunAddress.disabled = true;
        edStunUsername.disabled = true;
        edStunPassword.disabled = true;
        createRoomBtn.disabled = true;
        hasRoomJoined = true;
        connectionStatusMessage.innerText = 'Connecting...';
        createPeerConnection(isInitiator);
    });

    connection.on('message', function (message) {
        console.log('Client received message:', message);
        signalingMessageCallback(message);
    });

    connection.on('bye', function () {
        console.log(`Peer leaving room.`);
        // If peer did not create the room, re-enter to be creator.
        connectionStatusMessage.innerText = `Other peer left room ${myRoomId}.`;
    });

    window.addEventListener('unload', function () {
        if (hasRoomJoined) {
            console.log(`Unloading window. Notifying peers in ${myRoomId}.`);
            connection.invoke("LeaveRoom", myRoomId).catch(function (err) {
                return console.error(err.toString());
            });
        }
    });

    //Get room list.
    connection.invoke("GetRoomInfo").catch(function (err) {
        return console.error(err.toString());
    });

}).catch(function (err) {
    return console.error(err.toString());
});

/**
* Send message to signaling server
*/
function sendMessage(message) {
    console.log('Client sending message: ', message);
    connection.invoke("SendMessage", myRoomId, message).catch(function (err) {
        return console.error(err.toString());
    });
}

/****************************************************************************
* Room management
****************************************************************************/

$(createRoomBtn).click(function () {
    var name = roomNameTxt.value;
    var stunAddress = edStunAddress.value;
    var stunUsername = edStunUsername.value;
    var stunPassword = edStunPassword.value;
    var json = JSON.stringify({
        name: name,
        stunAddress: stunAddress,
        stunUsername: stunUsername,
        stunPassword: stunPassword
    });
    connection.invoke("CreateRoom", json
    ).catch(function (err) {
        return console.error(err.toString());
    });
});

$('#roomTable tbody').on('click', 'button', function () {
    if (hasRoomJoined) {
        alert('You already joined the room. Please use a new tab or window.');
    } else {
        var data = $(roomTable).DataTable().row($(this).parents('tr')).data();
        connection.invoke("Join", data.RoomId).catch(function (err) {
            return console.error(err.toString());
        });
    }
});

/****************************************************************************
* User media (webcam)
****************************************************************************/

function grabWebCamVideo() {
    console.log('Getting user media (video) ...');
    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
    })
        .then(gotStream)
        .catch(function (e) {
            alert('getUserMedia() error: ' + e.name);
        });
}

function gotStream(stream) {
    console.log('getUserMedia video stream URL:', stream);
    localStream = stream;
    peerConn.addStream(localStream);
    localVideo.srcObject = stream;
}

/****************************************************************************
* WebRTC peer connection and data channel
****************************************************************************/

function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function () { },
            logError);
        peerConn.createAnswer(onLocalSessionCreated, logError);

    } else if (message.type === 'answer') {
        console.log('Got answer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function () { },
            logError);

    } else if (message.type === 'candidate') {
        peerConn.addIceCandidate(new RTCIceCandidate({
            candidate: message.candidate,
            sdpMLineIndex: message.label,
            sdpMid: message.id
        }));

    }
}

function createPeerConnection(isInitiator) {
    console.log('Creating Peer connection as initiator?', isInitiator);

    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
        console.log('icecandidate event:', event);
        if (event.candidate) {
            // Trickle ICE
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
            // Vanilla ICE
            //sendMessage(peerConn.localDescription);
        }
    };

    peerConn.onicecandidateerror = function (event) {
        console.warn('icecandidateerror event:', event);
    }

    peerConn.ontrack = function (event) {
        console.log('icecandidate ontrack event:', event);
        remoteVideo.srcObject = event.streams[0];
    };

    if (isInitiator) {
        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    }
}

function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    peerConn.setLocalDescription(desc, function () {
        // Trickle ICE
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}



/****************************************************************************
* Auxiliary functions
****************************************************************************/

function logError(err) {
    if (!err) return;
    if (typeof err === 'string') {
        console.warn(err);
    } else {
        console.warn(err.toString(), err);
    }
}