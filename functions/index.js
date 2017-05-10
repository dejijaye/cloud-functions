const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// const secureCompare = require('secure-compare');

const express = require('express');
const cors = require('cors')({origin: true});
const router = new express.Router();

exports.sendNotificationOnEventComment 
    = functions.database.ref('/eventComments/{eventUid}/{eventCommentUid}').onWrite(event => {

        if (event.data.exists()) {

            const eventUid = event.params.eventUid;
            const eventCommentUid = event.params.eventCommentUid;
            console.log("event id is", eventUid);
            console.log("event comment id is", eventCommentUid);
            console.log("event comment is", event.data.val());            
            
            const comments = event.data.val();
            const commenter = comments.senderName;
            console.log("commenter is", commenter);

            const payload = {
                notification : {
                    title : ""
                }
            };            

            const eventPromise = admin.database().ref('/events/' + eventUid).once("value");
            
            eventPromise
                .then(resultSnap => {
                    if (resultSnap.exists()) {
                        const eventData = resultSnap.val();
                        console.log("event is", eventData);            
                        return eventData;
                    }
                })
                .then(eventData => {
                    if (eventData) {
                        payload.notification.title = "New comment on event " 
                            + eventData.name + " by " + commenter;
                        console.log("event payload", payload.notification.title);                                        
                        const invitees = eventData.invitees;

                        const notifyRef = invitees.map(notificationRef);

                        console.log("invitees are ", invitees);                                                                
                        const fcmTokenPromises = invitees.map(retrieveFcmToken);

                        return Promise.all(fcmTokenPromises).then(results => {
                                
                            console.log("token promise result ", results);                                                                                    
                            const tokens = [];
                            results.forEach(item =>{
                                if (item.val()) {
                                    tokens.push(item.val());
                                    console.log('token', item.val());
                                }
                            });
                            

                        admin.messaging().sendToDevice(tokens, payload)
                            .then(response => {
                                console.log("Successfully sent message:", response);
                                notifyRef.forEach(notification => {
                                    let newNotification = notification.push();
                                    newNotification.set(payload.notification);
                                });
                            })
                            .catch(error => {
                                console.log("Error sending message:", error);
                            });

                        })
                        .catch(err =>{
                                console.log("error is", err);
                        });
                    }
                });
        }

    });

    const retrieveFcmToken = Uid => {
        return admin.database().ref('/users/' + Uid + '/fcmToken').once('value');
                
    }

    const notificationRef = uuid => {
        return admin.database().ref(`/notifications/${uuid}`);
    }

exports.sendNotificationOnNewFollower
    = functions.database.ref('/users/{userId}/contacts/{contactId}').onWrite(event => {
        if (event.data.exists() && event.data.val()) {

            const contactId = event.params.contactId;
            const userId = event.params.userId;
            console.log("contact id is", contactId);                    

            const contactPromise = admin.auth().getUser(userId);

            const fcmTokenPromises = retrieveFcmToken(contactId);

            const notifyRef = notificationRef(userId);

            return Promise.all([contactPromise, fcmTokenPromises]).then(results => {
                const contactData = results[0];
                const tokenData = results[1];

                console.log(contactData);
                console.log(tokenData.val());

                const payload = {
                    notification : {
                        title : "You have a new follower!",
                        body: `${contactData.displayName} is now following you.`,
                        icon: contactData.photoURL,
                        type: 'NEW_FOLLOWER'
                    }
                };  


                admin.messaging().sendToDevice(tokenData.val(), payload)
                    .then(response => {
                        console.log("Successfully sent message:", response);
                        let newNotification = notifyRef.push();
                        newNotification.set(payload.notification);
                    })
                    .catch(error => {
                        console.log("Error sending message:", error);
                    });


            }).catch(error => {
                console.log(error);
            });
        }
    });

