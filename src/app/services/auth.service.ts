import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import 'firebase/auth';

import { environment } from '@environment';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    public firebaseAuthUnSub?: firebase.Unsubscribe;
    public user?: firebase.User | null;
    public currentUserIsAdmin: boolean = false;

    constructor(private ngZone: NgZone) {
        
    }
    
    public init(): Promise<firebase.User | null> {
        this.dispatch();

        return new Promise(resolve => {
            this.firebaseAuthUnSub = firebase.auth().onAuthStateChanged(user => {
                this.ngZone.run(() => {
                    this.user = user;
                    resolve(user);
                });
            });
        });
    }

    public signInWithEmailAndPassword(email: string, password: string): Promise<void> {
        return firebase.auth().signInWithEmailAndPassword(email, password).then(auth => {
            if (environment.env === 'dev') {
                console.log(' ~ AuthService: signInWithEmailAndPassword', auth);
            }
        });
    }

    public signInAnonymously(): Promise<void> {
        return firebase.auth().signInAnonymously().then(auth => {
            if (environment.env === 'dev') {
                console.log(' ~ AuthService: signInAnonymously', auth);
            }
        });
    }

    public sendPasswordResetEmail(email: string): Promise<void> {
        return firebase.auth().sendPasswordResetEmail(email);
    }

    public signOut(): Promise<void> {
        return firebase.auth().signOut().then(() => {
            // pass
        });
    }

    public dispatch(): void {
        this.firebaseAuthUnSub && this.firebaseAuthUnSub();
    }
}
