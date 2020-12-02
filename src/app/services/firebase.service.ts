import { Injectable } from '@angular/core';

import firebase from 'firebase/app';

// import 'firebase/analytics';
import 'firebase/auth';
// import 'firebase/database';
import 'firebase/firestore';
// import 'firebase/storage';
// import 'firebase/messaging';
// import 'firebase/functions';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {

    constructor() { }

    public init(): firebase.app.App {
        const firebaseConfig = {
            apiKey: "AIzaSyC8f0opFNukKc6CcomatCyVNU5-PGwuR7o",
            authDomain: "moo-web-rtc.firebaseapp.com",
            databaseURL: "https://moo-web-rtc.firebaseio.com",
            projectId: "moo-web-rtc",
            storageBucket: "moo-web-rtc.appspot.com",
            messagingSenderId: "429555155753",
            appId: "1:429555155753:web:a96fb158c1fee3f1f5ed38",
            measurementId: "G-3QKJ74T8CX",
        };
        
        return firebase.initializeApp(firebaseConfig);
    }
}
