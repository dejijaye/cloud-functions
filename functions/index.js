const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// const secureCompare = require('secure-compare');

const express = require('express');
const cors = require('cors')({origin: true});
const router = new express.Router();




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