exports.sendMessageNotification = functions.database.ref('/messages/{chatUid}/{messageUid}').onWrite(event => {
    if(event.data.exists() && event.data.val()) {
        const chatUid = event.params.chatUid;
        const messageUid = event.params.messageUid;

        console.log("chat id is: " + chatUid);
        console.log("message id is:" + messageUid);
        console.log("event data is: ", event.data.val());

        const msg = event.data.val().text;
        const icon = event.data.val().senderImage; 

        if(event.data.val().sent) {
            if(chatUid.length > 20) {
                const idArr = chatUid.split('-');
                const receiverId = idArr[0] !== event.data.val().senderId ? idArr[0] : idArr[1];

                console.log("recipient is: " + receiverId); 

                const getReceiverTokenPromise = retrieveFcmToken(receiverId);
                const getSenderPromise = admin.auth().getUser(event.data.val().senderId);
                const notifyRef = notificationRef(receiverId);

                return Promise.all([getSenderPromise, getReceiverTokenPromise]).then(results => {
                    const sender = results[0];
                    const token = results[1];

                    console.log("sender data: ", sender);
                    console.log("token is : " + token.val());

                    const payload = {
                        notification : {
                            title : "You have a new message!",
                            body: `${sender.displayName} sent you a message: ${msg}.`,
                            icon: icon,
                            type: 'NEW_MESSAGE'
                        }
                    };

                    admin.messaging().sendToDevice(token.val(), payload)
                        .then(response => {
                            console.log("Successfully sent message:", response);
                            let newNotification = notifyRef.push();
                            newNotification.set(payload.notification);
                        })
                        .catch(error => {
                            console.log("Error sending message:", error);
                        });
                })

            } else {
                const getGroupPromise = admin.database().ref('/groups/' + chatUid + '/contacts').once('value');
                const getSenderPromise = admin.auth().getUser(event.data.val().senderId);

                Promise.all([getSenderPromise, getGroupPromise]).then(results => {
                    const sender = results[0];
                    console.log(results[1]);
                    const result = Object.keys(results[1].val());
                    const contacts = []
                    result.forEach(id => {
                        if(id !== event.data.val().senderId) contacts.push(id);
                    });
                    console.log(contacts);

                    const payload = {
                        notification : {
                            title : "You have a new group message!",
                            body: `${sender.displayName} sent you a message: ${msg}.`,
                            icon: icon,
                            type: 'NEW_GRP_MESSAGE'
                        }
                    };

                    const notifyGrpRef = contacts.map(notificationRef);
                    const recipientToken = contacts.map(retrieveFcmToken);
                    return Promise.all(recipientToken).then(results => {    
                        console.log(result);                                                                           
                        const tokens = [];
                        results.forEach((item) => {
                            if (item.val()) {
                                tokens.push(item.val());
                                console.log('token', item.val());
                            }
                        });
                        console.log(tokens);

                        admin.messaging().sendToDevice(tokens, payload)
                            .then(response => {
                                console.log("Successfully sent message:", response);
                                notifyGrpRef.forEach(notification => {
                                    let newNotification = notification.push();
                                    newNotification.set(payload.notification);
                                });
                            })
                            .catch(error => {
                                console.log("Error sending message:", error);
                            });
                    }).catch(error => {
                        console.log(error);
                    });
                }).catch(error => {
                    console.log(error);
                });
            }
        }

    }
});


