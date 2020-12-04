import { Component, OnInit } from '@angular/core';

import { AuthService } from './services/auth.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
    public initalized: boolean = false;

    constructor(public authService: AuthService) {

    }

    public ngOnInit(): void {
        void this._init();
    }

    private _init(): Promise<void> {
        this.initalized = false;

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
}
