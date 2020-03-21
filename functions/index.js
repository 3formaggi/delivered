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
    return new Promise(async function(resolve,reject){
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



            admin.firestore().collection("users").doc(context.auth.uid).set(data,{ merge:true })
                .then(function(){
                    resolve('ok');
                });

        } catch (error) {
            console.error(error);
        }
    });
});


