const functions = require('firebase-functions');
const firebaseAdmin = require('firebase-admin');

const admin = firebaseAdmin.initializeApp();

exports.createUserDoc = functions.auth.user().onCreate((user) => {
    let data = {
        idControlled:false,
        complete:false,
        type:"shopper"
    };

    if(user.email){
        data.email = user.email;
    }

    if(user.phoneNumber){
        data.phone = user.phoneNumber;
    }

    return admin.firestore().collection("users").doc(user.uid).set(data);
});


exports.completeProfile = functions.https.onCall((data, context) => {
    return new Promise(async function(resolve){

        if(!context.auth.uid){
            resolve('not authenticated');
            return;
        }

        try {
            if(data.birth && (typeof data.birth !== "number" || data.birth < 0 || data.birth > Math.round(new Date().getTime() / 1000))){
                resolve('invalid birth');
                return;
            }
            let emailRegEx = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
            if(data.email && (!emailRegEx.test(data.email) || data.email.length > 300)){
                resolve('invalid email');
                return;
            }
            if(data.number && (typeof data.number !== "string" || data.number.toString().length > 5)){
                resolve('invalid number');
                return;
            }
            if(data.street && (typeof data.street !== "string" || data.street.length > 400)){
                resolve('invalid street');
                return;
            }
            if(data.zip && (typeof data.zip !== "number" || data.zip.toString().length !== 5)){
                resolve('invalid zip');
                return;
            }
            if(data.fname && (typeof data.fname !== "string" || data.fname.length > 100)){
                resolve('invalid name');
                return;
            }
            if(data.lname && (typeof data.lname !== "string" || data.lname.length > 100)){
                resolve('invalid name');
                return;
            }

            let doc = await admin.firestore().collection("users").doc(context.auth.uid).get();
            if(!doc.exists){
                resolve('doc not found');
                return;
            }

            for(let i in data){
                if(i in doc.data()){
                    resolve("cant't edit " + i);
                    return;
                }


                const entries = ["birth","email","number","street","zip","fname","lname"];
                if(!entries.includes(i)){
                    resolve("can't find " + i);
                    return;
                }


            }

            if(("birth" in doc.data() || "birth" in data) &&
                ("email" in doc.data() || "email" in data) &&
                ("fname" in doc.data() || "fname" in data) &&
                ("lname" in doc.data() || "lname" in data) &&
                ("number" in doc.data() || "number" in data) &&
                ("street" in doc.data() || "street" in data) &&
                ("zip" in doc.data() || "zip" in data)){
                data.complete = true;
            }



            let setPromise = admin.firestore().collection("users").doc(context.auth.uid).set(data,{ merge:true });
            let authPromise = admin.auth().updateUser(context.auth.uid, {
                displayName: doc.data().fname || data.fname + " " + doc.data().lname || data.lname
            });

                Promise.all([setPromise,authPromise])
                    .then(function(){
                        resolve('ok');
                    })
                    .catch(function(error){
                        console.error("Error occurred in function: " + error)
                    })

        } catch (error) {
            console.error(error);
            resolve('internal error');
        }
    });
});

exports.telephonerGetTasks = functions.https.onCall((data, context) => {
    return new Promise(async function (resolve) {
        try {

            if(!data.fname || !data.lname || !data.zip){
                resolve({state:"error",error:"params not complete"});
                return;
            }

            if (!context.auth.uid) {
                resolve({state: "error", error: 'not authenticated'});
                return;
            }


            let telephonerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
            if (!telephonerDoc.exists) {
                resolve({state: "error", error: "doc not found"});
                return;
            }
            if (telephonerDoc.data().type !== "telephoner") {
                resolve({state: "error", error: "shopper"});
            } else {
                let tasksSnapshot = await admin.firestore().collection('tasks').where("fname","==",data.fname).where("lname","==",data.lname).where("zip", "==", data.zip).orderBy("delivered").orderBy('date', "desc").get();
                if (tasksSnapshot.empty) {
                    resolve({state: "ok", data: {}});
                }
                let temp = {};
                let result = [];
                tasksSnapshot.forEach(function (doc) {
                    temp = {};
                    temp.zip = doc.data().zip;
                    temp.street = doc.data().street;
                    temp.number = doc.data().number;
                    temp.delivered = doc.data().delivered;
                    temp.payed = doc.data().payed;

                    result.push(temp);
                });


                resolve({state: "ok", data: result});
            }

        }catch(error){
            console.error(error);
            resolve({state: "error", error: "internal"})
        }

    });
});

