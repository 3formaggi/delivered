const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
//const admin =

//bei sehr ähnlichen Teilen in verschieden cloud Functions, wurde der Teil jeweils nur einaml kommentiert

exports.createUserDoc = functions.auth.user().onCreate((user) => { //bei Registrierung aufgerufen
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

    return admin.firestore().collection("users").doc(user.uid).set(data); //erstellen des Dokuments für den Nutzer
});


exports.completeProfile = functions.https.onCall((data, context) => { //nach der Registrierung ist das Profil noch nicht vollständig, wird dann aber mit dieser cloud Function vervollständigt
    return new Promise(async function(resolve){

        if(!context.auth.uid){
            resolve('not authenticated');
            return;
        }

        try { //überprüfen der angegebenen Parameter
            if(data.birth && (typeof data.birth !== "number" || data.birth < 0 || data.birth > Math.round(Date.now() / 1000))){
                resolve('invalid birth');
                return;
            }
            let emailRegEx = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
            if(data.email && (!emailRegEx.test(data.email) || data.email.length > 300)){
                resolve('invalid email');
                return;
            }
            if(data.number && (typeof data.number !== "string" || data.number.length > 5)){
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
            if(!doc.exists){ //sollte nie passieren
                resolve('doc not found');
                return;
            }

            if(doc.data().type !== "shopper"){
                resolve('wrong user type');
                return;
            }

            for(let i in data){
                if(i in doc.data()){ //bereits gesetzte Daten können mit dieser Funktion nicht nochmal bearbeitet werden
                    resolve("cant't edit " + i);
                    return;
                }


                const entries = ["birth","email","number","street","zip","fname","lname"];
                if(!entries.includes(i)){ //nicht alle Informationen sind zugelassen
                    resolve("can't find " + i);
                    return;
                }

                if(i !== "birth" && i !== "zip") { //entfernen von Leerzeichen
                    data[i] = data[i].trim();
                }


            }

            if(("birth" in doc.data() || "birth" in data) && //wenn alle Informationen vorhanden sind, wird das Dokuement mit "complete" vermerkt
                ("email" in doc.data() || "email" in data) &&
                ("fname" in doc.data() || "fname" in data) &&
                ("lname" in doc.data() || "lname" in data) &&
                ("number" in doc.data() || "number" in data) &&
                ("street" in doc.data() || "street" in data) &&
                ("zip" in doc.data() || "zip" in data)){
                data.complete = true;
            }

            data.birth = admin.firestore.Timestamp.fromDate(new Date(data.birth * 1000));



            let setPromise = admin.firestore().collection("users").doc(context.auth.uid).set(data,{ merge:true }); //die Daten werden in firestore und in der Nutzerverwaltung gespeichert
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


exports.telephonerGetTasks = functions.https.onCall((data, context) => { //die Telefonisten können bereits registrierte Aufträge abrufen, aus Datenschutzgründen aber nur mit Name und Postleitzahl des Auftraggebers
    return new Promise(async function (resolve) {
        try {

            if(!data.fname || !data.lname || !data.zip){
                resolve({state:"error",error:"params not complete"});
                return;
            }

            if(typeof data.fname !== "string" || typeof data.lname !== "string" || typeof data.zip !== "number"){
                resolve({state:"error",error:"param has wrong type"});
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
            if (telephonerDoc.data().type !== "telephoner") { //Nutzer existiert zwar, ist aber nicht zum telefonieren, sondern nur zum einkaufen gehen berechtigt
                resolve({state: "error", error: "type"});
            } else { // abrufen der Aufträge
                let tasksSnapshot = await admin.firestore().collection('tasks').where("fname","==",data.fname).where("lname","==",data.lname).where("zip", "==", data.zip).orderBy("delivered").orderBy('date', "desc").get();
                if (tasksSnapshot.empty) { //keine zu den Suchkriterien passenden Aufträge gefunden
                    resolve({state: "ok", data: {}});
                }
                let temp = {};
                let result = [];
                tasksSnapshot.forEach(function (doc) { //vorbereiten und senden der Daten, welche für die Abfrage erforderlich sind
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

exports.telephonerAddTask = functions.https.onCall((data, context) => { //Funktion zum Eintragen eines neuen Auftrags
    return new Promise(async function (resolve) {
        try {

            if (!context.auth.uid) {
                resolve({state: "error", error: 'not authenticated'});
                return;
            }

            if(typeof data.birth !== "number" || data.birth < 0 || data.birth > Math.round(new Date().getTime() / 1000) || //überprüfen, ob bereitgestellte Parameter vollständig und richtig formatiert sind
                typeof data.country !== "string" || data.country.length !== 2 ||
                typeof data.fname !== "string" || data.fname.length > 100 ||
                typeof data.lname !== "string" || data.lname.length > 100 ||
                typeof data.number !== "string" || data.number.length > 5 ||
                typeof data.over16 !== "boolean" ||
                typeof data.over18 !== "boolean" ||
                typeof data.phone !== "number" || data.phone.length > 50 ||
                typeof data.street !== "string" || data.street.length > 100 ||
                typeof data.zip !== "number" || data.zip.toString().length !== 5){
                resolve({state:"error",error:"params not complete or wrong"});
                return;
            }

            if(data.addressInfo && typeof data.addressInfo !== "string"){
                resolve({state:"error",error:"param addressInfo has wrong type"});
                return;
            }

            if(!data.items || data.items === 0){
                resolve({state:"error",error:"items empty or not set"});
                return;
            }else{
                data.items.forEach(function(item){
                    if(typeof item.item !== "string" || typeof item.amount !== "string" || (typeof item.info !== "string" && typeof item.info !== "undefined")){
                        resolve({state:"error",error:"items wrong formatted"});
                    }
                    if((Object.keys(item).length === 2 && (!item.item || !item.amount)) || (Object.keys(item).length === 3 && (!item.item || !item.amount || !item.info))){
                        resolve({state:"error",error:"items wrong formatted2"});

                    }
                });
            }






            let telephonerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
            if (!telephonerDoc.exists) {
                resolve({state: "error", error: "doc not found"});
                return;
            }
            if (telephonerDoc.data().type !== "telephoner") {
                resolve({state: "error", error: "type"});
            } else { //setzen des neuen Auftrags
                let taskDoc = {
                    birth: admin.firestore.Timestamp.fromDate(new Date(data.birth * 1000)),
                    country: data.country.toLowerCase(),
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    delivered: false,
                    items: data.items,
                    fname: data.fname,
                    lname: data.lname,
                    number: data.number,
                    over16: data.over16,
                    over18: data.over18,
                    payed: false,
                    phone: data.phone,
                    street: data.street,
                    zip: data.zip
                };

                if(data.addressInfo){
                    taskDoc.addressInfo = data.addressInfo;
                }

                admin.firestore().collection('tasks').add(taskDoc)
                    .then(function(){
                        resolve({state: "ok"});
                    });

            }



        }catch(error){
            console.error(error);
            resolve({state: "error", error: "internal"})
        }
    });
});

exports.userGetTasks = functions.https.onCall((data, context) => { //Funktion für den Nutzer, zum Anzeigen der verfügbaren Aufträge
    return new Promise(async function (resolve) {
        try {

            if (!context.auth.uid) {
                resolve({state: "error", error: 'not authenticated'});
                return;
            }

            
            if(!data.zip || !Array.isArray(data.zip)){
                resolve({state:"error",error:"request not complete or not correct built up"});
                return;
            }


            let userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
            

            let promises = [];



               data.zip.forEach(function(element){ //laden der Aufgaben abhängig vom Alter

                   if(typeof element === "number" && element.toString().length === 5) {
                       if((new Date(Date.now() - userDoc.data().birth.toDate().getTime()).getUTCFullYear() - 1970) >= 18){
                            promises.push(admin.firestore().collection('tasks').where('zip', '==', element).get());
                        }else if((new Date(Date.now() - userDoc.data().birth.toDate().getTime()).getUTCFullYear() - 1970) >= 16){
                            promises.push(admin.firestore().collection('tasks').where('zip', '==', element).where('over18','==',false).get());
                        }else{
                            promises.push(admin.firestore().collection('tasks').where('zip', '==', element).where('over16','==',false).get());
                        }
                    }else{
                        resolve({state:"error",error:"zip invalid"});
                    }
               });

            if(promises === []){
                return;
            }

            let result = [];
            let temp = {};
            Promise.all(promises) //Auflösen der Promises
                .then(function(snapshots){
                    snapshots.forEach(function(snapshot){
                        if(!snapshot.empty){
                            snapshot.forEach(function(doc){
                                temp.street = doc.data().street;
                                temp.zip = doc.data().zip;
                                temp.id = doc.id;

                                result.push(temp);
                                temp = {};
                            });

                        }


                    });
                    resolve(result);
                });

        } catch (error) {
            console.error(error);
            resolve({state:"error",error:"internal"});
        }
    });
});

exports.userAcceptTasks = functions.https.onCall((data, context) => { //Funktion zum Annehmen eines Auftrags
    return new Promise(async function (resolve) {
        try {

            if (!context.auth.uid) {
                resolve({state: "error", error: 'not authenticated'});
                return;
            }


            if (!data.id || typeof data.id !== "string") {
                resolve({state: "error", error: "request not complete or not correct built up"});
                return;
            }


            let userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();

            if(userDoc.data().type !== "shopper"){
                resolve({state:"error",error:"wrong user type"});
                return;
            }

            if(!userDoc.data().complete){
                resolve({state:"error",error:"user not complete"});
                return;
            }

            let taskDoc = await admin.firestore().collection('tasks').doc(data.id).get();
            if(!taskDoc.exists){ //überprüfen, ob die Id (und das zugehörige Dokument) existiert
                resolve({state:'error',error:'id not found'});
            }else if(taskDoc.data().shopper){ //überprüfen, ob dem Auftrag schon ein Einkäufer zugeordnet ist
                resolve({state:"error",error:"already assigned"})
            }else{
                admin.firestore().collection('tasks').doc(data.id).set({ //setzen des Einkäufers und der Zeit
                    shopper: context.auth.uid,
                    acceptedTimestamp: admin.firestore.FieldValue.serverTimestamp()
                }, {merge: true})
                    .then(function(){
                        resolve({state: "ok"});
                    });
            }




        } catch (error) {
            console.error(error);
            resolve({state: "error", error: "internal"});
        }

    });
});


exports.userGetAcceptedTasks = functions.https.onCall((data, context) => { //Funktion zum Abrufen der angenommenen Aufträge
    return new Promise(async function (resolve) {
        try {

            if (!context.auth.uid) {
                resolve({state: "error", error: 'not authenticated'});
                return;
            }

            if (data.delivered !== true && data.delivered !== false) {
                resolve({state: "error", error: 'delivered is not set or has wrong type'});
                return;
            }

            admin.firestore().collection('tasks').where("shopper","==",context.auth.uid).where("delivered","==",data.delivered).orderBy("acceptedTimestamp","desc").get()
                .then(function(snapshot){
                    if(snapshot.empty){
                        resolve({state:"ok",data:{}});
                    }else{
                        let temp = {};
                        let result = [];
                        snapshot.forEach(function(doc){
                            temp.zip = doc.data().zip;
                            temp.street = doc.data().street;
                            temp.number = doc.data().number;
                            temp.acceptedTimestamp = doc.data().acceptedTimestamp.toDate().getTime();

                            result.push(temp);
                            temp = {};
                        });
                        resolve({state:"ok",data:result});
                    }
                });


        } catch (error) {
            console.error(error);
            resolve({state: "error", error: "internal"});
        }
    });
});

