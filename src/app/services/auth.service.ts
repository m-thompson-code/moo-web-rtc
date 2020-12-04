import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import 'firebase/auth';

import { environment } from '@environment';
import { Observable, Subject } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private _firebaseAuthUnSub?: firebase.Unsubscribe;
    public user?: firebase.User | null;
    public currentUserIsAdmin: boolean = false;

    private _userSubject: Subject<firebase.User | null>;
    private _userObservable: Observable<firebase.User | null>;

    public initalized: boolean = false;

    constructor(private ngZone: NgZone) {
        this._userSubject = new Subject<firebase.User | null>();
        this._userObservable = this._userSubject.asObservable();
    }
    
    public init(): Promise<firebase.User | null> {
        this.dispatch();

        this.initalized = true;

        return new Promise(resolve => {
            this._firebaseAuthUnSub = firebase.auth().onAuthStateChanged(user => {
                this.ngZone.run(() => {
                    this.user = user;
                    this._userSubject.next(user);
                    resolve(user);
                });
            });
        });
    }

    public onUserChange(): Observable<firebase.User | null> {
        // if (!this.initalized) {
        //     throw new Error("AuthService needs to be initalized first (call AuthService.init)");
        // }

        return this._userObservable;
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
        return firebase.auth().signOut();
    }

    public dispatch(): void {
        this._firebaseAuthUnSub && this._firebaseAuthUnSub();

        this.initalized = false;
    }
}
