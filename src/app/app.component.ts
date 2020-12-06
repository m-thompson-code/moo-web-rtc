import { Component, OnDestroy, OnInit } from '@angular/core';

import firebase from 'firebase/app';
import { Subscription } from 'rxjs';

import { AuthService } from './services/auth.service';

@Component({
    selector: 'app-inital-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
    public user: firebase.User | null = null;

    public initalized: boolean = false;

    private _sub?: Subscription;

    constructor(private authService: AuthService) {

    }

    public ngOnInit(): void {
        void this._init();
    }

    private _init(): Promise<void> {
        this.initalized = false;

        this._sub = this.authService.onUserChange().subscribe(user => {
            this.user = user;
        });

        return this.authService.init().then(user => {
            console.log(user);

            if (!user) {
                return this.authService.signInAnonymously();
            }

            return;
        }).catch(error => {
            console.error(error);
        }).then(() => {
            this.initalized = true;
        });
    }

    public signOut(): Promise<void> {
        return this.authService.signOut();
    }

    public ngOnDestroy(): void {
        this._sub?.unsubscribe();
    }
}
