import { Injectable } from '@angular/core';

import firebase from 'firebase/app';

// import 'firebase/analytics';
import 'firebase/auth';
// import 'firebase/database';
import 'firebase/firestore';
// import 'firebase/storage';
// import 'firebase/messaging';
// import 'firebase/functions';

import { environment } from '@environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {

    constructor() { }

    public init(): firebase.app.App {
        return firebase.initializeApp(environment.firebaseConfig);
    }
}