exports.sendNotificationOnGroupAdd = functions.database.ref('/groups/{groupUid}/contacts/{contactUid}').onWrite(event => {
    if(event.data.exists() && event.data.val()) {
        const groupUid = event.params.groupUid;
        const contactUid = event.params.contactUid;

        console.log("contact id: ", contactUid); 
        const getGroupPromise = admin.database().ref(`/groups/${groupUid}`).once('value');
        const getContactPromise = admin.database().ref(`/users/${contactUid}/fcmToken`).once('value');
        const notifyRef = notificationRef(contactUid);

        Promise.all([getGroupPromise, getContactPromise]).then(results => {
            const groupData = results[0].val();
            const contactToken = results[1].val();

            console.log(groupData);
            const groupName = groupData.name;
            const groupOwner = Object.keys(groupData.admin);

            if(groupData.contacts && groupOwner[0] != contactUid) {

                const payload = {
                    notification: {
                        title: 'You have been added to a group',
                        type: 'NEW_GROUP'
                    }
                };

                admin.database().ref(`/users/${groupOwner[0]}`).once('value').then(userSnap => {
                    const user = userSnap.val();

                    payload.notification.body = `${user.username} added you to ${groupName}`;

                    admin.messaging().sendToDevice(contactToken, payload)
                        .then(response => {
                            console.log("Successfully sent message:", response);
                            let newNotification = notifyRef.push();
                            newNotification.set(payload.notification);
                        })
                        .catch(error => {
                            console.log("Error sending message:", error);
                        });
                }).catch(error => {
                    console.log(error);
                });
            }

        }).catch(error => {
            console.log(error);
        });


    }
});



router.use(cors);
// router.use(validateFirebaseIdToken);
router.post('*', (req, res) => {
    console.log("request ", req.body);
    // console.log("response ", res);

    res.set('content-type', 'application/json');
    const body = req.body;
    const contactsPromise = body.contacts.map(retrieveFcmToken);
    const notifyContactRef = body.contacts.map(notificationRef);

    admin.auth().getUser(body.userId).then(userSnap => {
        console.log(userSnap);
        const user = userSnap;

        const payload = {
            notification: {
                title: 'One of your contacts broadcasted their location',
                body: `${user.displayName} is at ${body.address}`,
                icon: `${user.photoURL}`,
                type: 'NEW_BROADCAST'
            }
        }

        Promise.all(contactsPromise).then(results => {
            const tokens = [];
            results.forEach(item =>{
                if (item.val()) {
                    tokens.push(item.val());
                    console.log('token', item.val());
                }
            });
            admin.messaging().sendToDevice(tokens, payload)
                .then(response => {
                    console.log("Successfully sent message:", response);
                    notifyContactRef.forEach(notification => {
                        let newNotification = notification.push();
                        newNotification.set(payload.notification);
                    })
                    res.status(200).json({status: 'ok', message: 'successful', response: response});
                })
                .catch(error => {
                    console.log("Error sending message:", error);
                    res.status(400).json({status: 'error', message: 'something went wrong', error: error});
                });
        }).catch(error => {
            console.log(error);
            res.status(400).json({status: 'error', message: 'something went wrong', error: error})
        });
    }).catch(error => {
        console.log(error);
        res.status(400).json({status: 'error', message: 'something went wrong', error: error})
    }); 
});

exports.broadcastLocationNotification = functions.https.onRequest(router);

// exports.eventBeginOrEndCheck = functions.https.onRequest((req, res) => {
//     const key = req.query.key;

//     // Exit if the keys don't match
//     if (!secureCompare(key, functions.config().cron.key)) {
//         console.log('The key provided in the request does not match the key set in the environment. Check that', key,
//             'matches the cron.key attribute in `firebase env:get`');
//         res.status(403).send('Security key does not match. Make sure your "key" URL query parameter matches the ' +
//             'cron.key environment variable.');
//         return;
//     }

//     // Get list of all events and their timestamp
//     // Check if the event is about to start e.g 24hrs away, 1hr away, 30mins away, starting right away

//     // global variables.
//     const eventStash = [];
//     const pastEvent = [];
//     const today = Date.now();
//     admin.database().ref('/events').once('value').then(eventsDataSnapshot => {
//         if(eventsDataSnapshot.exists()) {
//             const eventsData = eventsDataSnapshot.val();
//             return eventsData;
//         }
//     }).then(eventsData => {
//         eventsData.forEach(event => {
//             eventStash.push(event);
//             let diff = event.val().
//         });

//     });
// });
